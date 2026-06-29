"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  HoverCard,
  HoverCardChrome,
  hoverCardClasses,
  hoverCardMotion,
} from "@/components/shared/hover-card";

function TimelineStep({
  step,
  index,
  open,
  onToggle,
}: {
  step: { id: string; title: string; detail: string; data: unknown };
  index: number;
  open: boolean;
  onToggle: () => void;
}) {
  const hasData = step.data != null;

  return (
    <div className="relative pb-4 pl-8">
      <motion.span
        animate={{ scale: open ? 1.2 : 1, borderColor: open ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.4)" }}
        transition={{ duration: 0.2 }}
        className="absolute left-0 top-3 h-2 w-2 -translate-x-1/2 border bg-black"
      />
      <motion.button
        type="button"
        onClick={onToggle}
        {...hoverCardMotion}
        className={cn(hoverCardClasses, "relative w-full px-4 py-3 text-left", open && "!border-white")}
      >
        <HoverCardChrome />
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">
              Step {index + 1}
            </p>
            <p className="mt-1 text-[13px] font-bold uppercase text-white">{step.title}</p>
            <p className="mt-1 text-[12px] text-white/50">{step.detail}</p>
          </div>
          {hasData && (
            <motion.span
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="shrink-0 text-white/40"
            >
              <ChevronDown className="size-4" strokeWidth={2} />
            </motion.span>
          )}
        </div>
      </motion.button>

      <AnimatePresence initial={false}>
        {open && hasData && (
          <motion.div
            key={`${step.id}-body`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <HoverCard lift={false} className="mt-2 overflow-hidden p-0">
              <pre className="relative whitespace-pre-wrap p-4 font-mono text-[11px] text-white/70">
                {JSON.stringify(step.data, null, 2)}
              </pre>
            </HoverCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ProofTimeline({
  steps,
  rawProof,
  onAsk,
}: {
  steps: Array<{
    id: string;
    title: string;
    detail: string;
    data: unknown;
  }>;
  rawProof: string;
  onAsk?: (q: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [rawOpen, setRawOpen] = useState(false);

  return (
    <div className="w-full space-y-6">
      <div className="border-b border-white/20 pb-4">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.15em]">Proof Timeline</h2>
      </div>

      <div className="relative ml-3 space-y-0 border-l border-white/20">
        {steps.map((step, i) => {
          const open = openId === step.id;
          return (
            <TimelineStep
              key={step.id}
              step={step}
              index={i}
              open={open}
              onToggle={() => setOpenId(open ? null : step.id)}
            />
          );
        })}
      </div>

      <HoverCard lift={false}>
        <motion.button
          type="button"
          onClick={() => setRawOpen((v) => !v)}
          className="relative flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">
            Raw proof.txt
          </span>
          <motion.span
            animate={{ rotate: rawOpen ? 180 : 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="text-white/40"
          >
            <ChevronDown className="size-4" strokeWidth={2} />
          </motion.span>
        </motion.button>

        <AnimatePresence initial={false}>
          {rawOpen && (
            <motion.div
              key="raw-proof"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="border-t border-white/20">
                <pre className="whitespace-pre-wrap p-4 font-mono text-[11px] text-white/70">
                  {rawProof}
                </pre>
                {onAsk && (
                  <div className="border-t border-white/10 px-4 py-3">
                    <button
                      type="button"
                      onClick={() =>
                        onAsk(
                          "Walk me through the raw proof evidence — summarize key validation steps and what they confirm.",
                        )
                      }
                      className="border border-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/60 transition-colors hover:bg-white hover:text-black"
                    >
                      Ask VAYNE about proof
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </HoverCard>
    </div>
  );
}
