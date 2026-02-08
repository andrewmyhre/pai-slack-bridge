/**
 * Slack event handlers
 *
 * Uses async queue for processing - messages are acknowledged immediately
 * and processed in background by the queue processor.
 *
 * When a message comes from a thread, the full thread history is fetched
 * and passed as context to the agent.
 */

import type { App, SlackEventMiddlewareArgs, AllMiddlewareArgs } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { Config } from "../config";
import { queueJob } from "../queue/writer";

type MessageEvent = SlackEventMiddlewareArgs<"message"> & AllMiddlewareArgs;
type AppMentionEvent = SlackEventMiddlewareArgs<"app_mention"> & AllMiddlewareArgs;

/** Max characters of thread context to include */
const MAX_THREAD_CONTEXT_LENGTH = 8000;

/**
 * Send acknowledgment message that job has been queued
 */
async function sendQueuedAck(
  client: WebClient,
  channel: string,
  threadTs: string,
  jobId: string
): Promise<void> {
  try {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `Got it! Processing in background (job: ${jobId.substring(0, 8)}...)`,
    });
  } catch (error) {
    console.error("Failed to send queue acknowledgment:", error);
  }
}

/**
 * Check if a user is allowed to use the bridge
 */
function isUserAllowed(userId: string, config: Config): boolean {
  if (!config.bridge.allowedUsers || config.bridge.allowedUsers.length === 0) {
    return true; // No restrictions
  }
  return config.bridge.allowedUsers.includes(userId);
}

/**
 * Check if a channel is allowed
 */
function isChannelAllowed(channelId: string, config: Config): boolean {
  if (!config.bridge.allowedChannels || config.bridge.allowedChannels.length === 0) {
    return true; // No restrictions
  }
  return config.bridge.allowedChannels.includes(channelId);
}

/**
 * Extract the actual message text, removing bot mention
 */
function extractPrompt(text: string, botUserId?: string): string {
  let prompt = text;

  // Remove bot mention if present
  if (botUserId) {
    prompt = prompt.replace(new RegExp(`<@${botUserId}>`, "g"), "").trim();
  }

  return prompt;
}

/**
 * Fetch thread history and format as conversation context.
 *
 * Calls conversations.replies to get all messages in the thread,
 * excludes bot messages, resolves user display names, and formats
 * as a readable conversation transcript.
 *
 * Returns undefined if the message is not in a thread or the thread
 * has no prior messages.
 */
async function fetchThreadContext(
  client: WebClient,
  channel: string,
  threadTs: string,
  currentMessageTs: string,
  botUserId?: string
): Promise<string | undefined> {
  try {
    const result = await client.conversations.replies({
      channel,
      ts: threadTs,
      inclusive: true,
      limit: 100,
    });

    const messages = result.messages;
    if (!messages || messages.length <= 1) {
      // Only the current message exists — no prior context
      return undefined;
    }

    // Build a cache of user display names
    const userNames = new Map<string, string>();

    const resolveUserName = async (userId: string): Promise<string> => {
      if (userNames.has(userId)) return userNames.get(userId)!;
      try {
        const userInfo = await client.users.info({ user: userId });
        const name =
          userInfo.user?.profile?.display_name ||
          userInfo.user?.real_name ||
          userInfo.user?.name ||
          userId;
        userNames.set(userId, name);
        return name;
      } catch {
        userNames.set(userId, userId);
        return userId;
      }
    };

    // Format thread messages, excluding the current message and bot messages
    const formatted: string[] = [];

    for (const msg of messages) {
      // Skip the current message (it becomes the prompt)
      if (msg.ts === currentMessageTs) continue;

      // Skip bot messages (our own replies)
      if (msg.bot_id) continue;
      if (botUserId && msg.user === botUserId) continue;

      // Skip messages without text
      if (!msg.text) continue;

      const userName = msg.user ? await resolveUserName(msg.user) : "unknown";
      formatted.push(`[${userName}]: ${msg.text}`);
    }

    if (formatted.length === 0) return undefined;

    let context = formatted.join("\n");

    // Truncate from the beginning if too long (keep most recent messages)
    if (context.length > MAX_THREAD_CONTEXT_LENGTH) {
      context = context.slice(-MAX_THREAD_CONTEXT_LENGTH);
      // Clean up partial first line
      const firstNewline = context.indexOf("\n");
      if (firstNewline > 0) {
        context = "... (earlier messages truncated)\n" + context.slice(firstNewline + 1);
      }
    }

    return context;
  } catch (error) {
    console.error("[Slack] Failed to fetch thread context:", error);
    return undefined;
  }
}

