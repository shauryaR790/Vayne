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
  clearRecentInvestigations,
  loadInvestigationHistory,
  syncRecentInvestigationsFromApi,
  type RecentInvestigation,
} from "@/lib/recent-investigations";
import { clearAllInvestigationSessions } from "@/lib/investigation-session";
import { resetConversationToHome } from "@/lib/conversation-session";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
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

  const clearHistory = () => {
    if (!items.length) return;
    const confirmed = window.confirm(
      "Clear all investigation history from this browser? This removes the list and local sessions. Server-side investigation data is not deleted.",
    );
    if (!confirmed) return;
    clearRecentInvestigations();
    clearAllInvestigationSessions();
    resetConversationToHome();
    setItems([]);
    router.replace("/");
  };

  return (
    <div className="mx-auto w-full max-w-[920px] px-5 py-8 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          title="History"
          subtitle="Your investigations in this browser — nothing from other users"
        />
        {items.length > 0 ? (
          <button
            type="button"
            onClick={clearHistory}
            className="mb-1 border border-white/15 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-white/60 transition-colors hover:border-white/35 hover:text-white"
          >
            Clear all history
          </button>
        ) : null}
      </div>

      {loading && items.length ? (
        <p className="text-[13px] text-white/45">Refreshing…</p>
      ) : null}

      <MotionGroup className="mt-6 divide-y divide-vx-border">
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
              className="group flex items-center gap-4 py-4 transition-colors hover:bg-white/[0.02]"
            >
              <div className="flex size-9 shrink-0 items-center justify-center text-white/35 group-hover:text-white/60">
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
                Open →
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
