import { test, expect, describe } from "bun:test";
import { markdownToSlack } from "../../src/utils/markdown-to-slack";

describe("markdownToSlack", () => {
  describe("bold conversion", () => {
    test("converts **bold** to *bold*", () => {
      expect(markdownToSlack("This is **bold** text")).toBe(
        "This is *bold* text"
      );
    });

    test("converts multiple bold segments", () => {
      expect(markdownToSlack("**one** and **two**")).toBe("*one* and *two*");
    });

    test("converts __bold__ to *bold*", () => {
      expect(markdownToSlack("This is __bold__ text")).toBe(
        "This is *bold* text"
      );
    });
  });

  describe("italic conversion", () => {
    test("converts single *italic* to _italic_", () => {
      expect(markdownToSlack("This is *italic* text")).toBe(
        "This is _italic_ text"
      );
    });

    test("converts _italic_ to _italic_ (unchanged)", () => {
      expect(markdownToSlack("This is _italic_ text")).toBe(
        "This is _italic_ text"
      );
    });
  });

  describe("bold and italic together", () => {
    test("handles bold and italic in same string", () => {
      const input = "**bold** and *italic* text";
      const result = markdownToSlack(input);
      expect(result).toBe("*bold* and _italic_ text");
    });
  });

  describe("heading conversion", () => {
    test("converts # Heading to *Heading*", () => {
      expect(markdownToSlack("# Main Title")).toBe("*Main Title*");
    });

    test("converts ## Heading to *Heading*", () => {
      expect(markdownToSlack("## Section")).toBe("*Section*");
    });

    test("converts ### Heading to *Heading*", () => {
      expect(markdownToSlack("### Subsection")).toBe("*Subsection*");
    });

    test("handles heading in multiline text", () => {
      const input = "Some text\n## Heading\nMore text";
      const result = markdownToSlack(input);
      expect(result).toBe("Some text\n*Heading*\nMore text");
    });
  });

  describe("link conversion", () => {
    test("converts [text](url) to <url|text>", () => {
      expect(markdownToSlack("[Google](https://google.com)")).toBe(
        "<https://google.com|Google>"
      );
    });

    test("converts multiple links", () => {
      const input = "[one](https://one.com) and [two](https://two.com)";
      expect(markdownToSlack(input)).toBe(
        "<https://one.com|one> and <https://two.com|two>"
      );
    });
  });

  describe("list conversion", () => {
    test("converts - item to bullet point", () => {
      expect(markdownToSlack("- First item")).toBe("\u2022 First item");
    });

    test("converts multiple list items", () => {
      const input = "- One\n- Two\n- Three";
      expect(markdownToSlack(input)).toBe(
        "\u2022 One\n\u2022 Two\n\u2022 Three"
      );
    });

    test("converts * item to bullet point", () => {
      // Standalone * at line start followed by space is a list item
      expect(markdownToSlack("* First item")).toBe("\u2022 First item");
    });
  });

  describe("horizontal rule conversion", () => {
    test("converts --- to em dashes", () => {
      expect(markdownToSlack("---")).toBe("\u2014\u2014\u2014");
    });

    test("converts --- in multiline context", () => {
      const input = "Above\n---\nBelow";
      expect(markdownToSlack(input)).toBe(
        "Above\n\u2014\u2014\u2014\nBelow"
      );
    });
  });

  describe("code preservation", () => {
    test("preserves inline code", () => {
      expect(markdownToSlack("Use `console.log()`")).toBe(
        "Use `console.log()`"
      );
    });

    test("preserves code blocks", () => {
      const input = "```\nconst x = 1;\n```";
      expect(markdownToSlack(input)).toBe("```\nconst x = 1;\n```");
    });

    test("does not convert markdown inside code blocks", () => {
      const input = "```\n**not bold** and *not italic*\n```";
      expect(markdownToSlack(input)).toBe(
        "```\n**not bold** and *not italic*\n```"
      );
    });

    test("does not convert markdown inside inline code", () => {
      expect(markdownToSlack("Use `**bold**` in code")).toBe(
        "Use `**bold**` in code"
      );
    });
  });

  describe("mixed content", () => {
    test("handles a realistic Claude response", () => {
      const input = [
        "# Summary",
        "",
        "Here's what I found:",
        "",
        "- **Item 1**: The [docs](https://docs.example.com) say this",
        "- **Item 2**: Use `bun test` to verify",
        "",
        "---",
        "",
        "## Details",
        "",
        "This is *important* to note.",
        "",
        "```typescript",
        "const result = await fetch(url);",
        "```",
      ].join("\n");

      const expected = [
        "*Summary*",
        "",
        "Here's what I found:",
        "",
        "\u2022 *Item 1*: The <https://docs.example.com|docs> say this",
        "\u2022 *Item 2*: Use `bun test` to verify",
        "",
        "\u2014\u2014\u2014",
        "",
        "*Details*",
        "",
        "This is _important_ to note.",
        "",
        "```typescript",
        "const result = await fetch(url);",
        "```",
      ].join("\n");

      expect(markdownToSlack(input)).toBe(expected);
    });
  });

  describe("edge cases", () => {
    test("handles empty string", () => {
      expect(markdownToSlack("")).toBe("");
    });

    test("handles plain text without markdown", () => {
      expect(markdownToSlack("Just plain text")).toBe("Just plain text");
    });

    test("handles asterisks in math expressions (not bold)", () => {
      // Single asterisks surrounded by spaces should not be treated as italic markers
      expect(markdownToSlack("2 * 3 = 6")).toBe("2 * 3 = 6");
    });
  });
});