/**
 * Queue a message for processing, optionally with thread context
 */
async function queueMessage(
  client: WebClient,
  channel: string,
  messageTs: string,
  threadTs: string | undefined,
  user: string,
  prompt: string,
  config: Config,
  botUserId?: string
): Promise<void> {
  try {
    // If this message is in a thread, fetch the thread history
    let threadContext: string | undefined;
    if (threadTs) {
      threadContext = await fetchThreadContext(
        client,
        channel,
        threadTs,
        messageTs,
        botUserId
      );

      if (config.bridge.debugMode && threadContext) {
        console.log(
          `[Slack] Fetched thread context (${threadContext.length} chars) for message in thread ${threadTs}`
        );
      }
    }

    // The thread to reply in: use the existing thread, or start a new one from this message
    const replyTs = threadTs || messageTs;

    // Queue the job for background processing
    const jobId = await queueJob({
      channel,
      thread_ts: replyTs,
      user,
      prompt,
      thread_context: threadContext,
    });

    // Send immediate acknowledgment
    await sendQueuedAck(client, channel, replyTs, jobId);

    if (config.bridge.debugMode) {
      console.log(`[Slack] Queued job ${jobId.substring(0, 8)}... for user ${user}`);
    }
  } catch (error) {
    console.error("Failed to queue message:", error);
    const replyTs = threadTs || messageTs;
    await client.chat.postMessage({
      channel,
      thread_ts: replyTs,
      text: "Sorry, something went wrong while queuing your request. Please try again.",
    });
  }
}

/**
 * Register all event handlers
 */
export function registerHandlers(app: App, config: Config) {
  // Handle direct messages
  app.message(async ({ message, say, client, context }: MessageEvent) => {
    // Only handle user messages (not bot messages, etc.)
    if (message.subtype !== undefined) return;
    if (!("text" in message) || !message.text) return;
    if (!("user" in message) || !message.user) return;

    const { text, user, channel, ts } = message;
    const threadTs = "thread_ts" in message ? (message as any).thread_ts : undefined;

    // Check access control
    if (!isUserAllowed(user, config)) {
      if (config.bridge.debugMode) {
        console.log(`User ${user} not allowed`);
      }
      return;
    }

    if (!isChannelAllowed(channel, config)) {
      if (config.bridge.debugMode) {
        console.log(`Channel ${channel} not allowed`);
      }
      return;
    }

    // Check if this is a DM (for DMs we respond to all messages)
    const channelInfo = await client.conversations.info({ channel });
    const isDM = channelInfo.channel?.is_im;

    if (!isDM) {
      // In channels, only respond to @mentions (handled by app_mention)
      return;
    }

    const prompt = extractPrompt(text, context.botUserId);
    if (!prompt) return;

    if (config.bridge.debugMode) {
      console.log(`DM from ${user}: ${prompt}${threadTs ? ` (in thread ${threadTs})` : ""}`);
    }

    // Queue for async processing - returns immediately
    await queueMessage(client, channel, ts, threadTs, user, prompt, config, context.botUserId);
  });

  // Handle @mentions in channels
  app.event("app_mention", async ({ event, say, context, client }: AppMentionEvent) => {
    const { text, user, channel, ts } = event;
    const threadTs = "thread_ts" in event ? (event as any).thread_ts : undefined;

    // Skip if no user (shouldn't happen for app_mention)
    if (!user) return;

    // Check access control
    if (!isUserAllowed(user, config)) {
      if (config.bridge.debugMode) {
        console.log(`User ${user} not allowed`);
      }
      return;
    }

    if (!isChannelAllowed(channel, config)) {
      if (config.bridge.debugMode) {
        console.log(`Channel ${channel} not allowed`);
      }
      return;
    }

    const prompt = extractPrompt(text, context.botUserId);
    if (!prompt) {
      await say("Hi! How can I help you?");
      return;
    }

    if (config.bridge.debugMode) {
      console.log(
        `Mention from ${user} in ${channel}: ${prompt}${threadTs ? ` (in thread ${threadTs})` : ""}`
      );
    }

    // Queue for async processing - returns immediately
    await queueMessage(client, channel, ts, threadTs, user, prompt, config, context.botUserId);
  });
}
