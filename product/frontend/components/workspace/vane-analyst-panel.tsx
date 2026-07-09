"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { ArrowUp } from "lucide-react";

import { AnalystPanelHeader } from "@/components/workspace/analyst/analyst-panel-header";
import { AnalystMessage, AnalystMessageDivider, UserMessage } from "@/components/workspace/analyst/analyst-message";
import { AnalystThinking } from "@/components/workspace/analyst/analyst-thinking";
import type { InvestigationBundle } from "@/lib/investigation-bundle";
import { ANALYST_NAME } from "@/lib/brand";
import type { StoredChatMessage } from "@/lib/conversation-session";
import { cn } from "@/lib/utils";

interface AnalystMessageRow extends StoredChatMessage {
  streaming?: boolean;
}

const composerShell =
  "overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]";

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
  inputRef,
  onClearChat,
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
  inputRef?: RefObject<HTMLTextAreaElement>;
  onClearChat?: () => void;
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
  const empty = !messages.length && !thinking && !thinkingStep;
  const contextLabel = bundle
    ? bundle.report.name?.trim() || bundle.detail.summary.id || ANALYST_NAME
    : ANALYST_NAME;

  return (
    <aside className="flex h-screen w-[25%] min-w-[300px] shrink-0 flex-col border-l border-vx-border bg-vx-app">
      <AnalystPanelHeader
        contextLabel={contextLabel}
        onDismiss={messages.length && onClearChat ? onClearChat : undefined}
      />
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={() => onScroll?.(scrollRef.current?.scrollTop ?? 0)}
      >
        {empty ? (
          <div className="flex h-full min-h-[200px] items-center justify-center px-2 text-center">
            <p className="max-w-[240px] text-[14px] leading-relaxed text-vx-muted">
              {!bundle
                ? "Run an investigation to ask about findings, paths, and evidence."
                : "Ask why a finding was retained, how a path was validated, or what to fix first."}
            </p>
          </div>
        ) : null}

        <div className="space-y-5">
          {messages.map((msg, index) => (
            <div key={msg.id}>
              {index > 0 ? <AnalystMessageDivider /> : null}
              {msg.role === "user" ? (
                <UserMessage content={msg.content} />
              ) : (
                <AnalystMessage content={msg.content} streaming={msg.streaming} />
              )}
            </div>
          ))}
        </div>

        {thinkingStep ? (
          <div className={cn(messages.length ? "mt-5" : "mt-0")}>
            <AnalystThinking step={thinkingStep} />
          </div>
        ) : null}

        {thinking && !thinkingStep ? (
          <p className="mt-4 font-mono text-[13px] text-vx-muted">
            <span>{">"}</span> thinking
            <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-vx-secondary align-middle" />
          </p>
        ) : null}
      </div>

      <div className="shrink-0 p-3">
        <form
          className="w-full"
          onSubmit={(e) => {
            e.preventDefault();
            const q = input.trim();
            if (!q || disabled) return;
            onAsk(q);
          }}
        >
          <div className={composerShell}>
            <textarea
              ref={inputRef}
              value={input}
              disabled={disabled}
              onChange={(e) => onInputChange(e.target.value)}
              placeholder="Ask about findings, paths, evidence…"
              rows={3}
              className="max-h-36 min-h-[72px] w-full resize-none bg-transparent px-4 pt-4 text-[14px] leading-relaxed text-white outline-none placeholder:text-vx-muted disabled:opacity-50"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const q = input.trim();
                  if (q && !disabled) onAsk(q);
                }
              }}
            />
            <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-1">
              <span className="rounded-md px-2 py-1 text-[12px] text-vx-muted">Analyst</span>
              <button
                type="submit"
                disabled={disabled || !input.trim()}
                className="flex size-8 items-center justify-center rounded-lg bg-white/[0.08] text-vx-secondary transition-colors hover:bg-white/[0.12] hover:text-white disabled:opacity-30"
                aria-label="Send"
              >
                <ArrowUp className="size-4" strokeWidth={2} />
              </button>
            </div>
          </div>
        </form>
      </div>
    </aside>
  );
}
