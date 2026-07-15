"use client";

import { useEffect, useState, type RefObject } from "react";
import { ArrowUp, ChevronDown, Infinity, Loader2, Paperclip } from "lucide-react";

import { fetchAnalystStatus, type AnalystStatus } from "@/lib/analyst-chat";
import { OPEN_EVIDENCE_EVENT, dispatchWorkspaceEvent } from "@/lib/workspace-shortcuts";
import { cn } from "@/lib/utils";

function formatModelLabel(model: string): string {
  return model
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AnalystComposer({
  input,
  disabled,
  busy,
  thinking,
  placeholder,
  inputRef,
  onInputChange,
  onAsk,
}: {
  input: string;
  disabled?: boolean;
  busy?: boolean;
  thinking?: boolean;
  placeholder: string;
  inputRef?: RefObject<HTMLTextAreaElement>;
  onInputChange: (value: string) => void;
  onAsk: (question: string) => void;
}) {
  const [status, setStatus] = useState<AnalystStatus | null>(null);
  const canSend = !disabled && input.trim().length > 0;
  const isLoading = Boolean(busy || thinking);

  useEffect(() => {
    void fetchAnalystStatus().then(setStatus);
  }, []);

  useEffect(() => {
    const el = inputRef?.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input, inputRef]);

  const submit = () => {
    const q = input.trim();
    if (!q || disabled) return;
    onAsk(q);
  };

  const modelLabel = status?.model ? formatModelLabel(status.model) : "Analyst";

  return (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-vx-composer shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <textarea
          ref={inputRef}
          value={input}
          disabled={disabled}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={placeholder}
          rows={1}
          className={cn(
            "max-h-40 min-h-[44px] w-full resize-none bg-transparent px-3.5 pb-1 pt-3",
            "text-[14px] leading-relaxed text-white outline-none",
            "placeholder:text-white/35 disabled:opacity-50",
          )}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />

        <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-0.5">
          <div className="flex min-w-0 flex-1 items-center gap-0.5">
            <button
              type="button"
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1",
                "bg-white/[0.06] text-[12px] text-white/70 transition-colors hover:bg-white/[0.09] hover:text-white",
              )}
              aria-label="Analyst mode"
            >
              <Infinity className="size-3.5" strokeWidth={2} aria-hidden />
              <span>Analyst</span>
              <ChevronDown className="size-3 opacity-60" strokeWidth={2} aria-hidden />
            </button>

            <button
              type="button"
              className={cn(
                "inline-flex min-w-0 max-w-[140px] items-center gap-0.5 truncate rounded-md px-1.5 py-1",
                "text-[12px] text-white/45 transition-colors hover:text-white/70",
              )}
              aria-label={`Model: ${modelLabel}`}
              title={status?.model ?? modelLabel}
            >
              <span className="truncate">{modelLabel}</span>
              <ChevronDown className="size-3 shrink-0 opacity-50" strokeWidth={2} aria-hidden />
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {isLoading ? (
              <Loader2
                className="size-4 animate-spin text-white/35"
                strokeWidth={2}
                aria-label="Generating response"
              />
            ) : null}

            <button
              type="button"
              disabled={disabled}
              onClick={() => dispatchWorkspaceEvent(OPEN_EVIDENCE_EVENT)}
              className={cn(
                "flex size-7 items-center justify-center rounded-md text-white/40 transition-colors",
                "hover:bg-white/[0.06] hover:text-white/70 disabled:opacity-30",
              )}
              aria-label="Attach evidence"
            >
              <Paperclip className="size-4" strokeWidth={1.75} />
            </button>

            <button
              type="submit"
              disabled={!canSend}
              className={cn(
                "flex size-7 items-center justify-center rounded-full transition-all",
                canSend
                  ? "bg-white text-black hover:bg-white/90"
                  : "bg-white/15 text-white/25",
              )}
              aria-label="Send message"
            >
              <ArrowUp className="size-4" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
