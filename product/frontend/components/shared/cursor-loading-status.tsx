"use client";

import { cn } from "@/lib/utils";

export interface CursorLoadingLine {
  /** Bright shimmer segment (e.g. "Exploring", "Parsing evidence") */
  label: string;
  /** Muted trailing detail (e.g. "2 searches", "3 files") */
  detail?: string;
  /** Second-line style — softer shimmer across the whole label */
  dim?: boolean;
}

export function ShimmerText({
  children,
  dim,
  className,
}: {
  children: React.ReactNode;
  dim?: boolean;
  className?: string;
}) {
  return (
    <span className={cn(dim ? "vx-shimmer-text-dim" : "vx-shimmer-text", className)}>
      {children}
    </span>
  );
}

export function CursorLoadingStatus({
  lines,
  className,
}: {
  lines: CursorLoadingLine[];
  className?: string;
}) {
  if (!lines.length) return null;

  return (
    <div className={cn("space-y-1", className)} role="status" aria-live="polite">
      {lines.map((line, i) => (
        <p key={`${line.label}-${i}`} className="text-[13px] leading-[1.45]">
          <ShimmerText dim={line.dim}>{line.label}</ShimmerText>
          {line.detail ? (
            <span className="text-white/[0.32]">{` ${line.detail}`}</span>
          ) : null}
        </p>
      ))}
    </div>
  );
}
