"use client";

import Link from "next/link";
import { Download, FileText, Microscope } from "lucide-react";

import { API_BASE } from "@/lib/api";
import { HoverCard, hoverCardClasses } from "@/components/shared/hover-card";
import { cn } from "@/lib/utils";

export function InvestigationActionCards({ investigationId }: { investigationId: string }) {
  const base = `${API_BASE}/api/investigation/${investigationId}`;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Link href={`/investigation/${investigationId}`} className="block">
        <HoverCard lift className="h-full">
          <div className="flex items-start gap-3 px-5 py-4">
            <Microscope className="mt-0.5 size-5 shrink-0 text-white/60" strokeWidth={1.5} />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em]">View Investigation</p>
              <p className="mt-1 text-[12px] text-white/45">Technical evidence, graph, chains</p>
            </div>
          </div>
        </HoverCard>
      </Link>

      <Link href={`/report/${investigationId}`} className="block">
        <HoverCard lift className="h-full">
          <div className="flex items-start gap-3 px-5 py-4">
            <FileText className="mt-0.5 size-5 shrink-0 text-white/60" strokeWidth={1.5} />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em]">View Report</p>
              <p className="mt-1 text-[12px] text-white/45">Executive &amp; compliance reports</p>
            </div>
          </div>
        </HoverCard>
      </Link>

      <a
        href={`${base}/artifacts/investigation.json`}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(hoverCardClasses, "block transition-transform hover:-translate-y-0.5")}
      >
        <div className="flex items-start gap-3 px-5 py-4">
          <Download className="mt-0.5 size-5 shrink-0 text-white/60" strokeWidth={1.5} />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em]">Download Report</p>
            <p className="mt-1 text-[12px] text-white/45">JSON · MD · artifacts</p>
          </div>
        </div>
      </a>
    </div>
  );
}
