"use client";

import { motion } from "motion/react";

import { VayneIdentity } from "@/components/conversation/vayne-identity";

export function VayneThinking({
  label = "VAYNE is reasoning about your environment",
}: {
  label?: string;
}) {
  return (
    <div className="py-8">
      <VayneIdentity persona="analyst" compact />
      <div className="flex items-center gap-3 text-[15px] text-white/40">
        <span className="flex items-center gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="size-1.5 rounded-full bg-white/45"
              animate={{ opacity: [0.2, 0.9, 0.2] }}
              transition={{
                duration: 1.4,
                repeat: Infinity,
                delay: i * 0.22,
                ease: "easeInOut",
              }}
            />
          ))}
        </span>
        <span>{label}</span>
      </div>
    </div>
  );
}
