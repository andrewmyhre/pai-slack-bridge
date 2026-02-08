/**
 * Slack event handlers
 *
 * Uses async queue for processing - messages are acknowledged immediately
 * and processed in background by the queue processor.
 *
 * When a message comes from a thread, the thread store manages persistent
 * context: seed from Slack API on first encounter, then incremental appends.
 */

import type { App, SlackEventMiddlewareArgs, AllMiddlewareArgs } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { Config } from "../config";
import { queueJob } from "../queue/writer";
import {
  loadThreadFile,
  appendMessage,
  seedFromSlack,
  formatThreadContext,
} from "../queue/thread-store";

type MessageEvent = SlackEventMiddlewareArgs<"message"> & AllMiddlewareArgs;
type AppMentionEvent = SlackEventMiddlewareArgs<"app_mention"> & AllMiddlewareArgs;

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
 * Build thread context using the local thread store.
 *
 * Flow:
 * 1. Check if thread file exists (loadThreadFile)
 * 2. If not, seed from Slack API (seedFromSlack)
 * 3. Append the new user message
 * 4. Format thread context with XML fencing
 *
 * Returns formatted context string or undefined if not in a thread.
 */
async function buildThreadContext(
  client: WebClient,
  channel: string,
  threadTs: string,
  messageTs: string,
  userName: string,
  messageText: string,
  botUserId?: string
): Promise<string | undefined> {
  try {
    // Check if we already have a thread file
    let threadFile = await loadThreadFile(threadTs);

    if (!threadFile) {
      // First encounter with this thread: seed from Slack API
      const bridgeBotId = botUserId || "";
      threadFile = await seedFromSlack(threadTs, channel, bridgeBotId, client);
    }

    // Append the new user message (dedup will prevent duplicates)
    threadFile = await appendMessage(threadTs, channel, {
      role: "user",
      name: userName,
      text: messageText,
      ts: messageTs,
    });

    // Format with XML fencing and prompt budget
    if (threadFile.messages.length <= 1) {
      // Only the current message exists - no prior context needed
      return undefined;
    }

    return formatThreadContext(threadFile);
  } catch (error) {
    console.error("[ThreadStore] Failed to build thread context:", error);
    return undefined;
  }
}

/**
 * Resolve a Slack user ID to a display name.
 */
async function resolveUserName(
  client: WebClient,
  userId: string
): Promise<string> {
  try {
    const userInfo = await client.users.info({ user: userId });
    return (
      userInfo.user?.profile?.display_name ||
      userInfo.user?.real_name ||
      userInfo.user?.name ||
      userId
    );
  } catch {
    return userId;
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
    // If this message is in a thread, build context from thread store
    let threadContext: string | undefined;
    if (threadTs) {
      const userName = await resolveUserName(client, user);
      threadContext = await buildThreadContext(
        client,
        channel,
        threadTs,
        messageTs,
        userName,
        prompt,
        botUserId
      );

      if (config.bridge.debugMode && threadContext) {
        console.log(
          `[ThreadStore] Built thread context (${threadContext.length} chars) for thread ${threadTs}`
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
