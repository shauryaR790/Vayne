"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { listInvestigations } from "@/lib/api";
import type { InvestigationListItem } from "@/lib/types";
import { formatTimestamp } from "@/lib/format";
import { PageHeader } from "@/components/shared/workspace-card";

export function ProjectsGrid() {
  const [items, setItems] = useState<InvestigationListItem[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listInvestigations()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const q = filter.toLowerCase();
  const filtered = items.filter(
    (i) =>
      !q ||
      i.target.toLowerCase().includes(q) ||
      i.name.toLowerCase().includes(q) ||
      i.id.toLowerCase().includes(q),
  );

  return (
    <div className="mx-auto w-full max-w-[920px] px-5 py-8 lg:px-8">
      <PageHeader title="Projects" subtitle="All investigations" />

      <div className="mb-8 max-w-md">
        <input
          type="search"
          placeholder="Search investigations…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full border-b border-vx-border bg-transparent py-2 text-[14px] text-white outline-none placeholder:text-white/35 focus:border-white/30"
        />
      </div>

      {loading && <p className="text-[13px] text-white/45">Loading…</p>}
      {error && <p className="text-[13px] text-red-400">{error}</p>}

      {!loading && !filtered.length && (
        <p className="py-16 text-center text-[14px] text-white/45">
          No investigations yet. Run an analysis first.
        </p>
      )}

      <div className="divide-y divide-vx-border">
        {filtered.map((inv) => {
          const target = inv.target.split(/[/\\]/).pop() || inv.target;
          return (
            <Link
              key={inv.id}
              href={`/analyze?id=${inv.id}`}
              className="group block py-5 transition-colors hover:bg-white/[0.02]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="truncate text-[15px] font-medium text-white group-hover:text-white">
                  {target}
                </p>
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">
                  {inv.status}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">Risk</p>
                  <p className="mt-0.5 text-[14px] font-semibold text-white">
                    {inv.attack_surface_classification || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">Findings</p>
                  <p className="mt-0.5 text-[14px] font-semibold text-white">{inv.findings_retained}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">Paths</p>
                  <p className="mt-0.5 text-[14px] font-semibold text-white">{inv.path_count}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">Confidence</p>
                  <p className="mt-0.5 text-[14px] font-semibold text-white">
                    {inv.avg_confidence != null ? `${inv.avg_confidence}%` : "—"}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex justify-between text-[12px] text-white/40">
                <span>{formatTimestamp(String(inv.created_at))}</span>
                <span>{inv.duration_seconds.toFixed(1)}s</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
