"use client";

import type { GraphNode } from "@/lib/types";
import { normalizeGraphType } from "./layoutEngine";

export interface GraphStats {
  assets: number;
  services: number;
  software: number;
  vulnerabilities: number;
  attackPaths: number;
  rejectedPaths: number;
  confidence: number | null;
}

export function computeGraphStats(nodes: GraphNode[]): GraphStats {
  const count = (t: string) =>
    nodes.filter((n) => normalizeGraphType(n) === t).length;

  const withConf = nodes.filter((n) => n.confidence != null);
  const confidence =
    withConf.length > 0
      ? Math.round(withConf.reduce((a, n) => a + (n.confidence ?? 0), 0) / withConf.length)
      : null;

  return {
    assets: count("asset"),
    services: count("service"),
    software: count("software"),
    vulnerabilities: count("vulnerability"),
    attackPaths: 0,
    rejectedPaths: 0,
    confidence,
  };
}

export function GraphOverviewHeader({ stats }: { stats: GraphStats }) {
  const rows = [
    { label: "Assets", value: stats.assets },
    { label: "Services", value: stats.services },
    { label: "Software", value: stats.software },
    { label: "Vulnerabilities", value: stats.vulnerabilities },
    { label: "Attack Paths", value: stats.attackPaths },
    { label: "Rejected Paths", value: stats.rejectedPaths },
    { label: "Confidence", value: stats.confidence != null ? `${stats.confidence}%` : "—" },
  ];

  return (
    <div className="border border-white/25 bg-black px-4 py-3">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.15em] text-white">
        Attack Graph
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4 lg:grid-cols-7">
        {rows.map((row) => (
          <div key={row.label}>
            <p className="text-[9px] font-bold uppercase tracking-wider text-white/45">
              {row.label}
            </p>
            <p className="mt-0.5 text-lg font-black tabular-nums text-white">{row.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
