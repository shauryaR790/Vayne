"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { listInvestigations } from "@/lib/api";
import type { InvestigationListItem } from "@/lib/types";
import { PageHeader, WorkspaceCard, SectionLabel } from "@/components/shared/workspace-card";

export function AssetsContent() {
  const [items, setItems] = useState<InvestigationListItem[]>([]);

  useEffect(() => {
    listInvestigations().then(setItems);
  }, []);

  const assets = items.map((inv) => ({
    id: inv.id,
    target: inv.target.split(/[/\\]/).pop() || inv.target,
    classification: inv.attack_surface_classification,
    findings: inv.findings_retained,
  }));

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-8 lg:px-8">
      <PageHeader title="Assets" subtitle="Discovered assets across investigations" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {assets.map((asset) => (
          <WorkspaceCard key={asset.id} className="p-5">
            <SectionLabel>Target</SectionLabel>
            <p className="mt-2 font-mono text-[13px] font-medium uppercase">{asset.target}</p>
            <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-white/50">
              {asset.classification} · {asset.findings} findings
            </p>
            <Link
              href={`/analyze?id=${asset.id}`}
              className="mt-4 inline-block text-[10px] font-bold uppercase tracking-wider text-white/60 hover:text-white"
            >
              View investigation →
            </Link>
          </WorkspaceCard>
        ))}
      </div>
      {!assets.length && (
        <p className="py-16 text-center text-[11px] font-bold uppercase tracking-wider text-white/50">
          No assets discovered yet.
        </p>
      )}
    </div>
  );
}
