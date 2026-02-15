"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ChatMessage, MessageReaction } from "@/hooks/use-chat";

type MessageItemProps = {
  message: ChatMessage;
  onReact?: (threadId: string, messageId: string, reaction: MessageReaction) => Promise<void>;
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
  steps?: Array<{
    action: string;
    toolName: string;
    success: boolean;
    reason: string;
  }>;
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

const REACTION_OPTIONS: Array<{ id: MessageReaction; emoji: string; label: string }> = [
  { id: "thumbs_up", emoji: "👍", label: "Thumbs up" },
  { id: "heart", emoji: "❤️", label: "Heart" },
  { id: "angry", emoji: "😠", label: "Angry" },
  { id: "sad", emoji: "😢", label: "Sad" },
  { id: "brain", emoji: "🧠", label: "Summarize now" }
];

const REACTION_EMOJI_BY_ID: Record<MessageReaction, string> = {
  thumbs_up: "👍",
  heart: "❤️",
  angry: "😠",
  sad: "😢",
  brain: "🧠"
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
        className="ui-link transition"
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

function renderStructuredText(value: string, keyPrefix: string): ReactNode {
  const normalized = value
    .replace(/\r\n/g, "\n")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^\s*\*\s+/gm, "• ");
  const lines = normalized.split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = i + 1 < lines.length ? lines[i + 1] : "";
    const trimmed = line.trim();
    const nextTrimmed = next.trim();

    // Header pattern:
    // Title
    // -----
    if (
      trimmed.length > 0 &&
      /^[\-]{3,}$/.test(nextTrimmed)
    ) {
      nodes.push(
        <div key={`${keyPrefix}-h-${i}`} className="mt-1">
          <p className="ui-accent-soft text-[15px] font-semibold tracking-wide">{trimmed}</p>
          <div className="mt-1 h-px w-full bg-[rgb(var(--border)/0.55)]" />
        </div>
      );
      i += 2;
      continue;
    }

    // Uppercase topic headings like "MASTER MEMORY"
    if (/^[A-Z][A-Z\s]{4,}$/.test(trimmed)) {
      nodes.push(
        <div key={`${keyPrefix}-topic-${i}`} className="mt-2">
          <p className="ui-accent-soft text-[18px] font-semibold tracking-[0.02em]">{trimmed}</p>
          <div className="mt-1 h-px w-full bg-[rgb(var(--border)/0.48)]" />
        </div>
      );
      i += 1;
      continue;
    }

    // Title case section headers ending with ":".
    if (/^[A-Z][\w\s'()/,-]{2,}:$/.test(trimmed)) {
      nodes.push(
        <div key={`${keyPrefix}-section-${i}`} className="mt-2">
          <p className="ui-accent-soft text-[15px] font-semibold tracking-wide">
            {trimmed.replace(/:\s*$/, "")}
          </p>
          <div className="mt-1 h-px w-full bg-[rgb(var(--border)/0.42)]" />
        </div>
      );
      i += 1;
      continue;
    }

    if (trimmed.length === 0) {
      nodes.push(<div key={`${keyPrefix}-sp-${i}`} className="h-1" />);
      i += 1;
      continue;
    }

    // Polished list rows
    const numbered = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numbered) {
      nodes.push(
        <div key={`${keyPrefix}-li-${i}`} className="rounded-lg px-1 py-1.5">
          <p className="whitespace-pre-wrap font-medium">
            <span className="ui-accent-soft mr-2">{numbered[1]}.</span>
            {renderTextWithLinks(numbered[2])}
          </p>
        </div>
      );
      i += 1;
      continue;
    }

    if (trimmed.startsWith("• ")) {
      nodes.push(
        <div key={`${keyPrefix}-bullet-${i}`} className="rounded-lg px-1 py-1">
          <p className="whitespace-pre-wrap">
            <span className="ui-accent-soft mr-2">•</span>
            {renderTextWithLinks(trimmed.slice(2))}
          </p>
        </div>
      );
      i += 1;
      continue;
    }

    nodes.push(
      <p key={`${keyPrefix}-p-${i}`} className="whitespace-pre-wrap">
        {renderTextWithLinks(line)}
      </p>
    );
    i += 1;
  }
  return <div className="space-y-1">{nodes}</div>;
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
    const lastField = current.fields.length > 0 ? current.fields[current.fields.length - 1] : null;
    const lastLabel = lastField?.label.trim().toLowerCase() ?? "";
    if (lastField && (lastLabel === "body" || lastLabel === "preview" || lastLabel === "message")) {
      lastField.value = `${lastField.value}\n${line}`;
      continue;
    }
    const kv = line.match(/^([^:]{2,30}):\s*(.+)$/);
    if (kv) {
      const label = kv[1].trim();
      if (label.toLowerCase() === "draft id") continue;
      current.fields.push({ label, value: kv[2].trim() });
      continue;
    }
    if (current.fields.length > 0) {
      const lastField = current.fields[current.fields.length - 1];
      lastField.value = `${lastField.value}\n${line}`;
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
  if (action === "google_drive") {
    return parseIndexedToolCards(content);
  }
  return null;
}

function openLabelForAction(action: string | undefined): string {
  if (action === "google_drive") return "Open in Google Drive";
  if (action === "google_calendar") return "Open in Google Calendar";
  if (action === "google_gmail") return "Open in Gmail";
  return "Open in Google";
}

function ToolCardIcon({ action }: { action: string | undefined }) {
  if (action === "google_calendar") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <rect x="3" y="5" width="18" height="16" rx="2" fill="#8ab4f8" />
        <rect x="3" y="5" width="18" height="5" rx="2" fill="#4285f4" />
        <rect x="7" y="2" width="2" height="5" rx="1" fill="#e8f0fe" />
        <rect x="15" y="2" width="2" height="5" rx="1" fill="#e8f0fe" />
        <rect x="7" y="12" width="4" height="4" rx="1" fill="#0b57d0" />
      </svg>
    );
  }
  if (action === "google_gmail") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <rect x="2.5" y="4.5" width="19" height="15" rx="2" fill="#ffffff" />
        <path d="M4 7.5L12 13.5L20 7.5V18H4V7.5Z" fill="#e8eaed" />
        <path d="M4 7.5V18H7V10.2L12 13.9L17 10.2V18H20V7.5L12 13.5L4 7.5Z" fill="#ea4335" />
      </svg>
    );
  }
  if (action === "google_drive") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path d="M8 3.5h7l4 7H12z" fill="#0f9d58" />
        <path d="M5 17.5l3-5h7l-3 5z" fill="#f4b400" />
        <path d="M12 10.5h7l-3 5h-7z" fill="#4285f4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        d="M21.35 12.15c0-.77-.07-1.5-.2-2.2H12v4.17h5.23a4.47 4.47 0 0 1-1.94 2.93v2.43h3.14c1.84-1.7 2.92-4.2 2.92-7.33Z"
        fill="#4285F4"
      />
      <path
        d="M12 21.6c2.63 0 4.84-.87 6.45-2.36l-3.14-2.43c-.87.58-1.99.92-3.31.92-2.55 0-4.71-1.72-5.48-4.02H3.28v2.5A9.73 9.73 0 0 0 12 21.6Z"
        fill="#34A853"
      />
      <path
        d="M6.52 13.71a5.86 5.86 0 0 1 0-3.42v-2.5H3.28a9.73 9.73 0 0 0 0 8.42l3.24-2.5Z"
        fill="#FBBC05"
      />
      <path
        d="M12 6.27c1.43 0 2.72.49 3.73 1.46l2.8-2.8C16.84 3.37 14.63 2.4 12 2.4a9.73 9.73 0 0 0-8.72 5.39l3.24 2.5c.77-2.3 2.93-4.02 5.48-4.02Z"
        fill="#EA4335"
      />
    </svg>
  );
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

