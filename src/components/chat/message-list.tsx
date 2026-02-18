"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, MessageReaction } from "@/hooks/use-chat";
import { MessageItem } from "@/components/chat/message-item";
import { TypingIndicator, type DecisionChainStep } from "@/components/chat/typing-indicator";

type MessageListProps = {
  messages: ChatMessage[];
  isStreaming: boolean;
  onQuickReply: (text: string) => Promise<void>;
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
  decisionSteps?: DecisionChainStep[];
};

function oneActiveStep(steps: string[], activeIndex: number): DecisionChainStep[] {
  return steps.map((label, index) => ({
    label,
    status: index < activeIndex ? "completed" : index === activeIndex ? "active" : "pending"
  }));
}

function inferActionFromUserText(text: string | null): string | null {
  const normalized = (text ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (/\b(web|search|look up|google|news|latest|source|sources)\b/.test(normalized)) {
    return "web_search";
  }
  if (/\b(drive|file|files|folder|folders|doc|docs|spreadsheet|sheet|slides)\b/.test(normalized)) {
    return "google_drive";
  }
  if (/\b(calendar|schedule|availability|meeting|event|invite)\b/.test(normalized)) {
    return "google_calendar";
  }
  if (/\b(gmail|email|emails|inbox|thread|send|draft|compose)\b/.test(normalized)) {
    return "google_gmail";
  }
  return null;
}

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
      const next: AgentTraceStep = {
        action,
        executionStatus,
        ...(capabilityLabel ? { capabilityLabel } : {})
      };
      return next;
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

export function MessageList({
  messages,
  isStreaming,
  onQuickReply,
  onReactToMessage
}: MessageListProps) {
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
  const latestUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content ?? null;
  const inferredAction = inferActionFromUserText(latestUserMessage);
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
    if (route?.mode === "memory_direct") {
      return {
        label: "Direct memory mode active (agent tools not engaged for this turn).",
        tone: "warning"
      };
    }

    const phase = elapsedMs < 1800 ? 0 : elapsedMs < 4200 ? 1 : 2;
    const readableReason = humanizeDecisionReason(traceReason);
    const routeDecisionStep: DecisionChainStep = {
      label: readableReason ? `Decision: ${readableReason}` : "Decision: select best route",
      status: traceReason || effectiveAction ? "completed" : "active"
    };
    if (effectiveAction === "web_search") {
      const steps = [
        "Opening live web search...",
        "Searching web sources and extracting key facts...",
        "Preparing a grounded response..."
      ];
      const activeIndex = Math.min(phase, steps.length - 1);
      return {
        label: steps[activeIndex],
        tone: "active",
        decisionSteps: [routeDecisionStep, ...oneActiveStep(steps, activeIndex)]
      };
    }
    if (effectiveAction === "google_gmail") {
      const isComposeFlow =
        (traceReason ?? "").toLowerCase().includes("send") ||
        (traceReason ?? "").toLowerCase().includes("draft");
      const steps = isComposeFlow
        ? ["Opening Gmail...", "Composing draft email...", "Preparing your email response..."]
        : ["Opening Gmail...", "Checking inbox and recent threads...", "Preparing your response..."];
      const activeIndex = Math.min(phase, steps.length - 1);
      return {
        label: steps[activeIndex],
        tone: "active",
        decisionSteps: [routeDecisionStep, ...oneActiveStep(steps, activeIndex)]
      };
    }
    if (effectiveAction === "google_calendar") {
      const steps = [
        "Opening Google Calendar...",
        "Checking availability and conflicts...",
        "Preparing scheduling response..."
      ];
      const activeIndex = Math.min(phase, steps.length - 1);
      return {
        label: steps[activeIndex],
        tone: "active",
        decisionSteps: [routeDecisionStep, ...oneActiveStep(steps, activeIndex)]
      };
    }
    if (effectiveAction === "google_drive") {
      const steps = [
        "Opening Google Drive...",
        "Checking matching files and folders...",
        "Preparing file response..."
      ];
      const activeIndex = Math.min(phase, steps.length - 1);
      return {
        label: steps[activeIndex],
        tone: "active",
        decisionSteps: [routeDecisionStep, ...oneActiveStep(steps, activeIndex)]
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
      const chainSteps: DecisionChainStep[] =
        traceSteps.length > 0
          ? traceSteps.slice(0, 5).map((step) => {
              const status: DecisionChainStep["status"] =
                step.executionStatus === "completed"
                  ? "completed"
                  : step === activeStep
                    ? "active"
                    : "pending";
              return {
                label: step.capabilityLabel || titleFromAction(step.action),
                status
              };
            })
          : [
              { label: "Plan tool sequence", status: phase >= 1 ? "completed" : "active" },
              {
                label: "Execute selected tools",
                status: phase === 0 ? "pending" : phase === 1 ? "active" : "completed"
              }
            ];
      return {
        label:
          phase === 0
            ? `Planning steps from model decision... (${traceSteps.length || 1} step${traceSteps.length === 1 ? "" : "s"})`
            : phase === 1
              ? `Running ${activeStepLabel} and collecting results...`
              : "Synthesizing final response from step outputs...",
        tone: "active",
        decisionSteps: [
          routeDecisionStep,
          ...chainSteps,
          {
            label: "Synthesize final response",
            status: phase >= 2 ? "active" : "pending"
          }
        ]
      };
    }
    if (traceReason) {
      return {
        label:
          hasAssistantContent
            ? "Preparing response..."
            : `Model decision: ${readableReason ?? traceReason}`,
        tone: "active",
        decisionSteps: [
          routeDecisionStep,
          {
            label: "Generate response",
            status: hasAssistantContent ? "active" : "pending"
          }
        ]
      };
    }
    if (route?.mode === "agent") {
      const genericSteps = ["Analyzing request...", "Preparing response..."];
      const activeIndex = Math.min(phase, genericSteps.length - 1);
      return {
        label: hasAssistantContent ? "Preparing response..." : genericSteps[activeIndex],
        tone: "active",
        decisionSteps: [
          {
            label: "Decision: choose route",
            status: hasAssistantContent ? "completed" : "active"
          },
          ...oneActiveStep(genericSteps, activeIndex)
        ]
      };
    }
    const genericSteps = ["Analyze request", "Generate response"];
    const activeIndex = Math.min(phase, genericSteps.length - 1);
    return {
      label: hasAssistantContent ? "Preparing response..." : genericSteps[activeIndex],
      tone: "active",
      decisionSteps: oneActiveStep(genericSteps, activeIndex)
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
            onQuickReply={onQuickReply}
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
            decisionSteps={activity?.decisionSteps ?? []}
          />
        ) : null}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
