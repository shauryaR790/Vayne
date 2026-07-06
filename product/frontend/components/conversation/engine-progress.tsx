"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check } from "lucide-react";

import { ENGINE_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

const ENGINE_STEPS = [
  "Parsing evidence",
  "Correlating assets",
  "Validating attack paths",
  "Building attack graph",
  "Generating analyst evidence",
] as const;

export const ENGINE_STEP_MS = 900;
export const ENGINE_MIN_DURATION_MS = 6500;

export function EngineProgress({
  active,
  complete,
  className,
}: {
  active: boolean;
  complete?: boolean;
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

  const visibleStep = complete ? ENGINE_STEPS.length : step;

  return (
    <div
      className={cn(
        "w-full border border-vx-border bg-vx-panel p-4",
        className,
      )}
    >
      <p className="mb-3 text-[14px] font-medium text-vx-secondary">{ENGINE_NAME}</p>
      <ul className="space-y-2">
        {ENGINE_STEPS.map((label, index) => {
          const done = index < visibleStep;
          const current = index === visibleStep && !complete;
          return (
            <motion.li
              key={label}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2.5 text-[13px]"
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center text-[10px]",
                  done ? "text-white" : current ? "text-vx-body" : "text-vx-secondary",
                )}
              >
                {done ? <Check className="size-3" strokeWidth={2} /> : index + 1}
              </span>
              <span
                className={cn(
                  done ? "text-white" : current ? "text-vx-body" : "text-vx-secondary",
                )}
              >
                {label}
              </span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
