"use client";

import { useMemo, useState } from "react";
import { ChevronDown, FileText, X } from "lucide-react";

import { evidenceFormatLabel } from "@/components/workspace/evidence-queue";
import {
  STAGED_FILES_COMPACT_THRESHOLD,
  formatTotalFileSize,
  stagedFilesTypeSummary,
} from "@/lib/staged-files-summary";
import { shortFilename } from "@/lib/evidence-presentation";
import { cn } from "@/lib/utils";

function ComposerFileChip({
  name,
  onRemove,
  disabled,
}: {
  name: string;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex max-w-[220px] items-center gap-2 rounded-lg border border-white/20",
        "bg-white/[0.04] px-2.5 py-1.5 text-white",
      )}
    >
      <FileText className="size-3.5 shrink-0 text-white/70" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 truncate text-[12px] text-white" title={name}>
        {shortFilename(name)}
      </span>
      {onRemove ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          className="flex size-4 shrink-0 items-center justify-center rounded text-white/45 transition-colors hover:text-white disabled:opacity-30"
          aria-label={`Remove ${name}`}
        >
          <X className="size-3" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}

export function StagedEvidencePanel({
  files,
  disabled,
  onRemoveFile,
  onClearAll,
}: {
  files: File[];
  disabled?: boolean;
  onRemoveFile?: (index: number) => void;
  onClearAll?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const totalBytes = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);
  const typeSummary = useMemo(() => stagedFilesTypeSummary(files), [files]);
  const compact = files.length > STAGED_FILES_COMPACT_THRESHOLD;

  if (!files.length) return null;

  if (!compact) {
    return (
      <div className="flex flex-wrap gap-2 border-b border-white/[0.06] px-3 pb-2 pt-3">
        {files.map((file, index) => (
          <ComposerFileChip
            key={`${file.name}:${file.size}:${file.lastModified}`}
            name={file.name}
            disabled={disabled}
            onRemove={onRemoveFile ? () => onRemoveFile(index) : undefined}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="border-b border-white/[0.06] px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-white">
            {files.length.toLocaleString()} evidence files selected
          </p>
          <p className="mt-1 text-[11px] text-vx-muted">
            {formatTotalFileSize(totalBytes)}
            {typeSummary ? ` · ${typeSummary}` : ""}
          </p>
        </div>
        {onClearAll ? (
          <button
            type="button"
            disabled={disabled}
            onClick={onClearAll}
            className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-white/45 transition-colors hover:text-white disabled:opacity-30"
          >
            Clear all
          </button>
        ) : null}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 flex w-full items-center justify-between rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-left text-[12px] text-white/70 transition-colors hover:border-white/[0.14] hover:text-white disabled:opacity-40"
      >
        <span>{expanded ? "Hide file list" : "View file list"}</span>
        <ChevronDown
          className={cn("size-4 transition-transform", expanded && "rotate-180")}
          strokeWidth={2}
          aria-hidden
        />
      </button>

      {expanded ? (
        <ul className="mt-2 max-h-40 list-none overflow-y-auto rounded-md border border-white/[0.06] bg-black/20 p-0 [scrollbar-color:rgba(255,255,255,0.2)_transparent] [scrollbar-width:thin]">
          {files.map((file, index) => (
            <li
              key={`${file.name}:${file.size}:${file.lastModified}`}
              className="flex items-center justify-between gap-2 border-b border-white/[0.04] px-3 py-2 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate text-[12px] text-white/85" title={file.name}>
                  {shortFilename(file.name)}
                </p>
                <p className="text-[10px] text-vx-muted">
                  {evidenceFormatLabel(file.name)} · {formatTotalFileSize(file.size)}
                </p>
              </div>
              {onRemoveFile ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRemoveFile(index)}
                  className="shrink-0 text-white/35 hover:text-white disabled:opacity-30"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="size-3.5" strokeWidth={2} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
