import { test, expect, describe } from "bun:test";
import { markdownToMrkdwn } from "../../src/utils/markdown-to-mrkdwn";

describe("markdownToMrkdwn", () => {
  describe("bold", () => {
    test("converts **bold** to *bold*", () => {
      expect(markdownToMrkdwn("**hello**")).toBe("*hello*");
    });

    test("converts multiple bold in one line", () => {
      expect(markdownToMrkdwn("**a** and **b**")).toBe("*a* and *b*");
    });
  });

  describe("italic", () => {
    test("converts *italic* to _italic_", () => {
      expect(markdownToMrkdwn("hello *world*")).toBe("hello _world_");
    });

    test("preserves _italic_ as-is", () => {
      expect(markdownToMrkdwn("_hello_")).toBe("_hello_");
    });
  });

  describe("bold + italic", () => {
    test("converts ***bold italic*** to *_bold italic_*", () => {
      expect(markdownToMrkdwn("***hello***")).toBe("*_hello_*");
    });
  });

  describe("strikethrough", () => {
    test("converts ~~strike~~ to ~strike~", () => {
      expect(markdownToMrkdwn("~~deleted~~")).toBe("~deleted~");
    });
  });

  describe("links", () => {
    test("converts [text](url) to <url|text>", () => {
      expect(markdownToMrkdwn("[Google](https://google.com)")).toBe(
        "<https://google.com|Google>"
      );
    });

    test("converts multiple links", () => {
      expect(
        markdownToMrkdwn("[a](https://a.com) and [b](https://b.com)")
      ).toBe("<https://a.com|a> and <https://b.com|b>");
    });
  });

  describe("images", () => {
    test("converts ![alt](url) to <url|alt>", () => {
      expect(markdownToMrkdwn("![logo](https://example.com/logo.png)")).toBe(
        "<https://example.com/logo.png|logo>"
      );
    });
  });

  describe("headers", () => {
    test("converts # H1 to *H1*", () => {
      expect(markdownToMrkdwn("# Title")).toBe("*Title*");
    });

    test("converts ## H2 to *H2*", () => {
      expect(markdownToMrkdwn("## Subtitle")).toBe("*Subtitle*");
    });

    test("converts ### H3 to *H3*", () => {
      expect(markdownToMrkdwn("### Section")).toBe("*Section*");
    });
  });

  describe("lists", () => {
    test("converts - item to bullet", () => {
      expect(markdownToMrkdwn("- item one")).toBe("• item one");
    });

    test("converts * item to bullet", () => {
      expect(markdownToMrkdwn("* item one")).toBe("• item one");
    });

    test("preserves numbered lists", () => {
      expect(markdownToMrkdwn("1. first")).toBe("1. first");
    });

    test("preserves indentation in nested lists", () => {
      expect(markdownToMrkdwn("  - nested")).toBe("  • nested");
    });
  });

  describe("horizontal rules", () => {
    test("converts --- to unicode line", () => {
      expect(markdownToMrkdwn("---")).toBe("───────────────────────────");
    });

    test("converts *** to unicode line", () => {
      expect(markdownToMrkdwn("***")).toBe("───────────────────────────");
    });
  });

  describe("code", () => {
    test("preserves inline code", () => {
      expect(markdownToMrkdwn("use `npm install`")).toBe("use `npm install`");
    });

    test("does not convert markdown inside inline code", () => {
      expect(markdownToMrkdwn("use `**not bold**`")).toBe(
        "use `**not bold**`"
      );
    });

    test("preserves code blocks", () => {
      const input = "```\nconst x = 1;\n```";
      expect(markdownToMrkdwn(input)).toBe(input);
    });

    test("does not convert markdown inside code blocks", () => {
      const input = "```\n**not bold**\n[not a link](url)\n```";
      expect(markdownToMrkdwn(input)).toBe(input);
    });
  });

  describe("blockquotes", () => {
    test("preserves blockquotes", () => {
      expect(markdownToMrkdwn("> quoted text")).toBe("> quoted text");
    });

    test("converts inline formatting in blockquotes", () => {
      expect(markdownToMrkdwn("> **bold** quote")).toBe("> *bold* quote");
    });
  });

  describe("mixed content", () => {
    test("handles empty string", () => {
      expect(markdownToMrkdwn("")).toBe("");
    });

    test("handles plain text", () => {
      expect(markdownToMrkdwn("just plain text")).toBe("just plain text");
    });

    test("handles multiline with mixed formatting", () => {
      const input = [
        "# Task Complete",
        "",
        "**Status:** All tests passing",
        "",
        "- Fixed the [bug](https://github.com/issues/1)",
        "- Updated `config.ts`",
        "",
        "```",
        "const x = **not converted**;",
        "```",
      ].join("\n");

      const expected = [
        "*Task Complete*",
        "",
        "*Status:* All tests passing",
        "",
        "• Fixed the <https://github.com/issues/1|bug>",
        "• Updated `config.ts`",
        "",
        "```",
        "const x = **not converted**;",
        "```",
      ].join("\n");

      expect(markdownToMrkdwn(input)).toBe(expected);
    });
  });

  describe("PAI Algorithm output", () => {
    test("converts typical PAI summary output", () => {
      const input = [
        "## Summary",
        "",
        "**PR #130** merged successfully.",
        "",
        "- Added `/full` endpoint for TIFF serving",
        "- [View PR](https://github.com/andrewmyhre/donk/pull/130)",
        "",
        "---",
        "",
        "### Next Steps",
        "",
        "1. Review the ~~old~~ approach",
        "2. Deploy to *staging*",
      ].join("\n");

      const expected = [
        "*Summary*",
        "",
        "*PR #130* merged successfully.",
        "",
        "• Added `/full` endpoint for TIFF serving",
        "• <https://github.com/andrewmyhre/donk/pull/130|View PR>",
        "",
        "───────────────────────────",
        "",
        "*Next Steps*",
        "",
        "1. Review the ~old~ approach",
        "2. Deploy to _staging_",
      ].join("\n");

      expect(markdownToMrkdwn(input)).toBe(expected);
    });
  });
});
