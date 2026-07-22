"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

import { AnalystComposer } from "@/components/workspace/analyst/analyst-composer";
import { AnalystPanelHeader } from "@/components/workspace/analyst/analyst-panel-header";
import { AnalystMessage, AnalystMessageDivider, UserMessage } from "@/components/workspace/analyst/analyst-message";
import { AnalystThinking } from "@/components/workspace/analyst/analyst-thinking";
import type { InvestigationBundle } from "@/lib/investigation-bundle";
import { resolveMessageFileInsights } from "@/lib/engine-file-insights";
import type { AgentActivityFeed } from "@/lib/analyst-activity";
import type { StoredChatMessage } from "@/lib/conversation-session";
import { cn } from "@/lib/utils";

interface AnalystMessageRow extends StoredChatMessage {
  streaming?: boolean;
  revealedFileInsights?: number;
  revealedSegments?: number;
  segmentTexts?: string[];
  activeThinking?: { label: string; detail?: string } | null;
}

export function VaneAnalystPanel({
  bundle,
  bundles,
  contextLabel,
  messages,
  input,
  busy,
  thinking,
  activityFeed,
  onInputChange,
  onAsk,
  onScroll,
  initialScrollTop = 0,
  inputRef,
  onClearChat,
  briefingPrompt,
  onGetSummary,
  onSkipSummary,
  sourceLabel,
  sourceLabels,
}: {
  bundle: InvestigationBundle | null;
  bundles?: InvestigationBundle[];
  contextLabel?: string;
  messages: AnalystMessageRow[];
  input: string;
  busy: boolean;
  thinking: boolean;
  activityFeed?: AgentActivityFeed | null;
  analystOnline?: boolean;
  onInputChange: (value: string) => void;
  onAsk: (question: string) => void;
  onScroll?: (scrollTop: number) => void;
  initialScrollTop?: number;
  inputRef?: RefObject<HTMLTextAreaElement>;
  onClearChat?: () => void;
  briefingPrompt?: { fileCount: number } | null;
  onGetSummary?: () => void;
  onSkipSummary?: () => void;
  sourceLabel?: string;
  sourceLabels?: string[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoredScroll = useRef(false);
  const stickToBottom = useRef(false);

  useEffect(() => {
    if (restoredScroll.current) return;
    const el = scrollRef.current;
    if (!el || !initialScrollTop) return;
    el.scrollTop = initialScrollTop;
    restoredScroll.current = true;
  }, [initialScrollTop]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottom.current) return;
    const streaming = messages.some((m) => m.streaming);
    if (!streaming && !thinking) return;
    el.scrollTo({ top: el.scrollHeight, behavior: thinking ? "auto" : "smooth" });
  }, [messages, thinking, activityFeed, briefingPrompt]);

  const disabled = busy;
  const empty = !messages.length && !thinking && !activityFeed?.lines.length && !briefingPrompt;
  const activeBundles = bundles?.length ? bundles : bundle ? [bundle] : [];

  return (
    <aside className="flex h-full w-full min-w-[300px] flex-col border-l border-vx-border bg-vx-analyst">
      <AnalystPanelHeader
        onDismiss={messages.length && onClearChat ? onClearChat : undefined}
      />
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={() => {
          const el = scrollRef.current;
          if (el) {
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          }
          onScroll?.(el?.scrollTop ?? 0);
        }}
      >
        {empty ? (
          <div className="flex h-full min-h-[200px] items-center justify-center px-2 text-center">
            <p className="max-w-[240px] text-[14px] leading-relaxed text-vx-muted">
              {!bundle && !activeBundles.length
                ? "Ask VAYNE anything about cybersecurity — or upload evidence to start an investigation."
                : activeBundles.length > 1
                  ? "Ask across all uploaded analyses — compare findings, paths, and evidence from every scan."
                  : "Ask why a finding was retained, how a path was validated, or what to fix first."}
            </p>
          </div>
        ) : null}

        <div className="space-y-3">
          {messages.map((msg, index) => (
            <div key={msg.id}>
              {index > 0 ? <AnalystMessageDivider /> : null}
              {msg.role === "user" ? (
                <UserMessage content={msg.content} />
              ) : (
                <AnalystMessage
                  content={msg.content}
                  streaming={msg.streaming}
                  fileInsights={resolveMessageFileInsights(msg, bundle, sourceLabels)}
                  revealedFileInsights={msg.revealedFileInsights}
                  streamSegments={msg.streamSegments}
                  revealedSegments={msg.revealedSegments}
                  segmentTexts={msg.segmentTexts}
                  activeThinking={msg.activeThinking}
                  workbench={
                    msg.id.startsWith("brief-analyst-") ? bundle?.workbench ?? undefined : undefined
                  }
                  uploadedFileCount={sourceLabels?.length}
                />
              )}
            </div>
          ))}
        </div>

        {activityFeed?.lines.length ? (
          <div className={cn(messages.length ? "mt-5" : "mt-0")}>
            <AnalystThinking feed={activityFeed} />
          </div>
        ) : null}

        {thinking && !activityFeed?.lines.length ? (
          <div className={cn(messages.length ? "mt-5" : "mt-0")}>
            <AnalystThinking step="Thinking" />
          </div>
        ) : null}

        {briefingPrompt && !thinking ? (
          <div className={cn("border border-white/20 bg-vx-app p-4", messages.length ? "mt-5" : "mt-0")}>
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/60">
              Evidence detected
            </p>
            <p className="mt-2 text-[14px] leading-relaxed text-white">
              {briefingPrompt.fileCount === 1
                ? "1 file analyzed."
                : `${briefingPrompt.fileCount} files analyzed.`}{" "}
              Want VAYNE to walk you through what it found?
            </p>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={onGetSummary}
                className={cn(
                  "inline-flex items-center border border-white/25 bg-vx-panel px-4 py-2",
                  "text-[11px] font-bold uppercase tracking-wider text-white/80 transition-colors",
                  "hover:border-white hover:text-white",
                )}
              >
                Get summary
              </button>
              <button
                type="button"
                onClick={onSkipSummary}
                className={cn(
                  "inline-flex items-center border border-transparent px-4 py-2",
                  "text-[11px] font-bold uppercase tracking-wider text-white/40 transition-colors",
                  "hover:text-white/70",
                )}
              >
                Skip
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 p-3">
        <AnalystComposer
          input={input}
          disabled={disabled}
          busy={busy}
          thinking={thinking}
          placeholder={
            bundle ? "Ask about findings, paths, evidence…" : "Ask VAYNE about cybersecurity…"
          }
          inputRef={inputRef}
          onInputChange={onInputChange}
          onAsk={onAsk}
        />
      </div>
    </aside>
  );
}
