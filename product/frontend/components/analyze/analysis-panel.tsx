"use client";

import { useEffect, useMemo, useRef } from "react";
import { motion } from "motion/react";

import { HoverCard } from "@/components/shared/hover-card";
import { cn } from "@/lib/utils";

const PHASES = [
  { id: "ingest", label: "Ingest", at: 0 },
  { id: "correlate", label: "Correlate", at: 22 },
  { id: "search", label: "Search", at: 48 },
  { id: "prove", label: "Prove", at: 72 },
  { id: "report", label: "Report", at: 90 },
] as const;

const MODULES = [
  { id: "parser", label: "Parser", at: 8 },
  { id: "graph", label: "Graph", at: 24 },
  { id: "classifier", label: "Classifier", at: 42 },
  { id: "cve", label: "CVE Intel", at: 48 },
  { id: "search", label: "Path Search", at: 60 },
  { id: "proof", label: "Proof Engine", at: 78 },
] as const;

function phaseIndex(progress: number) {
  let idx = 0;
  for (let i = PHASES.length - 1; i >= 0; i--) {
    if (progress >= PHASES[i].at) {
      idx = i;
      break;
    }
  }
  return idx;
}

function statusLabel(active: boolean, progress: number) {
  if (!active && progress === 0) return "Standby";
  if (progress >= 100) return "Complete";
  if (active) return "Running";
  return "Paused";
}

function ProgressRing({
  progress,
  size,
  active,
}: {
  progress: number;
  size: number;
  active: boolean;
}) {
  const stroke = 2.5;
  const radius = (size - stroke * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;
  const ticks = 24;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {/* outer tick ring */}
      <svg
        width={size}
        height={size}
        className="absolute inset-0"
        aria-hidden
      >
        {Array.from({ length: ticks }).map((_, i) => {
          const angle = (i / ticks) * Math.PI * 2 - Math.PI / 2;
          const inner = radius + 6;
          const outer = radius + 10;
          const x1 = cx + Math.cos(angle) * inner;
          const y1 = cy + Math.sin(angle) * inner;
          const x2 = cx + Math.cos(angle) * outer;
          const y2 = cy + Math.sin(angle) * outer;
          const lit = (i / ticks) * 100 <= progress;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={lit ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.12)"}
              strokeWidth={1}
            />
          );
        })}
      </svg>

      {/* sweep pulse when running */}
      {active && progress < 100 && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.06) 40deg, transparent 80deg)",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        />
      )}

      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="white"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.75s cubic-bezier(0.4, 0, 0.2, 1)" }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-black tabular-nums leading-none" style={{ fontSize: size * 0.28 }}>
          {progress}
        </span>
        <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.2em] text-white/35">
          pct
        </span>
      </div>
    </div>
  );
}

function TerminalFeed({
  lines,
  active,
}: {
  lines: string[];
  active: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const idleLines = [
    "$ vayne engine --status",
    "modules · 6 loaded · ruleset v2.14",
    "state · idle · awaiting evidence upload",
    "hint · drop scan xml/json to begin",
  ];

  const display = lines.length ? lines : idleLines;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden border border-white/15 bg-white/[0.02]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:100%_14px]" />
      <div className="relative flex shrink-0 items-center justify-between border-b border-white/10 px-2 py-1">
        <span className="text-[8px] font-bold uppercase tracking-[0.16em] text-white/35">
          Engine Log
        </span>
        <span className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-wider text-white/30">
          {active && (
            <motion.span
              className="size-1.5 rounded-full bg-white"
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
          )}
          {active ? "streaming" : "buffer"}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="relative h-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 font-mono text-[9px] leading-[1.55]"
      >
        {display.map((line, i) => {
          const isLast = i === display.length - 1;
          const isCmd = line.startsWith("$");
          return (
            <p
              key={`${i}-${line.slice(0, 20)}`}
              className={cn(
                "truncate transition-colors duration-300",
                isCmd ? "text-white/70" : "text-white/45",
                isLast && active && "text-white/80",
              )}
            >
              {isCmd ? line : `› ${line}`}
              {isLast && active && (
                <motion.span
                  className="ml-0.5 inline-block h-2.5 w-1 bg-white/70"
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.85, repeat: Infinity }}
                />
              )}
            </p>
          );
        })}
      </div>
    </div>
  );
}

