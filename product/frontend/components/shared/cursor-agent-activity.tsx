"use client";

import { Sparkles } from "lucide-react";

import type { AgentActivityFeed } from "@/lib/analyst-activity";
import { ShimmerText } from "@/components/shared/cursor-loading-status";
import { cn } from "@/lib/utils";

export function CursorAgentActivity({
  feed,
  className,
  showHeader = true,
}: {
  feed: AgentActivityFeed;
  className?: string;
  showHeader?: boolean;
}) {
  const { title, subtitle, lines, waitingLabel = "Waiting for analyst model" } = feed;
  const hasActive = lines.some((line) => line.state === "active");

  return (
    <div className={cn("space-y-1.5", className)} role="status" aria-live="polite">
      {showHeader && (title || subtitle) ? (
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Sparkles className="size-3.5 shrink-0 text-white/40" aria-hidden />
          {title ? (
            <span className="text-[13px] font-medium text-white/88">{title}</span>
          ) : null}
          {subtitle ? (
            <span className="text-[12px] text-white/38">{subtitle}</span>
          ) : null}
        </div>
      ) : null}

      {lines.map((line) => (
        <p key={line.id} className="text-[13px] leading-[1.45]">
          {line.state === "active" ? (
            <>
              <ShimmerText>{line.verb}</ShimmerText>
              {line.detail ? <span className="text-white/[0.34]">{` ${line.detail}`}</span> : null}
            </>
          ) : (
            <>
              <span className="text-white/42">{line.verb}</span>
              {line.detail ? <span className="text-white/28">{` ${line.detail}`}</span> : null}
            </>
          )}
        </p>
      ))}

      {hasActive || waitingLabel ? (
        <p className="pt-0.5 text-[13px] leading-[1.45]">
          <ShimmerText dim>{waitingLabel}</ShimmerText>
        </p>
      ) : null}
    </div>
  );
}
