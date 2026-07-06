"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  RECENT_INVESTIGATIONS_UPDATED,
  loadRecentInvestigations,
  syncRecentInvestigationsFromApi,
  type RecentInvestigation,
} from "@/lib/recent-investigations";
import { cn } from "@/lib/utils";

function ActivityRow({
  label,
  meta,
  onClick,
}: {
  label: string;
  meta?: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors",
        onClick && "hover:bg-[#16181d]",
      )}
    >
      <span className="min-w-0 truncate text-[15px] text-[#9b9fa8]">{label}</span>
      {meta ? (
        <span className="shrink-0 text-[13px] text-[#70757f]">{meta}</span>
      ) : null}
    </Tag>
  );
}

function ActivitySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 px-3 text-[13px] font-medium text-[#70757f]">{title}</h3>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

export function VaneEngineActivity({ className }: { className?: string }) {
  const router = useRouter();
  const [items, setItems] = useState<RecentInvestigation[]>([]);

  const refresh = useCallback(async () => {
    const synced = await syncRecentInvestigationsFromApi(12);
    setItems(synced);
  }, []);

  useEffect(() => {
    setItems(loadRecentInvestigations(12));
    void refresh();
    const onUpdate = () => void refresh();
    window.addEventListener(RECENT_INVESTIGATIONS_UPDATED, onUpdate);
    return () => window.removeEventListener(RECENT_INVESTIGATIONS_UPDATED, onUpdate);
  }, [refresh]);

  const investigations = useMemo(() => items.slice(0, 5), [items]);
  const paths = useMemo(
    () =>
      items
        .filter((item) => item.pathCategory || item.pathCount)
        .slice(0, 4)
        .map((item) => ({
          id: item.id,
          label: item.pathCategory || item.title || "Attack path",
          meta: item.pathCount ? `${item.pathCount} paths` : undefined,
        })),
    [items],
  );
  const findings = useMemo(
    () =>
      items
        .filter((item) => item.summary || item.findingsCount)
        .slice(0, 4)
        .map((item) => ({
          id: item.id,
          label: item.summary || item.title || "Finding review",
          meta: item.findingsCount ? `${item.findingsCount} retained` : undefined,
        })),
    [items],
  );
  const assets = useMemo(
    () =>
      items
        .filter((item) => item.primaryHost || item.assetCount)
        .slice(0, 4)
        .map((item) => ({
          id: item.id,
          label: item.primaryHost || item.sourceFile || "Asset scope",
          meta: item.assetCount ? `${item.assetCount} assets` : undefined,
        })),
    [items],
  );

  const open = (id: string) => router.push(`/?id=${id}`);

  if (!items.length) {
    return (
      <div className={cn("w-full max-w-[640px] px-4", className)}>
        <h2 className="mb-4 text-[17px] font-medium text-white">Recent engine activity</h2>
        <p className="px-3 text-[15px] text-[#70757f]">
          Completed investigations, paths, and findings will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("w-full max-w-[640px] px-4", className)}>
      <h2 className="mb-4 text-[17px] font-medium text-white">Recent engine activity</h2>
      <div className="space-y-5">
        {investigations.length ? (
          <ActivitySection title="Recent investigations">
            {investigations.map((item) => (
              <ActivityRow
                key={item.id}
                label={item.title || "Security Investigation"}
                meta={item.risk}
                onClick={() => open(item.id)}
              />
            ))}
          </ActivitySection>
        ) : null}

        {paths.length ? (
          <ActivitySection title="Recent attack paths">
            {paths.map((row) => (
              <ActivityRow
                key={`path-${row.id}`}
                label={row.label}
                meta={row.meta}
                onClick={() => open(row.id)}
              />
            ))}
          </ActivitySection>
        ) : null}

        {findings.length ? (
          <ActivitySection title="Recent findings">
            {findings.map((row) => (
              <ActivityRow
                key={`finding-${row.id}`}
                label={row.label}
                meta={row.meta}
                onClick={() => open(row.id)}
              />
            ))}
          </ActivitySection>
        ) : null}

        {assets.length ? (
          <ActivitySection title="Recent assets analyzed">
            {assets.map((row) => (
              <ActivityRow
                key={`asset-${row.id}`}
                label={row.label}
                meta={row.meta}
                onClick={() => open(row.id)}
              />
            ))}
          </ActivitySection>
        ) : null}
      </div>
    </div>
  );
}
