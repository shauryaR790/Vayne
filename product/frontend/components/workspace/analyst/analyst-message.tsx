"use client";

import { cn } from "@/lib/utils";

export function UserMessage({ content, turn }: { content: string; turn?: number }) {
  const shade = turn !== undefined && turn % 2 === 1;
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-vx-muted">
        User message
      </p>
      <div
        className={cn(
          "rounded-md border border-vx-border border-l-2 border-l-white/25 px-3 py-3",
          shade ? "bg-vx-panel" : "bg-vx-elevated/40",
        )}
      >
        <p className="text-[14px] leading-relaxed text-white whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}

export function AnalystMessage({
  content,
  streaming,
  turn,
}: {
  content: string;
  streaming?: boolean;
  turn?: number;
}) {
  const shade = turn !== undefined && turn % 2 === 1;
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-vx-muted">
        Analyst response
      </p>
      <div
        className={cn(
          "rounded-md border border-vx-border border-l-2 border-l-white/40 px-3 py-3",
          shade ? "bg-vx-elevated/60" : "bg-vx-panel",
        )}
      >
        <p className="text-[14px] leading-[1.75] text-vx-body whitespace-pre-wrap">
          {content}
          {streaming ? (
            <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-white/70 align-middle" />
          ) : null}
        </p>
      </div>
    </div>
  );
}

export function AnalystMessageDivider({ className }: { className?: string }) {
  return <div className={cn("border-t border-vx-border", className)} />;
}
