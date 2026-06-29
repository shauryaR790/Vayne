"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";

import type { Finding } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/shared/risk-meter";
import { RiskMeter } from "@/components/shared/risk-meter";
import { SectionLabel, WorkspaceCard } from "@/components/shared/workspace-card";
import { AskVayneButton } from "@/components/shared/ask-vayne-button";
import { Button } from "@/components/ui/button";
import { MotionItem } from "@/components/dashboard/motion";

function severityVariant(classification?: string): "critical" | "high" | "medium" | "default" {
  const c = (classification ?? "").toLowerCase();
  if (c.includes("critical")) return "critical";
  if (c.includes("high") || c.includes("confirmed")) return "high";
  if (c.includes("medium") || c.includes("likely")) return "medium";
  return "default";
}

function FindingCard({
  finding,
  investigationId,
  index,
}: {
  finding: Finding;
  investigationId: string;
  index: number;
}) {
  const confidence = finding.confidence ?? 0;
  const exploitPct =
    (finding.classification ?? "").toLowerCase().includes("confirmed")
      ? 90
      : (finding.classification ?? "").toLowerCase().includes("likely")
        ? 70
        : 40;

  return (
    <motion.div
      variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="h-full"
    >
      <WorkspaceCard className="flex h-full flex-col p-0">
        <div className="border-b border-white/15 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-[14px] font-black uppercase leading-snug tracking-wide">
                {finding.title || finding.id}
              </h4>
              <p className="mt-1.5 truncate font-mono text-[12px] text-white/50">
                {finding.host || finding.id}
              </p>
            </div>
            <Badge variant={severityVariant(finding.classification)}>
              {finding.classification || "Finding"}
            </Badge>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <ProgressBar value={confidence} label="Confidence" />
          <ProgressBar
            value={exploitPct}
            label="Exploitability"
            display={
              exploitPct >= 80 ? "High" : exploitPct >= 50 ? "Medium" : "Low"
            }
          />
          <div>
            <SectionLabel>Business Impact</SectionLabel>
            <p className="mt-2 text-[13px] font-medium uppercase leading-snug">
              Production compromise
            </p>
          </div>
          {finding.reasoning?.[0] && (
            <div className="border-t border-white/15 pt-4">
              <SectionLabel>AI Reasoning</SectionLabel>
              <p className="mt-2 text-[13px] leading-relaxed text-white/65">
                {finding.reasoning[0]}
              </p>
            </div>
          )}
          <RiskMeter value={confidence / 10} label="Risk Score" />
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-white/15 px-5 py-4">
          <Link
            href={`/analyze?id=${investigationId}`}
            className="flex w-full items-center justify-between text-[11px] font-bold uppercase tracking-wider text-white/50 transition-colors hover:text-white"
          >
            Investigate
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </WorkspaceCard>
    </motion.div>
  );
}

export function FindingsSection({
  findings,
  investigationId,
  showHeader = true,
}: {
  findings: Finding[];
  investigationId?: string;
  showHeader?: boolean;
}) {
  if (!findings.length) return null;

  return (
    <MotionItem>
      {showHeader && (
        <div className="mb-4 flex items-center justify-between border-b border-white pb-4">
          <div>
            <h3 className="text-[12px] font-bold uppercase tracking-[0.15em]">
              Recent Findings
            </h3>
            <p className="mt-1 text-[12px] uppercase tracking-wider text-white/50">
              AI-validated vulnerabilities
            </p>
          </div>
          <div className="flex items-center gap-2">
            <AskVayneButton />
            {investigationId && (
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/analyze?id=${investigationId}`}>
                  View all
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}

      <motion.div
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.06 } },
        }}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        {findings.slice(0, 4).map((finding, i) => (
          <FindingCard
            key={finding.id || i}
            finding={finding}
            investigationId={investigationId ?? ""}
            index={i}
          />
        ))}
      </motion.div>
    </MotionItem>
  );
}
