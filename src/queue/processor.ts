/**
 * Queue processor - processes jobs from the pending queue
 *
 * CRITICAL: This processor runs with NO TIMEOUT on Claude invocations.
 * The queue exists to handle long-running tasks - timing them out defeats the purpose.
 * Only REAL failures (crashes, errors) go to the dead letter queue.
 */

import { readdir, readFile, writeFile, rename, unlink } from "fs/promises";
import { WebClient } from "@slack/web-api";
import type { SlackJob, QueueConfig } from "./types";
import { DEFAULT_QUEUE_CONFIG, getQueuePaths } from "./types";
import { ensureQueueDirs } from "./writer";
import { invokeClaudeNoTimeout, type ProgressCallback } from "./claude-invoke";
import { appendMessage, truncateAtNaturalBoundary, cleanupOldThreads } from "./thread-store";

/** Cleanup interval: every 100 poll cycles */
const CLEANUP_INTERVAL_CYCLES = 100;

/** Max chars for assistant response stored in thread file */
const ASSISTANT_TRUNCATE_CHARS = 500;

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Process a single job
 */
async function processJob(
  jobFile: string,
  slackClient: WebClient,
  claudeCliPath: string,
  workingDirectory: string,
  maxOutputLength: number,
  config: QueueConfig
): Promise<void> {
  const paths = getQueuePaths(config);
  const pendingPath = `${paths.pending}/${jobFile}`;
  const processingPath = `${paths.processing}/${jobFile}`;

  // Atomic move to processing (claim the job)
  try {
    await rename(pendingPath, processingPath);
  } catch (err) {
    // Job may have been claimed by another processor (race condition)
    // or doesn't exist anymore - skip it
    console.log(`[Queue] Could not claim job ${jobFile}, skipping`);
    return;
  }

  // Read job data
  const jobData = await readFile(processingPath, "utf-8");
  const parsedJob = JSON.parse(jobData);

  // Check if this is a simple notification (channel + text) or full Claude job
  const isSimpleNotification = parsedJob.text && !parsedJob.prompt;

  try {
    if (isSimpleNotification) {
      // Simple notification - just post to Slack without Claude processing
      console.log(`[Queue] Processing simple notification to ${parsedJob.channel}`);

      if (!parsedJob.channel) {
        throw new Error("Missing required field: channel");
      }

      await slackClient.chat.postMessage({
        channel: parsedJob.channel,
        text: parsedJob.text,
      });

      // Create minimal job record for completed queue
      const completedJob = {
        id: parsedJob.id || `simple-${Date.now()}`,
        channel: parsedJob.channel,
        text: parsedJob.text,
        created_at: parsedJob.created_at || Date.now(),
        started_at: Date.now(),
        completed_at: Date.now(),
      };

      const completedPath = `${paths.completed}/${jobFile}`;
      await writeFile(completedPath, JSON.stringify(completedJob, null, 2));
      await unlink(processingPath);

      console.log(`[Queue] Simple notification sent to ${parsedJob.channel}`);
    } else {
      // Full Claude processing job - validate required fields
      const job: SlackJob = parsedJob;

      if (!job.id || !job.channel || !job.thread_ts || !job.user || !job.prompt) {
        throw new Error(
          `Missing required fields. Need: id, channel, thread_ts, user, prompt. Got: ${Object.keys(parsedJob).join(", ")}`
        );
      }

      job.started_at = Date.now();
      console.log(`[Queue] Processing job ${job.id.substring(0, 8)}... for user ${job.user}`);

      // Progress callback to post phase updates to Slack thread
      const onProgress: ProgressCallback = async (phase: string) => {
        try {
          await slackClient.chat.postMessage({
            channel: job.channel,
            thread_ts: job.thread_ts,
            text: `[${phase}]`,
          });
        } catch (err) {
          // Don't fail the job if progress notification fails
          console.error(`[Queue] Failed to send progress update: ${err}`);
        }
      };

      // CRITICAL: No timeout - let long-running tasks complete
      // Queue processor has no external deadline
      const result = await invokeClaudeNoTimeout(
        job.prompt,
        claudeCliPath,
        workingDirectory,
        maxOutputLength,
        onProgress,
        job.thread_context
      );

      if (result.success) {
        // Send result to Slack
        await slackClient.chat.postMessage({
          channel: job.channel,
          thread_ts: job.thread_ts,
          text: result.output,
        });

        // Append assistant response to thread store (truncated at natural boundary)
        try {
          const truncatedResponse = truncateAtNaturalBoundary(
            result.output,
            ASSISTANT_TRUNCATE_CHARS
          );
          await appendMessage(job.thread_ts, job.channel, {
            role: "assistant",
            name: "pai-slack-bridge",
            text: truncatedResponse,
            ts: String(Date.now() / 1000), // synthetic ts for dedup
          });
        } catch (threadErr) {
          // Thread store append is best-effort; don't fail the job
          console.error("[Queue] Failed to append assistant message to thread store:", threadErr);
        }

        // Move to completed
        job.completed_at = Date.now();
        const completedPath = `${paths.completed}/${jobFile}`;
        await writeFile(processingPath, JSON.stringify(job, null, 2));
        await rename(processingPath, completedPath);

        const duration = job.completed_at - job.created_at;
        console.log(`[Queue] Job ${job.id.substring(0, 8)}... completed in ${duration}ms`);
      } else {
        // Claude returned an error - treat as failure
        throw new Error(result.error || "Claude CLI returned error");
      }
    }
  } catch (error) {
    // Move to failed (dead letter queue)
    const errorMsg = error instanceof Error ? error.message : String(error);
    const failedJob = {
      ...parsedJob,
      error: errorMsg,
      failed_at: Date.now(),
    };

    const failedPath = `${paths.failed}/${jobFile}`;
    await writeFile(failedPath, JSON.stringify(failedJob, null, 2));
    await unlink(processingPath);

    const jobId = parsedJob.id || jobFile;
    console.error(`[Queue] Job ${jobId} failed: ${errorMsg}`);

    // Notify user of failure (only if we have thread info)
    if (parsedJob.channel && parsedJob.thread_ts) {
      try {
        await slackClient.chat.postMessage({
          channel: parsedJob.channel,
          thread_ts: parsedJob.thread_ts,
          text: `Sorry, I encountered an error processing your request: ${errorMsg}`,
        });
      } catch (slackErr) {
        console.error(`[Queue] Failed to notify user of job failure:`, slackErr);
      }
    }
  }
}

