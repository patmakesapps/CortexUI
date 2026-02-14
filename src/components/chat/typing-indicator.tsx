"use client";

import { BrainLoader } from "@/components/ui/brain-loader";

type TypingIndicatorProps = {
  activityLabel?: string | null;
  tone?: "active" | "warning";
};

export function TypingIndicator({
  activityLabel = null,
  tone = "active"
}: TypingIndicatorProps) {
  const toneClasses =
    tone === "warning"
      ? "border-amber-300/35 bg-amber-500/15 text-amber-100"
      : "border-cyan-300/35 bg-cyan-500/10 text-cyan-100";

  return (
    <div className="px-2 py-1">
      <div className="inline-flex flex-col gap-2">
        <BrainLoader />
        {activityLabel ? (
          <div
            className={`rounded-xl border px-3 py-2 text-xs font-medium tracking-wide shadow-[0_12px_24px_rgb(2_6_23/0.24)] backdrop-blur-sm ${toneClasses}`}
          >
            {activityLabel}
          </div>
        ) : null}
      </div>
    </div>
  );
}
