/**
 * Claude CLI integration
 * Handles spawning Claude Code CLI and capturing output
 */

import { spawn, type Subprocess } from "bun";
import type { Config } from "../config";

export interface ClaudeResponse {
  success: boolean;
  output: string;
  error?: string;
  duration: number;
}

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
 * Invoke Claude CLI with --print mode
 */
export async function invokeClaude(
  prompt: string,
  config: Config
): Promise<ClaudeResponse> {
  const startTime = Date.now();

  try {
    const proc = spawn({
      cmd: [config.claude.cliPath, "--print", "-p", prompt],
      stdout: "pipe",
      stderr: "pipe",
    });

    // Set up timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        proc.kill();
        reject(new Error(`Claude CLI timed out after ${config.claude.timeout}ms`));
      }, config.claude.timeout);
    });

    // Wait for process to complete or timeout
    const resultPromise = (async () => {
      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      return { exitCode, stdout, stderr };
    })();

    const { exitCode, stdout, stderr } = await Promise.race([
      resultPromise,
      timeoutPromise,
    ]);

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
      output: formatForSlack(stdout, config.claude.maxOutputLength),
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

/**
 * Invoke Claude CLI with session continuation
 * Uses --continue flag to resume a previous session
 */
export async function invokeClaudeWithSession(
  prompt: string,
  sessionId: string | undefined,
  config: Config
): Promise<ClaudeResponse & { sessionId?: string }> {
  const startTime = Date.now();

  try {
    const args = ["--print", "-p", prompt];

    // Add session continuation if we have a session ID
    if (sessionId) {
      args.push("--continue", sessionId);
    }

    const proc = spawn({
      cmd: [config.claude.cliPath, ...args],
      stdout: "pipe",
      stderr: "pipe",
    });

    // Set up timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        proc.kill();
        reject(new Error(`Claude CLI timed out after ${config.claude.timeout}ms`));
      }, config.claude.timeout);
    });

    const resultPromise = (async () => {
      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      return { exitCode, stdout, stderr };
    })();

    const { exitCode, stdout, stderr } = await Promise.race([
      resultPromise,
      timeoutPromise,
    ]);

    const duration = Date.now() - startTime;

    if (exitCode !== 0) {
      return {
        success: false,
        output: "",
        error: stderr || `Claude CLI exited with code ${exitCode}`,
        duration,
      };
    }

    // TODO: Parse session ID from output if Claude provides one
    return {
      success: true,
      output: formatForSlack(stdout, config.claude.maxOutputLength),
      duration,
      sessionId: sessionId, // Keep the same session ID for now
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
