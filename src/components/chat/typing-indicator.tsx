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
      ? "border-[rgb(var(--status-warning)/0.52)] bg-[rgb(var(--status-warning)/0.2)] text-[rgb(var(--foreground)/0.96)]"
      : "border-[rgb(var(--accent)/0.45)] bg-[rgb(var(--accent)/0.14)] text-[rgb(var(--foreground)/0.96)]";

  return (
    <div className="px-2 py-1">
      <div className="inline-flex items-center gap-3">
        <BrainLoader />
        {activityLabel ? (
          <div
            className={`ui-shimmer ui-shimmer-soft max-w-[min(70vw,34rem)] rounded-xl border px-3 py-2 text-xs font-medium tracking-wide shadow-[0_12px_24px_rgb(2_6_23/0.24)] backdrop-blur-sm ${toneClasses}`}
          >
            {activityLabel}
          </div>
        ) : null}
      </div>
    </div>
  );
}
