"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ChatMessage, MessageReaction } from "@/hooks/use-chat";

type MessageItemProps = {
  message: ChatMessage;
  onQuickReply?: (text: string) => Promise<void>;
  onReact?: (threadId: string, messageId: string, reaction: MessageReaction) => Promise<void>;
};

type ContentPart =
  | { type: "text"; value: string }
  | { type: "code"; value: string; language: string };

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
    if (textBuffer.length === 0) return;
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
    flushCode();
  }
  flushText();

  if (parts.length === 0) {
    parts.push({ type: "text", value: content });
  }

  return parts;
}

function readActiveReaction(
  meta: ChatMessage["meta"]
): MessageReaction | null {
  if (!meta || typeof meta !== "object") return null;
  const value = (meta as Record<string, unknown>).reaction;
  if (
    value === "thumbs_up" ||
    value === "heart" ||
    value === "angry" ||
    value === "sad" ||
    value === "brain"
  ) {
    return value;
  }
  return null;
}

export function MessageItem({ message, onReact }: MessageItemProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [pendingReaction, setPendingReaction] = useState<MessageReaction | null>(null);
  const [burstReaction, setBurstReaction] = useState<MessageReaction | null>(null);
  const [localReaction, setLocalReaction] = useState<MessageReaction | null>(
    readActiveReaction(message.meta)
  );

  const isUser = message.role === "user";
  const parts = parseContent(message.content);
  const activeReaction = localReaction ?? readActiveReaction(message.meta);

  const bubbleClass = isUser
    ? "ml-auto ui-message-user rounded-2xl px-4 py-3"
    : "mr-auto ui-message-assistant rounded-2xl px-4 py-3";

  const handleCopy = async (value: string, index: number) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 1200);
    } catch {
      setCopiedIndex(null);
    }
  };

  const handleReactionClick = async (reaction: MessageReaction) => {
    if (!onReact || !message.threadId || !message.id || pendingReaction) return;
    setPendingReaction(reaction);
    setBurstReaction(reaction);
    window.setTimeout(() => setBurstReaction(null), 220);
    const previous = activeReaction;
    const next = previous === reaction ? null : reaction;
    setLocalReaction(next);
    try {
      await onReact(message.threadId, message.id, reaction);
    } catch {
      setLocalReaction(previous);
    } finally {
      setPendingReaction(null);
    }
  };

  const content = (
    <div className="group">
      <div className={bubbleClass}>
        <div className="space-y-3">
          {parts.map((part, index) => {
            if (part.type === "text") {
              if (part.value.trim().length === 0) return null;
              return (
                <p key={`${message.id}-text-${index}`} className="whitespace-pre-wrap">
                  {renderTextWithLinks(part.value)}
                </p>
              );
            }

            return (
              <div
                key={`${message.id}-code-${index}`}
                className="overflow-hidden rounded-2xl border border-slate-500/45 bg-slate-900/80"
              >
                <div className="flex items-center justify-between border-b border-slate-500/45 bg-slate-800/80 px-3 py-1.5 text-xs tracking-wide text-slate-300">
                  <span className="font-semibold uppercase">{part.language}</span>
                  <button
                    type="button"
                    onClick={() => void handleCopy(part.value, index)}
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
      {onReact && !isUser ? (
        <div className="pt-2">
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
              {activeReaction ? REACTION_EMOJI_BY_ID[activeReaction] : "+"}
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
                        burstReaction === option.id ? { scale: [1, 1.14, 1] } : { scale: 1 }
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
        </div>
      ) : null}
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
