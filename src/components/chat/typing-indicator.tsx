"use client";

import { motion } from "framer-motion";

export function TypingIndicator() {
  return (
    <div className="px-2 py-1">
      <div className="inline-flex items-center gap-1.5 rounded-2xl border border-border/70 bg-[rgb(var(--panel)/0.9)] px-3 py-2 text-xs text-slate-300 shadow-sm backdrop-blur">
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            className="h-1.5 w-1.5 rounded-full bg-slate-400"
            animate={{ y: [0, -2, 0], opacity: [0.5, 1, 0.5] }}
            transition={{
              duration: 0.9,
              repeat: Infinity,
              delay: index * 0.12
            }}
          />
        ))}
      </div>
    </div>
  );
}
