export type MessageRole = "system" | "user" | "assistant";

export type UIMessage = {
  id: string;
  threadId: string;
  role: Exclude<MessageRole, "system">;
  content: string;
  createdAt: string;
  meta?: Record<string, unknown>;
};

export type ContextMessage = {
  role: MessageRole;
  content: string;
};

export type BuildMemoryContextParams = {
  threadId: string;
  latestUserText: string;
  shortTermLimit?: number;
};

export type ThreadRecord = {
  id: string;
  userId: string;
  title: string | null;
  createdAt: string;
};
