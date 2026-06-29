"use client";

import type { GraphNode } from "@/lib/types";
import { formatGraphNodeLabel } from "@/lib/format";
import { ConfidenceBar } from "@/components/ui/ConfidenceBar";
import { SectionLabel } from "@/components/shared/workspace-card";
import { Button } from "@/components/ui/button";
import { normalizeGraphType } from "./layoutEngine";

function parseNodeMeta(node: GraphNode) {
  const label = node.label || "";
  const { primary, secondary: host } = formatGraphNodeLabel(label);
  const portMatch = primary.match(/:(\d+)/);
  return {
    name: primary.replace(/@\S+$/, "").replace(/:\d+$/, ""),
    host: host || label.split("@")[1]?.split("/")[0] || "—",
    port: portMatch?.[1] ?? "—",
  };
}

function riskLabel(risk?: number): string {
  if (risk == null) return "—";
  if (risk >= 7) return "High";
  if (risk >= 4) return "Medium";
  return "Low";
}

export function GraphNodeInspector({ node }: { node: GraphNode | null }) {
  if (!node) {
    return (
      <p className="mt-4 text-[11px] leading-relaxed text-white/40">
        Select a node to inspect evidence, confidence, risk, and reasoning.
      </p>
    );
  }

  const type = normalizeGraphType(node);
  const meta = parseNodeMeta(node);
  const cves = (node.evidence ?? []).filter((e) => /CVE-/i.test(e));

  return (
    <div className="mt-4 space-y-3 text-left min-w-0">
      <div>
        <SectionLabel>Type</SectionLabel>
        <p className="mt-1 text-[11px] font-bold uppercase text-white">{type}</p>
      </div>
      <div>
        <SectionLabel>Name</SectionLabel>
        <p className="mt-1 break-all font-mono text-[11px] text-white/85">{meta.name}</p>
      </div>
      <div>
        <SectionLabel>Host</SectionLabel>
        <p className="mt-1 font-mono text-[11px] text-white/75">{meta.host}</p>
      </div>
      {type === "service" && (
        <div>
          <SectionLabel>Port</SectionLabel>
          <p className="mt-1 font-mono text-[11px] text-white/75">{meta.port}</p>
        </div>
      )}
      {node.confidence != null && (
        <div>
          <SectionLabel>Confidence</SectionLabel>
          <div className="mt-2">
            <ConfidenceBar value={node.confidence} />
          </div>
        </div>
      )}
      <div>
        <SectionLabel>Risk</SectionLabel>
        <p className="mt-1 text-[11px] font-bold uppercase text-white">
          {riskLabel(node.risk)}
        </p>
      </div>
      {node.evidence?.length ? (
        <div>
          <SectionLabel>Evidence</SectionLabel>
          <ul className="mt-2 space-y-1 break-all font-mono text-[10px] text-white/65">
            {node.evidence.slice(0, 4).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {cves.length > 0 && (
        <div>
          <SectionLabel>Related CVEs</SectionLabel>
          <ul className="mt-2 space-y-1 font-mono text-[10px] text-white/70">
            {cves.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <SectionLabel>Business Impact</SectionLabel>
        <p className="mt-1 text-[11px] uppercase text-white/70">
          {node.criticality || riskLabel(node.risk)}
        </p>
      </div>
      <div>
        <SectionLabel>Reasoning</SectionLabel>
        <p className="mt-2 text-[11px] leading-relaxed text-white/60">
          VAYNE identified {meta.name} through scan fingerprinting
          {node.evidence?.[0] ? ` — ${node.evidence[0]}` : ""}
          {cves.length ? " and matched vulnerability intelligence." : "."}
        </p>
      </div>
      <div className="flex flex-col gap-1.5 pt-2">
        <Button variant="secondary" size="sm" className="w-full">
          Investigate
        </Button>
        <Button variant="ghost" size="sm" className="w-full">
          Explain
        </Button>
        <Button variant="ghost" size="sm" className="w-full">
          Generate Remediation
        </Button>
      </div>
    </div>
  );
}
