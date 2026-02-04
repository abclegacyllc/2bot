/**
 * Model Router Tests
 *
 * Tests for smart model routing functionality.
 *
 * @module modules/2bot-ai-provider/__tests__/model-router.test
 */

import { describe, expect, it } from "vitest";
import { classifyQueryComplexity } from "../model-router";
import type { TextGenerationMessage } from "../types";

// ===========================================
// Helper to create test messages
// ===========================================

function createMessages(content: string, role: "user" | "assistant" = "user"): TextGenerationMessage[] {
  return [{ role, content }];
}

function createConversation(messages: Array<{ role: "user" | "assistant"; content: string }>): TextGenerationMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

// ===========================================
// classifyQueryComplexity Tests
// ===========================================

describe("classifyQueryComplexity", () => {
  describe("simple queries", () => {
    it("classifies simple greetings as simple", () => {
      const greetings = ["hi", "hello", "hey", "Hello!", "Hi there", "good morning"];
      for (const greeting of greetings) {
        const result = classifyQueryComplexity(createMessages(greeting));
        expect(result).toBe("simple");
      }
    });

    it("classifies simple acknowledgments as simple", () => {
      const acknowledgments = ["yes", "no", "ok", "okay", "sure", "thanks", "thank you"];
      for (const ack of acknowledgments) {
        const result = classifyQueryComplexity(createMessages(ack));
        expect(result).toBe("simple");
      }
    });

    it("classifies very short messages as simple", () => {
      const result = classifyQueryComplexity(createMessages("how are you"));
      // Short message without technical content should lean simple
      expect(["simple", "medium"]).toContain(result);
    });

    it("classifies multilingual greetings as simple", () => {
      const greetings = ["salom", "привет", "assalomu alaykum"];
      for (const greeting of greetings) {
        const result = classifyQueryComplexity(createMessages(greeting));
        expect(result).toBe("simple");
      }
    });
  });

  describe("complex queries", () => {
    it("classifies code requests as complex", () => {
      const codeQuery = `Can you help me implement a function that does:
\`\`\`javascript
function processData(items) {
  // Need help here
}
\`\`\``;
      const result = classifyQueryComplexity(createMessages(codeQuery));
      expect(result).toBe("complex");
    });

    it("classifies technical keywords as complex", () => {
      const technicalQueries = [
        "Please analyze this algorithm and explain how it works",
        "I need to implement a comprehensive solution for this problem",
        "Can you help me debug this and refactor the code",
        "Investigate this step-by-step and explain the architecture",
      ];
      for (const query of technicalQueries) {
        const result = classifyQueryComplexity(createMessages(query));
        expect(result).toBe("complex");
      }
    });

    it("classifies messages with code keywords as complex", () => {
      const codeMessages = [
        "function calculateSum(a, b) { return a + b; }",
        "const data = await fetch(url)",
        "import React from 'react'",
        "export default class MyComponent",
      ];
      for (const msg of codeMessages) {
        const result = classifyQueryComplexity(createMessages(msg));
        expect(result).toBe("complex");
      }
    });

    it("classifies very long messages as complex", () => {
      const longMessage = "This is a detailed question. ".repeat(30);
      const result = classifyQueryComplexity(createMessages(longMessage));
      expect(result).toBe("complex");
    });

    it("classifies messages with images as complex", () => {
      const messageWithImage: TextGenerationMessage[] = [
        {
          role: "user",
          content: "What's in this image?",
          parts: [
            { type: "text", text: "What's in this image?" },
            { type: "image_url", image_url: { url: "data:image/png;base64,..." } },
          ],
        },
      ];
      const result = classifyQueryComplexity(messageWithImage);
      expect(result).toBe("complex");
    });
  });

  describe("medium queries", () => {
    it("classifies moderate questions as medium", () => {
      const mediumQueries = [
        "What is the capital of France and what are some famous landmarks there?",
        "Can you explain how HTTP works in web development?",
        "What are the differences between SQL and NoSQL databases?",
      ];
      for (const query of mediumQueries) {
        const result = classifyQueryComplexity(createMessages(query));
        // Medium queries should NOT be simple
        expect(result).not.toBe("simple");
      }
    });

    it("classifies content generation requests appropriately", () => {
      const contentRequest = "Write an article about climate change";
      const result = classifyQueryComplexity(createMessages(contentRequest));
      // Content generation adds +1, so should be at least medium
      expect(["medium", "complex"]).toContain(result);
    });
  });

  describe("conversation depth", () => {
    it("considers deep conversations as more complex", () => {
      const deepConversation = createConversation([
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi!" },
        { role: "user", content: "How are you?" },
        { role: "assistant", content: "Good, thanks!" },
        { role: "user", content: "What's the weather?" },
        { role: "assistant", content: "I don't know the weather." },
        { role: "user", content: "Tell me more about that topic" }, // 4th user message
      ]);
      // Deep conversation should add complexity
      const result = classifyQueryComplexity(deepConversation);
      // Even "Tell me more" becomes more complex with deep context
      expect(["medium", "complex"]).toContain(result);
    });
  });

  describe("multiple questions", () => {
    it("considers multiple questions as more complex", () => {
      const multiQuestion = "What is AI? How does it work? Can you give examples?";
      const result = classifyQueryComplexity(createMessages(multiQuestion));
      // Multiple questions should push toward complexity
      expect(["medium", "complex"]).toContain(result);
    });
  });

  describe("edge cases", () => {
    it("handles empty messages array", () => {
      const result = classifyQueryComplexity([]);
      expect(result).toBe("medium"); // Default when no user message
    });

    it("handles messages with only assistant messages", () => {
      const result = classifyQueryComplexity([
        { role: "assistant", content: "Hello!" },
      ]);
      expect(result).toBe("medium"); // Default when no user message
    });

    it("handles messages with only system messages", () => {
      const result = classifyQueryComplexity([
        { role: "system", content: "You are a helpful assistant." },
      ]);
      expect(result).toBe("medium"); // Default when no user message
    });

    it("uses the last user message for classification", () => {
      const conversation = createConversation([
        { role: "user", content: "Tell me about the complex architecture of microservices" },
        { role: "assistant", content: "Here's an explanation..." },
        { role: "user", content: "thanks" }, // Last user message is simple
      ]);
      const result = classifyQueryComplexity(conversation);
      expect(result).toBe("simple"); // Last message is "thanks"
    });
  });

  describe("regression tests - fixed issues", () => {
    it("does NOT classify 'Fix this bug' as simple (issue #2)", () => {
      // Previously, `/^.{1,20}$/` pattern would match this as simple
      const result = classifyQueryComplexity(createMessages("Fix this bug"));
      // "Fix" doesn't match technical patterns but "bug" context matters
      // This should NOT be classified as simple due to tech context
      expect(result).not.toBe("simple");
    });

    it("properly handles 'debug' keyword as complex", () => {
      const result = classifyQueryComplexity(createMessages("Debug this please"));
      expect(result).toBe("complex");
    });

    it("handles punctuation variations in greetings", () => {
      const greetingsWithPunctuation = ["hello!", "hello.", "hello?", "Hi!!", "Hey..."];
      for (const greeting of greetingsWithPunctuation) {
        const result = classifyQueryComplexity(createMessages(greeting));
        expect(result).toBe("simple");
      }
    });
  });
});
