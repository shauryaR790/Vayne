"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { SourceFileBadge } from "@/components/shared/source-file-badge";
import { shortFilename } from "@/lib/evidence-presentation";
import {
  EVIDENCE_LIST_COMPACT_THRESHOLD,
  filenameTypeSummary,
} from "@/lib/staged-files-summary";
import { cn } from "@/lib/utils";

export function CombinedEvidenceBanner({
  filenames,
}: {
  filenames: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const compact = filenames.length > EVIDENCE_LIST_COMPACT_THRESHOLD;
  const typeSummary = useMemo(() => filenameTypeSummary(filenames), [filenames]);

  if (filenames.length <= 1) return null;

  return (
    <div className="border-b border-vx-border bg-vx-panel px-6 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-vx-secondary">
        Combined analysis
      </p>
      <p className="mt-1 max-w-[72ch] text-[13px] leading-relaxed text-vx-muted">
        {filenames.length.toLocaleString()} evidence files correlated into one investigation.
        {typeSummary ? ` ${typeSummary}.` : ""} Individual findings show source tags where
        attribution matters.
      </p>

      {compact ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full max-w-md items-center justify-between rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-left text-[12px] text-white/70 transition-colors hover:border-white/[0.14] hover:text-white"
          >
            <span>{expanded ? "Hide source file list" : "View source file list"}</span>
            <ChevronDown
              className={cn("size-4 shrink-0 transition-transform", expanded && "rotate-180")}
              strokeWidth={2}
              aria-hidden
            />
          </button>
          {expanded ? (
            <ul className="mt-2 max-h-36 list-none overflow-y-auto rounded-md border border-white/[0.06] bg-black/20 p-0 [scrollbar-color:rgba(255,255,255,0.2)_transparent] [scrollbar-width:thin]">
              {filenames.map((file) => (
                <li
                  key={file}
                  className="border-b border-white/[0.04] px-3 py-1.5 font-mono text-[11px] text-white/75 last:border-b-0"
                  title={file}
                >
                  {shortFilename(file)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {filenames.map((file) => (
            <SourceFileBadge key={file} file={file} />
          ))}
        </div>
      )}
    </div>
  );
}