function isExpandableToolCardFieldValue(value: string): boolean {
  if (!value) return false;
  const lines = value.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return value.length > 280 || lines.length > 4;
}

function getCollapsedToolCardFieldValue(value: string): string {
  const lines = value.split(/\r?\n/);
  const trimmedLines = lines.slice(0, 4);
  const collapsed = trimmedLines.join("\n").trimEnd();
  if (value.length > 280) {
    return `${collapsed.slice(0, 280).trimEnd()}...`;
  }
  if (lines.length > 4) {
    return `${collapsed}\n...`;
  }
  return collapsed;
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
    const stepsRaw = Array.isArray(row.steps) ? row.steps : [];
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
    const steps = stepsRaw
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const step = item as Record<string, unknown>;
        const actionValue = typeof step.action === "string" ? step.action.trim() : "";
        const toolNameValue =
          typeof step.toolName === "string" ? step.toolName.trim() : "";
        const successValue =
          typeof step.success === "boolean" ? step.success : null;
        const reasonValue =
          typeof step.reason === "string" ? step.reason.trim() : "";
        if (!actionValue || !toolNameValue || successValue === null) return null;
        return {
          action: actionValue,
          toolName: toolNameValue,
          success: successValue,
          reason: reasonValue
        };
      })
      .filter(
        (
          item
        ): item is { action: string; toolName: string; success: boolean; reason: string } =>
          item !== null
      );

    return {
      version,
      source,
      action,
      ...(reason ? { reason } : {}),
      ...(typeof confidence === "number" ? { confidence } : {}),
      capabilities,
      ...(steps.length > 0 ? { steps } : {})
    };
  }

  const sourceRaw = metaRow.source;
  const source = typeof sourceRaw === "string" ? sourceRaw.trim().toLowerCase() : "";
  if (
    source !== "cortexagent_web_search" &&
    source !== "cortexagent_google_calendar" &&
    source !== "cortexagent_google_gmail" &&
    source !== "cortexagent_google_drive" &&
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
  } else if (source === "cortexagent_google_gmail") {
    capabilities.push({
      id: "google_gmail",
      type: "tool",
      label: "Gmail"
    });
  } else if (source === "cortexagent_google_drive") {
    capabilities.push({
      id: "google_drive",
      type: "tool",
      label: "Google Drive"
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
          : source === "cortexagent_google_gmail"
            ? "google_gmail"
          : source === "cortexagent_google_drive"
            ? "google_drive"
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
    source === "cortexagent_google_gmail" ||
    source === "cortexagent_google_drive" ||
    source === "cortexagent"
  ) {
    return { mode: "agent" };
  }
  return null;
}

export function MessageItem({ message, onReact }: MessageItemProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [pendingReaction, setPendingReaction] = useState<MessageReaction | null>(null);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [burstReaction, setBurstReaction] = useState<MessageReaction | null>(null);
  const [expandedToolCards, setExpandedToolCards] = useState<Record<string, boolean>>({});
  const isUser = message.role === "user";
  const activeReaction =
    message.meta && typeof message.meta === "object"
      ? ((message.meta as Record<string, unknown>).reaction as string | undefined)
      : undefined;
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
          capability.id !== agentTrace.action &&
          capability.label.trim().toLowerCase() !== normalizedAction.trim().toLowerCase()
      )
    : [];
  const isWebSearchRouted = agentTrace?.action === "web_search";
  const toolCardGroup =
    !isUser && agentTrace
      ? parseToolCardGroup(agentTrace.action, normalizedAssistantContent)
      : null;
  const openCtaLabel = openLabelForAction(agentTrace?.action);

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

  const handleReactionClick = async (reaction: MessageReaction) => {
    if (!onReact || message.isStreaming) return;
    try {
      setReactionsOpen(false);
      setBurstReaction(reaction);
      window.setTimeout(() => {
        setBurstReaction((current) => (current === reaction ? null : current));
      }, 220);
      setPendingReaction(reaction);
      await onReact(message.threadId, message.id, reaction);
    } finally {
      setPendingReaction(null);
    }
  };

  const toggleToolCardExpanded = (cardKey: string) => {
    setExpandedToolCards((prev) => ({
      ...prev,
      [cardKey]: !prev[cardKey]
    }));
  };

  const content = isUser ? (
    <div className="ui-user-bubble ml-auto max-w-[85%] rounded-3xl px-4 py-3 text-[17px] leading-8 shadow-[0_12px_30px_rgb(2_6_23/0.25)] md:max-w-[70%] md:text-[18px]">
      <p className="whitespace-pre-wrap">{message.content || " "}</p>
    </div>
  ) : (
    <div className="mr-auto max-w-[90%] px-3 py-2 text-[17px] leading-8 text-[rgb(var(--foreground)/1)] md:max-w-[78%] md:text-[18px]">
      {agentRoute?.mode === "agent_fallback" ? (
        <div className="mb-3 rounded-2xl border border-amber-400/70 bg-amber-100/90 px-3 py-2 text-[12px] leading-5 text-amber-900 shadow-[0_10px_24px_rgb(120_53_15/0.18)]">
          <p className="font-semibold tracking-wide text-amber-900">Agent fallback</p>
          <p>{agentRoute.warning ?? "Agentic tools were unavailable. This reply used direct memory mode."}</p>
        </div>
      ) : agentTrace && !isChatRouted && isWebSearchRouted ? (
        <div className="mb-3 rounded-2xl border border-[rgb(var(--accent)/0.35)] bg-gradient-to-r from-[rgb(var(--accent)/0.2)] via-[rgb(var(--accent)/0.08)] to-transparent px-3 py-2 text-[12px] leading-5 text-[rgb(var(--foreground)/0.9)] shadow-[0_14px_30px_rgb(8_47_73/0.25)] backdrop-blur-sm">
          <p className="ui-accent-text font-semibold tracking-wide">Agentic behavior active</p>
          <p>
            {agentTrace.action === "web_search"
              ? "This response was generated with live web search."
              : `This response used ${toTitleCase(agentTrace.action)} routing.`}
          </p>
        </div>
      ) : null}
      {agentTrace && !isChatRouted ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="ui-badge-info rounded-full px-2.5 py-0.5 font-semibold uppercase tracking-wide">
            Agent Mode
          </span>
          <span className="ui-badge-neutral rounded-full px-2.5 py-0.5 font-semibold">
            {normalizedAction}
          </span>
          {visibleCapabilities.map((capability) => (
            <span
              key={`${message.id}-${capability.id}`}
              className="ui-badge-success rounded-full px-2.5 py-0.5 font-semibold"
            >
              {capability.label}
            </span>
          ))}
        </div>
      ) : null}
      {agentTrace?.action === "orchestration" && agentTrace.steps && agentTrace.steps.length > 0 ? (
        <div className="mb-3 rounded-2xl border border-[rgb(var(--border)/0.65)] bg-[rgb(var(--panel)/0.45)] px-3 py-2">
          <p className="ui-accent-soft text-[11px] font-semibold uppercase tracking-[0.12em]">
            Pipeline Steps
          </p>
          <div className="mt-2 space-y-1.5">
            {agentTrace.steps.map((step, index) => (
              <p key={`${message.id}-step-${index}`} className="text-[13px] leading-6">
                <span className="font-semibold">{index + 1}. {toTitleCase(step.action)}</span>
                {" - "}
                {step.success ? "Completed" : "Failed"}
              </p>
            ))}
          </div>
        </div>
      ) : null}
      <div className="space-y-4">
        {toolCardGroup ? (
          <div className="space-y-3">
            <p className="ui-accent-soft text-[15px] font-semibold uppercase tracking-wide">
              {toolCardGroup.heading}
            </p>
            {toolCardGroup.cards.map((card, cardIndex) => (
              <article
                key={`${message.id}-tool-card-${cardIndex}`}
                className="ui-panel rounded-2xl border border-[rgb(var(--border)/0.75)] p-4 shadow-[0_16px_32px_rgb(8_47_73/0.18)]"
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className="ui-panel ui-panel-strong inline-flex h-8 w-8 items-center justify-center rounded-md">
                    <ToolCardIcon action={agentTrace?.action} />
                  </span>
                  <h4 className="text-[18px] font-semibold leading-7 text-[rgb(var(--foreground)/1)]">
                    {card.title}
                  </h4>
                </div>
                <div className="space-y-2">
                  {card.fields.map((field, fieldIndex) => {
                    const cardFieldKey = `${message.id}-tool-card-${cardIndex}-field-${fieldIndex}`;
                    const expandable = isExpandableToolCardFieldValue(field.value);
                    const expanded = Boolean(expandedToolCards[cardFieldKey]);
                    const visibleValue =
                      expandable && !expanded
                        ? getCollapsedToolCardFieldValue(field.value)
                        : field.value;
                    return (
                      <div
                        key={cardFieldKey}
                        className="ui-panel ui-panel-strong rounded-xl px-3 py-2"
                      >
                        <p className="ui-accent-soft text-[11px] font-semibold uppercase tracking-[0.12em]">
                          {field.label}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-[16px] leading-7 text-[rgb(var(--foreground)/0.96)]">
                          {renderTextWithLinks(visibleValue)}
                        </p>
                        {expandable ? (
                          <button
                            type="button"
                            onClick={() => toggleToolCardExpanded(cardFieldKey)}
                            className="ui-button mt-2 inline-flex rounded-lg px-2.5 py-1 text-[12px] font-semibold"
                          >
                            {expanded ? "Show less" : "Read full body"}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                  {card.link ? (
                    <a
                      href={card.link}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="ui-button inline-flex rounded-lg px-3 py-1.5 text-[13px] font-semibold transition"
                    >
                      {openCtaLabel}
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
            {toolCardGroup.footer ? (
              <p className="text-[14px] leading-6 text-[rgb(var(--foreground)/0.72)]">
                {toolCardGroup.footer}
              </p>
            ) : null}
          </div>
        ) : (
          parts.map((part, index) => {
            if (part.type === "text") {
              if (part.value.trim().length === 0) {
                return null;
              }
              return (
                <div key={`${message.id}-text-${index}`}>
                  {renderStructuredText(part.value, `${message.id}-text-${index}`)}
                </div>
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
        {onReact ? (
          <div className="pt-1">
            <div className="flex items-center justify-start">
              <button
                type="button"
                onClick={() => setReactionsOpen((prev) => !prev)}
                disabled={Boolean(message.isStreaming)}
                aria-label="Toggle reactions"
                title="React to this message"
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs transition ${
                  reactionsOpen || activeReaction
                    ? "border-[rgb(var(--accent)/0.65)] bg-[rgb(var(--accent)/0.2)]"
                    : "border-[rgb(var(--border)/0.72)] bg-[rgb(var(--panel)/0.55)] hover:bg-[rgb(var(--panel)/0.95)]"
                }`}
              >
                {activeReaction &&
                (activeReaction === "thumbs_up" ||
                  activeReaction === "heart" ||
                  activeReaction === "angry" ||
                  activeReaction === "sad" ||
                  activeReaction === "brain")
                  ? REACTION_EMOJI_BY_ID[activeReaction]
                  : "+"}
              </button>
            </div>
            <AnimatePresence initial={false}>
              {reactionsOpen ? (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className="mt-2 flex flex-wrap items-center justify-start gap-1.5 sm:gap-2"
                >
                  {REACTION_OPTIONS.map((option) => {
                    const selected = activeReaction === option.id;
                    const pending = pendingReaction === option.id;
                    return (
                      <motion.button
                        key={`${message.id}-reaction-${option.id}`}
                        type="button"
                        onClick={() => void handleReactionClick(option.id)}
                        disabled={Boolean(message.isStreaming) || pendingReaction !== null}
                        aria-label={option.label}
                        title={option.label}
                        whileHover={{ y: -2, scale: 1.07 }}
                        whileTap={{ scale: 0.92 }}
                        animate={
                          burstReaction === option.id
                            ? { scale: [1, 1.14, 1] }
                            : { scale: 1 }
                        }
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full border px-2 text-base transition md:h-8 md:min-w-8 ${
                          selected
                            ? "border-[rgb(var(--accent)/0.7)] bg-[rgb(var(--accent)/0.25)] shadow-[0_6px_16px_rgb(2_132_199/0.25)]"
                            : "border-[rgb(var(--border)/0.7)] bg-[rgb(var(--panel)/0.55)] hover:bg-[rgb(var(--panel)/0.95)]"
                        } ${pending ? "opacity-60" : ""}`}
                      >
                        {option.emoji}
                      </motion.button>
                    );
                  })}
                </motion.div>
              ) : null}
            </AnimatePresence>
            {activeReaction ? (
              <p className="ui-text-muted mt-1 text-[11px]">Reaction saved</p>
            ) : null}
          </div>
        ) : null}
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
