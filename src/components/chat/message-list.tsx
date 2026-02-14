"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/hooks/use-chat";
import { MessageItem } from "@/components/chat/message-item";
import { TypingIndicator } from "@/components/chat/typing-indicator";

type MessageListProps = {
  messages: ChatMessage[];
  isStreaming: boolean;
};

function readAgentTraceAction(message: ChatMessage | null): string | null {
  if (!message || !message.meta || typeof message.meta !== "object") return null;
  const raw = (message.meta as Record<string, unknown>).agentTrace;
  if (!raw || typeof raw !== "object") return null;
  const action = (raw as Record<string, unknown>).action;
  return typeof action === "string" && action.trim().length > 0
    ? action.trim().toLowerCase()
    : null;
}

function readAgentRoute(
  message: ChatMessage | null
): { mode: "agent" | "agent_fallback" | "memory_direct"; warning?: string } | null {
  if (!message || !message.meta || typeof message.meta !== "object") return null;
  const raw = (message.meta as Record<string, unknown>).agentRoute;
  if (!raw || typeof raw !== "object") return null;
  const mode = (raw as Record<string, unknown>).mode;
  if (mode !== "agent" && mode !== "agent_fallback" && mode !== "memory_direct") {
    return null;
  }
  const warningRaw = (raw as Record<string, unknown>).warning;
  return {
    mode,
    ...(typeof warningRaw === "string" && warningRaw.trim().length > 0
      ? { warning: warningRaw.trim() }
      : {})
  };
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isStreaming]);

  const showTypingIndicator =
    isStreaming &&
    (messages.length === 0 ||
      messages[messages.length - 1].role === "user" ||
      messages[messages.length - 1].content.length === 0);

  const activeAssistant =
    [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && message.isStreaming) ??
    [...messages].reverse().find((message) => message.role === "assistant") ??
    null;
  const route = readAgentRoute(activeAssistant);
  const traceAction = readAgentTraceAction(activeAssistant);
  const activity =
    route?.mode === "agent_fallback"
      ? {
          label:
            route.warning ??
            "Agentic routing is unavailable for this turn. Continuing in direct memory mode.",
          tone: "warning" as const
        }
      : traceAction === "web_search"
        ? {
            label: "Agentic workflow active: searching live web sources.",
            tone: "active" as const
          }
        : route?.mode === "agent"
          ? {
              label: "Agentic workflow active.",
              tone: "active" as const
            }
          : null;

  return (
    <div className="chat-scroll chat-fade-scroll flex-1 overflow-y-auto px-1 pb-6 pt-4 md:px-2 md:pb-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-1">
        {messages.map((message) => (
          <MessageItem key={message.id} message={message} />
        ))}
        {showTypingIndicator ? (
          <TypingIndicator activityLabel={activity?.label ?? null} tone={activity?.tone} />
        ) : null}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
