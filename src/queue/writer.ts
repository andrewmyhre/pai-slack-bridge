/**
 * Queue writer - atomic job submission
 *
 * Uses atomic file operations (write to .tmp, rename to final)
 * to ensure jobs are never partially written.
 */

import { randomUUID } from "crypto";
import { mkdir, writeFile, rename } from "fs/promises";
import type { SlackJob, QueueConfig } from "./types";
import { DEFAULT_QUEUE_CONFIG, getQueuePaths } from "./types";

/**
 * Input data for creating a new job
 */
export interface QueueJobInput {
  channel: string;
  thread_ts: string;
  user: string;
  prompt: string;
  thread_context?: string;
}

/**
 * Ensure queue directories exist
 */
export async function ensureQueueDirs(
  config: QueueConfig = DEFAULT_QUEUE_CONFIG
): Promise<void> {
  const paths = getQueuePaths(config);
  await mkdir(paths.pending, { recursive: true });
  await mkdir(paths.processing, { recursive: true });
  await mkdir(paths.completed, { recursive: true });
  await mkdir(paths.failed, { recursive: true });
}

/**
 * Queue a job for processing
 *
 * Performs atomic write:
 * 1. Write to temp file in base dir
 * 2. Rename to pending directory (atomic on POSIX)
 *
 * @returns Job ID
 */
export async function queueJob(
  input: QueueJobInput,
  config: QueueConfig = DEFAULT_QUEUE_CONFIG
): Promise<string> {
  const paths = getQueuePaths(config);

  // Ensure directories exist
  await ensureQueueDirs(config);

  const jobId = randomUUID();
  const job: SlackJob = {
    id: jobId,
    channel: input.channel,
    thread_ts: input.thread_ts,
    user: input.user,
    prompt: input.prompt,
    ...(input.thread_context && { thread_context: input.thread_context }),
    created_at: Date.now(),
    started_at: null,
    completed_at: null,
  };

  // Atomic write: temp file first, then rename
  const tmpPath = `${paths.base}/${jobId}.tmp.json`;
  const finalPath = `${paths.pending}/${jobId}.json`;

  await writeFile(tmpPath, JSON.stringify(job, null, 2));
  await rename(tmpPath, finalPath);

  return jobId;
}
