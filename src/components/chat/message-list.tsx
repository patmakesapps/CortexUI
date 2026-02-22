"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage, MessageReaction } from "@/hooks/use-chat";
import { MessageItem } from "@/components/chat/message-item";
import { TypingIndicator } from "@/components/chat/typing-indicator";

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

export function MessageList({
  messages,
  isStreaming,
  onQuickReply,
  onReactToMessage
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const prevSignatureRef = useRef<string>("");

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

  return (
    <div className="chat-scroll chat-fade-scroll flex-1 overflow-y-auto px-1 pb-6 pt-4 md:px-2 md:pb-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-1">
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            onQuickReply={onQuickReply}
            onReact={message.role === "assistant" && !isStreaming ? onReactToMessage : undefined}
          />
        ))}
        {isStreaming ? <TypingIndicator activityLabel="Thinking..." tone="active" /> : null}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
