"use client";

import { cn } from "@/lib/utils";

export function SourceFileBadge({
  file,
  className,
  title,
}: {
  file: string;
  className?: string;
  title?: string;
}) {
  const label = file.split(/[/\\]/).pop() || file;
  return (
    <span
      className={cn(
        "inline-flex max-w-[220px] items-center truncate rounded border border-white/15 bg-white/[0.04]",
        "px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-vx-secondary",
        className,
      )}
      title={title || `From ${file}`}
    >
      {label}
    </span>
  );
}
