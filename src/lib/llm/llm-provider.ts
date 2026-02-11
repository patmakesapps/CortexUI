import type { ContextMessage } from "@/lib/memory/types";

export type StreamChatParams = {
  messages: ContextMessage[];
  signal?: AbortSignal;
};

export interface LlmProvider {
  streamChat(params: StreamChatParams): AsyncIterable<string>;
}
