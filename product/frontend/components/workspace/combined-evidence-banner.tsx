"use client";

import { SourceFileBadge } from "@/components/shared/source-file-badge";

export function CombinedEvidenceBanner({
  filenames,
}: {
  filenames: string[];
}) {
  if (filenames.length <= 1) return null;

  return (
    <div className="border-b border-vx-border bg-vx-panel px-6 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-vx-secondary">
        Combined analysis
      </p>
      <p className="mt-1 max-w-[72ch] text-[13px] leading-relaxed text-vx-muted">
        Findings, paths, and graph nodes are correlated across{" "}
        {filenames.length} uploaded files. Source tags show which evidence file
        each item came from.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {filenames.map((file) => (
          <SourceFileBadge key={file} file={file} />
        ))}
      </div>
    </div>
  );
}
