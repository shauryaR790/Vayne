"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { InvestigationBundle } from "@/lib/investigation-bundle";
import {
  ANALYST_OFFLINE_MESSAGE,
  ANALYST_PRESETS,
  fetchAnalystStatus,
  sanitizeChatHistory,
  streamAnalystChat,
  type AnalystStatus,
  type ReportMode,
} from "@/lib/analyst-chat";
import type { ChatTurn } from "@/lib/vayne-analyst";
import { createStreamBatcher } from "@/lib/stream-buffer";
import { HoverCard } from "@/components/shared/hover-card";
import { VayneThinking } from "@/components/shared/vayne-thinking";
import { ChatBubble } from "@/components/investigation/chat-bubble";
import { cn } from "@/lib/utils";

interface DisplayMessage extends ChatTurn {
  id: string;
  streaming?: boolean;
}

type UsageStats = {
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  cached?: boolean;
};

export function AskVaynePanel({
  bundle,
  registerAsk,
  chatOnly = false,
  compact = false,
}: {
  bundle: InvestigationBundle;
  registerAsk?: (ask: (question: string, reportMode?: ReportMode, presetId?: string) => void) => void;
  chatOnly?: boolean;
  compact?: boolean;
}) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [reasoning, setReasoning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [analystStatus, setAnalystStatus] = useState<AnalystStatus | null>(null);
  const [lastUsage, setLastUsage] = useState<UsageStats | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamAbort = useRef(false);

  const investigationId = bundle.detail.summary.id;
  const showDevStats = process.env.NODE_ENV === "development";

  useEffect(() => {
    fetchAnalystStatus().then(setAnalystStatus);
  }, []);

  const updateStreamMessage = useCallback((id: string, content: string, streaming: boolean) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content, streaming } : m)),
    );
  }, []);

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    const streaming = messages.some((m) => m.streaming);
    scrollToBottom(!streaming);
  }, [messages, reasoning, scrollToBottom]);

  const streamReply = useCallback(
    async (question: string, history: ChatTurn[], reportMode?: ReportMode, presetId?: string) => {
      setBusy(true);
      setReasoning(true);

      const streamId = `stream-${Date.now()}`;
      let gotTokens = false;
      let streamMessageId: string | null = null;

      const batcher = createStreamBatcher((text) => {
        updateStreamMessage(streamId, text, true);
      });

      try {
        for await (const event of streamAnalystChat(investigationId, question, history, {
          reportMode,
          presetId,
        })) {
          if (streamAbort.current) return;

          if (event.type === "thinking") continue;

          if (event.type === "error") {
            setReasoning(false);
            batcher.finish();
            const offline =
              event.code === "llm_offline" ||
              event.code === "http_error" ||
              event.code === "llm_not_configured";
            setMessages((prev) => [
              ...prev,
              {
                id: streamId,
                role: "assistant",
                content: offline ? ANALYST_OFFLINE_MESSAGE : event.message,
              },
            ]);
            setAnalystStatus((s) => (s ? { ...s, online: false } : s));
            setBusy(false);
            return;
          }

          if (event.type === "token") {
            if (!gotTokens) {
              gotTokens = true;
              setReasoning(false);
              streamMessageId = streamId;
              setMessages((prev) => [
                ...prev,
                { id: streamId, role: "assistant", content: "", streaming: true },
              ]);
              setAnalystStatus((s) => (s ? { ...s, online: true } : s));
            }
            batcher.append(event.token);
          }

          if (event.type === "usage") {
            setLastUsage({
              prompt_tokens: event.prompt_tokens,
              completion_tokens: event.completion_tokens,
              cost_usd: event.cost_usd,
              cached: event.cached,
            });
          }

          if (event.type === "done") break;
        }
      } catch {
        setReasoning(false);
        batcher.finish();
        updateStreamMessage(streamId, ANALYST_OFFLINE_MESSAGE, false);
        setBusy(false);
        return;
      }

      batcher.finish();
      const finalText = batcher.text;

      if (!gotTokens && !streamAbort.current) {
        setMessages((prev) => [
          ...prev,
          { id: streamId, role: "assistant", content: ANALYST_OFFLINE_MESSAGE },
        ]);
      } else if (gotTokens && streamMessageId) {
        updateStreamMessage(streamMessageId, finalText, false);
      }

      setBusy(false);
    },
    [investigationId, updateStreamMessage],
  );

  const ask = useCallback(
    async (question: string, reportMode?: ReportMode, presetId?: string) => {
      const q = question.trim();
      if (!q || busy) return;

      const history: ChatTurn[] = sanitizeChatHistory(messages);

      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: "user", content: q },
      ]);
      setInput("");

      await streamReply(q, history, reportMode, presetId);
    },
    [busy, messages, streamReply],
  );

  useEffect(() => {
    registerAsk?.((question) => ask(question));
  }, [ask, registerAsk]);

  const statusLabel = analystStatus?.online
    ? `VAYNE analyst · ${analystStatus.model}`
    : analystStatus?.configured === false
      ? "Analyst not configured"
      : "Analyst unavailable · engine operational";

  return (
    <HoverCard as="section" className="scroll-mt-6" lift={false}>
      <div className="border-b border-white/20 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[12px] font-bold uppercase tracking-[0.15em]">
              {compact ? "Ask VAYNE anything" : chatOnly ? "Ask VAYNE" : "Investigation Chat"}
            </h2>
            {!compact ? (
              <p className="mt-1 text-[10px] text-white/40">
                AI security analyst — explains engine output only
              </p>
            ) : null}
          </div>
          <span
            className={cn(
              "border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em]",
              analystStatus?.online
                ? "border-white/40 text-white/70"
                : "border-white/20 text-white/40",
            )}
          >
            {statusLabel}
          </span>
        </div>
      </div>

      {!compact ? (
        <div className="flex flex-wrap gap-2 border-b border-white/15 px-6 py-4">
          {ANALYST_PRESETS.map((preset) => (
            <HoverCard
              key={preset.id}
              as="button"
              disabled={busy}
              onClick={() => ask(preset.prompt, preset.reportMode, preset.id)}
              className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/65 disabled:opacity-40"
            >
              {preset.label}
            </HoverCard>
          ))}
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className={cn(
          "overflow-y-auto space-y-5 px-6 py-5",
          compact ? "h-[320px]" : "h-[400px]",
        )}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <ChatBubble
              id={msg.id}
              role={msg.role}
              content={msg.content}
              streaming={msg.streaming}
            />
          </div>
        ))}

        {reasoning ? (
          <div className="flex justify-start">
            <HoverCard lift={false} className="px-4 py-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/35">VAYNE</p>
              <div className="mt-2">
                <VayneThinking />
              </div>
            </HoverCard>
          </div>
        ) : null}
      </div>

      {showDevStats && lastUsage ? (
        <div className="border-t border-white/10 px-6 py-2 font-mono text-[10px] text-white/35">
          LLM Cost: ${lastUsage.cost_usd.toFixed(4)}
          {lastUsage.cached ? " (cached)" : ""} · Prompt: {lastUsage.prompt_tokens} tokens · Output:{" "}
          {lastUsage.completion_tokens} tokens
        </div>
      ) : null}

      <form
        className="flex gap-2 border-t border-white/20 px-6 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          type="text"
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            compact
              ? "Ask VAYNE anything…"
              : "Ask about findings, paths, rejections, remediation…"
          }
          className="min-w-0 flex-1 border border-white bg-black px-4 py-3 text-[13px] text-white outline-none placeholder:text-white/35 focus:bg-white/5 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || busy}
          className="shrink-0 border border-white bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-black transition-colors hover:bg-background hover:text-white disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </HoverCard>
  );
}
