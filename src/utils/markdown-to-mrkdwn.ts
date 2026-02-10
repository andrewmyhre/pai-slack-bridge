/**
 * Markdown to Slack mrkdwn converter
 *
 * Converts GitHub-flavored markdown (as produced by Claude)
 * to Slack's mrkdwn format for proper rendering in Slack messages.
 *
 * Key differences:
 * - Bold: **text** → *text*
 * - Italic: *text* or _text_ → _text_
 * - Strikethrough: ~~text~~ → ~text~
 * - Links: [text](url) → <url|text>
 * - Images: ![alt](url) → <url|alt>
 * - Headers: # Header → *Header*
 * - Lists: - item → • item
 * - HR: --- → ───────
 * - Code blocks and inline code: same in both formats
 */

/**
 * Convert GitHub-flavored markdown to Slack mrkdwn
 */
export function markdownToMrkdwn(text: string): string {
  if (!text) return text;

  const lines = text.split("\n");
  const result: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    // Track code block boundaries — don't convert inside code blocks
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }

    if (inCodeBlock) {
      result.push(line);
      continue;
    }

    result.push(convertLine(line));
  }

  return result.join("\n");
}

/**
 * Convert a single line of markdown to mrkdwn (outside code blocks)
 */
function convertLine(line: string): string {
  // Horizontal rules: --- or *** or ___ → unicode line
  if (/^\s*[-*_]{3,}\s*$/.test(line)) {
    return "───────────────────────────";
  }

  // Headers: # Header → *Header*
  const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
  if (headerMatch && headerMatch[2]) {
    return `*${headerMatch[2].trim()}*`;
  }

  // Unordered list items: - item or * item → • item
  // Preserve indentation for nested lists
  const listMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
  if (listMatch && listMatch[2]) {
    const indent = listMatch[1] ?? "";
    const content = convertInline(listMatch[2]);
    return `${indent}• ${content}`;
  }

  // Ordered list items: keep as-is but convert inline content
  const orderedMatch = line.match(/^(\s*)(\d+\.)\s+(.+)$/);
  if (orderedMatch && orderedMatch[3]) {
    const indent = orderedMatch[1] ?? "";
    const num = orderedMatch[2] ?? "";
    const content = convertInline(orderedMatch[3]);
    return `${indent}${num} ${content}`;
  }

  // Blockquotes are the same in both formats, just convert inline
  if (line.startsWith(">")) {
    const content = line.replace(/^>\s?/, "");
    return `> ${convertInline(content)}`;
  }

  // Table rows: | col | col | → preserve as-is (Slack doesn't support tables)
  // But convert inline formatting within cells
  if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
    // Skip separator rows (|---|---|)
    if (/^\s*\|[\s-:|]+\|\s*$/.test(line)) {
      return line;
    }
    // Convert inline formatting in table cells
    return line.replace(/(?<=\|)[^|]+(?=\|)/g, (cell) => convertInline(cell));
  }

  // Regular line: convert inline formatting
  return convertInline(line);
}

/**
 * Convert inline markdown formatting to Slack mrkdwn
 *
 * Processing order matters to avoid double-conversion.
 * We use placeholder tokens (\x00BOLD...\x00) to prevent
 * converted bold from being re-matched by the italic regex.
 */
function convertInline(text: string): string {
  if (!text) return text;

  // Extract and protect inline code spans
  const codeSpans: string[] = [];
  let processed = text.replace(/`([^`]+)`/g, (_match: string, code: string) => {
    codeSpans.push(code);
    return `\x00CODE${codeSpans.length - 1}\x00`;
  });

  // Images: ![alt](url) → <url|alt>
  processed = processed.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_match: string, alt: string, url: string) => `<${url}|${alt || "image"}>`
  );

  // Links: [text](url) → <url|text>
  processed = processed.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match: string, linkText: string, url: string) => `<${url}|${linkText}>`
  );

  // Bold+italic: ***text*** → *_text_* (protect with placeholder)
  const boldItalicSpans: string[] = [];
  processed = processed.replace(
    /\*{3}([^*]+)\*{3}/g,
    (_match: string, content: string) => {
      boldItalicSpans.push(`*_${content}_*`);
      return `\x00BI${boldItalicSpans.length - 1}\x00`;
    }
  );

  // Bold: **text** → *text* (protect with placeholder)
  const boldSpans: string[] = [];
  processed = processed.replace(
    /\*{2}([^*]+)\*{2}/g,
    (_match: string, content: string) => {
      boldSpans.push(`*${content}*`);
      return `\x00BOLD${boldSpans.length - 1}\x00`;
    }
  );

  // Italic with asterisks (single): *text* → _text_
  processed = processed.replace(
    /(?<!\*)\*([^*]+)\*(?!\*)/g,
    (_match: string, content: string) => `_${content}_`
  );

  // Strikethrough: ~~text~~ → ~text~
  processed = processed.replace(
    /~~([^~]+)~~/g,
    (_match: string, content: string) => `~${content}~`
  );

  // Restore all placeholders
  processed = processed.replace(/\x00BI(\d+)\x00/g, (_match: string, idx: string) => {
    return boldItalicSpans[parseInt(idx)] ?? "";
  });
  processed = processed.replace(/\x00BOLD(\d+)\x00/g, (_match: string, idx: string) => {
    return boldSpans[parseInt(idx)] ?? "";
  });
  processed = processed.replace(/\x00CODE(\d+)\x00/g, (_match: string, idx: string) => {
    return "`" + (codeSpans[parseInt(idx)] ?? "") + "`";
  });

  return processed;
}
