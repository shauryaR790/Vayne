"use client";

import { motion } from "motion/react";

import { CursorLoadingStatus } from "@/components/shared/cursor-loading-status";

/**
 * Shown on the Investigation Engine panel while the API is cold-starting
 * (common on first open / free-tier hosts — often ~1 minute).
 */
export function ServerStartingUp() {
  return (
    <div className="flex min-h-full w-full flex-1 items-center justify-center px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
        className="mx-auto w-full max-w-[420px] text-center"
        role="status"
        aria-live="polite"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/45">
          Investigation Engine
        </p>
        <div className="mt-5 flex justify-center">
          <CursorLoadingStatus
            className="text-left"
            lines={[
              { label: "Server starting up" },
              { label: "Usually about 1 minute on first open", dim: true },
            ]}
          />
        </div>
        <p className="mt-6 font-mono text-[13px] leading-relaxed text-white/55">
          VAYNE will start working automatically once the server is ready. Keep this tab open —
          your evidence stays queued.
        </p>
      </motion.div>
    </div>
  );
}
