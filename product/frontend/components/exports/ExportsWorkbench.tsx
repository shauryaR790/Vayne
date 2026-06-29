"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { API_BASE, getReportMarkdown, listInvestigations } from "@/lib/api";
import type { InvestigationListItem } from "@/lib/types";
import { SectionLabel, WorkspaceCard } from "@/components/shared/workspace-card";
import { Button } from "@/components/ui/button";
import { AskVayneButton } from "@/components/shared/ask-vayne-button";
import { ScansTable } from "@/components/dashboard/scans-table";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

const REPORT_TYPES = [
  { id: "executive", label: "Executive" },
  { id: "analyst", label: "Analyst" },
  { id: "attack_story", label: "Developer / Story" },
  { id: "remediation", label: "SOC / Remediation" },
] as const;

const LANGUAGES = ["English", "French", "German", "Spanish", "Japanese", "Hindi", "Arabic"];

export function ExportsWorkbench() {
  const [investigations, setInvestigations] = useState<InvestigationListItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [reportType, setReportType] = useState<(typeof REPORT_TYPES)[number]["id"]>("executive");
  const [language, setLanguage] = useState("English");
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    listInvestigations().then((items) => {
      setInvestigations(items);
      if (items[0]) setSelectedId(items[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    getReportMarkdown(selectedId, reportType)
      .then(setPreview)
      .catch(() => setPreview("Report not available."))
      .finally(() => setLoading(false));
  }, [selectedId, reportType]);

  const artifactUrl = (name: string) =>
    `${API_BASE}/api/investigation/${selectedId}/artifact/${name}`;

  function copyReport() {
    if (preview) navigator.clipboard.writeText(preview);
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-8 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 border-b border-white pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="vx-page-title">Reports</h1>
          <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-white/50">
            AI-validated vulnerability reports & exports
          </p>
        </div>
        <AskVayneButton />
      </div>

      <div className="mb-8">
        <ScansTable
          items={investigations}
          filter={filter}
          onFilterChange={setFilter}
        />
      </div>

      <div className="mb-6 border-b border-white pb-4">
        <h3 className="text-[12px] font-bold uppercase tracking-[0.15em]">Recent Findings</h3>
        <p className="mt-1 text-[12px] uppercase tracking-wider text-white/50">
          Export investigation reports
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-4">
          <WorkspaceCard className="p-5">
            <SectionLabel>Investigation</SectionLabel>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="mt-3 w-full border border-white bg-surface px-3 py-2 text-[12px] uppercase tracking-wider text-white outline-none"
            >
              {investigations.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {(inv.target.split(/[/\\]/).pop() || inv.name).slice(0, 40)}
                </option>
              ))}
            </select>
          </WorkspaceCard>

          <WorkspaceCard className="p-5">
            <SectionLabel>Report Type</SectionLabel>
            <div className="mt-3 space-y-1">
              {REPORT_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setReportType(t.id)}
                  className={
                    reportType === t.id
                      ? "w-full border border-white bg-white px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-black"
                      : "w-full border border-transparent px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-white/60 hover:border-white/30 hover:text-white"
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
          </WorkspaceCard>

          <WorkspaceCard className="p-5">
            <SectionLabel>Language</SectionLabel>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-3 w-full border border-white bg-surface px-3 py-2 text-[12px] text-white outline-none"
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-white/40">
              Translation — coming soon
            </p>
          </WorkspaceCard>

          <WorkspaceCard className="space-y-2 p-5">
            <SectionLabel>Export</SectionLabel>
            <Button className="mt-3 w-full" asChild>
              <a
                href={artifactUrl(
                  reportType === "remediation"
                    ? "remediation_plan.json"
                    : reportType === "attack_story"
                      ? "attack_story.md"
                      : `${reportType}_report.md`,
                )}
                target="_blank"
                rel="noreferrer"
              >
                Download
              </a>
            </Button>
            <Button variant="secondary" className="w-full" onClick={copyReport}>
              Copy Report
            </Button>
            <Button variant="secondary" className="w-full" asChild>
              <a href={artifactUrl("investigation.json")} target="_blank" rel="noreferrer">
                Download JSON
              </a>
            </Button>
            {selectedId && (
              <Button variant="ghost" className="w-full" asChild>
                <Link href={`/analyze?id=${selectedId}`}>Open Investigation</Link>
              </Button>
            )}
          </WorkspaceCard>
        </aside>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <div className="px-5 pb-5">
            {loading ? (
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">
                Loading…
              </p>
            ) : (
              <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-white/75">
                {preview || "Select an investigation to preview."}
              </pre>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
