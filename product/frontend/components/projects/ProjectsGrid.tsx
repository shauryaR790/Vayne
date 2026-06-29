"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listInvestigations } from "@/lib/api";
import type { InvestigationListItem } from "@/lib/types";
import { formatTimestamp } from "@/lib/format";

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
    <div className="max-w-[1400px] mx-auto px-6 py-10">
      <header className="text-center border-b border-vercel-border pb-8 mb-8">
        <h1 className="vx-page-title">Projects</h1>
        <p className="text-body text-vercel-muted mt-3">All investigations</p>
      </header>

      <div className="flex gap-3 mb-8 max-w-md mx-auto">
        <input
          type="search"
          placeholder="Search investigations…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 bg-vercel-panel border border-vercel-border px-4 py-2 text-body outline-none focus:border-vercel-info/50"
        />
      </div>

      {loading && <p className="text-center text-vercel-muted">Loading…</p>}
      {error && <p className="text-center text-vercel-danger">{error}</p>}

      {!loading && !filtered.length && (
        <p className="text-center text-vercel-muted py-16">No investigations yet. Run an analysis first.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((inv) => {
          const target = inv.target.split(/[/\\]/).pop() || inv.target;
          return (
            <Link
              key={inv.id}
              href={`/analyze?id=${inv.id}`}
              className="group border border-vercel-border bg-vercel-panel p-5 hover:border-vercel-info/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-body font-bold text-white truncate group-hover:text-vercel-info transition-colors">
                  {target}
                </h2>
                <span
                  className={
                    inv.status === "complete"
                      ? "vx-badge-success shrink-0"
                      : inv.status === "failed"
                        ? "vx-badge-danger shrink-0"
                        : "vx-badge-warning shrink-0"
                  }
                >
                  {inv.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4 text-metadata">
                <div>
                  <span className="text-vercel-muted uppercase tracking-wide">Risk</span>
                  <p className="text-white font-semibold mt-0.5">{inv.attack_surface_classification || "—"}</p>
                </div>
                <div>
                  <span className="text-vercel-muted uppercase tracking-wide">Findings</span>
                  <p className="text-white font-semibold mt-0.5">{inv.findings_retained}</p>
                </div>
                <div>
                  <span className="text-vercel-muted uppercase tracking-wide">Paths</span>
                  <p className="text-white font-semibold mt-0.5">{inv.path_count}</p>
                </div>
                <div>
                  <span className="text-vercel-muted uppercase tracking-wide">Confidence</span>
                  <p className="text-vercel-success font-semibold mt-0.5">
                    {inv.avg_confidence != null ? `${inv.avg_confidence}%` : "—"}
                  </p>
                </div>
              </div>
              <div className="flex justify-between mt-4 pt-3 border-t border-vercel-border text-label text-vercel-muted">
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
