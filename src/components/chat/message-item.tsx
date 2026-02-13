"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { ChatMessage } from "@/hooks/use-chat";

type MessageItemProps = {
  message: ChatMessage;
};

type ContentPart =
  | { type: "text"; value: string }
  | { type: "code"; value: string; language: string };

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
      const openMatch = trimmedStart.match(/^(```+|~~~+)\s*([^\s`~]+)?(?:\s.*)?$/);
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

    const closePattern = new RegExp(`^${fenceChar}{${fenceLength},}\\s*$`);
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
    const rawFence = fenceChar.repeat(fenceLength);
    textBuffer.push(`${rawFence}${language === "text" ? "" : language}`);
    textBuffer = textBuffer.concat(codeBuffer);
  }

  flushText();

  if (parts.length === 0) {
    parts.push({ type: "text", value: content });
  }

  return parts;
}

export function MessageItem({ message }: MessageItemProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const isUser = message.role === "user";
  const parts = isUser ? [] : parseContent(message.content || " ");

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
      <div className="space-y-4">
        {parts.map((part, index) => {
          if (part.type === "text") {
            if (part.value.trim().length === 0) {
              return null;
            }
            return (
              <p key={`${message.id}-text-${index}`} className="whitespace-pre-wrap">
                {part.value}
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
