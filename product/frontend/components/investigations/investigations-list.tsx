"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { listInvestigations } from "@/lib/api";
import type { InvestigationListItem } from "@/lib/types";
import { PageHeader } from "@/components/shared/workspace-card";
import { Badge } from "@/components/ui/badge";
import { ConfidenceRing } from "@/components/shared/confidence-ring";
import { RiskMeter } from "@/components/shared/risk-meter";
import {
  MetricTile,
  SectionLabel,
} from "@/components/shared/workspace-card";
import { CollapsibleWorkspaceCard } from "@/components/shared/collapsible-workspace-card";
import { MotionGroup } from "@/components/dashboard/motion";

export function InvestigationsList() {
  const [items, setItems] = useState<InvestigationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listInvestigations()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-8 lg:px-8">
      <PageHeader
        title="Investigations"
        subtitle={`${items.length} active AI-led security investigations`}
      />

      {loading && (
        <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">
          Loading…
        </p>
      )}
      {error && <p className="text-[11px] font-bold uppercase text-white/70">{error}</p>}

      <MotionGroup className="space-y-4">
        {items.map((inv) => {
          const target = inv.target.split(/[/\\]/).pop() || inv.target;
          const confidence = inv.avg_confidence ?? 0;
          const risk = inv.attack_surface_score ?? 0;

          return (
            <CollapsibleWorkspaceCard
              key={inv.id}
              expandLabel="Expand investigation"
              title={
                <>
                  <h2 className="text-lg font-black uppercase tracking-wide sm:text-xl">
                    {target}
                  </h2>
                  <Badge
                    variant={
                      inv.attack_surface_classification.toLowerCase().includes("critical")
                        ? "critical"
                        : "default"
                    }
                  >
                    {inv.attack_surface_classification}
                  </Badge>
                  <span className="border border-white/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/60">
                    {inv.status}
                  </span>
                </>
              }
              subtitle={
                <p className="font-mono text-[12px] text-white/50">{inv.id.slice(0, 12)}</p>
              }
              trailing={
                confidence > 0 ? <ConfidenceRing value={Math.round(confidence)} size={72} /> : null
              }
            >
              <div className="flex flex-col gap-5 border-b border-white/15 p-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-4">
                  <div>
                    <SectionLabel>Asset</SectionLabel>
                    <p className="mt-1 font-mono text-[13px] font-medium uppercase text-white/80">
                      {target}
                    </p>
                  </div>
                  <div>
                    <SectionLabel>Findings</SectionLabel>
                    <p className="mt-1 font-medium uppercase">{inv.findings_retained}</p>
                  </div>
                  <div>
                    <SectionLabel>Paths</SectionLabel>
                    <p className="mt-1 font-medium uppercase">{inv.path_count}</p>
                  </div>
                  <div>
                    <SectionLabel>Critical</SectionLabel>
                    <p className="mt-1 font-bold uppercase">{inv.critical_count}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-px bg-surface sm:grid-cols-4">
                <MetricTile label="Risk Score" value={risk.toFixed(1)} large />
                <MetricTile label="Findings" value={inv.findings_retained} />
                <MetricTile label="Paths" value={inv.path_count} />
                <MetricTile label="Duration" value={`${inv.duration_seconds.toFixed(1)}s`} />
              </div>

              <div className="space-y-5 p-6">
                <RiskMeter value={risk} label="Investigation Risk" />
                <Link
                  href={`/?id=${inv.id}`}
                  className="inline-flex items-center gap-2 border border-white px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider transition-colors hover:bg-white hover:text-black"
                >
                  Open full investigation
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </CollapsibleWorkspaceCard>
          );
        })}
      </MotionGroup>

      {!loading && !items.length && !error && (
        <p className="py-16 text-center text-[11px] font-bold uppercase tracking-wider text-white/50">
          No investigations yet. Start a new scan from Home.
        </p>
      )}
    </div>
  );
}
