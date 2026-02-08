/**
 * Queue types for async Slack job processing
 */

/**
 * Represents a job queued for processing
 */
export interface SlackJob {
  /** Unique job identifier */
  id: string;
  /** Slack channel ID */
  channel: string;
  /** Thread timestamp - reply to this message */
  thread_ts: string;
  /** User who sent the message */
  user: string;
  /** The prompt to send to Claude */
  prompt: string;
  /** Formatted thread conversation history (when message is from a thread) */
  thread_context?: string;
  /** Job creation timestamp (ms) */
  created_at: number;
  /** When processing started (ms) */
  started_at: number | null;
  /** When processing completed (ms) */
  completed_at: number | null;
  /** Error message if failed */
  error?: string;
  /** When job failed (ms) */
  failed_at?: number;
}

/**
 * Queue directory structure paths
 */
export interface QueuePaths {
  base: string;
  pending: string;
  processing: string;
  completed: string;
  failed: string;
}

/**
 * Queue configuration
 */
export interface QueueConfig {
  /** Base directory for queue files */
  queueDir: string;
  /** Poll interval in milliseconds */
  pollInterval: number;
  /** Retention days for completed jobs */
  retentionDays: number;
}

/**
 * Default queue configuration
 */
export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  queueDir: "/tmp/pai-slack-queue",
  pollInterval: 2000,
  retentionDays: 7,
};

/**
 * Get queue directory paths from config
 */
export function getQueuePaths(config: QueueConfig): QueuePaths {
  const base = config.queueDir;
  return {
    base,
    pending: `${base}/pending`,
    processing: `${base}/processing`,
    completed: `${base}/completed`,
    failed: `${base}/failed`,
  };
}
