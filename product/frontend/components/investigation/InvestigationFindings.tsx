"use client";

import type { Finding } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/shared/workspace-card";
import { ProgressBar } from "@/components/shared/risk-meter";
import { HoverCard } from "@/components/shared/hover-card";

function severityVariant(classification?: string): "critical" | "high" | "medium" | "default" {
  const c = (classification ?? "").toLowerCase();
  if (c.includes("critical")) return "critical";
  if (c.includes("high") || c.includes("confirmed")) return "high";
  if (c.includes("medium") || c.includes("likely")) return "medium";
  return "default";
}

function exploitLabel(classification?: string): string {
  const c = (classification ?? "").toLowerCase();
  if (c.includes("confirmed")) return "High";
  if (c.includes("likely")) return "Medium";
  return "Low";
}

function priorityLabel(classification?: string): string {
  const v = severityVariant(classification);
  if (v === "critical" || v === "high") return "P0 — Immediate";
  if (v === "medium") return "P1 — Short Term";
  return "P2 — Monitor";
}

function FindingInvestigationCard({
  finding,
  index,
  onAsk,
}: {
  finding: Finding;
  index: number;
  onAsk?: (q: string) => void;
}) {
  const confidence = finding.confidence ?? 0;
  const evidenceCount = finding.evidence?.length ?? 0;

  return (
    <HoverCard className="flex flex-col bg-black p-0" lift>
      <div className="border-b border-white/15 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
              Finding #{index + 1}
            </p>
            <h4 className="mt-1 text-[14px] font-black uppercase leading-snug tracking-wide">
              {finding.title || finding.id}
            </h4>
            <p className="mt-1 truncate font-mono text-[11px] text-white/50">
              {finding.host || finding.cve || finding.id}
            </p>
          </div>
          <Badge variant={severityVariant(finding.classification)}>
            {finding.classification || "Finding"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-b border-white/15 px-5 py-4 text-[12px] sm:grid-cols-3">
        <div>
          <SectionLabel>Confidence</SectionLabel>
          <p className="mt-1 font-black tabular-nums">{confidence}%</p>
        </div>
        <div>
          <SectionLabel>Exploitability</SectionLabel>
          <p className="mt-1 font-bold uppercase">{exploitLabel(finding.classification)}</p>
        </div>
        <div>
          <SectionLabel>Business Impact</SectionLabel>
          <p className="mt-1 font-bold uppercase">
            {severityVariant(finding.classification) === "critical" ? "Critical" : "Moderate"}
          </p>
        </div>
        <div>
          <SectionLabel>Risk Score</SectionLabel>
          <p className="mt-1 font-black tabular-nums">{(confidence / 10).toFixed(1)}</p>
        </div>
        <div>
          <SectionLabel>Evidence Count</SectionLabel>
          <p className="mt-1 font-black tabular-nums">{evidenceCount}</p>
        </div>
        <div>
          <SectionLabel>Remediation</SectionLabel>
          <p className="mt-1 text-[11px] font-bold uppercase">{priorityLabel(finding.classification)}</p>
        </div>
      </div>

      {finding.reasoning?.[0] && (
        <div className="border-b border-white/15 px-5 py-4">
          <SectionLabel>AI Reasoning</SectionLabel>
          <p className="mt-2 text-[13px] leading-relaxed text-white/70">{finding.reasoning[0]}</p>
        </div>
      )}

      <div className="px-5 py-4">
        <ProgressBar value={confidence} label="Confidence" />
      </div>

      <div className="mt-auto flex flex-wrap gap-2 border-t border-white/15 px-5 py-4">
        <button
          type="button"
          onClick={() =>
            onAsk?.(
              `Investigate finding "${finding.title || finding.id}" — walk me through the evidence, attack relevance, and recommended next steps.`,
            )
          }
          className="border border-white/40 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/70 transition-colors hover:border-sky-400/60 hover:text-sky-300"
        >
          Investigate
        </button>
        <button
          type="button"
          onClick={() => onAsk?.(`Explain finding: ${finding.title || finding.id}`)}
          className="border border-white px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/70 transition-colors hover:bg-white hover:text-black"
        >
          Ask VAYNE
        </button>
        <button
          type="button"
          onClick={() =>
            onAsk?.(
              `Generate a concise remediation report for finding "${finding.title || finding.id}" including business impact, technical details, and prioritized fixes.`,
            )
          }
          className="border border-white/40 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/70 transition-colors hover:border-emerald-400/60 hover:text-emerald-300"
        >
          Generate Report
        </button>
      </div>
    </HoverCard>
  );
}

export function InvestigationFindings({
  findings,
  onAsk,
}: {
  findings: Finding[];
  onAsk?: (q: string) => void;
}) {
  if (!findings.length) {
    return (
      <section className="space-y-4">
        <SectionHeader />
        <HoverCard className="px-6 py-8 text-center" lift={false}>
          <p className="relative text-[13px] font-bold uppercase text-white/60">No validated findings</p>
          <p className="relative mt-2 text-[12px] text-white/40">
            VAYNE retained no findings above the confidence threshold.
          </p>
        </HoverCard>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <SectionHeader />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {findings.map((finding, i) => (
          <FindingInvestigationCard
            key={finding.id || i}
            finding={finding}
            index={i}
            onAsk={onAsk}
          />
        ))}
      </div>
    </section>
  );
}

function SectionHeader() {
  return (
    <div className="border-b border-white/20 pb-3">
      <h2 className="text-[12px] font-bold uppercase tracking-[0.15em]">Findings</h2>
    </div>
  );
}
