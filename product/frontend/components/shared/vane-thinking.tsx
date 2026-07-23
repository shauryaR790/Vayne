"use client";

import { CursorLoadingStatus } from "@/components/shared/cursor-loading-status";

export function VaneThinking({
  label = "VAYNE is investigating",
  detail,
}: {
  label?: string;
  detail?: string;
}) {
  return (
    <CursorLoadingStatus
      className="py-3"
      lines={[
        { label, detail },
        { label: "Reasoning over evidence", dim: true },
      ]}
    />
  );
}

/** @deprecated Use VaneThinking */
export const VayneThinking = VaneThinking;
