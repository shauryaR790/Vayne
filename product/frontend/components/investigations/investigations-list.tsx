"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";

import { listInvestigations } from "@/lib/api";
import type { InvestigationListItem } from "@/lib/types";
import { PageHeader } from "@/components/shared/workspace-card";
import { Badge } from "@/components/ui/badge";
import { MotionGroup } from "@/components/dashboard/motion";

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
    <div className="mx-auto w-full max-w-[920px] px-5 py-8 lg:px-8">
      <PageHeader
        title="History"
        subtitle="Previous investigations — open a chat to resume where you left off"
      />

      {loading ? (
        <p className="text-[13px] text-white/45">Loading history…</p>
      ) : null}
      {error ? <p className="text-[13px] text-white/60">{error}</p> : null}

      <MotionGroup className="mt-6 flex flex-col gap-2">
        {items.map((inv) => {
          const target = inv.target.split(/[/\\]/).pop() || inv.target;
          const risk = inv.attack_surface_classification;

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
                      risk.toLowerCase().includes("critical") || risk.toLowerCase().includes("high")
                        ? "critical"
                        : "default"
                    }
                  >
                    {risk}
                  </Badge>
                </div>
                <p className="mt-1 text-[12px] text-white/40">
                  {inv.findings_retained} findings · {inv.path_count} paths ·{" "}
                  {formatWhen(inv.created_at)}
                </p>
              </div>
              <span className="shrink-0 text-[12px] font-medium text-white/35 group-hover:text-white/70">
                Open chat →
              </span>
            </Link>
          );
        })}
      </MotionGroup>

      {!loading && !items.length && !error ? (
        <p className="py-16 text-center text-[14px] text-white/45">
          No investigations yet. Upload evidence from Home to start.
        </p>
      ) : null}
    </div>
  );
}
