/**
 * Slack event handlers
 *
 * Handles DMs, @mentions, and thread replies. All responses include:
 * - Thread-aware replies (thread_ts)
 * - "Thinking..." indicator that gets replaced with the response
 * - Markdown-to-Slack mrkdwn conversion
 * - Thread context for conversational continuity
 */

import type {
  App,
  SlackEventMiddlewareArgs,
  AllMiddlewareArgs,
} from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { Config } from "../config";
import { invokeClaude } from "../bridge/claude-cli";
import { markdownToSlack } from "../utils/markdown-to-slack";
import { formatThreadContext } from "../utils/thread-context";
import type { ThreadMessage } from "../utils/thread-context";

type MessageEvent = SlackEventMiddlewareArgs<"message"> & AllMiddlewareArgs;
type AppMentionEvent = SlackEventMiddlewareArgs<"app_mention"> &
  AllMiddlewareArgs;

/**
 * Check if a user is allowed to use the bridge
 */
function isUserAllowed(userId: string, config: Config): boolean {
  if (
    !config.bridge.allowedUsers ||
    config.bridge.allowedUsers.length === 0
  ) {
    return true; // No restrictions
  }
  return config.bridge.allowedUsers.includes(userId);
}

/**
 * Check if a channel is allowed
 */
function isChannelAllowed(channelId: string, config: Config): boolean {
  if (
    !config.bridge.allowedChannels ||
    config.bridge.allowedChannels.length === 0
  ) {
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
 * Fetch thread history and build a contextual prompt for Claude
 */
async function buildThreadPrompt(
  client: WebClient,
  channel: string,
  threadTs: string,
  currentMessage: string,
  currentTs: string,
  botUserId: string
): Promise<string> {
  try {
    const threadResponse = await client.conversations.replies({
      channel,
      ts: threadTs,
    });

    const messages: ThreadMessage[] = (threadResponse.messages ?? [])
      .filter((m) => m.user && m.text)
      .map((m) => ({
        user: m.user!,
        text: m.text!,
        ts: m.ts!,
      }));

    return formatThreadContext(messages, currentMessage, botUserId, currentTs);
  } catch {
    // If we can't fetch thread history, just use the current message
    return currentMessage;
  }
}

/**
 * Post a "Thinking..." message and return its timestamp for later update
 */
async function postThinkingMessage(
  client: WebClient,
  channel: string,
  threadTs: string
): Promise<string | undefined> {
  try {
    const result = await client.chat.postMessage({
      channel,
      text: "_Thinking..._",
      thread_ts: threadTs,
    });
    return result.ts;
  } catch {
    // Non-fatal: if we can't post thinking message, continue without it
    return undefined;
  }
}

/**
 * Update the thinking message with the actual response, or post a new message
 */
async function sendResponse(
  client: WebClient,
  channel: string,
  threadTs: string,
  thinkingTs: string | undefined,
  text: string
): Promise<void> {
  const formattedText = markdownToSlack(text);

  if (thinkingTs) {
    try {
      await client.chat.update({
        channel,
        ts: thinkingTs,
        text: formattedText,
      });
      return;
    } catch {
      // Fall through to postMessage if update fails
    }
  }

  await client.chat.postMessage({
    channel,
    text: formattedText,
    thread_ts: threadTs,
  });
}

/**
 * Register all event handlers
 */
export function registerHandlers(app: App, config: Config) {
  // Handle direct messages and thread replies
  app.message(async ({ message, say, client, context }: MessageEvent) => {
    // Only handle user messages (not bot messages, etc.)
    if (message.subtype !== undefined) return;
    if (!("text" in message) || !message.text) return;
    if (!("user" in message) || !message.user) return;

    const { text, user, channel } = message;
    const threadTs =
      "thread_ts" in message ? (message.thread_ts as string | undefined) : undefined;
    const messageTs = message.ts;

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

    // Determine if we should process this message:
    // 1. DMs: always process
    // 2. Channel thread replies: process if in a thread (bot was mentioned to start it)
    // 3. Channel top-level messages: skip (handled by app_mention)
    const channelInfo = await client.conversations.info({ channel });
    const isDM = channelInfo.channel?.is_im;

    if (!isDM && !threadTs) {
      // Top-level channel message without mention — skip
      return;
    }

    // Skip channel messages that mention the bot — handled by app_mention to avoid double-posting
    if (!isDM && context.botUserId && text.includes(`<@${context.botUserId}>`)) {
      return;
    }

    const prompt = extractPrompt(text, context.botUserId);
    if (!prompt) return;

    // For thread replies, build contextual prompt with thread history
    const replyTs = threadTs ?? messageTs;
    const fullPrompt =
      threadTs && context.botUserId
        ? await buildThreadPrompt(
            client,
            channel,
            threadTs,
            prompt,
            messageTs,
            context.botUserId
          )
        : prompt;

    if (config.bridge.debugMode) {
      const source = isDM ? "DM" : "thread reply";
      console.log(`${source} from ${user}: ${prompt}`);
    }

    // Post "Thinking..." indicator
    const thinkingTs = await postThinkingMessage(client, channel, replyTs);

    try {
      const response = await invokeClaude(fullPrompt, config);

      if (response.success) {
        await sendResponse(client, channel, replyTs, thinkingTs, response.output);
      } else {
        await sendResponse(
          client,
          channel,
          replyTs,
          thinkingTs,
          `Sorry, I encountered an error: ${response.error}`
        );
      }

      if (config.bridge.debugMode) {
        console.log(`Response sent in ${response.duration}ms`);
      }
    } catch (error) {
      console.error("Error processing message:", error);
      await sendResponse(
        client,
        channel,
        replyTs,
        thinkingTs,
        "Sorry, something went wrong. Please try again."
      );
    }
  });

  // Handle @mentions in channels
  app.event(
    "app_mention",
    async ({ event, say, client, context }: AppMentionEvent) => {
      const { text, user, channel, ts: eventTs, thread_ts: eventThreadTs } = event;

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

      // Reply in thread: use existing thread_ts, or start new thread under this message
      const threadTs = eventThreadTs ?? eventTs;

      if (!prompt) {
        await say({ text: "Hi! How can I help you?", thread_ts: threadTs });
        return;
      }

      // For mentions in existing threads, build contextual prompt
      const fullPrompt =
        eventThreadTs && context.botUserId
          ? await buildThreadPrompt(
              client,
              channel,
              eventThreadTs,
              prompt,
              eventTs,
              context.botUserId
            )
          : prompt;

      if (config.bridge.debugMode) {
        console.log(`Mention from ${user} in ${channel}: ${prompt}`);
      }

      // Post "Thinking..." indicator
      const thinkingTs = await postThinkingMessage(client, channel, threadTs);

      try {
        const response = await invokeClaude(fullPrompt, config);

        if (response.success) {
          await sendResponse(
            client,
            channel,
            threadTs,
            thinkingTs,
            response.output
          );
        } else {
          await sendResponse(
            client,
            channel,
            threadTs,
            thinkingTs,
            `Sorry, I encountered an error: ${response.error}`
          );
        }

        if (config.bridge.debugMode) {
          console.log(`Response sent in ${response.duration}ms`);
        }
      } catch (error) {
        console.error("Error processing mention:", error);
        await sendResponse(
          client,
          channel,
          threadTs,
          thinkingTs,
          "Sorry, something went wrong. Please try again."
        );
      }
    }
  );
}
