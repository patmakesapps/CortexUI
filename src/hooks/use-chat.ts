"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThreadRecord, UIMessage } from "@/lib/memory/types";

export type ChatMessage = UIMessage & {
  isStreaming?: boolean;
};

export type ChatThread = Pick<ThreadRecord, "id" | "title" | "createdAt">;

type UseChatResult = {
  threadId: string | null;
  threads: ChatThread[];
  messages: ChatMessage[];
  isBootstrapping: boolean;
  isStreaming: boolean;
  error: string | null;
  clearError: () => void;
  selectThread: (threadId: string) => Promise<void>;
  createThread: () => Promise<void>;
  renameThread: (threadId: string, title: string) => Promise<void>;
  deleteThread: (threadId: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
};

function deriveTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New chat";
  const words = cleaned.split(" ").slice(0, 7).join(" ");
  return words.length > 60 ? `${words.slice(0, 57)}...` : words;
}

export function useChat(options?: { allowLocalFallback?: boolean }): UseChatResult {
  const allowLocalFallback = options?.allowLocalFallback ?? true;
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageCache, setMessageCache] = useState<Record<string, ChatMessage[]>>({});
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeThreadRef = useRef<string | null>(null);
  const messageCacheRef = useRef<Record<string, ChatMessage[]>>({});
  const loadCounter = useRef(0);

  useEffect(() => {
    activeThreadRef.current = threadId;
  }, [threadId]);

  useEffect(() => {
    messageCacheRef.current = messageCache;
  }, [messageCache]);

  const setMessagesForThread = useCallback(
    (targetThreadId: string, nextMessages: ChatMessage[]) => {
      setMessageCache((prev) => ({ ...prev, [targetThreadId]: nextMessages }));
      if (activeThreadRef.current === targetThreadId) {
        setMessages(nextMessages);
      }
    },
    []
  );

  const updateMessagesForThread = useCallback(
    (
      targetThreadId: string,
      updater: (existing: ChatMessage[]) => ChatMessage[]
    ) => {
      setMessageCache((prev) => {
        const existing = prev[targetThreadId] ?? [];
        const updated = updater(existing);
        if (activeThreadRef.current === targetThreadId) {
          setMessages(updated);
        }
        return { ...prev, [targetThreadId]: updated };
      });
    },
    []
  );

  const loadThreadMessages = useCallback(
    async (targetThreadId: string, useCache = true): Promise<void> => {
      const cached = messageCacheRef.current[targetThreadId];
      if (useCache && cached) {
        setMessagesForThread(targetThreadId, cached);
        return;
      }

      if (targetThreadId.startsWith("local-") || targetThreadId.startsWith("draft-")) {
        setMessagesForThread(targetThreadId, []);
        return;
      }

      const currentLoad = ++loadCounter.current;
      const messagesRes = await fetch(`/api/chat/${targetThreadId}/messages`, {
        method: "GET"
      });
      if (!messagesRes.ok) {
        if (currentLoad === loadCounter.current) {
          setMessagesForThread(targetThreadId, []);
        }
        return;
      }

      const messageData = (await messagesRes.json()) as { messages: UIMessage[] };
      if (currentLoad !== loadCounter.current) return;
      setMessagesForThread(targetThreadId, messageData.messages);
    },
    [setMessagesForThread]
  );

  const persistRename = useCallback(async (targetThreadId: string, title: string) => {
    if (targetThreadId.startsWith("local-") || targetThreadId.startsWith("draft-")) {
      return;
    }
    const res = await fetch(`/api/chat/${targetThreadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title })
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      throw new Error(payload?.error?.message ?? "Failed to rename thread.");
    }
  }, []);

  const createRemoteThread = useCallback(async (): Promise<ChatThread> => {
    const threadRes = await fetch("/api/chat/threads", { method: "POST" });
    if (threadRes.ok) {
      const threadData = (await threadRes.json()) as { threadId: string };
      return {
        id: threadData.threadId,
        title: null,
        createdAt: new Date().toISOString()
      };
    }
    if (allowLocalFallback) {
      return {
        id: `local-${crypto.randomUUID()}`,
        title: null,
        createdAt: new Date().toISOString()
      };
    }
    throw new Error("Unable to create a new chat thread.");
  }, [allowLocalFallback]);

  const selectThread = useCallback(
    async (nextThreadId: string) => {
      if (!nextThreadId || nextThreadId === threadId) return;
      setError(null);
      activeThreadRef.current = nextThreadId;
      setThreadId(nextThreadId);
      await loadThreadMessages(nextThreadId);
    },
    [loadThreadMessages, threadId]
  );

  const createThread = useCallback(async () => {
    setError(null);
    activeThreadRef.current = null;
    setThreadId(null);
    setMessages([]);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const renameThread = useCallback(
    async (targetThreadId: string, title: string) => {
      const nextTitle = title.trim();
      if (!nextTitle) return;

      const previous = threads;
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === targetThreadId ? { ...thread, title: nextTitle } : thread
        )
      );

      try {
        await persistRename(targetThreadId, nextTitle);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to rename thread.";
        setThreads(previous);
        setError(message);
        throw new Error(message);
      }
    },
    [persistRename, threads]
  );

  const deleteThread = useCallback(
    async (targetThreadId: string) => {
      const previousThreads = threads;
      const previousThreadId = threadId;
      const previousMessages = messages;
      const previousCache = messageCacheRef.current;

      const remaining = threads.filter((thread) => thread.id !== targetThreadId);
      setThreads(remaining);
      setMessageCache((prev) => {
        const next = { ...prev };
        delete next[targetThreadId];
        return next;
      });

      if (threadId === targetThreadId) {
        const nextActive = remaining[0]?.id ?? null;
        activeThreadRef.current = nextActive;
        setThreadId(nextActive);
        if (nextActive) {
          await loadThreadMessages(nextActive);
        } else {
          setMessages([]);
        }
      }

      if (targetThreadId.startsWith("local-") || targetThreadId.startsWith("draft-")) {
        return;
      }

      const res = await fetch(`/api/chat/${targetThreadId}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        const message = payload?.error?.message ?? "Failed to delete thread.";
        setThreads(previousThreads);
        activeThreadRef.current = previousThreadId;
        setThreadId(previousThreadId);
        setMessages(previousMessages);
        setMessageCache(previousCache);
        setError(message);
        throw new Error(message);
      }
    },
    [loadThreadMessages, messages, threadId, threads]
  );

  useEffect(() => {
    const bootstrap = async () => {
      setIsBootstrapping(true);
      try {
        const listRes = await fetch("/api/chat/threads", { method: "GET" });
        const listedThreads: ChatThread[] = [];
        if (!listRes.ok) {
          const payload = (await listRes.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          throw new Error(payload?.error?.message ?? "Failed to load threads.");
        }

        const listData = (await listRes.json()) as {
          threads: ThreadRecord[];
          degraded?: boolean;
          warning?: string;
        };
        if (listData.degraded) {
          throw new Error(listData.warning ?? "Chat backend is currently unavailable.");
        }

        for (const thread of listData.threads ?? []) {
          listedThreads.push({
            id: thread.id,
            title: thread.title,
            createdAt: thread.createdAt
          });
        }

        setThreads(listedThreads);
        const firstId = listedThreads[0]?.id ?? null;
        activeThreadRef.current = firstId;
        setThreadId(firstId);
        if (firstId) {
          await loadThreadMessages(firstId, false);
        } else {
          setMessages([]);
        }
      } catch (err) {
        if (allowLocalFallback) {
          setThreads([]);
          activeThreadRef.current = null;
          setThreadId(null);
          setMessages([]);
        } else {
          setThreadId(null);
          setThreads([]);
          setMessages([]);
        }
        setError(err instanceof Error ? err.message : "Failed to initialize chat.");
      } finally {
        setIsBootstrapping(false);
      }
    };

    void bootstrap();
  }, [allowLocalFallback, loadThreadMessages]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      setError(null);
      setIsStreaming(true);

      let activeId = activeThreadRef.current;

      try {
        if (!activeId) {
          const created = await createRemoteThread();

          setThreads((prev) => [
            created,
            ...prev.filter((thread) => thread.id !== created.id)
          ]);

          activeId = created.id;
          activeThreadRef.current = created.id;
          setThreadId(created.id);
        }

        if (!activeId) return;

        const now = new Date().toISOString();
        const userMessage: ChatMessage = {
          id: `user-${crypto.randomUUID()}`,
          threadId: activeId,
          role: "user",
          content: trimmed,
          createdAt: now
        };
        const assistantId = `assistant-${crypto.randomUUID()}`;
        const assistantMessage: ChatMessage = {
          id: assistantId,
          threadId: activeId,
          role: "assistant",
          content: "",
          createdAt: now,
          isStreaming: true
        };
        const baseMessages = [
          ...(messageCacheRef.current[activeId] ?? []),
          userMessage,
          assistantMessage
        ];
        setMessagesForThread(activeId, baseMessages);

        const targetThread = threads.find((thread) => thread.id === activeId);
        if (!targetThread?.title?.trim()) {
          const autoTitle = deriveTitle(trimmed);
          setThreads((prev) =>
            prev.map((thread) =>
              thread.id === activeId ? { ...thread, title: autoTitle } : thread
            )
          );
          void persistRename(activeId, autoTitle).catch(() => null);
        }

        const response = await fetch(`/api/chat/${activeId}/messages`, {
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
          updateMessagesForThread(activeId, (existing) => {
            const source = existing.length > 0 ? existing : baseMessages;
            return source.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + chunk }
                : message
            );
          });
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to stream assistant output.";
        setError(message);

        if (activeId) {
          const fallback =
            "I could not reach the backend stream, so here is a local fallback reply to keep the UI preview moving. The layout, spacing, typing flow, and auto-scroll behavior should still reflect normal chat usage while we debug the backend connection.";
          updateMessagesForThread(activeId, (existing) =>
            existing.map((item) =>
              item.role === "assistant" && item.isStreaming
                ? { ...item, content: item.content || fallback }
                : item
            )
          );
        }
      } finally {
        if (activeId) {
          updateMessagesForThread(activeId, (existing) =>
            existing.map((item) =>
              item.role === "assistant" && item.isStreaming
                ? { ...item, isStreaming: false }
                : item
            )
          );
        }
        setIsStreaming(false);
      }
    },
    [createRemoteThread, isStreaming, persistRename, setMessagesForThread, threads, updateMessagesForThread]
  );

  return useMemo(
    () => ({
      threadId,
      threads,
      messages,
      isBootstrapping,
      isStreaming,
      error,
      clearError,
      selectThread,
      createThread,
      renameThread,
      deleteThread,
      sendMessage
    }),
    [
      createThread,
      clearError,
      deleteThread,
      error,
      isBootstrapping,
      isStreaming,
      messages,
      renameThread,
      selectThread,
      sendMessage,
      threadId,
      threads
    ]
  );
}
