"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { InvestigationBundle } from "@/lib/investigation-bundle";
import {
  ANALYST_OFFLINE_MESSAGE,
  streamInvestigationBrief,
} from "@/lib/analyst-chat";
import { createStreamBatcher } from "@/lib/stream-buffer";
import { HoverCard } from "@/components/shared/hover-card";
import { VayneThinking } from "@/components/shared/vayne-thinking";

export function InvestigationBriefSection({
  bundle,
  conversation = false,
}: {
  bundle: InvestigationBundle;
  conversation?: boolean;
}) {
  const investigationId = bundle.detail.summary.id;
  const [content, setContent] = useState("");
  const [streaming, setStreaming] = useState(true);
  const [thinking, setThinking] = useState(true);
  const abortRef = useRef(false);
  const startedRef = useRef(false);

  const load = useCallback(async () => {
    abortRef.current = false;
    startedRef.current = false;
    setThinking(true);
    setStreaming(true);
    setContent("");

    const batcher = createStreamBatcher(setContent);

    try {
      for await (const event of streamInvestigationBrief(investigationId)) {
        if (abortRef.current) return;
        if (event.type === "thinking") continue;
        if (event.type === "error") {
          batcher.finish();
          setContent(
            event.code === "llm_offline" || event.code === "llm_not_configured"
              ? ANALYST_OFFLINE_MESSAGE
              : event.message,
          );
          break;
        }
        if (event.type === "token") {
          if (!startedRef.current) {
            startedRef.current = true;
            setThinking(false);
          }
          batcher.append(event.token);
        }
        if (event.type === "done") break;
      }
    } catch {
      setContent(ANALYST_OFFLINE_MESSAGE);
    }

    batcher.finish();
    if (!batcher.text && !abortRef.current) {
      setContent((c) => c || ANALYST_OFFLINE_MESSAGE);
    }
    setThinking(false);
    setStreaming(false);
  }, [investigationId]);

  useEffect(() => {
    load();
    return () => {
      abortRef.current = true;
    };
  }, [load]);

  const stats = bundle.report.stats;

  return (
    <HoverCard id="investigation-brief" className="scroll-mt-6" lift={false}>
      {!conversation ? (
        <div className="border-b border-white/20 px-6 py-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">
            VAYNE Investigation Brief
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            {[
              { label: "Assets", value: bundle.report.assets?.length ?? 0 },
              { label: "Validated", value: stats.findings_retained ?? 0 },
              { label: "Paths", value: bundle.detail.summary.path_count },
              { label: "Rejected", value: stats.paths_rejected ?? 0 },
            ].map((s) => (
              <div key={s.label} className="border border-white/15 px-3 py-2">
                <p className="text-[9px] font-bold uppercase tracking-wider text-white/35">{s.label}</p>
                <p className="mt-1 text-xl font-bold text-white">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="border-b border-white/20 px-6 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">AI Summary</p>
        </div>
      )}
      <div className="min-h-[120px] px-6 py-6">
        {thinking && !content ? <VayneThinking label="Thinking" /> : null}
        <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-white/85 [overflow-wrap:anywhere]">
          {content}
          {streaming && content ? (
            <span className="ml-0.5 inline-block h-4 w-1 bg-white/60" />
          ) : null}
        </div>
      </div>
    </HoverCard>
  );
}
