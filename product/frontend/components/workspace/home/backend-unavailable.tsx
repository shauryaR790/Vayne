"use client";

import { motion } from "motion/react";

/**
 * Shown when health checks fail for ~90s — backend crashed or misconfigured.
 */
export function BackendUnavailable() {
  return (
    <div className="flex min-h-full w-full flex-1 items-center justify-center px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
        className="mx-auto w-full max-w-[440px] text-center"
        role="alert"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/45">
          Investigation Engine
        </p>
        <p className="mt-5 font-mono text-[15px] leading-relaxed text-white/85">
          Backend unavailable
        </p>
        <p className="mt-4 font-mono text-[13px] leading-relaxed text-white/55">
          The API server is not responding. On Render this usually means missing environment
          variables — especially <span className="text-white/70">VAYNE_JWT_SECRET</span> and{" "}
          <span className="text-white/70">VAYNE_API_KEY_PEPPER</span>. Check Render logs, fix
          env vars, then redeploy.
        </p>
        <p className="mt-4 font-mono text-[12px] text-white/40">
          Health checks retry every few seconds — this page updates when the server comes back.
        </p>
      </motion.div>
    </div>
  );
}
