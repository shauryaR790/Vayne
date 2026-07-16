"use client";

import { FileCode2, FileJson, FileSpreadsheet, FileText, Shield } from "lucide-react";

import type { EngineFileInsight, EngineFileInsightLine } from "@/lib/engine-file-insights";
import { cn } from "@/lib/utils";

function FileTypeIcon({ extension }: { extension: string }) {
  const className = "size-3.5 shrink-0";
  switch (extension) {
    case ".json":
      return <FileJson className={cn(className, "text-amber-400/90")} strokeWidth={2} />;
    case ".xml":
      return <FileCode2 className={cn(className, "text-sky-400/90")} strokeWidth={2} />;
    case ".csv":
      return <FileSpreadsheet className={cn(className, "text-emerald-400/90")} strokeWidth={2} />;
    case ".nessus":
      return <Shield className={cn(className, "text-violet-400/90")} strokeWidth={2} />;
    default:
      return <FileText className={cn(className, "text-white/45")} strokeWidth={2} />;
  }
}

function InsightLine({ line, lineNo }: { line: EngineFileInsightLine; lineNo: number }) {
  return (
    <div
      className={cn(
        "vx-engine-file-line grid grid-cols-[2.25rem_1fr] font-mono text-[12px] leading-[1.55]",
        line.kind === "add" && "vx-engine-file-line-add",
        line.kind === "remove" && "vx-engine-file-line-remove",
        line.kind === "context" && "vx-engine-file-line-context",
      )}
    >
      <span className="select-none px-2 text-right text-white/22 tabular-nums">{lineNo}</span>
      <code className="block whitespace-pre-wrap break-all px-2 py-px">
        {line.kind === "add" ? (
          <>
            <span className="text-emerald-400/95">+ </span>
            {line.content}
          </>
        ) : line.kind === "remove" ? (
          <>
            <span className="text-red-400/95">- </span>
            {line.content}
          </>
        ) : (
          line.content
        )}
      </code>
    </div>
  );
}

export function EngineFileDetailBox({ insight }: { insight: EngineFileInsight }) {
  return (
    <article className="vx-engine-file-box overflow-hidden rounded-lg border border-white/[0.1] bg-[#1a1a1a]">
      <header className="flex items-center gap-2 border-b border-white/[0.08] bg-[#1f1f1f] px-3 py-2">
        <FileTypeIcon extension={insight.extension} />
        <span className="min-w-0 truncate font-mono text-[12px] text-white/72">{insight.filename}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2 font-mono text-[11px] tabular-nums">
          {insight.additions > 0 ? (
            <span className="text-emerald-400/95">+{insight.additions}</span>
          ) : null}
          {insight.deletions > 0 ? (
            <span className="text-red-400/90">-{insight.deletions}</span>
          ) : null}
          {insight.additions === 0 && insight.deletions === 0 ? (
            <span className="text-white/30">0</span>
          ) : null}
        </span>
      </header>
      <div className="max-h-[220px] overflow-y-auto py-1 [-ms-overflow-style:none] [scrollbar-width:thin]">
        {insight.lines.map((line, i) => (
          <InsightLine key={`${insight.id}-${i}`} line={line} lineNo={i + 1} />
        ))}
      </div>
    </article>
  );
}

export function EngineFileDetailList({ insights }: { insights: EngineFileInsight[] }) {
  if (!insights.length) return null;

  return (
    <div className="space-y-3">
      {insights.map((insight) => (
        <EngineFileDetailBox key={insight.id} insight={insight} />
      ))}
    </div>
  );
}
