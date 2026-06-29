"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { listInvestigations } from "@/lib/api";
import type { InvestigationListItem } from "@/lib/types";
import { PageHeader, WorkspaceCard, SectionLabel } from "@/components/shared/workspace-card";
import { Badge } from "@/components/ui/badge";
import { RiskMeter } from "@/components/shared/risk-meter";

export function AttackPathsContent() {
  const [items, setItems] = useState<InvestigationListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listInvestigations()
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  const withPaths = items.filter((i) => i.path_count > 0);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-8 lg:px-8">
      <PageHeader
        title="Attack Paths"
        subtitle="Verified attack chains across investigations"
      />

      {loading && (
        <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">
          Loading…
        </p>
      )}

      <div className="space-y-4">
        {withPaths.map((inv) => {
          const target = inv.target.split(/[/\\]/).pop() || inv.target;
          return (
            <WorkspaceCard key={inv.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-[14px] font-black uppercase tracking-wide">{target}</h3>
                  <p className="mt-1 font-mono text-[12px] text-white/50">{inv.id.slice(0, 12)}</p>
                </div>
                <Badge variant="default">{inv.path_count} paths</Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <SectionLabel>Risk</SectionLabel>
                  <p className="mt-1 font-black uppercase">{inv.attack_surface_classification}</p>
                </div>
                <div>
                  <SectionLabel>Findings</SectionLabel>
                  <p className="mt-1 font-black">{inv.findings_retained}</p>
                </div>
                <div>
                  <SectionLabel>Critical</SectionLabel>
                  <p className="mt-1 font-black">{inv.critical_count}</p>
                </div>
                <div>
                  <SectionLabel>Confidence</SectionLabel>
                  <p className="mt-1 font-black">
                    {inv.avg_confidence != null ? `${inv.avg_confidence}%` : "—"}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <RiskMeter value={inv.attack_surface_score} label="Path Risk" />
              </div>
              <Link
                href={`/analyze?id=${inv.id}`}
                className="mt-4 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/60 hover:text-white"
              >
                Open investigation
                <ArrowRight className="size-4" />
              </Link>
            </WorkspaceCard>
          );
        })}
      </div>

      {!loading && !withPaths.length && (
        <p className="py-16 text-center text-[11px] font-bold uppercase tracking-wider text-white/50">
          No verified attack paths yet.
        </p>
      )}
    </div>
  );
}
