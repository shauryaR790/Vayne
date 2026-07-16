"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";

import {
  CursorLoadingStatus,
  type CursorLoadingLine,
} from "@/components/shared/cursor-loading-status";
import { ENGINE_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

const ENGINE_STEPS = [
  "Parsing evidence",
  "Correlating assets",
  "Validating attack paths",
  "Building attack graph",
  "Generating analyst evidence",
] as const;

export const ENGINE_STEP_MS = 650;
/** Short polish window when analysis finishes quickly — never blocks results. */
export const ENGINE_MIN_DURATION_MS = 2200;
export const ENGINE_COMPLETE_MS = 350;

function waitingLabel(step: string): string {
  const lower = step.toLowerCase();
  if (lower.includes("parsing")) return "Waiting for correlation engine";
  if (lower.includes("correlating")) return "Waiting for path validator";
  if (lower.includes("validating")) return "Waiting for graph builder";
  if (lower.includes("graph")) return "Waiting for report generator";
  return "Waiting for engine";
}

export function EngineProgress({
  active,
  complete,
  fileCount,
  className,
}: {
  active: boolean;
  complete?: boolean;
  fileCount?: number;
  className?: string;
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) {
      setStep(0);
      return;
    }
    if (complete) {
      setStep(ENGINE_STEPS.length);
      return;
    }
    const timer = window.setInterval(() => {
      setStep((prev) => (prev < ENGINE_STEPS.length - 1 ? prev + 1 : prev));
    }, ENGINE_STEP_MS);
    return () => window.clearInterval(timer);
  }, [active, complete]);

  if (!active && !complete) return null;

  const visibleStep = complete ? ENGINE_STEPS.length - 1 : step;
  const current = ENGINE_STEPS[visibleStep];
  const detail =
    fileCount && fileCount > 0
      ? `${fileCount} file${fileCount === 1 ? "" : "s"}`
      : undefined;

  const lines: CursorLoadingLine[] = complete
    ? [
        { label: "Investigation complete", detail: ENGINE_NAME },
        { label: "Opening workspace", dim: true },
      ]
    : [
        { label: current, detail },
        { label: waitingLabel(current), dim: true },
      ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn("w-full px-1 py-1", className)}
    >
      <CursorLoadingStatus lines={lines} />
    </motion.div>
  );
}
