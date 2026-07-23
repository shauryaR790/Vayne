"use client";

import { useCallback, useRef } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import type { InvestigationBundle } from "@/lib/investigation-bundle";
import { ANALYST_PRESETS, type ReportMode } from "@/lib/analyst-chat";
import { InvestigationBriefSection } from "@/components/investigation/investigation-brief-section";
import { InvestigationActionCards } from "@/components/investigation/investigation-action-cards";
import { AskVaynePanel } from "@/components/investigation/AskVaynePanel";
import { HoverCard } from "@/components/shared/hover-card";

const QUICK_TOPICS: Array<{ label: string; presetId: string }> = [
  { label: "Attack Path", presetId: "attack_chain" },
  { label: "Analyst Workflows", presetId: "remediation" },
  { label: "Operational Risk", presetId: "business" },
  { label: "Technical Details", presetId: "technical" },
  { label: "Impact Brief", presetId: "executive" },
];

const SUGGESTED_QUESTIONS = [
  "Why is this ranked #1?",
  "What evidence contradicts this?",
  "What should I validate next?",
  "Explain the evidence graph",
  "What remains unknown?",
  "How much analyst time was saved?",
];

export function VayneInvestigationWindow({
  bundle,
  onNewInvestigation,
}: {
  bundle: InvestigationBundle;
  onNewInvestigation?: () => void;
}) {
  const askRef = useRef<
    ((question: string, reportMode?: ReportMode, presetId?: string) => void) | null
  >(null);
  const investigationId = bundle.detail.summary.id;

  const askPreset = useCallback((presetId: string) => {
    const preset = ANALYST_PRESETS.find((p) => p.id === presetId);
    if (preset) askRef.current?.(preset.prompt, preset.reportMode, preset.id);
  }, []);

  const askQuestion = useCallback((q: string) => {
    askRef.current?.(q);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[800px] px-5 py-8 lg:px-8">
      <header className="mb-8 border-b border-white/15 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/35">
              VAYNE Investigation
            </p>
            <h1 className="mt-2 text-xl font-bold text-white">
              {bundle.report.name || bundle.report.target?.split(/[/\\]/).pop() || "Analysis complete"}
            </h1>
          </div>
          {onNewInvestigation ? (
            <button
              type="button"
              onClick={onNewInvestigation}
              className="inline-flex items-center gap-2 border border-white/25 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/60 transition-colors hover:border-white hover:text-white"
            >
              <Plus className="size-3.5" />
              New investigation
            </button>
          ) : null}
        </div>
      </header>

      <div className="space-y-8">
        <InvestigationBriefSection bundle={bundle} conversation />

        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
            Would you like me to explain
          </p>
          <div className="flex flex-wrap gap-2">
            {QUICK_TOPICS.map((topic) => (
              <HoverCard
                key={topic.presetId}
                as="button"
                onClick={() => askPreset(topic.presetId)}
                className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/65"
              >
                {topic.label}
              </HoverCard>
            ))}
          </div>
        </div>

        <div id="ask-vayne" className="scroll-mt-6">
          <AskVaynePanel
            bundle={bundle}
            chatOnly
            compact
            registerAsk={(ask) => {
              askRef.current = ask;
            }}
          />
        </div>

        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
            Suggested questions
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => askQuestion(q)}
                className="border border-white/15 px-3 py-2 text-[11px] text-white/50 transition-colors hover:border-white/35 hover:text-white/75"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
            Supporting evidence
          </p>
          <InvestigationActionCards investigationId={investigationId} />
          <p className="mt-3 text-[11px] text-white/35">
            Technical graphs, proof chains, and reports open in separate views — your conversation
            stays here.{" "}
            <Link href={`/investigation/${investigationId}`} className="text-white/55 underline">
              Open investigation workspace
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
