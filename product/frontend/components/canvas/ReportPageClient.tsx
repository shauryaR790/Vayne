"use client";

import { useEffect, useState } from "react";

import { getInvestigation, getReportMarkdown, API_BASE } from "@/lib/api";
import { ReportWorkbench } from "@/components/investigation/ReportWorkbench";
import { VayneThinking } from "@/components/shared/vayne-thinking";
import { HoverCard } from "@/components/shared/hover-card";
import { Download, Copy } from "lucide-react";

export function ReportPageClient({ id }: { id: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [initialContent, setInitialContent] = useState("");
  const [meta, setMeta] = useState({
    pathCount: 0,
    attackSurface: 0,
    classification: "",
    avgConfidence: 0,
    avgRisk: 0,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [detail, executive] = await Promise.all([
          getInvestigation(id),
          getReportMarkdown(id, "executive"),
        ]);
        if (cancelled) return;
        setInitialContent(executive);
        setMeta({
          pathCount: detail.summary.path_count,
          attackSurface: detail.summary.attack_surface_score ?? 0,
          classification: detail.summary.attack_surface_classification ?? "",
          avgConfidence:
            detail.attack_paths.length > 0
              ? detail.attack_paths.reduce((a, p) => a + p.confidence, 0) / detail.attack_paths.length
              : 0,
          avgRisk:
            detail.attack_paths.length > 0
              ? detail.attack_paths.reduce((a, p) => a + p.risk, 0) / detail.attack_paths.length
              : 0,
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <VayneThinking label="Loading report" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-6 text-[13px] text-white/50">
        {error}
      </div>
    );
  }

  const base = `${API_BASE}/api/investigation/${id}`;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-8 lg:px-8">
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">Report</p>
        <h1 className="mt-2 text-2xl font-bold text-white">Client deliverables</h1>
        <p className="mt-1 text-[13px] text-white/45">
          Executive, technical, remediation, and compliance views
        </p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {[
          { label: "JSON", href: `${base}/artifacts/investigation.json` },
          { label: "Executive MD", href: `${base}/reports/executive` },
          { label: "Analyst MD", href: `${base}/reports/analyst` },
          { label: "Proof", href: `${base}/artifacts/proof.txt` },
        ].map((item) => (
          <a
            key={item.label}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <HoverCard lift>
              <div className="flex items-center gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-white/65">
                <Download className="size-3.5" />
                {item.label}
              </div>
            </HoverCard>
          </a>
        ))}
      </div>

      <ReportWorkbench
        investigationId={id}
        initialContent={initialContent}
        initialType="executive"
        meta={meta}
      />

      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(initialContent)}
        className="mt-4 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/45 hover:text-white/70"
      >
        <Copy className="size-3.5" />
        Copy Markdown
      </button>
    </div>
  );
}
