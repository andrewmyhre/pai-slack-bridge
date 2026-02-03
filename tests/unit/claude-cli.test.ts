import { test, expect, describe, mock } from "bun:test";

// We'll test the formatting functions by importing them
// For now, test the ANSI stripping logic inline

describe("Claude CLI", () => {
  describe("ANSI stripping", () => {
    const stripAnsi = (text: string): string => {
      // eslint-disable-next-line no-control-regex
      return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
    };

    test("strips color codes", () => {
      const input = "\x1B[31mRed text\x1B[0m";
      expect(stripAnsi(input)).toBe("Red text");
    });

    test("strips bold/underline codes", () => {
      const input = "\x1B[1mBold\x1B[0m \x1B[4mUnderline\x1B[0m";
      expect(stripAnsi(input)).toBe("Bold Underline");
    });

    test("handles text without ANSI codes", () => {
      const input = "Plain text";
      expect(stripAnsi(input)).toBe("Plain text");
    });

    test("handles empty string", () => {
      expect(stripAnsi("")).toBe("");
    });
  });

  describe("output truncation", () => {
    const formatForSlack = (text: string, maxLength: number): string => {
      if (text.length > maxLength) {
        return text.substring(0, maxLength - 100) + "\n\n... (output truncated)";
      }
      return text;
    };

    test("truncates long output", () => {
      const longText = "a".repeat(5000);
      const result = formatForSlack(longText, 4000);
      expect(result.length).toBeLessThanOrEqual(4000);
      expect(result).toContain("(output truncated)");
    });

    test("preserves short output", () => {
      const shortText = "Hello, world!";
      const result = formatForSlack(shortText, 4000);
      expect(result).toBe(shortText);
    });
  });
});
