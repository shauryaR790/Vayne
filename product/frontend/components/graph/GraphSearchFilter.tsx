"use client";

import { Search } from "lucide-react";

export type GraphFilterId = "critical" | "exploitable" | "internet" | "lateral";

const FILTERS: { id: GraphFilterId; label: string }[] = [
  { id: "critical", label: "Critical only" },
  { id: "exploitable", label: "Exploitable only" },
  { id: "internet", label: "Internet facing" },
  { id: "lateral", label: "Lateral movement" },
];

export function GraphSearchFilter({
  query,
  onQueryChange,
  activeFilters,
  onToggleFilter,
  matchCount,
  totalCount,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  activeFilters: Set<GraphFilterId>;
  onToggleFilter: (id: GraphFilterId) => void;
  matchCount: number;
  totalCount: number;
}) {
  return (
    <div className="pointer-events-auto absolute left-3 right-3 top-3 z-20 flex flex-col gap-2 sm:flex-row sm:items-center">
      <label className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/35"
          strokeWidth={1.5}
        />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search hosts, services, CVEs…"
          className="h-9 w-full rounded-lg border border-white/10 bg-black/70 pl-9 pr-3 text-[12px] text-white/85 outline-none backdrop-blur-sm placeholder:text-white/30 focus:border-white/25"
        />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((filter) => {
          const active = activeFilters.has(filter.id);
          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => onToggleFilter(filter.id)}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide transition-colors ${
                active
                  ? "border-white/30 bg-white/10 text-white"
                  : "border-white/10 bg-black/50 text-white/45 hover:border-white/20 hover:text-white/70"
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>
      {query.trim() ? (
        <div className="hidden text-[10px] uppercase tracking-wide text-white/35 sm:block">
          {matchCount}/{totalCount}
        </div>
      ) : null}
    </div>
  );
}
