"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, MessageReaction } from "@/hooks/use-chat";
import { MessageItem } from "@/components/chat/message-item";
import { TypingIndicator } from "@/components/chat/typing-indicator";

type MessageListProps = {
  messages: ChatMessage[];
  isStreaming: boolean;
  onReactToMessage: (
    threadId: string,
    messageId: string,
    reaction: MessageReaction
  ) => Promise<void>;
};

type ActivityTone = "active" | "warning";
type ActivityState = {
  label: string;
  tone: ActivityTone;
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

function inferActionFromUserText(text: string): string | null {
  const lowered = text.trim().toLowerCase();
  if (!lowered) return null;
  const intents = [
    /\b(gmail|email|emails|inbox|draft|send email|send an email)\b/.test(lowered),
    /\b(calendar|meeting|schedule|appointment|availability|event)\b/.test(lowered),
    /\b(drive|folder|file|doc|document|spreadsheet|slides)\b/.test(lowered),
    /\b(search|look up|lookup|latest|news|web|online|find on the internet|google it)\b/.test(
      lowered
    )
  ].filter(Boolean).length;
  if (intents >= 2) {
    return "orchestration";
  }
  if (/\b(gmail|email|emails|inbox|draft|send email|send an email)\b/.test(lowered)) {
    return "google_gmail";
  }
  if (/\b(calendar|meeting|schedule|appointment|availability|event)\b/.test(lowered)) {
    return "google_calendar";
  }
  if (/\b(drive|folder|file|doc|document|spreadsheet|slides)\b/.test(lowered)) {
    return "google_drive";
  }
  if (
    /\b(search|look up|lookup|latest|news|web|online|find on the internet|google it)\b/.test(
      lowered
    )
  ) {
    return "web_search";
  }
  return null;
}

function inferCalendarModeFromUserText(text: string): "create_or_update" | "check" {
  const lowered = text.trim().toLowerCase();
  if (!lowered) return "check";
  if (
    /\b(add|create|schedule|book|set up|put|move|reschedule|update|change)\b/.test(lowered) &&
    /\b(calendar|meeting|event|appointment)\b/.test(lowered)
  ) {
    return "create_or_update";
  }
  if (/\b(add event|create event|schedule meeting|reschedule)\b/.test(lowered)) {
    return "create_or_update";
  }
  return "check";
}

function inferGmailModeFromUserText(text: string): "send_or_draft" | "check" {
  const lowered = text.trim().toLowerCase();
  if (!lowered) return "check";
  if (
    /\b(send|email|mail|draft|compose|reply|respond|forward|message)\b/.test(lowered) &&
    /\b(to|about|subject|cc|bcc|follow up|follow-up)\b/.test(lowered)
  ) {
    return "send_or_draft";
  }
  if (/\b(send an email|write an email|draft an email|compose email|reply to)\b/.test(lowered)) {
    return "send_or_draft";
  }
  return "check";
}

export function MessageList({ messages, isStreaming, onReactToMessage }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const streamStartedAtRef = useRef<number | null>(null);
  const prevSignatureRef = useRef<string>("");
  const [streamTick, setStreamTick] = useState(0);

  useEffect(() => {
    const last = messages[messages.length - 1];
    const signature = last
      ? `${messages.length}:${last.id}:${last.role}:${last.content.length}:${Boolean(last.isStreaming)}`
      : "0";
    const shouldScroll =
      isStreaming || prevSignatureRef.current === "" || signature !== prevSignatureRef.current;
    prevSignatureRef.current = signature;
    if (shouldScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, isStreaming]);

  useEffect(() => {
    if (!isStreaming) {
      streamStartedAtRef.current = null;
      setStreamTick(0);
      return;
    }
    if (streamStartedAtRef.current === null) {
      streamStartedAtRef.current = Date.now();
    }
    const timer = window.setInterval(() => {
      setStreamTick((prev) => prev + 1);
    }, 900);
    return () => window.clearInterval(timer);
  }, [isStreaming]);

  const showTypingIndicator = isStreaming;

  const activeAssistant =
    [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && message.isStreaming) ??
    [...messages].reverse().find((message) => message.role === "assistant") ??
    null;
  const route = readAgentRoute(activeAssistant);
  const traceAction = readAgentTraceAction(activeAssistant);
  const latestUserText =
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const inferredAction = inferActionFromUserText(latestUserText);
  const calendarMode = inferCalendarModeFromUserText(latestUserText);
  const gmailMode = inferGmailModeFromUserText(latestUserText);
  const effectiveAction = traceAction ?? inferredAction;
  const elapsedMs =
    isStreaming && streamStartedAtRef.current
      ? Math.max(0, Date.now() + streamTick * 0 - streamStartedAtRef.current)
      : 0;
  const hasAssistantContent = Boolean(activeAssistant?.content?.trim());

  const buildActivity = (): ActivityState | null => {
    if (route?.mode === "agent_fallback") {
      return {
        label:
          route.warning ??
          "Agent routing is unavailable for this turn. Continuing in direct memory mode.",
        tone: "warning"
      };
    }

    const phase = elapsedMs < 1800 ? 0 : elapsedMs < 4200 ? 1 : 2;
    if (effectiveAction === "web_search") {
      return {
        label:
          phase === 0
            ? "Opening live web search..."
            : phase === 1
              ? "Checking top sources and extracting key facts..."
              : "Preparing a grounded response...",
        tone: "active"
      };
    }
    if (effectiveAction === "google_gmail") {
      if (gmailMode === "send_or_draft") {
        return {
          label:
            phase === 0
              ? "Opening Gmail..."
              : phase === 1
                ? "Drafting your email..."
                : "Preparing send confirmation...",
          tone: "active"
        };
      }
      return {
        label:
          phase === 0
            ? "Opening Gmail..."
            : phase === 1
              ? "Reading emails in your inbox..."
              : "Preparing your response...",
        tone: "active"
      };
    }
    if (effectiveAction === "google_calendar") {
      if (calendarMode === "create_or_update") {
        return {
          label:
            phase === 0
              ? "Opening Google Calendar..."
              : phase === 1
                ? "Drafting your calendar event details..."
                : "Adding to your calendar...",
          tone: "active"
        };
      }
      return {
        label:
          phase === 0
            ? "Opening Google Calendar..."
            : phase === 1
              ? "Checking availability and conflicts..."
              : "Preparing scheduling response...",
        tone: "active"
      };
    }
    if (effectiveAction === "google_drive") {
      return {
        label:
          phase === 0
            ? "Opening Google Drive..."
            : phase === 1
              ? "Checking matching files and folders..."
              : "Preparing file response...",
        tone: "active"
      };
    }
    if (effectiveAction === "orchestration") {
      return {
        label:
          phase === 0
            ? "Planning orchestration steps (Gmail, Drive, Calendar, Web)..."
            : phase === 1
              ? "Executing tool steps and collecting results..."
              : "Synthesizing final response from step outputs...",
        tone: "active"
      };
    }
    if (route?.mode === "agent") {
      return {
        label: hasAssistantContent ? "Preparing response..." : "Understanding your request and gathering context...",
        tone: "active"
      };
    }
    return {
      label: hasAssistantContent ? "Preparing response..." : "Thinking through your request...",
      tone: "active"
    };
  };
  const activity = buildActivity();

  return (
    <div className="chat-scroll chat-fade-scroll flex-1 overflow-y-auto px-1 pb-6 pt-4 md:px-2 md:pb-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-1">
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            onReact={
              message.role === "assistant" && !isStreaming
                ? onReactToMessage
                : undefined
            }
          />
        ))}
        {showTypingIndicator ? (
          <TypingIndicator
            activityLabel={activity?.label ?? null}
            tone={activity?.tone}
          />
        ) : null}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
