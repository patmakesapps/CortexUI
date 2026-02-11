"use client";

import { motion } from "framer-motion";
import type { ChatMessage } from "@/hooks/use-chat";

type MessageItemProps = {
  message: ChatMessage;
};

export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === "user";

  const content = isUser ? (
    <div className="ml-auto max-w-[85%] rounded-3xl border border-slate-500/40 bg-slate-700/55 px-4 py-3 text-[17px] leading-8 text-slate-100 shadow-[0_12px_30px_rgb(2_6_23/0.25)] md:max-w-[70%] md:text-[18px]">
      <p className="whitespace-pre-wrap">{message.content || " "}</p>
    </div>
  ) : (
    <div className="mr-auto max-w-[90%] px-3 py-2 text-[17px] leading-8 text-slate-100 md:max-w-[78%] md:text-[18px]">
      <p className="whitespace-pre-wrap">{message.content || " "}</p>
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