/**
 * Recover jobs stuck in processing (from previous crash)
 */
async function recoverStuckJobs(config: QueueConfig): Promise<void> {
  const paths = getQueuePaths(config);

  try {
    const processingJobs = await readdir(paths.processing);
    const jsonFiles = processingJobs.filter((f) => f.endsWith(".json"));

    for (const jobFile of jsonFiles) {
      console.log(`[Queue] Recovering stuck job: ${jobFile}`);
      // Move back to pending for reprocessing
      await rename(`${paths.processing}/${jobFile}`, `${paths.pending}/${jobFile}`);
    }

    if (jsonFiles.length > 0) {
      console.log(`[Queue] Recovered ${jsonFiles.length} stuck job(s)`);
    }
  } catch (err) {
    // Processing directory might not exist yet
    console.log(`[Queue] No stuck jobs to recover`);
  }
}

export interface ProcessorConfig {
  slackBotToken: string;
  claudeCliPath: string;
  workingDirectory: string;
  maxOutputLength: number;
  queueConfig?: QueueConfig;
}

/**
 * Start the queue processor
 *
 * Polls the pending directory and processes jobs sequentially.
 * Only stops when the process is killed.
 */
export async function startQueueProcessor(config: ProcessorConfig): Promise<void> {
  const queueConfig = config.queueConfig || DEFAULT_QUEUE_CONFIG;
  const paths = getQueuePaths(queueConfig);

  // Ensure directories exist
  await ensureQueueDirs(queueConfig);

  // Create Slack client
  const slackClient = new WebClient(config.slackBotToken);

  // Recover any jobs stuck in processing from previous crash
  await recoverStuckJobs(queueConfig);

  console.log(`[Queue] Processor started, watching ${paths.pending}`);
  console.log(`[Queue] Poll interval: ${queueConfig.pollInterval}ms`);

  // Track poll cycles for periodic cleanup
  let pollCycleCount = 0;

  // Main processing loop
  while (true) {
    try {
      const pendingJobs = await readdir(paths.pending);
      const jsonFiles = pendingJobs.filter((f) => f.endsWith(".json"));

      for (const jobFile of jsonFiles) {
        await processJob(
          jobFile,
          slackClient,
          config.claudeCliPath,
          config.workingDirectory,
          config.maxOutputLength,
          queueConfig
        );
      }
    } catch (err) {
      console.error("[Queue] Error in processing loop:", err);
    }

    // Periodic thread file cleanup (every CLEANUP_INTERVAL_CYCLES polls)
    pollCycleCount++;
    if (pollCycleCount >= CLEANUP_INTERVAL_CYCLES) {
      pollCycleCount = 0;
      try {
        const cleaned = await cleanupOldThreads(72);
        if (cleaned > 0) {
          console.log(`[Queue] Cleaned up ${cleaned} old thread file(s)`);
        }
      } catch (err) {
        console.error("[Queue] Thread cleanup error:", err);
      }
    }

    // Wait before next poll
    await sleep(queueConfig.pollInterval);
  }
}

/**
 * Get queue status (for monitoring)
 */
export async function getQueueStatus(
  config: QueueConfig = DEFAULT_QUEUE_CONFIG
): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}> {
  const paths = getQueuePaths(config);

  const count = async (dir: string): Promise<number> => {
    try {
      const files = await readdir(dir);
      return files.filter((f) => f.endsWith(".json")).length;
    } catch {
      return 0;
    }
  };

  return {
    pending: await count(paths.pending),
    processing: await count(paths.processing),
    completed: await count(paths.completed),
    failed: await count(paths.failed),
  };
}
