"use client";

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import type { ChatMessage } from "@/hooks/use-chat";

type MessageItemProps = {
  message: ChatMessage;
};

type ContentPart =
  | { type: "text"; value: string }
  | { type: "code"; value: string; language: string };

type AgentCapability = {
  id: string;
  type: "tool";
  label: string;
};

type AgentTraceMeta = {
  version: number;
  source: string;
  action: string;
  reason?: string;
  confidence?: number;
  capabilities: AgentCapability[];
};

type AgentRouteMeta = {
  mode: "agent" | "agent_fallback" | "memory_direct";
  warning?: string;
};

const URL_PATTERN = /(https?:\/\/[^\s<>"`]+)/g;

function splitTrailingPunctuation(url: string): { href: string; trailing: string } {
  const match = url.match(/([)\].,!?:;]+)$/);
  if (!match) {
    return { href: url, trailing: "" };
  }
  const trailing = match[1];
  return {
    href: url.slice(0, -trailing.length),
    trailing
  };
}

function renderTextWithLinks(value: string) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  URL_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null = URL_PATTERN.exec(value);

  while (match) {
    const rawUrl = match[0];
    const start = match.index;
    const end = start + rawUrl.length;
    const { href, trailing } = splitTrailingPunctuation(rawUrl);

    if (start > lastIndex) {
      nodes.push(value.slice(lastIndex, start));
    }

    nodes.push(
      <a
        key={`${start}-${href}`}
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="underline decoration-cyan-300/60 underline-offset-4 transition hover:text-cyan-200 hover:decoration-cyan-200"
      >
        {href}
      </a>
    );

    if (trailing) {
      nodes.push(trailing);
    }

    lastIndex = end;
    match = URL_PATTERN.exec(value);
  }

  if (lastIndex < value.length) {
    nodes.push(value.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : value;
}

function parseContent(content: string): ContentPart[] {
  const parts: ContentPart[] = [];
  const lines = content.split(/\r?\n/);
  let textBuffer: string[] = [];
  let codeBuffer: string[] = [];
  let inCode = false;
  let fenceChar = "`";
  let fenceLength = 3;
  let language = "text";

  const flushText = () => {
    if (textBuffer.length === 0) {
      return;
    }
    parts.push({ type: "text", value: textBuffer.join("\n") });
    textBuffer = [];
  };

  const flushCode = () => {
    parts.push({ type: "code", value: codeBuffer.join("\n"), language });
    codeBuffer = [];
  };

  for (const line of lines) {
    const trimmedStart = line.trimStart();

    if (!inCode) {
      const openMatch = trimmedStart.match(
        /^(?:(?:[-*+]|\d+\.)\s+)?(```+|~~~+)\s*([^\s`~]+)?(?:\s.*)?$/
      );
      if (openMatch) {
        flushText();
        inCode = true;
        fenceChar = openMatch[1][0];
        fenceLength = openMatch[1].length;
        language = (openMatch[2] || "text").toLowerCase();
        continue;
      }
      textBuffer.push(line);
      continue;
    }

    // Be tolerant of occasional trailing text after closing fences from streamed LLM output.
    const closePattern = new RegExp(`^${fenceChar}{${fenceLength},}(?:\\s.*)?$`);
    if (trimmedStart.match(closePattern)) {
      flushCode();
      inCode = false;
      fenceChar = "`";
      fenceLength = 3;
      language = "text";
      continue;
    }

    codeBuffer.push(line);
  }

  if (inCode) {
    // If the model forgets a closing fence, keep rendering as code so copy UX still works.
    flushCode();
  }

  flushText();

  if (parts.length === 0) {
    parts.push({ type: "text", value: content });
  }

  return parts;
}

