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

type ToolCardField = {
  label: string;
  value: string;
};

type ToolCard = {
  title: string;
  fields: ToolCardField[];
  link?: string;
};

type ToolCardGroup = {
  heading: string;
  cards: ToolCard[];
  footer?: string;
};

const URL_PATTERN = /(https?:\/\/[^\s<>"`]+)/g;
const GMAIL_HIDDEN_FIELD_LABELS = new Set([
  "draft id",
  "message id",
  "thread id",
  "id"
]);

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

function parseIndexedToolCards(content: string): ToolCardGroup | null {
  const lines = content.split(/\r?\n/);
  if (lines.length < 2) return null;
  const heading = lines[0].trim();
  if (!heading.endsWith(":")) return null;

  const cards: ToolCard[] = [];
  let current: ToolCard | null = null;
  const pushCurrent = () => {
    if (!current) return;
    cards.push(current);
    current = null;
  };

  for (const rawLine of lines.slice(1)) {
    const numbered = rawLine.match(/^\s*\d+\.\s+(.+)$/);
    if (numbered) {
      pushCurrent();
      current = { title: numbered[1].trim(), fields: [] };
      continue;
    }
    if (!current) {
      continue;
    }
    const line = rawLine.trim();
    if (!line) continue;
    if (/^link:\s*/i.test(line)) {
      current.link = line.replace(/^link:\s*/i, "").trim();
      continue;
    }
    const kv = line.match(/^([^:]{2,30}):\s*(.+)$/);
    if (kv) {
      const label = kv[1].trim();
      if (label.toLowerCase() === "draft id") continue;
      current.fields.push({ label, value: kv[2].trim() });
      continue;
    }
    current.fields.push({ label: "Detail", value: line });
  }
  pushCurrent();
  if (cards.length === 0) return null;
  return { heading: heading.replace(/:\s*$/, ""), cards };
}

function parseGmailDraftConfirmationCard(content: string): ToolCardGroup | null {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0) return null;
  if (lines[0].trim().toLowerCase() !== "i am ready to send this draft:") {
    return null;
  }
  const fields: ToolCardField[] = [];
  let footer = "";
  for (const rawLine of lines.slice(1)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^reply with /i.test(line)) {
      footer = line;
      continue;
    }
    const bullet = line.match(/^\-\s*([^:]{2,30}):\s*(.+)$/);
    if (!bullet) continue;
    const label = bullet[1].trim();
    if (label.toLowerCase() === "draft id") continue;
    fields.push({ label, value: bullet[2].trim() });
  }
  if (fields.length === 0) return null;
  return {
    heading: "Email Draft Ready",
    cards: [{ title: "Ready to send", fields }],
    ...(footer ? { footer } : {})
  };
}

function parseCalendarDraftCard(content: string): ToolCardGroup | null {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0) return null;
  if (lines[0].trim().toLowerCase() !== "i have this draft event:") {
    return null;
  }
  const fields: ToolCardField[] = [];
  let footer = "";
  for (const rawLine of lines.slice(1)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^should i add this to google calendar\?/i.test(line)) {
      footer = line;
      continue;
    }
    const bullet = line.match(/^\-\s*([^:]{2,30}):\s*(.+)$/);
    if (!bullet) continue;
    fields.push({ label: bullet[1].trim(), value: bullet[2].trim() });
  }
  if (fields.length === 0) return null;
  return {
    heading: "Calendar Draft",
    cards: [{ title: "Pending event", fields }],
    ...(footer ? { footer } : {})
  };
}

function parseToolCardGroup(action: string | undefined, content: string): ToolCardGroup | null {
  if (!action) return null;
  if (action === "google_gmail") {
    const parsed = parseGmailDraftConfirmationCard(content) ?? parseIndexedToolCards(content);
    return parsed ? sanitizeGmailToolCardGroup(parsed) : null;
  }
  if (action === "google_calendar") {
    return parseCalendarDraftCard(content) ?? parseIndexedToolCards(content);
  }
  return null;
}

function sanitizeGmailToolCardGroup(group: ToolCardGroup): ToolCardGroup {
  return {
    ...group,
    cards: group.cards.map((card) => ({
      ...card,
      title: normalizeGmailCardTitle(card.title),
      fields: card.fields.filter(
        (field) => !GMAIL_HIDDEN_FIELD_LABELS.has(field.label.trim().toLowerCase())
      )
    }))
  };
}

