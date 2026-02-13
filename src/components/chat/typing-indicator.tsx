"use client";

import { BrainLoader } from "@/components/ui/brain-loader";

export function TypingIndicator() {
  return (
    <div className="px-2 py-1">
      <BrainLoader />
    </div>
  );
}
