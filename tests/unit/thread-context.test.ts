import { test, expect, describe } from "bun:test";
import { formatThreadContext } from "../../src/utils/thread-context";

describe("formatThreadContext", () => {
  test("formats a simple thread with two messages", () => {
    const messages = [
      { user: "U123", text: "<@BBOT> What is TypeScript?", ts: "1" },
      { user: "BBOT", text: "TypeScript is a typed superset of JavaScript.", ts: "2" },
    ];
    const currentMessage = "Can you give me an example?";
    const botUserId = "BBOT";

    const result = formatThreadContext(messages, currentMessage, botUserId);

    expect(result).toContain("Thread context:");
    expect(result).toContain("[User]: What is TypeScript?");
    expect(result).toContain("[PAI]: TypeScript is a typed superset of JavaScript.");
    expect(result).toContain("Current message: Can you give me an example?");
  });

  test("strips bot mention from thread messages", () => {
    const messages = [
      { user: "U123", text: "<@BBOT> help me", ts: "1" },
    ];

    const result = formatThreadContext(messages, "follow up", "BBOT");
    expect(result).toContain("[User]: help me");
    expect(result).not.toContain("<@BBOT>");
  });

  test("labels bot messages as [PAI]", () => {
    const messages = [
      { user: "BBOT", text: "I can help with that.", ts: "1" },
    ];

    const result = formatThreadContext(messages, "thanks", "BBOT");
    expect(result).toContain("[PAI]: I can help with that.");
  });

  test("handles multiple users in thread", () => {
    const messages = [
      { user: "U001", text: "<@BBOT> question", ts: "1" },
      { user: "BBOT", text: "answer", ts: "2" },
      { user: "U002", text: "another question", ts: "3" },
    ];

    const result = formatThreadContext(messages, "my reply", "BBOT");
    expect(result).toContain("[User]: question");
    expect(result).toContain("[PAI]: answer");
    expect(result).toContain("[User]: another question");
    expect(result).toContain("Current message: my reply");
  });

  test("excludes the current message from thread context", () => {
    // The last message in the thread is the current one being processed.
    // It should appear only as "Current message:", not in the thread context.
    const messages = [
      { user: "U001", text: "<@BBOT> start", ts: "1" },
      { user: "BBOT", text: "response", ts: "2" },
      { user: "U001", text: "follow up", ts: "3" },
    ];

    const result = formatThreadContext(messages, "follow up", "BBOT", "3");
    // The message with ts "3" should not appear in thread context section
    const contextSection = result.split("Current message:")[0]!;
    expect(contextSection).not.toContain("follow up");
    expect(result).toContain("Current message: follow up");
  });

  test("handles empty thread (only current message)", () => {
    const messages: Array<{ user: string; text: string; ts: string }> = [];
    const result = formatThreadContext(messages, "hello", "BBOT");
    expect(result).toBe("hello");
  });

  test("handles thread with only bot messages before current", () => {
    const messages = [
      { user: "U001", text: "<@BBOT> initial", ts: "1" },
      { user: "BBOT", text: "I responded", ts: "2" },
    ];

    const result = formatThreadContext(messages, "new question", "BBOT");
    expect(result).toContain("Thread context:");
    expect(result).toContain("[User]: initial");
    expect(result).toContain("[PAI]: I responded");
    expect(result).toContain("Current message: new question");
  });
});
