"use client";

import { BrainLoader } from "@/components/ui/brain-loader";

export type DecisionChainStep = {
  label: string;
  status: "completed" | "active" | "pending";
};

type TypingIndicatorProps = {
  activityLabel?: string | null;
  tone?: "active" | "warning";
  decisionSteps?: DecisionChainStep[];
};

export function TypingIndicator({
  activityLabel = null,
  tone = "active",
  decisionSteps = []
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
            <p>{activityLabel}</p>
            {decisionSteps.length > 0 ? (
              <div className="mt-2 text-[11px] tracking-normal text-[rgb(var(--foreground)/0.9)]">
                {(() => {
                  const activeIndex = Math.max(
                    0,
                    decisionSteps.findIndex((step) => step.status === "active")
                  );
                  const current = decisionSteps[activeIndex] ?? decisionSteps[0];
                  if (!current) return null;
                  const headline = (activityLabel ?? "").trim().toLowerCase();
                  const stepLine = (current.label ?? "").trim();
                  if (stepLine.toLowerCase() === headline) {
                    return null;
                  }
                  return (
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-pulse" />
                      <span>{stepLine}</span>
                    </div>
                  );
                })()}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
