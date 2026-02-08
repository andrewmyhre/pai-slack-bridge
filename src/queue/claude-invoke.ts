/**
 * Claude CLI invocation for queue processor
 *
 * CRITICAL: This version has NO TIMEOUT.
 * Queue processor has no external deadline - let tasks complete.
 * Only real failures (crashes, errors) should fail jobs.
 *
 * Supports progress callbacks for phase transition notifications.
 */

import { spawn } from "bun";

export interface ClaudeResponse {
  success: boolean;
  output: string;
  error?: string;
  duration: number;
}

/**
 * Progress callback for phase transitions
 */
export type ProgressCallback = (phase: string) => void | Promise<void>;

/**
 * Known PAI phases to detect in output
 */
const PHASE_PATTERNS = [
  { pattern: /OBSERVE/i, phase: "OBSERVE" },
  { pattern: /THINK/i, phase: "THINK" },
  { pattern: /EXECUTE/i, phase: "EXECUTE" },
  { pattern: /VERIFY/i, phase: "VERIFY" },
  { pattern: /COMPLETE/i, phase: "COMPLETE" },
  { pattern: /Planning/i, phase: "Planning" },
  { pattern: /Implementing/i, phase: "Implementing" },
  { pattern: /Testing/i, phase: "Testing" },
  { pattern: /Reviewing/i, phase: "Reviewing" },
];

/**
 * Strip ANSI escape codes from output
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

/**
 * Convert output to Slack-compatible markdown
 */
function formatForSlack(text: string, maxLength: number): string {
  let formatted = stripAnsi(text);

  // Truncate if too long (Slack limit is ~4000 chars per message)
  if (formatted.length > maxLength) {
    formatted = formatted.substring(0, maxLength - 100) + "\n\n... (output truncated)";
  }

  return formatted;
}

/**
 * Detect phase transitions in Claude output
 */
function detectPhase(text: string): string | null {
  for (const { pattern, phase } of PHASE_PATTERNS) {
    if (pattern.test(text)) {
      return phase;
    }
  }
  return null;
}

/**
 * Invoke Claude CLI with NO TIMEOUT
 *
 * This is specifically for the queue processor where:
 * - There is no external deadline (Slack has already acknowledged)
 * - Long-running tasks should complete successfully
 * - Only real failures should be reported
 *
 * @param prompt - The prompt to send to Claude
 * @param cliPath - Path to Claude CLI executable
 * @param workingDirectory - Working directory for Claude
 * @param maxOutputLength - Maximum output length for Slack
 * @param onProgress - Optional callback for phase transitions
 */
export async function invokeClaudeNoTimeout(
  prompt: string,
  cliPath: string,
  workingDirectory: string,
  maxOutputLength: number,
  onProgress?: ProgressCallback,
  threadContext?: string
): Promise<ClaudeResponse> {
  const startTime = Date.now();

  try {
    // Prepend thread context to prompt when available
    const fullPrompt = threadContext
      ? `Here is the conversation thread for context:\n\n${threadContext}\n\n---\n\nLatest message (respond to this):\n${prompt}`
      : prompt;

    const proc = spawn({
      cmd: [cliPath, "--print", "--continue", "--dangerously-skip-permissions", fullPrompt],
      cwd: workingDirectory,
      stdout: "pipe",
      stderr: "pipe",
    });

    // Collect output chunks
    const outputChunks: string[] = [];
    let lastPhase: string | null = null;

    // Stream stdout for progress detection
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      outputChunks.push(text);

      // Detect and report phase transitions
      if (onProgress) {
        const phase = detectPhase(text);
        if (phase && phase !== lastPhase) {
          lastPhase = phase;
          try {
            await onProgress(phase);
          } catch (progressErr) {
            // Don't fail the job if progress notification fails
            console.error("[Claude] Progress callback error:", progressErr);
          }
        }
      }
    }

    // Wait for process to complete
    const exitCode = await proc.exited;
    const stdout = outputChunks.join("");
    const stderr = await new Response(proc.stderr).text();

    const duration = Date.now() - startTime;

    if (exitCode !== 0) {
      return {
        success: false,
        output: "",
        error: stderr || `Claude CLI exited with code ${exitCode}`,
        duration,
      };
    }

    return {
      success: true,
      output: formatForSlack(stdout, maxOutputLength),
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : String(error),
      duration,
    };
  }
}