function toTitleCase(raw: string): string {
  return raw
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function readAgentTraceMeta(message: ChatMessage): AgentTraceMeta | null {
  const meta = message.meta;
  const metaRow =
    meta && typeof meta === "object" ? (meta as Record<string, unknown>) : null;
  if (!metaRow) return null;

  const candidate = metaRow.agentTrace;
  if (candidate && typeof candidate === "object") {
    const row = candidate as Record<string, unknown>;
    const action = typeof row.action === "string" ? row.action.trim() : "";
    if (!action) return null;
    const version = typeof row.version === "number" ? row.version : 1;
    const source = typeof row.source === "string" ? row.source : "cortex-agent";
    const reason = typeof row.reason === "string" ? row.reason : undefined;
    const confidence = typeof row.confidence === "number" ? row.confidence : undefined;
    const capabilitiesRaw = Array.isArray(row.capabilities) ? row.capabilities : [];
    const capabilities = capabilitiesRaw
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const capability = item as Record<string, unknown>;
        const id = typeof capability.id === "string" ? capability.id.trim() : "";
        const type = capability.type === "tool" ? "tool" : null;
        const label =
          typeof capability.label === "string" ? capability.label.trim() : "";
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
  }

  const sourceRaw = metaRow.source;
  const source = typeof sourceRaw === "string" ? sourceRaw.trim().toLowerCase() : "";
  if (source !== "cortexagent_web_search" && source !== "cortexagent") {
    return null;
  }
  const capabilities: AgentCapability[] = [];
  if (source === "cortexagent_web_search") {
    capabilities.push({ id: "web_search", type: "tool", label: "Web Search" });
  }
  return {
    version: 1,
    source: "cortex-agent",
    action: source === "cortexagent_web_search" ? "web_search" : "chat",
    capabilities
  };
}

function readAgentRouteMeta(message: ChatMessage): AgentRouteMeta | null {
  const meta = message.meta;
  const row = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : null;
  if (!row) return null;

  const candidate = row.agentRoute;
  if (candidate && typeof candidate === "object") {
    const routeRow = candidate as Record<string, unknown>;
    const mode = routeRow.mode;
    if (mode !== "agent" && mode !== "agent_fallback" && mode !== "memory_direct") {
      return null;
    }
    const warning = typeof routeRow.warning === "string" ? routeRow.warning.trim() : "";
    return {
      mode,
      ...(warning ? { warning } : {})
    };
  }

  const source = typeof row.source === "string" ? row.source.trim().toLowerCase() : "";
  if (source === "cortexagent_web_search" || source === "cortexagent") {
    return { mode: "agent" };
  }
  return null;
}

export function MessageItem({ message }: MessageItemProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const isUser = message.role === "user";
  const parts = isUser ? [] : parseContent(message.content || " ");
  const agentTrace = isUser ? null : readAgentTraceMeta(message);
  const agentRoute = isUser ? null : readAgentRouteMeta(message);
  const isChatRouted = agentTrace?.action === "chat";
  const normalizedAction = agentTrace ? toTitleCase(agentTrace.action) : "";
  const visibleCapabilities = agentTrace
    ? agentTrace.capabilities.filter(
        (capability) =>
          capability.label.trim().toLowerCase() !== normalizedAction.trim().toLowerCase()
      )
    : [];

  const handleCopy = async (value: string, partIndex: number) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedIndex(partIndex);
      window.setTimeout(() => {
        setCopiedIndex((prev) => (prev === partIndex ? null : prev));
      }, 1500);
    } catch {
      setCopiedIndex(null);
    }
  };

  const content = isUser ? (
    <div className="ml-auto max-w-[85%] rounded-3xl border border-slate-500/40 bg-slate-700/55 px-4 py-3 text-[17px] leading-8 text-slate-100 shadow-[0_12px_30px_rgb(2_6_23/0.25)] md:max-w-[70%] md:text-[18px]">
      <p className="whitespace-pre-wrap">{message.content || " "}</p>
    </div>
  ) : (
    <div className="mr-auto max-w-[90%] px-3 py-2 text-[17px] leading-8 text-slate-100 md:max-w-[78%] md:text-[18px]">
      {agentRoute?.mode === "agent_fallback" ? (
        <div className="mb-3 rounded-2xl border border-amber-300/35 bg-gradient-to-r from-amber-500/18 via-amber-400/10 to-transparent px-3 py-2 text-[12px] leading-5 text-amber-100 shadow-[0_14px_26px_rgb(120_53_15/0.25)] backdrop-blur-sm">
          <p className="font-semibold tracking-wide text-amber-50">Agent fallback</p>
          <p>{agentRoute.warning ?? "Agentic tools were unavailable. This reply used direct memory mode."}</p>
        </div>
      ) : agentTrace && !isChatRouted ? (
        <div className="mb-3 rounded-2xl border border-cyan-300/35 bg-gradient-to-r from-cyan-500/22 via-cyan-400/10 to-transparent px-3 py-2 text-[12px] leading-5 text-cyan-100 shadow-[0_14px_30px_rgb(8_47_73/0.25)] backdrop-blur-sm">
          <p className="font-semibold tracking-wide text-cyan-50">Agentic behavior active</p>
          <p>
            {agentTrace.action === "web_search"
              ? "This response was generated with live web search."
              : `This response used ${toTitleCase(agentTrace.action)} routing.`}
          </p>
        </div>
      ) : null}
      {agentTrace && !isChatRouted ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full border border-cyan-300/30 bg-cyan-500/15 px-2.5 py-0.5 font-semibold uppercase tracking-wide text-cyan-200">
            Agent Mode
          </span>
          <span className="rounded-full border border-slate-400/30 bg-slate-700/40 px-2.5 py-0.5 font-semibold text-slate-200">
            {normalizedAction}
          </span>
          {visibleCapabilities.map((capability) => (
            <span
              key={`${message.id}-${capability.id}`}
              className="rounded-full border border-emerald-300/30 bg-emerald-500/15 px-2.5 py-0.5 font-semibold text-emerald-200"
            >
              {capability.label}
            </span>
          ))}
        </div>
      ) : null}
      <div className="space-y-4">
        {parts.map((part, index) => {
          if (part.type === "text") {
            if (part.value.trim().length === 0) {
              return null;
            }
            return (
              <p key={`${message.id}-text-${index}`} className="whitespace-pre-wrap">
                {renderTextWithLinks(part.value)}
              </p>
            );
          }

          return (
            <div
              key={`${message.id}-code-${index}`}
              className="overflow-hidden rounded-2xl border border-slate-500/50 bg-slate-900/80"
            >
              <div className="flex items-center justify-between border-b border-slate-500/45 bg-slate-800/80 px-3 py-1.5 text-xs tracking-wide text-slate-300">
                <span className="font-semibold uppercase">{part.language}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(part.value, index)}
                  className="rounded-md border border-slate-500/50 px-2 py-0.5 text-[11px] font-semibold text-slate-100 transition hover:bg-slate-700/60"
                >
                  {copiedIndex === index ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="overflow-x-auto px-4 py-3 text-[14px] leading-6 text-slate-100 md:text-[15px]">
                <code>{part.value}</code>
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (isUser) {
    return <div className="px-1 py-1.5">{content}</div>;
  }

  return (
    <motion.div
      className="px-1 py-1.5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      {content}
    </motion.div>
  );
}
