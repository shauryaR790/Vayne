"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Search } from "lucide-react";

import type { InvestigationListItem } from "@/lib/types";
import { formatTimestamp } from "@/lib/format";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MotionItem } from "@/components/dashboard/motion";
import { StatusPill, mapInvestigationStatus } from "@/components/dashboard/status-pill";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function analystHoursSaved(findings: number, duration: number): string {
  const hrs = Math.max(1, Math.round(findings * 2.5 + duration / 60));
  return `${hrs}h`;
}

export function ScansTable({
  items,
  loading,
  filter,
  onFilterChange,
}: {
  items: InvestigationListItem[];
  loading?: boolean;
  filter?: string;
  onFilterChange?: (value: string) => void;
}) {
  const q = (filter ?? "").toLowerCase();
  const filtered = items.filter(
    (scan) =>
      !q ||
      scan.target.toLowerCase().includes(q) ||
      scan.name.toLowerCase().includes(q) ||
      scan.id.toLowerCase().includes(q),
  );

  return (
    <MotionItem>
      <Card>
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center">
          <div>
            <CardTitle>Recent Scans</CardTitle>
            <p className="mt-1 text-[11px] uppercase tracking-wider text-white/50">
              Latest scans across your attack surface
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="flex flex-1 items-center gap-2 border border-white px-3 py-2 sm:w-56">
              <Search className="size-4 text-white/50" />
              <input
                placeholder="Search scans"
                value={filter ?? ""}
                onChange={(e) => onFilterChange?.(e.target.value)}
                className="w-full bg-transparent text-[12px] uppercase tracking-wider text-white outline-none placeholder:text-white/40"
              />
            </div>
            <Button variant="secondary" size="sm" type="button">
              Filter
            </Button>
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          {loading ? (
            <p className="px-5 py-8 text-[12px] uppercase tracking-wider text-white/50">
              Loading scans…
            </p>
          ) : !filtered.length ? (
            <p className="px-5 py-8 text-[12px] uppercase tracking-wider text-white/50">
              No scans yet. Run a new scan from Home.
            </p>
          ) : (
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-t border-white/20 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">
                  <th className="border-b border-white/20 px-5 py-3">Target</th>
                  <th className="border-b border-white/20 px-5 py-3">Scan Type</th>
                  <th className="border-b border-white/20 px-5 py-3">Findings</th>
                  <th className="border-b border-white/20 px-5 py-3">Critical</th>
                  <th className="border-b border-white/20 px-5 py-3">Status</th>
                  <th className="border-b border-white/20 px-5 py-3">Time</th>
                  <th className="border-b border-white/20 px-5 py-3">
                    Analyst Hrs Saved
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((scan, i) => {
                  const target = scan.target.split(/[/\\]/).pop() || scan.target;
                  return (
                    <motion.tr
                      key={scan.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.05 * i }}
                      className="border-b border-white/10 transition-colors hover:bg-white/5"
                    >
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/analyze?id=${scan.id}`}
                          className="font-mono text-[12px] hover:underline"
                        >
                          {target}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="border border-white/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/60">
                          Full Surface
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-[12px]">{scan.findings_retained}</td>
                      <td className="px-5 py-3.5 text-[12px] font-bold">
                        {scan.critical_count}
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusPill status={mapInvestigationStatus(scan.status)} />
                      </td>
                      <td className="px-5 py-3.5 text-[11px] uppercase tracking-wider text-white/50">
                        {relativeTime(String(scan.created_at))}
                      </td>
                      <td className="px-5 py-3.5 text-[12px] font-bold">
                        {analystHoursSaved(scan.findings_retained, scan.duration_seconds)}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </MotionItem>
  );
}
