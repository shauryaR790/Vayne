"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { listInvestigations } from "@/lib/api";
import type { InvestigationListItem } from "@/lib/types";
import { PageHeader } from "@/components/shared/workspace-card";

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
    <div className="mx-auto w-full max-w-[920px] px-5 py-8 lg:px-8">
      <PageHeader
        title="Attack Paths"
        subtitle="Verified attack chains across investigations"
      />

      {loading && <p className="text-[13px] text-white/45">Loading…</p>}

      <div className="divide-y divide-vx-border">
        {withPaths.map((inv) => {
          const target = inv.target.split(/[/\\]/).pop() || inv.target;
          return (
            <div key={inv.id} className="py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-white">{target}</p>
                  <p className="mt-1 font-mono text-[12px] text-white/40">{inv.id.slice(0, 12)}</p>
                </div>
                <span className="text-[12px] font-bold uppercase tracking-wider text-white/55">
                  {inv.path_count} paths
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">Risk</p>
                  <p className="mt-1 font-black uppercase text-white">{inv.attack_surface_classification}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">Findings</p>
                  <p className="mt-1 font-black text-white">{inv.findings_retained}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">Critical</p>
                  <p className="mt-1 font-black text-white">{inv.critical_count}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">Confidence</p>
                  <p className="mt-1 font-black text-white">
                    {inv.avg_confidence != null ? `${inv.avg_confidence}%` : "—"}
                  </p>
                </div>
              </div>
              <Link
                href={`/analyze?id=${inv.id}`}
                className="mt-4 inline-flex items-center gap-2 text-[12px] font-medium text-white/50 transition-colors hover:text-white"
              >
                Open investigation
                <ArrowRight className="size-4" />
              </Link>
            </div>
          );
        })}
      </div>

      {!loading && !withPaths.length && (
        <p className="py-16 text-center text-[14px] text-white/45">No verified attack paths yet.</p>
      )}
    </div>
  );
}
