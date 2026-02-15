"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThreadRecord, UIMessage } from "@/lib/memory/types";

export type ChatMessage = UIMessage & {
  isStreaming?: boolean;
};

export type ChatThread = Pick<ThreadRecord, "id" | "title" | "createdAt" | "isCoreMemory">;

type UseChatResult = {
  threadId: string | null;
  threads: ChatThread[];
  messages: ChatMessage[];
  isBootstrapping: boolean;
  isThreadTransitioning: boolean;
  isStreaming: boolean;
  error: string | null;
  clearError: () => void;
  selectThread: (threadId: string) => Promise<void>;
  createThread: () => Promise<void>;
  renameThread: (threadId: string, title: string) => Promise<void>;
  deleteThread: (threadId: string) => Promise<void>;
  promoteThread: (threadId: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
};

type AgentCapability = {
  id: string;
  type: "tool";
  label: string;
};

type AgentRouteMode = "agent" | "agent_fallback" | "memory_direct";

type AgentRouteMeta = {
  mode: AgentRouteMode;
  warning?: string;
};

type AgentTraceMeta = {
  version: number;
  source: string;
  action: string;
  reason?: string;
  confidence?: number;
  capabilities: AgentCapability[];
};

function deriveTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New chat";
  const words = cleaned.split(" ").slice(0, 7).join(" ");
  return words.length > 60 ? `${words.slice(0, 57)}...` : words;
}

function parseAgentTraceMeta(headers: Headers): AgentTraceMeta | null {
  const raw = headers.get("x-cortex-agent-trace");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const action = typeof parsed.action === "string" ? parsed.action.trim() : "";
    if (!action) return null;
    const version = typeof parsed.version === "number" ? parsed.version : 1;
    const source = typeof parsed.source === "string" ? parsed.source : "cortex-agent";
    const reason = typeof parsed.reason === "string" ? parsed.reason : undefined;
    const confidence =
      typeof parsed.confidence === "number" ? parsed.confidence : undefined;
    const capabilitiesRaw = Array.isArray(parsed.capabilities)
      ? parsed.capabilities
      : [];
    const capabilities = capabilitiesRaw
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const id = typeof row.id === "string" ? row.id.trim() : "";
        const type = row.type === "tool" ? "tool" : null;
        const label = typeof row.label === "string" ? row.label.trim() : "";
        if (!id || !type || !label) return null;
        return { id, type, label } satisfies AgentCapability;
      })
      .filter((item): item is AgentCapability => item !== null);

    return {
      version,
      source,
      action,
      ...(reason ? { reason } : {}),
      ...(typeof confidence === "number" ? { confidence } : {}),
      capabilities
    };
  } catch {
    return null;
  }
}

function parseAgentRouteMeta(headers: Headers): AgentRouteMeta | null {
  const rawMode = headers.get("x-cortex-route-mode");
  if (!rawMode) return null;
  const mode = rawMode.trim().toLowerCase();
  if (mode !== "agent" && mode !== "agent_fallback" && mode !== "memory_direct") {
    return null;
  }
  const warningRaw = headers.get("x-cortex-route-warning");
  const warning = warningRaw?.trim();
  return {
    mode: mode as AgentRouteMode,
    ...(warning ? { warning } : {})
  };
}

