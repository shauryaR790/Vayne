"use client";

import { motion } from "motion/react";

export function VayneThinking({
  label = "VAYNE is investigating",
}: {
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 py-3 text-[14px] text-white/42">
      <span>{label}</span>
      <motion.span
        className="size-1.5 rounded-full bg-white/55"
        animate={{ opacity: [0.25, 1, 0.25], scale: [0.9, 1.1, 0.9] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />
    </div>
  );
}
