"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";

import { PageHeader } from "@/components/shared/workspace-card";
import { Badge } from "@/components/ui/badge";
import { MotionGroup } from "@/components/dashboard/motion";
import {
  HISTORY_MAX,
  RECENT_INVESTIGATIONS_UPDATED,
  loadInvestigationHistory,
  syncRecentInvestigationsFromApi,
  type RecentInvestigation,
} from "@/lib/recent-investigations";

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function InvestigationsList() {
  const [items, setItems] = useState<RecentInvestigation[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const synced = await syncRecentInvestigationsFromApi(HISTORY_MAX);
      setItems(synced);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setItems(loadInvestigationHistory(HISTORY_MAX));
    void refresh();
    const onUpdate = () => void refresh();
    window.addEventListener(RECENT_INVESTIGATIONS_UPDATED, onUpdate);
    return () => window.removeEventListener(RECENT_INVESTIGATIONS_UPDATED, onUpdate);
  }, [refresh]);

  return (
    <div className="mx-auto w-full max-w-[920px] px-5 py-8 lg:px-8">
      <PageHeader
        title="History"
        subtitle="Your investigations in this browser — nothing from other users"
      />

      {loading && items.length ? (
        <p className="text-[13px] text-white/45">Refreshing…</p>
      ) : null}

      <MotionGroup className="mt-6 flex flex-col gap-2">
        {items.map((inv) => {
          const target =
            inv.primaryHost ||
            inv.sourceFile?.split(/[/\\]/).pop() ||
            inv.title ||
            "Security Investigation";
          const risk = inv.surfaceClassification || inv.risk || "Unknown";

          return (
            <Link
              key={inv.id}
              href={`/?id=${inv.id}`}
              className="group flex items-center gap-4 rounded-2xl border border-white/[0.1] bg-[#0d0d0d] px-5 py-4 transition-colors hover:border-white/20 hover:bg-[#111111]"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-white/45 group-hover:text-white/70">
                <MessageSquare className="size-4" strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[15px] font-medium text-white">{target}</p>
                  <Badge
                    variant={
                      String(risk).toLowerCase().includes("critical") ||
                      String(risk).toLowerCase().includes("high")
                        ? "critical"
                        : "default"
                    }
                  >
                    {String(risk)}
                  </Badge>
                </div>
                <p className="mt-1 text-[12px] text-white/40">
                  {inv.findingsCount ?? 0} findings · {inv.pathCount ?? 0} paths ·{" "}
                  {formatWhen(inv.updatedAt || inv.createdAt)}
                </p>
              </div>
              <span className="shrink-0 text-[12px] font-medium text-white/35 group-hover:text-white/70">
                Open chat →
              </span>
            </Link>
          );
        })}
      </MotionGroup>

      {!loading && !items.length ? (
        <p className="py-16 text-center text-[14px] text-white/45">
          No investigations yet. Upload evidence from Home to start.
        </p>
      ) : null}
    </div>
  );
}
