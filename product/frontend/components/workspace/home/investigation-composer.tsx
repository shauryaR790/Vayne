"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, Infinity, Loader2, Paperclip } from "lucide-react";

import { StagedEvidencePanel } from "@/components/workspace/home/staged-evidence-panel";
import type { InvestigationMode } from "@/lib/investigation-mode";
import { ACCEPTED_EXTENSIONS } from "@/lib/upload";
import { cn } from "@/lib/utils";

function InvestigationModePicker({
  value,
  disabled,
  onChange,
}: {
  value: InvestigationMode;
  disabled?: boolean;
  onChange: (mode: InvestigationMode) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/[0.06] px-3 py-2.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-vx-muted">
        Multi-file mode
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("combined")}
        className={cn(
          "rounded-full border px-3 py-1 text-[12px] transition-colors",
          value === "combined"
            ? "border-white/30 bg-white text-black"
            : "border-white/10 text-vx-muted hover:border-white/20 hover:text-white",
        )}
      >
        Merge scans
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("separate")}
        className={cn(
          "rounded-full border px-3 py-1 text-[12px] transition-colors",
          value === "separate"
            ? "border-white/30 bg-white text-black"
            : "border-white/10 text-vx-muted hover:border-white/20 hover:text-white",
        )}
      >
        Analyze separately
      </button>
    </div>
  );
}

export function InvestigationComposer({
  disabled,
  busy,
  stagedFiles = [],
  investigationMode = "combined",
  onInvestigationModeChange,
  onSelectFiles,
  onRemoveFile,
  onClearFiles,
  onBeginSession,
  onUpload,
}: {
  disabled?: boolean;
  busy?: boolean;
  stagedFiles?: File[];
  investigationMode?: InvestigationMode;
  onInvestigationModeChange?: (mode: InvestigationMode) => void;
  onSelectFiles: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
  onClearFiles?: () => void;
  onBeginSession: (prompt: string) => void;
  onUpload: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [focused, setFocused] = useState(false);

  const stagedFileCount = stagedFiles.length;
  const canSubmit = Boolean(value.trim()) || stagedFileCount > 0;
  const isLoading = Boolean(busy || disabled);

  const submit = useCallback(() => {
    if (!canSubmit || disabled) return;
    onBeginSession(value.trim());
    setValue("");
  }, [canSubmit, disabled, onBeginSession, value]);

  const handleFiles = useCallback(
    (picked: File[]) => {
      if (!picked.length || disabled) return;
      onSelectFiles(picked);
    },
    [disabled, onSelectFiles],
  );

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  return (
    <div className="w-full">
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(",")}
        multiple
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          handleFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      <div
        className={cn(
          "overflow-hidden rounded-xl border transition-colors duration-200",
          dragOver || focused ? "border-white/[0.14]" : "border-white/[0.08]",
          "bg-vx-composer shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          handleFiles(Array.from(e.dataTransfer.files ?? []));
        }}
      >
        {dragOver ? (
          <div className="border-b border-white/[0.06] px-4 py-2">
            <p className="py-1.5 text-center text-[12px] text-white/55">
              Drop Nmap, Nessus, Burp, OpenVAS…
            </p>
          </div>
        ) : null}

        {stagedFileCount > 0 ? (
          <>
            <StagedEvidencePanel
              files={stagedFiles}
              disabled={disabled}
              onRemoveFile={onRemoveFile}
              onClearAll={onClearFiles}
            />
            {stagedFileCount > 1 && onInvestigationModeChange ? (
              <InvestigationModePicker
                value={investigationMode}
                disabled={disabled}
                onChange={onInvestigationModeChange}
              />
            ) : null}
          </>
        ) : null}

        <textarea
          ref={inputRef}
          value={value}
          disabled={disabled}
          rows={1}
          placeholder="Ask VANE to investigate, analyze scans, or find attack paths"
          className={cn(
            "max-h-[200px] min-h-[52px] w-full resize-none bg-transparent px-4 pb-1 pt-4",
            "text-[15px] leading-relaxed text-white outline-none",
            "placeholder:text-white/35 disabled:opacity-50",
          )}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />

        <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-0.5">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <button
              type="button"
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1",
                "bg-white/[0.06] text-[12px] text-white/70 transition-colors hover:bg-white/[0.09] hover:text-white",
              )}
              aria-label="Investigation mode"
            >
              <Infinity className="size-3.5" strokeWidth={2} aria-hidden />
              <span>Agent</span>
              <ChevronDown className="size-3 opacity-60" strokeWidth={2} aria-hidden />
            </button>

            <button
              type="button"
              className={cn(
                "inline-flex min-w-0 items-center gap-0.5 truncate rounded-md px-1.5 py-1",
                "text-[12px] text-white/40 transition-colors hover:text-white/65",
              )}
              aria-label="Model"
            >
              <span className="truncate">VANE Analyst</span>
              <ChevronDown className="size-3 shrink-0 opacity-50" strokeWidth={2} aria-hidden />
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {isLoading ? (
              <Loader2
                className="size-4 animate-spin text-white/40"
                strokeWidth={2}
                aria-label="Analyzing"
              />
            ) : null}

            <button
              type="button"
              disabled={disabled}
              onClick={onUpload}
              className={cn(
                "flex size-7 items-center justify-center rounded-md text-white/40 transition-colors",
                "hover:bg-white/[0.06] hover:text-white/70 disabled:opacity-30",
              )}
              aria-label="Attach evidence"
            >
              <Paperclip className="size-4" strokeWidth={1.75} />
            </button>

            <button
              type="button"
              disabled={disabled || !canSubmit}
              onClick={submit}
              className={cn(
                "flex size-7 items-center justify-center rounded-full transition-all duration-150",
                canSubmit
                  ? "bg-white text-black hover:bg-white/90"
                  : "bg-white/15 text-white/25",
              )}
              aria-label="Begin investigation"
            >
              <ArrowUp className="size-4" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
