"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { UIMessage } from "@/lib/memory/types";

export type ChatMessage = UIMessage & {
  isStreaming?: boolean;
};

type UseChatResult = {
  threadId: string | null;
  messages: ChatMessage[];
  isBootstrapping: boolean;
  isStreaming: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
};

export function useChat(): UseChatResult {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const bootstrap = async () => {
      setIsBootstrapping(true);
      try {
        let activeThreadId: string | undefined;

        const listRes = await fetch("/api/chat/threads", { method: "GET" });
        if (listRes.ok) {
          const listData = (await listRes.json()) as {
            threads: Array<{ id: string }>;
          };
          activeThreadId = listData.threads[0]?.id;
        }

        if (!activeThreadId) {
          const threadRes = await fetch("/api/chat/threads", { method: "POST" });
          if (threadRes.ok) {
            const threadData = (await threadRes.json()) as { threadId: string };
            activeThreadId = threadData.threadId;
          }
        }

        // Demo fallback: allow chat UI to run without memory backend wiring.
        if (!activeThreadId) {
          activeThreadId = `local-${crypto.randomUUID()}`;
        }

        setThreadId(activeThreadId);

        const messagesRes = await fetch(
          `/api/chat/${activeThreadId}/messages`,
          { method: "GET" }
        );
        if (!messagesRes.ok) return;

        const messageData = (await messagesRes.json()) as { messages: UIMessage[] };
        setMessages(messageData.messages);
      } catch (err) {
        setThreadId(`local-${crypto.randomUUID()}`);
        setError(err instanceof Error ? err.message : "Failed to initialize chat.");
      } finally {
        setIsBootstrapping(false);
      }
    };

    void bootstrap();
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !threadId || isStreaming) return;

      setError(null);
      setIsStreaming(true);

      const now = new Date().toISOString();
      const userMessage: ChatMessage = {
        id: `user-${crypto.randomUUID()}`,
        threadId,
        role: "user",
        content: trimmed,
        createdAt: now
      };
      const assistantId = `assistant-${crypto.randomUUID()}`;
      const assistantMessage: ChatMessage = {
        id: assistantId,
        threadId,
        role: "assistant",
        content: "",
        createdAt: now,
        isStreaming: true
      };
      setMessages((prev) => [...prev, userMessage, assistantMessage]);

      try {
        const response = await fetch(`/api/chat/${threadId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed })
        });

        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          throw new Error(payload?.error?.message ?? "Assistant request failed.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (!chunk) continue;
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + chunk }
                : message
            )
          );
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to stream assistant output.";
        setError(message);
        const fallback =
          "I could not reach the backend stream, so here is a local fallback reply to keep the UI preview moving. The layout, spacing, typing flow, and auto-scroll behavior should still reflect normal chat usage while we debug the backend connection.";
        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantId
              ? {
                  ...item,
                  content: item.content || fallback
                }
              : item
          )
        );
      } finally {
        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantId ? { ...item, isStreaming: false } : item
          )
        );
        setIsStreaming(false);
      }
    },
    [isStreaming, threadId]
  );

  return useMemo(
    () => ({
      threadId,
      messages,
      isBootstrapping,
      isStreaming,
      error,
      sendMessage
    }),
    [error, isBootstrapping, isStreaming, messages, sendMessage, threadId]
  );
}
