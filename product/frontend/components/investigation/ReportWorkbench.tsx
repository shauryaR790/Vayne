"use client";

import { useState } from "react";
import { getApiBase, requestHeaders } from "@/lib/api";
import { Panel, SidePanel, StatRow, WorkstationLayout } from "@/components/ui/Workstation";

const TABS = [
  { id: "executive", label: "Executive" },
  { id: "analyst", label: "Analyst" },
  { id: "attack_story", label: "Stories" },
  { id: "remediation", label: "Remediation" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ReportWorkbench({
  investigationId,
  initialContent,
  initialType,
  meta,
}: {
  investigationId: string;
  initialContent: string;
  initialType: TabId;
  meta: {
    pathCount: number;
    attackSurface: number;
    classification: string;
    avgConfidence: number;
    avgRisk: number;
  };
}) {
  const [active, setActive] = useState<TabId>(initialType);
  const [content, setContent] = useState(initialContent);
  const [loading, setLoading] = useState(false);

  async function loadReport(type: TabId) {
    setLoading(true);
    setActive(type);
    try {
      const res = await fetch(
        `${getApiBase()}/api/investigation/${investigationId}/reports/${type}`,
        { cache: "no-store", headers: requestHeaders() },
      );
      setContent(await res.text());
    } catch {
      setContent("Failed to load report.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 bg-vercel-bg border-b border-vercel-border flex">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => loadReport(tab.id)}
            className={active === tab.id ? "vx-tab-active" : "vx-tab"}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <WorkstationLayout
        main={
          <Panel title={TABS.find((t) => t.id === active)?.label ?? "Report"}>
            {loading ? (
              <p className="text-body text-vercel-muted">Loading…</p>
            ) : (
              <pre className="text-body font-mono whitespace-pre-wrap leading-relaxed text-zinc-300">
                {content}
              </pre>
            )}
          </Panel>
        }
        side={
          <>
            <SidePanel title="Report metadata">
              <div className="space-y-2">
                <StatRow label="Type" value={active} />
                <StatRow label="Engine export" value="verbatim markdown" />
                <StatRow label="Investigation" value={investigationId.slice(0, 8)} />
              </div>
            </SidePanel>
            <SidePanel title="Statistics">
              <div className="space-y-2">
                <StatRow label="Attack paths" value={meta.pathCount} />
                <StatRow label="Attack surface" value={meta.attackSurface} />
                <StatRow label="Classification" value={meta.classification} />
                <StatRow label="Avg confidence" value={meta.avgConfidence ? `${meta.avgConfidence}%` : "—"} />
                <StatRow label="Avg risk" value={meta.avgRisk ? meta.avgRisk.toFixed(1) : "—"} />
              </div>
            </SidePanel>
            <SidePanel title="Export">
              <a
                href={`${getApiBase()}/api/investigation/${investigationId}/artifact/${active === "remediation" ? "remediation_plan.json" : active === "attack_story" ? "attack_story.md" : `${active}_report.md`}`}
                className="vx-btn w-full text-center text-body"
                target="_blank"
                rel="noreferrer"
              >
                Download artifact
              </a>
            </SidePanel>
            <SidePanel title="Risk">
              <StatRow label="Avg risk" value={meta.avgRisk ? meta.avgRisk.toFixed(1) : "—"} />
              <StatRow label="Classification" value={meta.classification} />
            </SidePanel>
          </>
        }
      />
    </div>
  );
}
