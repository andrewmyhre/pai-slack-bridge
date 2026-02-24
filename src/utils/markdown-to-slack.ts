/**
 * Convert standard Markdown to Slack mrkdwn format
 *
 * Slack uses a subset of markdown called "mrkdwn" with different syntax:
 * - Bold: *text* (not **text**)
 * - Italic: _text_ (not *text*)
 * - Links: <url|text> (not [text](url))
 * - No heading syntax (use bold instead)
 * - Lists use bullet character
 */

/**
 * Split text into code and non-code segments to avoid converting
 * markdown syntax inside code blocks and inline code.
 */
function splitCodeSegments(
  text: string
): Array<{ content: string; isCode: boolean }> {
  const segments: Array<{ content: string; isCode: boolean }> = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Check for code block first (```)
    const codeBlockMatch = remaining.match(/^(```[\s\S]*?```)/);
    if (codeBlockMatch) {
      segments.push({ content: codeBlockMatch[1]!, isCode: true });
      remaining = remaining.slice(codeBlockMatch[1]!.length);
      continue;
    }

    // Check for inline code (`)
    const inlineCodeMatch = remaining.match(/^(`[^`]+`)/);
    if (inlineCodeMatch) {
      segments.push({ content: inlineCodeMatch[1]!, isCode: true });
      remaining = remaining.slice(inlineCodeMatch[1]!.length);
      continue;
    }

    // Find the next code segment
    const nextCode = remaining.search(/```|`/);
    if (nextCode === -1) {
      // No more code segments
      segments.push({ content: remaining, isCode: false });
      break;
    }

    // Add the non-code part
    if (nextCode > 0) {
      segments.push({ content: remaining.slice(0, nextCode), isCode: false });
    }
    remaining = remaining.slice(nextCode);
  }

  return segments;
}

// Placeholder tokens that won't appear in real text
const BOLD_OPEN = "\x00BOLD_O\x00";
const BOLD_CLOSE = "\x00BOLD_C\x00";

/**
 * Convert markdown formatting in non-code text to Slack mrkdwn
 */
function convertNonCodeSegment(text: string): string {
  let result = text;

  // Convert links: [text](url) -> <url|text>
  // Do this early before bold/italic conversion could interfere
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    "<$2|$1>"
  );

  // Phase 1: Convert bold to placeholder tokens so italic regex won't catch them
  // **text** or __text__ -> BOLD_OPEN text BOLD_CLOSE
  result = result.replace(/\*\*(.+?)\*\*/g, `${BOLD_OPEN}$1${BOLD_CLOSE}`);
  result = result.replace(/__(.+?)__/g, `${BOLD_OPEN}$1${BOLD_CLOSE}`);

  // Phase 2: Convert italic (single * that are not bold placeholders)
  // Only match *text* where asterisks are not surrounded by spaces
  // (to avoid matching things like "2 * 3 = 6")
  result = result.replace(/(?<!\*)\*(?!\*| )(.+?)(?<! )\*(?!\*)/g, "_$1_");

  // Phase 3: Convert list items that use * syntax (before restoring bold)
  // Must be at line start followed by space
  result = result.replace(/^\* (.+)$/gm, "\u2022 $1");

  // Phase 4: Restore bold placeholders to Slack bold syntax (*)
  result = result.replace(new RegExp(escapeRegExp(BOLD_OPEN), "g"), "*");
  result = result.replace(new RegExp(escapeRegExp(BOLD_CLOSE), "g"), "*");

  // Convert headings: # Heading -> *Heading* (per line)
  result = result.replace(/^#{1,6}\s+(.+)$/gm, "*$1*");

  // Convert horizontal rules: --- -> em dashes
  result = result.replace(/^---$/gm, "\u2014\u2014\u2014");

  // Convert unordered list items: - item -> bullet item
  result = result.replace(/^- (.+)$/gm, "\u2022 $1");

  return result;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Convert standard Markdown to Slack mrkdwn format
 */
export function markdownToSlack(text: string): string {
  if (!text) return text;

  const segments = splitCodeSegments(text);

  return segments.map((seg) => {
    if (seg.isCode) return seg.content;
    return convertNonCodeSegment(seg.content);
  }).join("");
}
