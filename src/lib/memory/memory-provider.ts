import type {
  BuildMemoryContextParams,
  ContextMessage,
  ThreadRecord,
  UIMessage
} from "@/lib/memory/types";

export interface MemoryProvider {
  startThread(userId: string, title?: string): Promise<string>;
  chat?(
    threadId: string,
    text: string,
    signal?: AbortSignal
  ): Promise<Response>;
  addUserEvent(
    threadId: string,
    text: string,
    meta?: Record<string, unknown>
  ): Promise<string>;
  buildMemoryContext(params: BuildMemoryContextParams): Promise<ContextMessage[]>;
  addAssistantEvent(
    threadId: string,
    text: string,
    meta?: Record<string, unknown>
  ): Promise<string>;
  getRecentEvents(threadId: string, limit?: number): Promise<UIMessage[]>;
  listThreads?(userId: string, limit?: number): Promise<ThreadRecord[]>;
  getActiveSummary?(threadId: string): Promise<string | null>;
}