function normalizeGmailCardTitle(title: string): string {
  const cleaned = title.trim();
  if (/^\[sent\]/i.test(cleaned)) {
    return "Email sent";
  }
  if (/^\[drafted\]\s*new\s+email/i.test(cleaned)) {
    return "Email draft created";
  }
  return cleaned;
}

function normalizeGoogleCalendarContent(raw: string): string {
  if (!raw) return raw;
  let next = raw;
  next = next.replace(
    /https?:\/\/(?:www\.)?google\.com\/calendar\/event\?[^\s)]+/gi,
    "https://calendar.google.com/"
  );
  next = next.replace(/Starts:\s*([0-9T:\-+.Z]+)/gi, (_match, isoValue: string) => {
    const value = String(isoValue || "").trim();
    if (!value) return "Starts: Time unavailable";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return `Starts: ${value}`;
    }
    const stamp = date.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
    return `Starts: ${stamp}`;
  });
  return next;
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
  if (
    source !== "cortexagent_web_search" &&
    source !== "cortexagent_google_calendar" &&
    source !== "cortexagent"
  ) {
    return null;
  }
  const capabilities: AgentCapability[] = [];
  if (source === "cortexagent_web_search") {
    capabilities.push({ id: "web_search", type: "tool", label: "Web Search" });
  } else if (source === "cortexagent_google_calendar") {
    capabilities.push({
      id: "google_calendar",
      type: "tool",
      label: "Google Calendar"
    });
  }
  return {
    version: 1,
    source: "cortex-agent",
    action:
      source === "cortexagent_web_search"
        ? "web_search"
        : source === "cortexagent_google_calendar"
          ? "google_calendar"
          : "chat",
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
  if (
    source === "cortexagent_web_search" ||
    source === "cortexagent_google_calendar" ||
    source === "cortexagent"
  ) {
    return { mode: "agent" };
  }
  return null;
}

export function MessageItem({ message }: MessageItemProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const isUser = message.role === "user";
  const normalizedAssistantContent =
    !isUser && readAgentTraceMeta(message)?.action === "google_calendar"
      ? normalizeGoogleCalendarContent(message.content || " ")
      : message.content || " ";
  const parts = isUser ? [] : parseContent(normalizedAssistantContent);
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
  const isWebSearchRouted = agentTrace?.action === "web_search";
  const toolCardGroup =
    !isUser && agentTrace
      ? parseToolCardGroup(agentTrace.action, normalizedAssistantContent)
      : null;

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
      ) : agentTrace && !isChatRouted && isWebSearchRouted ? (
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
        {toolCardGroup ? (
          <div className="space-y-3">
            <p className="text-[15px] font-semibold uppercase tracking-wide text-cyan-100/90">
              {toolCardGroup.heading}
            </p>
            {toolCardGroup.cards.map((card, cardIndex) => (
              <article
                key={`${message.id}-tool-card-${cardIndex}`}
                className="rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-slate-800/85 via-slate-800/60 to-cyan-950/30 p-4 shadow-[0_16px_32px_rgb(8_47_73/0.22)]"
              >
                <h4 className="mb-3 text-[18px] font-semibold leading-7 text-slate-100">
                  {card.title}
                </h4>
                <div className="space-y-2">
                  {card.fields.map((field, fieldIndex) => (
                    <div
                      key={`${message.id}-tool-card-${cardIndex}-field-${fieldIndex}`}
                      className="rounded-xl border border-slate-500/35 bg-slate-900/35 px-3 py-2"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-200/85">
                        {field.label}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-[16px] leading-7 text-slate-100">
                        {renderTextWithLinks(field.value)}
                      </p>
                    </div>
                  ))}
                  {card.link ? (
                    <a
                      href={card.link}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-3 py-1.5 text-[13px] font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
                    >
                      Open in Google
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
            {toolCardGroup.footer ? (
              <p className="text-[14px] leading-6 text-slate-300">{toolCardGroup.footer}</p>
            ) : null}
          </div>
        ) : (
          parts.map((part, index) => {
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
          })
        )}
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
