"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { listInvestigations } from "@/lib/api";
import type { InvestigationListItem } from "@/lib/types";
import { PageHeader } from "@/components/shared/workspace-card";

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
    <div className="mx-auto w-full max-w-[920px] px-5 py-8 lg:px-8">
      <PageHeader title="Assets" subtitle="Discovered assets across investigations" />
      <div className="divide-y divide-vx-border">
        {assets.map((asset) => (
          <div key={asset.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div className="min-w-0">
              <p className="truncate font-mono text-[14px] font-medium uppercase text-white">
                {asset.target}
              </p>
              <p className="mt-1 text-[12px] text-white/45">
                {asset.classification} · {asset.findings} findings
              </p>
            </div>
            <Link
              href={`/analyze?id=${asset.id}`}
              className="shrink-0 text-[12px] font-medium text-white/50 transition-colors hover:text-white"
            >
              Open investigation →
            </Link>
          </div>
        ))}
      </div>
      {!assets.length && (
        <p className="py-16 text-center text-[14px] text-white/45">No assets discovered yet.</p>
      )}
    </div>
  );
}
