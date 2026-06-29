"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Check, X } from "lucide-react";

import type { InvestigationBundle } from "@/lib/investigation-bundle";
import { avgConfidence } from "@/lib/report-helpers";

interface AnalysisCompleteDialogProps {
  open: boolean;
  bundle: InvestigationBundle | null;
  onDismiss: () => void;
  onViewBriefing: () => void;
}

function StatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-black px-3 py-3 text-center">
      <p className="font-mono text-lg font-black tabular-nums text-white">{value}</p>
      <p className="mt-1 text-[8px] font-bold uppercase tracking-[0.16em] text-white/45">{label}</p>
    </div>
  );
}

export function AnalysisCompleteDialog({
  open,
  bundle,
  onDismiss,
  onViewBriefing,
}: AnalysisCompleteDialogProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onDismiss]);

  if (!mounted) return null;

  const stats = bundle?.report.stats;
  const paths = bundle?.detail.summary.path_count ?? 0;
  const findings = stats?.findings_retained ?? 0;
  const confidence =
    bundle && bundle.detail.attack_paths.length > 0 ? avgConfidence(bundle.detail) : null;
  const duration = bundle?.report.duration_seconds.toFixed(1) ?? "—";

  return createPortal(
    <AnimatePresence>
      {open && bundle && (
        <>
          <motion.button
            type="button"
            aria-label="Close dialog"
            className="fixed inset-0 z-[100] cursor-default bg-black/80 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onDismiss}
          />

          <div className="pointer-events-none fixed inset-0 z-[101] flex items-center justify-center p-5">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="analysis-complete-title"
              className="pointer-events-auto relative w-full max-w-[420px] border-2 border-white bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_24px_80px_rgba(0,0,0,0.9)]"
              initial={{ opacity: 0, y: 28, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 360, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:100%_4px]" />

              <span className="pointer-events-none absolute left-0 top-0 size-3 border-l-2 border-t-2 border-white" />
              <span className="pointer-events-none absolute right-0 top-0 size-3 border-r-2 border-t-2 border-white" />
              <span className="pointer-events-none absolute bottom-0 left-0 size-3 border-b-2 border-l-2 border-white" />
              <span className="pointer-events-none absolute bottom-0 right-0 size-3 border-b-2 border-r-2 border-white" />

              <div className="relative flex items-center justify-between border-b border-white/20 px-4 py-2.5">
                <span className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-white/50">
                  VAYNE · Analysis Complete
                </span>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="flex size-7 items-center justify-center border border-white/25 text-white/60 transition-colors hover:border-white hover:bg-white hover:text-black"
                  aria-label="Close"
                >
                  <X className="size-3.5" strokeWidth={2} />
                </button>
              </div>

              <div className="relative px-6 py-6">
                <div className="flex items-start gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center border-2 border-white bg-white text-black">
                    <Check className="size-5" strokeWidth={2.5} aria-hidden />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <h2
                      id="analysis-complete-title"
                      className="text-brutal text-[1.35rem] font-black uppercase leading-tight tracking-[0.04em] text-white"
                    >
                      Review Complete
                    </h2>
                    <p className="mt-2 text-[12px] leading-relaxed text-white/55">
                      Investigation finished. Your briefing is ready — scroll down to Ask VAYNE for
                      analyst guidance.
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-px border border-white/25 bg-white/25 sm:grid-cols-4">
                  <StatCell label="Findings" value={findings} />
                  <StatCell label="Paths" value={paths} />
                  <StatCell label="Confidence" value={confidence != null ? `${confidence}%` : "—"} />
                  <StatCell label="Duration" value={`${duration}s`} />
                </div>

                <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={onViewBriefing}
                    className="flex-1 border-2 border-white bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-black transition-colors hover:bg-black hover:text-white"
                  >
                    View Briefing
                  </button>
                  <button
                    type="button"
                    onClick={onDismiss}
                    className="flex-1 border border-white/30 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70 transition-colors hover:border-white hover:text-white"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
