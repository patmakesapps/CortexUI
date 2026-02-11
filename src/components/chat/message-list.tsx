"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/hooks/use-chat";
import { MessageItem } from "@/components/chat/message-item";
import { TypingIndicator } from "@/components/chat/typing-indicator";

type MessageListProps = {
  messages: ChatMessage[];
  isStreaming: boolean;
};

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

  return (
    <div className="chat-scroll chat-fade-scroll flex-1 overflow-y-auto px-1 pb-6 pt-4 md:px-2 md:pb-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-1">
        {messages.map((message) => (
          <MessageItem key={message.id} message={message} />
        ))}
        {showTypingIndicator ? <TypingIndicator /> : null}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
