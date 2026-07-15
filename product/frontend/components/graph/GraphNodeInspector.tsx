"use client";

import type { GraphNode } from "@/lib/types";
import { formatGraphNodeLabel } from "@/lib/format";
import { SectionLabel } from "@/components/shared/workspace-card";
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

function inferSources(node: GraphNode): string[] {
  const fromEvidence = (node.evidence ?? [])
    .map((e) => {
      const m = e.match(/^(nmap|nessus|burp|nuclei|openvas|httpx)/i);
      return m ? m[1] : null;
    })
    .filter(Boolean) as string[];
  return [...new Set(fromEvidence.map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()))];
}

function InspectorField({
  label,
  value,
  mono,
  large,
}: {
  label: string;
  value: string;
  mono?: boolean;
  large?: boolean;
}) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <p
        className={
          mono
            ? "mt-2 font-mono text-[14px] font-medium text-vx-body"
            : large
              ? "mt-2 text-[18px] font-black uppercase leading-none text-vx-text"
              : "mt-2 text-[14px] font-medium uppercase text-vx-body"
        }
      >
        {value}
      </p>
    </div>
  );
}

export function GraphNodeInspector({ node }: { node: GraphNode | null }) {
  if (!node) {
    return (
      <p className="mt-4 text-[14px] leading-relaxed text-vx-secondary">
        Select a node on the attack path to inspect evidence and confidence.
      </p>
    );
  }

  const type = normalizeGraphType(node);
  const meta = parseNodeMeta(node);
  const sources = inferSources(node);
  const evidenceCount = node.evidence?.length ?? 0;

  return (
    <div className="mt-4 space-y-5 text-left min-w-0">
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
        <InspectorField label="Host" value={meta.host} mono />
        <InspectorField label="Type" value={type} />
        <InspectorField
          label="Confidence"
          value={node.confidence != null ? `${node.confidence}%` : "—"}
          large
        />
        <InspectorField label="Risk" value={riskLabel(node.risk)} />
        <InspectorField
          label="Evidence"
          value={`${evidenceCount} signal${evidenceCount === 1 ? "" : "s"}`}
        />
        <InspectorField
          label="Scanners"
          value={sources.length ? sources.join(", ") : "—"}
        />
      </div>

      <div className="border-t border-vx-border pt-4">
        <SectionLabel>Node</SectionLabel>
        <p className="mt-2 break-all font-mono text-[14px] font-medium leading-relaxed text-vx-body">
          {meta.name}
        </p>
      </div>

      {node.evidence?.length ? (
        <div className="border-t border-vx-border pt-4">
          <SectionLabel>Proof</SectionLabel>
          <ul className="mt-3 max-h-32 space-y-2 overflow-y-auto">
            {node.evidence.slice(0, 5).map((e) => (
              <li key={e} className="font-mono text-[13px] leading-relaxed text-vx-secondary">
                {e}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
