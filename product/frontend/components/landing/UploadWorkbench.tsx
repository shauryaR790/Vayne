"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { analyzeFiles, API_BASE, checkHealth } from "@/lib/api";
import {
  ENGINE_CAPABILITIES,
  ENGINE_MODULES,
  SUPPORTED_INPUTS,
  SYSTEM_INFO,
} from "@/lib/engine-info";
import { saveRecentInvestigation, loadRecentInvestigations, type RecentInvestigation } from "@/lib/recent-investigations";
import { ACCEPTED_EXTENSIONS, validateUploadFiles } from "@/lib/upload";
import { AnalysisLoader } from "@/components/ui/AnalysisLoader";
import { LandingSidebar } from "@/components/layout/LandingSidebar";
import { Panel, SidePanel, StatRow, WorkstationLayout } from "@/components/ui/Workstation";
import { IconCheck } from "@/components/ui/icons";

function readPickedFiles(stored: File[], input: HTMLInputElement | null): File[] {
  if (stored.length > 0) return stored;
  return Array.from(input?.files ?? []);
}

export function UploadWorkbench() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Ready");
  const [analyzing, setAnalyzing] = useState(false);
  const [backendStatus, setBackendStatus] = useState<"checking" | "connected" | "offline">("checking");
  const [files, setFiles] = useState<File[]>([]);
  const [recent, setRecent] = useState<RecentInvestigation[]>([]);

  useEffect(() => {
    setRecent(loadRecentInvestigations());
    let cancelled = false;
    checkHealth().then((ok) => {
      if (!cancelled) setBackendStatus(ok ? "connected" : "offline");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mainRef.current) return;
    gsap.fromTo(
      mainRef.current.querySelectorAll(".vx-stagger"),
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.35, stagger: 0.04, ease: "power2.out", delay: 0.1 },
    );
  }, []);

  function onFilesSelected(list: FileList | null) {
    const picked = Array.from(list ?? []);
    setFiles(picked);
    if (picked.length) setStatus("Ready");
  }

  async function onAnalyze() {
    const picked = readPickedFiles(files, fileInputRef.current);
    if (!picked.length) {
      setStatus("Choose at least one scan file.");
      return;
    }
    const validation = validateUploadFiles(picked);
    if (!validation.ok) {
      setStatus(validation.message);
      return;
    }
    if (backendStatus !== "connected") {
      setStatus(`Backend offline (${API_BASE})`);
      return;
    }
    setAnalyzing(true);
    setStatus("Analyzing…");
    try {
      const result = await analyzeFiles(validation.files, "web-upload");
      saveRecentInvestigation({
        id: result.investigation_id,
        name: "web-upload",
        createdAt: new Date().toISOString(),
      });
      router.push(`/investigation/${result.investigation_id}`);
    } catch (e) {
      setAnalyzing(false);
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const online = backendStatus === "connected";

  const side = (
    <>
      <SidePanel title="Engine Status" centered>
        <ul className="space-y-3">
          {ENGINE_MODULES.map((m) => (
            <li key={m} className="flex items-center justify-center gap-2 text-metadata font-semibold uppercase tracking-wide">
              <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-vercel-success" : "bg-vercel-muted"}`} />
              <span className="text-white">{m}</span>
            </li>
          ))}
        </ul>
      </SidePanel>

      <SidePanel title="System Info" centered>
        <div className="space-y-3">
          <StatRow label="Version" value={`v${SYSTEM_INFO.version}`} />
          <StatRow label="Rules" value={SYSTEM_INFO.rulesLoaded} />
          <StatRow label="Exploit DB" value={SYSTEM_INFO.exploitDbCount} />
          <StatRow label="Confidence" value={SYSTEM_INFO.confidenceModelFactors} />
          <div className="flex justify-center pt-2">
            <span
              className={
                online
                  ? "vx-status-pill text-vercel-success border-vercel-success/30"
                  : "vx-status-pill text-vercel-danger border-vercel-danger/30"
              }
            >
              {backendStatus === "checking" ? "checking" : online ? "online" : "offline"}
            </span>
          </div>
        </div>
      </SidePanel>

      <SidePanel title="Capabilities" centered>
        <ul className="space-y-2">
          {ENGINE_CAPABILITIES.map((c) => (
            <li key={c} className="text-metadata text-vercel-muted font-semibold uppercase tracking-wide">
              {c}
            </li>
          ))}
        </ul>
      </SidePanel>
    </>
  );

  return (
    <div className="flex min-h-screen">
      <LandingSidebar />
      <div ref={mainRef} className="flex-1 min-w-0 p-8 lg:p-12 max-w-[1200px]">
        <header className="vx-stagger border-b border-vercel-border pb-8 mb-8 text-center">
          <h1 className="vx-page-title">VAYNE Attack Reasoning Engine</h1>
          <p className="text-body text-vercel-muted mt-3 font-semibold">
            Upload evidence to begin investigation
          </p>
        </header>

        <WorkstationLayout
          main={
            <div className="space-y-6">
              <div className="vx-stagger">
                <Panel title="Upload Evidence" hero>
                  <div className="space-y-6 py-2">
                    <label className="block">
                      <span className="vx-card-title mb-2 block">Choose file</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept={ACCEPTED_EXTENSIONS.join(",")}
                        className="block w-full border border-dashed border-vercel-border-hover bg-black/40 p-8 text-body font-semibold text-center cursor-pointer hover:border-vercel-info/50 transition-colors duration-nav file:hidden"
                        onChange={(e) => onFilesSelected(e.target.files)}
                      />
                    </label>

                    {files.length > 0 && (
                      <p className="text-metadata font-mono text-vercel-muted text-center">
                        {files.map((f) => f.name).join(", ")}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={onAnalyze}
                      disabled={analyzing}
                      className="vx-btn-primary w-full py-3 text-body"
                    >
                      Analyze
                    </button>

                    <p className="text-metadata text-vercel-muted text-center">{status}</p>
                  </div>
                </Panel>
              </div>

              {analyzing && (
                <div className="vx-stagger">
                  <AnalysisLoader active={analyzing} />
                </div>
              )}

              <div className="vx-stagger">
                <Panel title="Recent Investigations">
                  {recent.length ? (
                    <div className="space-y-2">
                      {recent.map((inv) => (
                        <Link
                          key={inv.id}
                          href={`/investigation/${inv.id}`}
                          className="vx-row-item block font-semibold"
                        >
                          <span className="text-white">{inv.name}</span>
                          <span className="ml-auto text-metadata font-mono text-vercel-muted">
                            {inv.id.slice(0, 8)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-body text-vercel-muted">No investigations yet.</p>
                  )}
                </Panel>
              </div>

              <div className="vx-stagger">
                <Panel title="Supported Inputs">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {SUPPORTED_INPUTS.map((input) => (
                      <div
                        key={input}
                        className="flex items-center gap-2 text-body font-semibold uppercase"
                      >
                        <IconCheck className="w-3.5 h-3.5 text-vercel-success shrink-0" />
                        {input}
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            </div>
          }
          side={side}
        />
      </div>
    </div>
  );
}
