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

type AgentTraceStep = {
  action: string;
  executionStatus: "completed" | "action_required" | "failed";
  capabilityLabel?: string;
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

function readAgentTraceReason(message: ChatMessage | null): string | null {
  if (!message || !message.meta || typeof message.meta !== "object") return null;
  const raw = (message.meta as Record<string, unknown>).agentTrace;
  if (!raw || typeof raw !== "object") return null;
  const reason = (raw as Record<string, unknown>).reason;
  return typeof reason === "string" && reason.trim().length > 0 ? reason.trim() : null;
}

function readAgentTraceSteps(message: ChatMessage | null): AgentTraceStep[] {
  if (!message || !message.meta || typeof message.meta !== "object") return [];
  const raw = (message.meta as Record<string, unknown>).agentTrace;
  if (!raw || typeof raw !== "object") return [];
  const stepsRaw = (raw as Record<string, unknown>).steps;
  if (!Array.isArray(stepsRaw)) return [];
  return stepsRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const action = typeof row.action === "string" ? row.action.trim().toLowerCase() : "";
      const capabilityLabel =
        typeof row.capabilityLabel === "string" && row.capabilityLabel.trim().length > 0
          ? row.capabilityLabel.trim()
          : undefined;
      const executionStatusRaw =
        typeof row.executionStatus === "string" ? row.executionStatus.trim().toLowerCase() : "";
      const executionStatus =
        executionStatusRaw === "completed" ||
        executionStatusRaw === "action_required" ||
        executionStatusRaw === "failed"
          ? executionStatusRaw
          : null;
      if (!action || !executionStatus) return null;
      return { action, capabilityLabel, executionStatus } satisfies AgentTraceStep;
    })
    .filter((item): item is AgentTraceStep => item !== null);
}

function titleFromAction(action: string): string {
  const normalized = action.trim().toLowerCase();
  if (normalized === "google_gmail") return "Gmail";
  if (normalized === "google_calendar") return "Google Calendar";
  if (normalized === "google_drive") return "Google Drive";
  if (normalized === "web_search") return "Web Search";
  if (normalized === "orchestration") return "Orchestration";
  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function humanizeDecisionReason(reason: string | null): string | null {
  if (!reason) return null;
  const normalized = reason.trim().toLowerCase();
  const exact: Record<string, string> = {
    llm_only_tool_intent_hint_fallback:
      "Detected tool intent and selected the best matching tool from intent hints.",
    llm_only_tool_intent_unresolved:
      "Detected tool intent, but the model could not map it to a safe executable tool action.",
    llm_only_no_actionable_plan:
      "Model did not return an actionable tool plan for this turn.",
    web_search_followup: "Continuing the prior web search context.",
    calendar_confirmation_followup: "Applying your follow-up to the pending calendar draft.",
    gmail_send_confirmation_followup: "Applying your confirmation to the pending Gmail draft."
  };
  if (exact[normalized]) return exact[normalized];
  if (normalized.startsWith("matched_")) {
    return `Intent match: ${normalized.replace(/^matched_/, "").replace(/_/g, " ")}.`;
  }
  if (normalized.startsWith("verification_override:")) {
    return "Verification policy required live web verification before answering.";
  }
  return normalized.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
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
  const traceReason = readAgentTraceReason(activeAssistant);
  const traceSteps = readAgentTraceSteps(activeAssistant);
  const effectiveAction = traceAction;
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
    if (route?.mode === "memory_direct") {
      return {
        label: "Direct memory mode active (agent tools not engaged for this turn).",
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
      const firstPendingStep = traceSteps.find(
        (step) => step.executionStatus === "action_required" || step.executionStatus === "failed"
      );
      const activeStep = firstPendingStep ?? traceSteps[0] ?? null;
      const activeStepLabel = activeStep
        ? activeStep.capabilityLabel || titleFromAction(activeStep.action)
        : "tool";
      return {
        label:
          phase === 0
            ? `Planning steps from model decision... (${traceSteps.length || 1} step${traceSteps.length === 1 ? "" : "s"})`
            : phase === 1
              ? `Running ${activeStepLabel} and collecting results...`
              : "Synthesizing final response from step outputs...",
        tone: "active"
      };
    }
    if (traceReason) {
      const readableReason = humanizeDecisionReason(traceReason);
      return {
        label:
          hasAssistantContent
            ? "Preparing response..."
            : `Model decision: ${readableReason ?? traceReason}`,
        tone: "active"
      };
    }
    if (route?.mode === "agent") {
      return {
        label: hasAssistantContent ? "Preparing response..." : "Waiting for model decision...",
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
