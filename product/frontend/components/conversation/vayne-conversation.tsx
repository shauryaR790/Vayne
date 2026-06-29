"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Paperclip, ArrowUp } from "lucide-react";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";

import { analyzeFiles, API_BASE, checkHealth } from "@/lib/api";
import {
  ANALYST_OFFLINE_MESSAGE,
  streamAnalystChat,
  streamInvestigationBrief,
} from "@/lib/analyst-chat";
import { loadInvestigationBundle, type InvestigationBundle } from "@/lib/investigation-bundle";
import { investigationLinksFooter } from "@/lib/conversation-links";
import { saveRecentInvestigation, recentEntryFromBundle } from "@/lib/recent-investigations";
import { createRhythmStreamBatcher } from "@/lib/stream-buffer";
import { CONVERSATION_SHELL } from "@/lib/conversation-layout";
import { ACCEPTED_EXTENSIONS, validateUploadFiles } from "@/lib/upload";
import { ChatBubble } from "@/components/investigation/chat-bubble";
import { VayneThinking } from "@/components/shared/vayne-thinking";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

export function VayneConversation({
  resumeId,
}: {
  resumeId?: string | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [bundle, setBundle] = useState<InvestigationBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState(
    "VAYNE is reasoning about your environment",
  );
  const [backendOnline, setBackendOnline] = useState(false);
  const [error, setError] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const briefStartedRef = useRef(false);

  const beginStream = useCallback(() => {
    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;
    return controller.signal;
  }, []);

  const investigationId = bundle?.detail.summary.id;

  const updateMessage = useCallback((id: string, content: string, streaming: boolean) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      if (idx === -1) {
        return [...prev, { id, role: "assistant", content, streaming }];
      }
      return prev.map((m) => (m.id === id ? { ...m, content, streaming } : m));
    });
  }, []);

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    checkHealth().then(setBackendOnline);
  }, []);

  useEffect(() => {
    const streaming = messages.some((m) => m.streaming);
    scrollToBottom(!streaming);
  }, [messages, thinking, scrollToBottom]);

  const streamBrief = useCallback(
    async (invId: string, withLinks: boolean, signal?: AbortSignal) => {
      const streamId = `brief-${invId}`;
      const batcher = createRhythmStreamBatcher((text) => {
        setThinking(false);
        updateMessage(streamId, text, true);
      });

      setThinking(true);
      setThinkingLabel("I'm preparing your analysis");

      const finalize = (text: string) => {
        batcher.finish();
        setThinking(false);
        let out = text || ANALYST_OFFLINE_MESSAGE;
        if (withLinks) out += investigationLinksFooter(invId);
        updateMessage(streamId, out, false);
      };

      try {
        for await (const event of streamInvestigationBrief(invId, { signal })) {
          if (signal?.aborted) return;
          if (event.type === "thinking") {
            setThinking(true);
            continue;
          }
          if (event.type === "error") {
            const msg =
              event.code === "llm_offline" || event.code === "llm_not_configured"
                ? ANALYST_OFFLINE_MESSAGE
                : event.message;
            finalize(msg);
            return;
          }
          if (event.type === "token") {
            setThinking(false);
            batcher.append(event.token);
          }
          if (event.type === "done") break;
        }
      } catch {
        if (signal?.aborted) return;
        finalize(ANALYST_OFFLINE_MESSAGE);
        return;
      }

      if (signal?.aborted) return;
      finalize(batcher.text);
    },
    [updateMessage],
  );

  const loadInvestigation = useCallback(
    async (invId: string, userPrompt?: string) => {
      setBusy(true);
      setThinking(true);
      setThinkingLabel("VAYNE is reasoning about your environment");
      setError("");

      try {
        const data = await loadInvestigationBundle(invId);
        setBundle(data);
        saveRecentInvestigation(recentEntryFromBundle(data, userPrompt || invId));

        if (userPrompt) {
          setMessages((prev) => [
            ...prev,
            { id: `user-${Date.now()}`, role: "user", content: userPrompt },
          ]);
        }

        const signal = beginStream();
        await streamBrief(invId, true, signal);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setThinking(false);
      } finally {
        setBusy(false);
      }
    },
    [beginStream, streamBrief],
  );

  useEffect(() => {
    if (!resumeId || bundle || briefStartedRef.current) return;
    briefStartedRef.current = true;
    loadInvestigation(resumeId);
  }, [resumeId, bundle, loadInvestigation]);

  const streamReply = useCallback(
    async (question: string) => {
      if (!investigationId) return;

      const streamId = `reply-${Date.now()}`;
      const history = messages
        .filter((m) => !m.streaming)
        .map(({ role, content }) => ({ role, content }));

      setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: "user", content: question }]);
      setBusy(true);
      setThinking(true);
      setThinkingLabel("VAYNE is reasoning about your environment");

      const batcher = createRhythmStreamBatcher((text) => {
        setThinking(false);
        updateMessage(streamId, text, true);
      });
      let gotTokens = false;

      const signal = beginStream();

      try {
        for await (const event of streamAnalystChat(investigationId, question, history, {
          signal,
        })) {
          if (signal.aborted) return;
          if (event.type === "thinking") {
            setThinking(true);
            continue;
          }

          if (event.type === "error") {
            setThinking(false);
            batcher.finish();
            const offline =
              event.code === "llm_offline" ||
              event.code === "http_error" ||
              event.code === "llm_not_configured";
            updateMessage(
              streamId,
              offline ? ANALYST_OFFLINE_MESSAGE : event.message,
              false,
            );
            setBusy(false);
            return;
          }

          if (event.type === "token") {
            gotTokens = true;
            setThinking(false);
            batcher.append(event.token);
          }

          if (event.type === "done") break;
        }
      } catch {
        setThinking(false);
        batcher.finish();
        updateMessage(streamId, ANALYST_OFFLINE_MESSAGE, false);
        setBusy(false);
        return;
      }

      batcher.finish();
      setThinking(false);
      updateMessage(
        streamId,
        gotTokens ? batcher.text || ANALYST_OFFLINE_MESSAGE : ANALYST_OFFLINE_MESSAGE,
        false,
      );

      setBusy(false);
    },
    [beginStream, investigationId, messages, updateMessage],
  );

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (busy) return;

    if (bundle && text) {
      setInput("");
      await streamReply(text);
      return;
    }

    if (!files.length) {
      if (text) setError("Attach evidence first, then ask VAYNE to analyze it.");
      return;
    }

    const validation = validateUploadFiles(files);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    if (!backendOnline) {
      setError(`Backend offline (${API_BASE})`);
      return;
    }

    const prompt =
      text || `Analyze ${validation.files.map((f) => f.name).join(", ")}`;

    setInput("");
    setFiles([]);
    setBusy(true);
    setThinking(true);
    setThinkingLabel("I'm analyzing the uploaded evidence");
    setError("");

    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: "user", content: prompt }]);

    try {
      const label = validation.files.map((f) => f.name).join(", ");
      const result = await analyzeFiles(validation.files, label);
      const data = await loadInvestigationBundle(result.investigation_id);
      setBundle(data);
      saveRecentInvestigation(recentEntryFromBundle(data, label));
      setThinkingLabel("I'm preparing your analysis");
      const signal = beginStream();
      await streamBrief(result.investigation_id, true, signal);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setThinking(false);
    } finally {
      setBusy(false);
    }
  }, [backendOnline, beginStream, bundle, busy, files, input, streamBrief, streamReply]);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
    };
  }, []);

  const sessionActive =
    !!resumeId || !!bundle || messages.length > 0 || thinking || busy;

  const inputForm = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(",")}
        className="hidden"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          setFiles(picked);
          setError("");
        }}
      />

      <form
        className="flex items-end gap-2 rounded-[28px] border border-white/[0.12] bg-white/[0.05] p-2 shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/80 disabled:opacity-40"
          aria-label="Attach evidence"
        >
          <Paperclip className="size-5" strokeWidth={1.5} />
        </button>

        <div className="min-w-0 flex-1 py-1">
          {files.length > 0 && !bundle ? (
            <p className="mb-1.5 truncate px-1 text-[12px] text-white/38">
              {files.map((f) => f.name).join(", ")}
            </p>
          ) : null}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder={
              bundle
                ? "Ask VAYNE anything about this investigation…"
                : "Upload evidence or ask VAYNE to analyze a scan…"
            }
            rows={1}
            className="max-h-36 w-full resize-none bg-transparent px-1 text-[16px] leading-relaxed text-white outline-none placeholder:text-white/28 disabled:opacity-50"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
        </div>

        <button
          type="submit"
          disabled={busy || (!input.trim() && !files.length && !bundle)}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full transition-all",
            busy || (!input.trim() && !files.length && !bundle)
              ? "text-white/18"
              : "bg-white text-black hover:bg-white/92",
          )}
          aria-label="Send"
        >
          <ArrowUp className="size-5" strokeWidth={2} />
        </button>
      </form>
    </>
  );

  const statusMessages = (
    <>
      {error ? (
        <p className="mb-2 text-center text-[11px] text-white/45">{error}</p>
      ) : null}
      {!backendOnline && !busy ? (
        <p className="mb-2 text-center text-[11px] text-white/35">
          Backend offline — start the VAYNE API on port 8000
        </p>
      ) : null}
    </>
  );

  return (
    <LayoutGroup id="vayne-chat">
      <div className="relative flex h-[calc(100vh-0px)] flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto pb-32">
          <AnimatePresence>
            {!sessionActive ? (
              <motion.div
                key="hero"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.3 }}
                className="pointer-events-none flex min-h-[32vh] flex-col items-center justify-end px-4 pb-4 pt-24"
              >
                <div className="text-center">
                  <h1 className="text-3xl font-black tracking-tight text-white">VAYNE</h1>
                  <p className="mt-3 max-w-md text-[15px] text-white/45">
                    Upload evidence and talk to your security analyst.
                  </p>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {sessionActive ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35, delay: 0.08 }}
              className={`flex flex-col pt-10 ${CONVERSATION_SHELL}`}
            >
              {messages.map((msg) => (
                <ChatBubble
                  key={msg.id}
                  id={msg.id}
                  role={msg.role}
                  content={msg.content}
                  streaming={msg.streaming}
                />
              ))}
              {thinking ? <VayneThinking label={thinkingLabel} /> : null}
            </motion.div>
          ) : null}
        </div>

        {!sessionActive ? (
          <motion.div
            layoutId="vayne-input-bar"
            className={`absolute inset-x-0 top-1/2 z-20 -translate-y-1/2 ${CONVERSATION_SHELL}`}
            transition={{ type: "spring", stiffness: 400, damping: 38 }}
          >
            {statusMessages}
            {inputForm}
          </motion.div>
        ) : (
          <motion.div
            layoutId="vayne-input-bar"
            className="sticky bottom-0 z-20 shrink-0 bg-gradient-to-t from-black via-black/98 to-transparent pt-10"
            transition={{ type: "spring", stiffness: 400, damping: 38 }}
          >
            <div className={`pb-6 ${CONVERSATION_SHELL}`}>
              {statusMessages}
              {inputForm}
            </div>
          </motion.div>
        )}
      </div>
    </LayoutGroup>
  );
}