export function AnalysisPanel({
  active,
  progress,
  lines,
  fillHeight = false,
}: {
  active: boolean;
  progress: number;
  lines: string[];
  fillHeight?: boolean;
}) {
  const idle = !active && progress === 0;
  const currentPhase = phaseIndex(progress);
  const ringSize = fillHeight ? 132 : 112;

  const stats = useMemo(
    () => ({
      rules: progress > 0 ? 847 : 0,
      paths: progress >= 60 ? Math.min(8, Math.floor((progress - 60) / 5) + 1) : 0,
      proofs: progress >= 78 ? Math.min(4, Math.floor((progress - 78) / 6) + 1) : 0,
    }),
    [progress],
  );

  const phaseLabel = idle ? "Awaiting Input" : PHASES[currentPhase].label;

  return (
    <div
      className={cn(
        "flex w-full flex-col overflow-hidden",
        fillHeight ? "h-full max-h-full min-h-0" : "max-w-[260px]",
      )}
    >
      <HoverCard
        className={cn(
          "flex max-h-full min-h-0 flex-col overflow-hidden p-0",
          fillHeight && "h-full flex-1",
        )}
        lift
      >
        {/* scanline backdrop */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.35]">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:100%_20px]" />
          <div className="absolute inset-y-0 right-0 w-px bg-white/[0.06]" />
        </div>

        {/* header */}
        <div className="relative flex shrink-0 items-center justify-between border-b border-white/15 px-3 py-2.5">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/50 transition-colors duration-300 group-hover:text-white/70">
              Analysis Engine
            </p>
            <p className="mt-0.5 font-mono text-[8px] uppercase tracking-wider text-white/30">
              vayne-core · ruleset 2.14
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span
              className={cn(
                "border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider",
                active
                  ? "border-white/50 text-white"
                  : progress >= 100
                    ? "border-white/40 text-white/70"
                    : "border-white/20 text-white/40",
              )}
            >
              {statusLabel(active, progress)}
            </span>
            {(active || progress > 0) && (
              <span className="font-mono text-[8px] tabular-nums text-white/30">
                phase · {phaseLabel.toLowerCase()}
              </span>
            )}
          </div>
        </div>

        {/* ring + stats */}
        <div className="relative flex shrink-0 flex-col items-center px-3 py-4">
          <ProgressRing progress={progress} size={ringSize} active={active} />

          <p className="mt-3 text-center text-[9px] font-bold uppercase tracking-[0.14em] text-white/65">
            {idle
              ? "Awaiting scan upload"
              : progress >= 100
                ? "Analysis complete"
                : `Running ${phaseLabel.toLowerCase()} phase`}
          </p>

          <div className="mt-3 grid w-full grid-cols-3 gap-1.5">
            {[
              { label: "Rules", value: stats.rules || "—" },
              { label: "Paths", value: stats.paths || "—" },
              { label: "Proofs", value: stats.proofs || "—" },
            ].map((s) => (
              <div
                key={s.label}
                className="border border-white/12 bg-white/[0.03] px-1.5 py-1.5 text-center transition-colors duration-300 group-hover:border-white/25"
              >
                <p className="text-[7px] font-bold uppercase tracking-wider text-white/35">
                  {s.label}
                </p>
                <p className="mt-0.5 font-mono text-[11px] font-black tabular-nums text-white/85">
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* module grid */}
        <div className="relative shrink-0 border-t border-white/10 px-3 py-2.5">
          <p className="mb-2 text-[8px] font-bold uppercase tracking-[0.16em] text-white/35">
            Active Modules
          </p>
          <div className="grid grid-cols-3 gap-1">
            {MODULES.map((mod) => {
              const on = progress >= mod.at;
              const warming = active && progress >= mod.at - 6 && progress < mod.at;
              return (
                <div
                  key={mod.id}
                  className={cn(
                    "flex items-center gap-1 border px-1.5 py-1 transition-all duration-300",
                    on
                      ? "border-white/35 bg-white/[0.06]"
                      : warming
                        ? "border-white/20 bg-white/[0.02]"
                        : "border-white/8 bg-transparent",
                  )}
                >
                  <span
                    className={cn(
                      "size-1 shrink-0 rounded-full",
                      on
                        ? "bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]"
                        : warming
                          ? "bg-white/40 animate-pulse"
                          : "bg-white/15",
                    )}
                  />
                  <span
                    className={cn(
                      "truncate text-[7px] font-bold uppercase tracking-wide",
                      on ? "text-white/75" : "text-white/25",
                    )}
                  >
                    {mod.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* terminal — fixed slot, scrolls internally */}
        <div className="relative flex h-0 min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-2">
          <TerminalFeed lines={lines} active={active} />
        </div>
      </HoverCard>
    </div>
  );
}
