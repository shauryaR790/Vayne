"use client";

import { CursorLoadingStatus } from "@/components/shared/cursor-loading-status";

export function SessionAnalyzingBar({
  label = "Analyzing evidence",
  detail,
}: {
  label?: string;
  detail?: string;
}) {
  return (
    <div
      className="fixed bottom-6 left-3 right-3 z-50 mx-auto max-w-lg rounded-xl border border-white/[0.08] bg-[#141414]/96 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-sm sm:left-1/2 sm:right-auto sm:w-auto sm:-translate-x-1/2"
      role="status"
      aria-live="polite"
    >
      <CursorLoadingStatus
        lines={[
          { label, detail },
          { label: "Waiting for VAYNE engine", dim: true },
        ]}
      />
    </div>
  );
}
