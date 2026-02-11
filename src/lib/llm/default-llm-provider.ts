import type { LlmProvider, StreamChatParams } from "@/lib/llm/llm-provider";

type ProviderConfig = {
  name: "openai" | "groq";
  apiKey: string;
  baseUrl: string;
  model: string;
};

export class DefaultLlmProvider implements LlmProvider {
  private readonly config: ProviderConfig | null;

  constructor() {
    const groqKey = process.env.GROQ_API_KEY;
    const openAiKey = process.env.OPENAI_API_KEY;

    if (groqKey) {
      this.config = {
        name: "groq",
        apiKey: groqKey,
        baseUrl: "https://api.groq.com/openai/v1",
        model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile"
      };
      return;
    }

    if (openAiKey) {
      this.config = {
        name: "openai",
        apiKey: openAiKey,
        baseUrl: "https://api.openai.com/v1",
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini"
      };
      return;
    }

    this.config = null;
  }

  async *streamChat(params: StreamChatParams): AsyncIterable<string> {
    if (process.env.CHAT_DEMO_MODE !== "false") {
      const prompt =
        params.messages
          .slice()
          .reverse()
          .find((message) => message.role === "user")?.content ?? "your prompt";
      const demoResponse = buildDemoResponse(prompt);
      for (const chunk of chunkText(demoResponse, 26)) {
        await sleep(14);
        yield chunk;
      }
      return;
    }

    if (!this.config) {
      yield "No model API key configured. Set OPENAI_API_KEY or GROQ_API_KEY.";
      return;
    }

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: params.messages,
        stream: true,
        temperature: 0.2
      }),
      signal: params.signal
    });

    if (!response.ok || !response.body) {
      const detail = await response.text();
      throw new Error(
        `LLM request failed (${response.status}) ${detail || "Unknown error"}`
      );
    }

    for await (const chunk of parseSseStream(response.body)) {
      const parsed = safeParse(chunk);
      if (!parsed) continue;
      const token = (
        parsed as {
          choices?: Array<{ delta?: { content?: unknown } }>;
        }
      ).choices?.[0]?.delta?.content;
      if (typeof token === "string" && token.length > 0) {
        yield token;
      }
    }
  }
}

function buildDemoResponse(prompt: string): string {
  return `Great question. Here is a clear working draft response based on: "${prompt}".

I can help you move this forward in a practical way, so I will keep it simple, structured, and useful.

First, frame the goal in one sentence:
- Define the exact output you want.
- Define the success criteria.
- Define the deadline and constraints.

Second, break the work into small executable steps:
- Start with the minimum version that proves the core idea.
- Add one improvement at a time.
- Validate each improvement before moving to the next.

Third, avoid common mistakes:
- Do not overbuild before testing real usage.
- Do not mix architecture decisions with visual polish too early.
- Do not skip error-handling and fallback behavior.

If you want, I can now generate:
1. A concrete implementation checklist.
2. A first-pass API and data contract.
3. A UX pass for empty, loading, success, and failure states.

This is a temporary demo response for UI validation, but it is intentionally sized and formatted to mimic a realistic assistant answer so spacing, typography, and streaming behavior can be reviewed properly.`;
}

function chunkText(input: string, chunkSize: number): string[] {
  const words = input.split(" ");
  const output: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > chunkSize) {
      output.push(`${current} `);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) output.push(current);
  return output;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function* parseSseStream(
  stream: ReadableStream<Uint8Array>
): AsyncIterable<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        yield payload;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function safeParse(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}
