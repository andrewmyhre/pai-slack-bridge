/**
 * Slack event handlers
 */

import type { App, SlackEventMiddlewareArgs, AllMiddlewareArgs } from "@slack/bolt";
import type { Config } from "../config";
import { invokeClaude } from "../bridge/claude-cli";

type MessageEvent = SlackEventMiddlewareArgs<"message"> & AllMiddlewareArgs;
type AppMentionEvent = SlackEventMiddlewareArgs<"app_mention"> & AllMiddlewareArgs;

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
 * Register all event handlers
 */
export function registerHandlers(app: App, config: Config) {
  // Handle direct messages
  app.message(async ({ message, say, client, context }: MessageEvent) => {
    // Only handle user messages (not bot messages, etc.)
    if (message.subtype !== undefined) return;
    if (!("text" in message) || !message.text) return;
    if (!("user" in message) || !message.user) return;

    const { text, user, channel } = message;

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
      console.log(`DM from ${user}: ${prompt}`);
    }

    // Show typing indicator
    // Note: Slack doesn't have a typing indicator API for bots
    // We could post a "thinking..." message and update it

    try {
      const response = await invokeClaude(prompt, config);

      if (response.success) {
        await say(response.output);
      } else {
        await say(`Sorry, I encountered an error: ${response.error}`);
      }

      if (config.bridge.debugMode) {
        console.log(`Response sent in ${response.duration}ms`);
      }
    } catch (error) {
      console.error("Error processing message:", error);
      await say("Sorry, something went wrong. Please try again.");
    }
  });

  // Handle @mentions in channels
  app.event("app_mention", async ({ event, say, context }: AppMentionEvent) => {
    const { text, user, channel } = event;

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
      console.log(`Mention from ${user} in ${channel}: ${prompt}`);
    }

    try {
      const response = await invokeClaude(prompt, config);

      if (response.success) {
        await say(response.output);
      } else {
        await say(`Sorry, I encountered an error: ${response.error}`);
      }

      if (config.bridge.debugMode) {
        console.log(`Response sent in ${response.duration}ms`);
      }
    } catch (error) {
      console.error("Error processing mention:", error);
      await say("Sorry, something went wrong. Please try again.");
    }
  });
}