export function useChat(): UseChatResult {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageCache, setMessageCache] = useState<Record<string, ChatMessage[]>>({});
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isThreadTransitioning, setIsThreadTransitioning] = useState(false);
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

      const currentLoad = ++loadCounter.current;
      const messagesRes = await fetch(`/api/chat/${targetThreadId}/messages`, {
        method: "GET"
      });
      if (!messagesRes.ok) {
        const payload = (await messagesRes.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(
          payload?.error?.message ?? "Could not load messages for this chat."
        );
      }

      const messageData = (await messagesRes.json()) as {
        messages?: UIMessage[];
        degraded?: boolean;
        warning?: string;
      };
      if (messageData.degraded) {
        throw new Error(messageData.warning ?? "Chat messages are temporarily unavailable.");
      }
      if (currentLoad !== loadCounter.current) return;
      setMessagesForThread(
        targetThreadId,
        Array.isArray(messageData.messages) ? messageData.messages : []
      );
    },
    [setMessagesForThread]
  );

  const persistRename = useCallback(async (targetThreadId: string, title: string) => {
    if (targetThreadId.startsWith("draft-")) {
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
        createdAt: new Date().toISOString(),
        isCoreMemory: false
      };
    }
    throw new Error("Unable to create a new chat thread.");
  }, []);

  const selectThread = useCallback(
    async (nextThreadId: string) => {
      if (!nextThreadId) return;
      if (nextThreadId === threadId && (messageCacheRef.current[nextThreadId] ?? []).length > 0) {
        return;
      }
      setError(null);
      activeThreadRef.current = nextThreadId;
      setThreadId(nextThreadId);
      setMessages([]);
      setIsThreadTransitioning(true);
      try {
        await loadThreadMessages(nextThreadId, false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load this chat.");
      } finally {
        setIsThreadTransitioning(false);
      }
    },
    [loadThreadMessages, threadId]
  );

  const createThread = useCallback(async () => {
    setError(null);
    activeThreadRef.current = null;
    setThreadId(null);
    setMessages([]);
    setIsThreadTransitioning(false);
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
          try {
            await loadThreadMessages(nextActive);
          } catch (err) {
            setMessages([]);
            setError(err instanceof Error ? err.message : "Could not load this chat.");
          }
        } else {
          setMessages([]);
        }
      }

      if (targetThreadId.startsWith("draft-")) {
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

  const promoteThread = useCallback(async (targetThreadId: string) => {
    if (targetThreadId.startsWith("draft-")) {
      throw new Error("Only persisted chats can be promoted to core memory.");
    }
    const res = await fetch(`/api/chat/${targetThreadId}/promote`, { method: "POST" });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      throw new Error(
        payload?.error?.message ?? "Failed to promote thread to core memory."
      );
    }
    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === targetThreadId ? { ...thread, isCoreMemory: true } : thread
      )
    );
  }, []);

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
            createdAt: thread.createdAt,
            isCoreMemory: thread.isCoreMemory
          });
        }

        setThreads(listedThreads);
        const firstId = listedThreads[0]?.id ?? null;
        activeThreadRef.current = firstId;
        setThreadId(firstId);
        if (firstId) {
          try {
            await loadThreadMessages(firstId, false);
          } catch (err) {
            setMessages([]);
            setError(err instanceof Error ? err.message : "Could not load this chat.");
          }
        } else {
          setMessages([]);
        }
      } catch (err) {
        setThreadId(null);
        setThreads([]);
        setMessages([]);
        setError(err instanceof Error ? err.message : "Failed to initialize chat.");
      } finally {
        setIsBootstrapping(false);
      }
    };

    void bootstrap();
  }, [loadThreadMessages]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      setError(null);
      setIsStreaming(true);

      let activeId = activeThreadRef.current;
      let streamThreadId: string | null = activeId;

      try {
        if (!activeId) {
          setIsThreadTransitioning(true);
          const createdAt = new Date().toISOString();
          const created = await createRemoteThread();
          const createdThread: ChatThread = {
            id: created.id,
            title: null,
            createdAt,
            isCoreMemory: false
          };
          setThreads((prev) => [createdThread, ...prev]);
          setMessagesForThread(created.id, []);
          activeId = created.id;
          streamThreadId = created.id;
          activeThreadRef.current = created.id;
          setThreadId(created.id);
          setIsThreadTransitioning(false);
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
        streamThreadId = activeId;

        const requestThreadId = activeId;

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

        const response = await fetch(`/api/chat/${requestThreadId}/messages`, {
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
        const traceMeta = parseAgentTraceMeta(response.headers);
        const routeMeta = parseAgentRouteMeta(response.headers);
        if (traceMeta || routeMeta) {
          updateMessagesForThread(requestThreadId, (existing) =>
            existing.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    meta: {
                      ...(message.meta ?? {}),
                      ...(traceMeta ? { agentTrace: traceMeta } : {}),
                      ...(routeMeta ? { agentRoute: routeMeta } : {})
                    }
                  }
                : message
            )
          );
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pendingChunk = "";
        let flushTimer: ReturnType<typeof setTimeout> | null = null;

        const flushPendingChunk = () => {
          if (!pendingChunk) return;
          const nextChunk = pendingChunk;
          pendingChunk = "";
          updateMessagesForThread(requestThreadId, (existing) => {
            const source = existing.length > 0 ? existing : baseMessages;
            return source.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + nextChunk }
                : message
            );
          });
        };

        const scheduleChunkFlush = () => {
          if (flushTimer) return;
          flushTimer = setTimeout(() => {
            flushTimer = null;
            flushPendingChunk();
          }, 32);
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (!chunk) continue;
          pendingChunk += chunk;
          scheduleChunkFlush();
        }
        const tail = decoder.decode();
        if (tail) {
          pendingChunk += tail;
        }
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        flushPendingChunk();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to stream assistant output.";
        setError(message);

        if (streamThreadId) {
          const fallback =
            "I could not reach the backend stream, so here is a local fallback reply to keep momentum moving while we recover the connection.";
          updateMessagesForThread(streamThreadId, (existing) =>
            existing.map((item) =>
              item.role === "assistant" && item.isStreaming
                ? { ...item, content: item.content || fallback }
                : item
            )
          );
        }
      } finally {
        if (streamThreadId) {
          updateMessagesForThread(streamThreadId, (existing) =>
            existing.map((item) =>
              item.role === "assistant" && item.isStreaming
                ? { ...item, isStreaming: false }
                : item
            )
          );
        }
        setIsThreadTransitioning(false);
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
      isThreadTransitioning,
      isStreaming,
      error,
      clearError,
      selectThread,
      createThread,
      renameThread,
      deleteThread,
      promoteThread,
      sendMessage
    }),
    [
      createThread,
      clearError,
      deleteThread,
      error,
      isBootstrapping,
      isThreadTransitioning,
      isStreaming,
      messages,
      promoteThread,
      renameThread,
      selectThread,
      sendMessage,
      threadId,
      threads
    ]
  );
}
