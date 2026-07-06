"use client";

import { useEffect, useRef } from "react";
import { ArrowUp } from "lucide-react";

import { AnalystMessage, AnalystMessageDivider, UserMessage } from "@/components/workspace/analyst/analyst-message";
import { AnalystThinking } from "@/components/workspace/analyst/analyst-thinking";
import type { InvestigationBundle } from "@/lib/investigation-bundle";
import { ANALYST_NAME } from "@/lib/brand";
import type { StoredChatMessage } from "@/lib/conversation-session";
import { cn } from "@/lib/utils";

interface AnalystMessageRow extends StoredChatMessage {
  streaming?: boolean;
}

export function VaneAnalystPanel({
  bundle,
  messages,
  input,
  busy,
  thinking,
  thinkingStep,
  onInputChange,
  onAsk,
  onScroll,
  initialScrollTop = 0,
}: {
  bundle: InvestigationBundle | null;
  messages: AnalystMessageRow[];
  input: string;
  busy: boolean;
  thinking: boolean;
  thinkingStep?: string | null;
  analystOnline?: boolean;
  onInputChange: (value: string) => void;
  onAsk: (question: string) => void;
  onScroll?: (scrollTop: number) => void;
  initialScrollTop?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoredScroll = useRef(false);

  useEffect(() => {
    if (restoredScroll.current) return;
    const el = scrollRef.current;
    if (!el || !initialScrollTop) return;
    el.scrollTop = initialScrollTop;
    restoredScroll.current = true;
  }, [initialScrollTop]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: thinking ? "auto" : "smooth" });
  }, [messages, thinking, thinkingStep]);

  const disabled = !bundle || busy;

  return (
    <aside className="flex h-screen w-[25%] min-w-[300px] shrink-0 flex-col border-l border-vx-border bg-vx-app">
      <header className="shrink-0 border-b border-vx-border px-4 py-3.5">
        <h2 className="text-[15px] font-medium text-white">{ANALYST_NAME}</h2>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        onScroll={() => onScroll?.(scrollRef.current?.scrollTop ?? 0)}
      >
        {!bundle ? (
          <p className="text-[15px] leading-relaxed text-vx-secondary">
            Run an investigation to ask the analyst about findings, paths, and evidence.
          </p>
        ) : !messages.length && !thinking && !thinkingStep ? (
          <p className="text-[15px] leading-relaxed text-vx-secondary">
            Ask why a finding was retained, how a path was validated, or what to fix first.
          </p>
        ) : null}

        <div className="space-y-6">
          {messages.map((msg, index) => (
            <div key={msg.id} className="space-y-6">
              {index > 0 ? <AnalystMessageDivider /> : null}
              {msg.role === "user" ? (
                <UserMessage content={msg.content} turn={index} />
              ) : (
                <AnalystMessage content={msg.content} streaming={msg.streaming} turn={index} />
              )}
            </div>
          ))}
        </div>

        {thinkingStep ? (
          <div className={cn(messages.length ? "mt-6" : "")}>
            <AnalystThinking step={thinkingStep} />
          </div>
        ) : null}

        {thinking && !thinkingStep ? (
          <p className="mt-4 font-mono text-[13px] text-vx-secondary">
            <span className="text-vx-muted">{">"}</span> thinking
            <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-vx-secondary align-middle" />
          </p>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-vx-border px-3 py-3">
        <form
          className="w-full"
          onSubmit={(e) => {
            e.preventDefault();
            const q = input.trim();
            if (!q || disabled) return;
            onAsk(q);
          }}
        >
          <div className="flex w-full items-end gap-2 rounded-lg border border-vx-border bg-vx-panel px-3 py-2.5">
            <textarea
              value={input}
              disabled={disabled}
              onChange={(e) => onInputChange(e.target.value)}
              placeholder="Ask about findings, paths, evidence…"
              rows={3}
              className="max-h-32 min-w-0 flex-1 resize-none bg-transparent text-[15px] leading-relaxed text-white outline-none placeholder:text-vx-muted disabled:opacity-50"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const q = input.trim();
                  if (q && !disabled) onAsk(q);
                }
              }}
            />
            <button
              type="submit"
              disabled={disabled || !input.trim()}
              className="mb-0.5 flex size-8 shrink-0 items-center justify-center rounded-md text-vx-secondary transition-colors hover:bg-vx-elevated hover:text-white disabled:opacity-30"
              aria-label="Send"
            >
              <ArrowUp className="size-4" strokeWidth={2} />
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
}
