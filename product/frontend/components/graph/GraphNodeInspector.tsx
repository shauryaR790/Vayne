"use client";

import { X } from "lucide-react";

import type { GraphEdge, GraphNode } from "@/lib/types";
import { formatGraphNodeLabel } from "@/lib/format";
import {
  businessImpact,
  connectedAssetLabels,
  extractCves,
  recommendedRemediation,
  severityLabel,
  whyItMatters,
} from "./graphNodePresentation";
import { normalizeGraphType } from "./graphUtils";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-white/8 pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function GraphNodeInspector({
  node,
  graphNodes,
  graphEdges,
  onClose,
}: {
  node: GraphNode;
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  onClose: () => void;
}) {
  const type = normalizeGraphType(node);
  const { primary, secondary: subtitle } = formatGraphNodeLabel(node.label || node.id);
  const cves = extractCves(node);
  const connected = connectedAssetLabels(node, graphEdges, graphNodes);
  const remediation = recommendedRemediation(node);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-white/8 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">{type}</p>
          <h2 className="mt-1 truncate text-[18px] font-semibold leading-tight text-white">{primary}</h2>
          {subtitle ? <p className="mt-1 truncate text-[12px] text-white/45">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/[0.04] hover:text-white/75"
          aria-label="Close inspector"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-white/30">Severity</div>
            <div className="mt-1 text-[14px] font-semibold text-white/90">{severityLabel(node)}</div>
          </div>
          <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-white/30">Confidence</div>
            <div className="mt-1 text-[14px] font-semibold text-white/90">
              {node.confidence != null ? `${Math.round(node.confidence)}%` : "—"}
            </div>
          </div>
        </div>

        <Section title="Why it matters">
          <p className="text-[13px] leading-relaxed text-white/70">{whyItMatters(node)}</p>
        </Section>

        <Section title="Business impact">
          <p className="text-[13px] leading-relaxed text-white/70">{businessImpact(node)}</p>
        </Section>

        {cves.length ? (
          <Section title="Related CVEs">
            <div className="flex flex-wrap gap-1.5">
              {cves.map((cve) => (
                <span
                  key={cve}
                  className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-200/90"
                >
                  {cve}
                </span>
              ))}
            </div>
          </Section>
        ) : null}

        {node.evidence?.length ? (
          <Section title="Evidence">
            <ul className="space-y-2">
              {node.evidence.slice(0, 6).map((item) => (
                <li key={item} className="text-[12px] leading-relaxed text-white/60">
                  {item}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {connected.length ? (
          <Section title="Connected assets">
            <ul className="space-y-1.5">
              {connected.map((label) => (
                <li key={label} className="truncate text-[12px] text-white/60">
                  {label}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Section title="Recommended remediation">
          <ul className="space-y-2">
            {remediation.map((item) => (
              <li key={item} className="text-[12px] leading-relaxed text-white/65">
                {item}
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
