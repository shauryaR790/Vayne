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

function DockSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-[200px] max-w-[280px] shrink-0">
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
    <div className="flex max-h-[280px] flex-col bg-[#050505]">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/8 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">{type}</p>
          <h2 className="truncate text-[16px] font-semibold leading-tight text-white">{primary}</h2>
          {subtitle ? <p className="truncate text-[11px] text-white/45">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="rounded-md border border-white/8 bg-white/[0.02] px-2.5 py-1.5 text-center">
            <div className="text-[9px] uppercase tracking-wide text-white/30">Severity</div>
            <div className="text-[12px] font-semibold text-white/90">{severityLabel(node)}</div>
          </div>
          <div className="rounded-md border border-white/8 bg-white/[0.02] px-2.5 py-1.5 text-center">
            <div className="text-[9px] uppercase tracking-wide text-white/30">Confidence</div>
            <div className="text-[12px] font-semibold text-white/90">
              {node.confidence != null ? `${Math.round(node.confidence)}%` : "—"}
            </div>
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
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto px-4 py-3">
        <div className="flex gap-6">
          <DockSection title="Why it matters">
            <p className="text-[12px] leading-relaxed text-white/70">{whyItMatters(node)}</p>
          </DockSection>

          <DockSection title="Business impact">
            <p className="text-[12px] leading-relaxed text-white/70">{businessImpact(node)}</p>
          </DockSection>

          {cves.length ? (
            <DockSection title="Related CVEs">
              <div className="flex flex-wrap gap-1.5">
                {cves.map((cve) => (
                  <span
                    key={cve}
                    className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-200/90"
                  >
                    {cve}
                  </span>
                ))}
              </div>
            </DockSection>
          ) : null}

          {node.evidence?.length ? (
            <DockSection title="Evidence">
              <ul className="space-y-1.5">
                {node.evidence.slice(0, 4).map((item) => (
                  <li key={item} className="text-[11px] leading-relaxed text-white/60">
                    {item}
                  </li>
                ))}
              </ul>
            </DockSection>
          ) : null}

          {connected.length ? (
            <DockSection title="Connected assets">
              <ul className="space-y-1">
                {connected.slice(0, 5).map((label) => (
                  <li key={label} className="truncate text-[11px] text-white/60">
                    {label}
                  </li>
                ))}
              </ul>
            </DockSection>
          ) : null}

          <DockSection title="Recommended remediation">
            <ul className="space-y-1.5">
              {remediation.map((item) => (
                <li key={item} className="text-[11px] leading-relaxed text-white/65">
                  {item}
                </li>
              ))}
            </ul>
          </DockSection>
        </div>
      </div>
    </div>
  );
}
