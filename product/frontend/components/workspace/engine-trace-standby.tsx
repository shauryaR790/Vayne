"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

const STAGES = ["Parser", "Correlate", "Score", "Graph", "Proof"] as const;

/**
 * Sparse idle terminal for Engine Trace — signal ready, not a docs dump.
 */
export function EngineTraceStandby({
  running,
  className,
}: {
  running?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col font-mono text-[11.5px]",
        className,
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col justify-center px-5 py-10">
        <div className="mx-auto w-full max-w-[260px]">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                running ? "animate-pulse bg-white/70" : "bg-white/25",
              )}
              aria-hidden
            />
            <p className="text-[11px] tracking-[0.18em] text-white/45">
              {running ? "LISTENING" : "NO STREAM"}
            </p>
          </div>

          <p className="mt-7 flex items-center gap-2 text-[13px] text-white/75">
            <span className="text-white/25">›</span>
            <span>vayne trace</span>
            <span
              className="inline-block h-3.5 w-[7px] animate-pulse bg-white/50"
              aria-hidden
            />
          </p>

          <p className="mt-3 text-[11px] leading-relaxed text-white/32">
            {running
              ? "First stage event will open the live feed."
              : "Ingest to start the CLI proof stream."}
          </p>
        </div>
      </div>

      <footer className="shrink-0 border-t border-white/[0.06] px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.14em] text-white/28">
          {STAGES.map((stage, i) => (
            <span key={stage} className="inline-flex items-center gap-2">
              {i > 0 ? <span className="text-white/12" aria-hidden>·</span> : null}
              <span>{stage}</span>
            </span>
          ))}
        </div>
        <p className="mt-2.5 text-[10px] text-white/25">
          <Link
            href="/engine-docs"
            className="text-white/40 underline decoration-white/15 underline-offset-2 transition-colors hover:text-white/65"
          >
            Engine docs
          </Link>
          <span className="text-white/20"> · </span>
          formulas evaluate only when active
        </p>
      </footer>
    </div>
  );
}
