/**
 * Thread context formatting for Claude prompts
 *
 * When the bot participates in a Slack thread, we fetch the full thread
 * history and format it as context so Claude can maintain conversational
 * continuity.
 */

export interface ThreadMessage {
  user: string;
  text: string;
  ts: string;
}

/**
 * Format thread history into a context string for Claude
 *
 * @param messages - Thread messages from conversations.replies
 * @param currentMessage - The new message being processed
 * @param botUserId - The bot's user ID (to label bot messages as [PAI])
 * @param currentTs - Timestamp of the current message (to exclude from history)
 * @returns Formatted context string, or just the message if no thread history
 */
export function formatThreadContext(
  messages: ThreadMessage[],
  currentMessage: string,
  botUserId: string,
  currentTs?: string
): string {
  // Filter out the current message from thread history
  const historyMessages = currentTs
    ? messages.filter((m) => m.ts !== currentTs)
    : messages;

  // If no thread history, just return the message directly
  if (historyMessages.length === 0) {
    return currentMessage;
  }

  const formattedHistory = historyMessages
    .map((msg) => {
      const label = msg.user === botUserId ? "[PAI]" : "[User]";
      // Strip bot mentions from message text
      const cleanText = msg.text
        .replace(new RegExp(`<@${botUserId}>\\s*`, "g"), "")
        .trim();
      return `${label}: ${cleanText}`;
    })
    .join("\n");

  return `Thread context:\n${formattedHistory}\n\nCurrent message: ${currentMessage}`;
}
