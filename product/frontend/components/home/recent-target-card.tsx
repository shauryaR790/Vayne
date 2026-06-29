"use client";

import { Check, MoreHorizontal } from "lucide-react";

import { HoverCard } from "@/components/shared/hover-card";
import { cn } from "@/lib/utils";

export interface RecentTargetItem {
  id: string;
  label: string;
  createdAt?: string;
  pathCount?: number;
  findingsCount?: number;
  durationSeconds?: number;
  avgConfidence?: number | null;
  riskScore?: number;
  criticalCount?: number;
  surfaceClassification?: string;
  status?: string;
  headline?: string;
  primaryHost?: string;
  assetCount?: number;
  rejectedPaths?: number;
  pathCategory?: string;
  blastRadius?: number;
  topCve?: string;
}

type LogTone = "cmd" | "dim" | "ok" | "warn" | "muted";

interface LogLine {
  text: string;
  tone: LogTone;
}

function formatRelativeRun(iso?: string) {
  if (!iso) return "unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDuration(seconds?: number) {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function statusLabel(status?: string) {
  const value = (status ?? "complete").toLowerCase();
  if (value.includes("fail") || value.includes("error")) return "Failed";
  if (value.includes("run") || value.includes("progress")) return "Running";
  return "Ready";
}

function toneClass(tone: LogTone) {
  const map: Record<LogTone, string> = {
    cmd: "text-white/75 transition-colors duration-300 group-hover:text-white",
    dim: "text-white/35 transition-colors duration-300 group-hover:text-white/55",
    ok: "text-white/65 transition-colors duration-300 group-hover:text-white/85",
    warn: "text-white/55 transition-colors duration-300 group-hover:text-white/75",
    muted: "text-white/30 transition-colors duration-300 group-hover:text-white/50",
  };
  return map[tone];
}

function formatCategory(category?: string) {
  if (!category) return "verified";
  return category.replace(/_/g, " ");
}

function buildTerminalLog(target: RecentTargetItem): LogLine[] {
  const paths = target.pathCount ?? 0;
  const duration = formatDuration(target.durationSeconds);
  const assets = target.assetCount != null ? String(target.assetCount) : "—";
  const findings = target.findingsCount != null ? String(target.findingsCount) : "—";
  const confidence =
    target.avgConfidence != null && !Number.isNaN(target.avgConfidence)
      ? `${Math.round(target.avgConfidence)}%`
      : "—";
  const risk =
    target.riskScore != null && !Number.isNaN(target.riskScore)
      ? target.riskScore.toFixed(1)
      : "—";
  const rejected = target.rejectedPaths ?? 0;

  const lineHost = target.primaryHost
    ? `target · ${target.primaryHost}`
    : `scope · ${target.label}`;

  const lineLead = target.topCve
    ? `lead · ${target.topCve}${target.headline ? ` · ${target.headline}` : ""}`
    : target.headline
      ? `lead · ${target.headline}`
      : `surface · ${(target.surfaceClassification ?? "mapped").replace(/_/g, " ")}`;

  const linePaths =
    paths > 0
      ? `path · ${formatCategory(target.pathCategory)} · ${confidence} · blast ${target.blastRadius ?? "—"}`
      : rejected > 0
        ? `rejected · ${rejected} chain${rejected === 1 ? "" : "s"} · 0 verified`
        : `paths · none verified · surface only`;

  return [
    { text: `$ vayne analyze ${target.label}`, tone: "cmd" },
    { text: `${assets} assets · ${findings} findings · ${duration}`, tone: "dim" },
    { text: lineHost, tone: "ok" },
    { text: lineLead, tone: paths > 0 ? "ok" : "warn" },
    { text: linePaths, tone: paths > 0 ? "ok" : "warn" },
    {
      text: `verdict · ${statusLabel(target.status).toLowerCase()} · risk ${risk} · ${formatRelativeRun(target.createdAt)}`,
      tone: "muted",
    },
  ];
}

function TerminalPanel({ lines }: { lines: LogLine[] }) {
  return (
    <div className="relative flex h-full min-h-[108px] flex-col justify-between overflow-hidden border border-white/15 bg-white/[0.03] px-3 py-2.5 font-mono text-[10px] leading-[1.65] transition-all duration-300 group-hover:border-white/35 group-hover:bg-white/[0.07]">
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:100%_18px]" />
      </div>
      {lines.map((line, i) => (
        <p
          key={`${i}-${line.text.slice(0, 24)}`}
          className={cn("relative truncate", toneClass(line.tone))}
          style={{ transitionDelay: `${i * 25}ms` }}
        >
          {line.text}
        </p>
      ))}
    </div>
  );
}


export function RecentTargetCard({
  target,
  empty = false,
  disabled = false,
  onClick,
}: {
  target?: RecentTargetItem;
  empty?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  if (empty || !target) {
    return (
      <HoverCard
        as="div"
        lift={false}
        className="flex h-full min-h-0 flex-col rounded-lg border-dashed border-white/20 p-3 hover:border-white/40"
      >
        <p className="mb-2 shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-white/25 transition-colors duration-300 group-hover:text-white/40">
          Empty slot
        </p>
        <TerminalPanel
          lines={[
            { text: "$ vayne analyze —", tone: "dim" },
            { text: "engine idle · awaiting input", tone: "dim" },
            { text: "target · —", tone: "muted" },
            { text: "lead · —", tone: "muted" },
            { text: "paths · —", tone: "muted" },
            { text: "verdict · no run recorded", tone: "muted" },
          ]}
        />
      </HoverCard>
    );
  }

  const shortId = target.id.slice(0, 12);
  const log = buildTerminalLog(target);
  const status = statusLabel(target.status);

  return (
    <HoverCard
      as="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-full min-h-0 flex-col rounded-lg p-3 text-left disabled:opacity-40"
    >

      <div className="relative flex shrink-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center border border-white/30 bg-white/[0.04] transition-all duration-300 group-hover:border-white/70 group-hover:bg-white/10 group-hover:shadow-[0_0_12px_rgba(255,255,255,0.12)]">
            <span className="text-[9px] font-black transition-colors duration-300 group-hover:text-white">
              V
            </span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold leading-tight transition-colors duration-300 group-hover:text-white">
              {target.label}
            </p>
            <p className="mt-0.5 font-mono text-[9px] text-white/45 transition-colors duration-300 group-hover:text-white/65">
              {shortId}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-white/55 transition-colors duration-300 group-hover:text-white/80">
            <Check className="size-2.5 transition-transform duration-300 group-hover:scale-110" strokeWidth={2.5} />
            {status}
          </span>
          <MoreHorizontal className="size-3 text-white/30 transition-colors duration-300 group-hover:text-white/60" />
        </div>
      </div>

      <div className="relative mt-2.5 min-h-0 flex-1">
        <TerminalPanel lines={log} />
      </div>
    </HoverCard>
  );
}
