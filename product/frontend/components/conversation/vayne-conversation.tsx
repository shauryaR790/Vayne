"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Paperclip, ArrowUp } from "lucide-react";
import { motion } from "motion/react";

import { analyzeFiles, API_BASE, checkHealth } from "@/lib/api";
import {
  ANALYST_OFFLINE_MESSAGE,
  streamAnalystChat,
  streamInvestigationBrief,
} from "@/lib/analyst-chat";
import { loadInvestigationBundle, type InvestigationBundle } from "@/lib/investigation-bundle";
import { investigationLinksFooter } from "@/lib/conversation-links";
import { saveRecentInvestigation, recentEntryFromBundle, extractSourceFile } from "@/lib/recent-investigations";
import { looksLikeFilename } from "@/lib/investigation-metadata";
import { createStreamBatcher } from "@/lib/stream-buffer";
import { CHAT_CONTAINER_CLASS } from "@/lib/conversation-layout";
import {
  loadConversationSession,
  saveConversationSession,
  clearConversationSession,
  type StoredChatMessage,
} from "@/lib/conversation-session";
import { ConversationHome } from "@/components/conversation/conversation-home";
import {
  ConversationQuickActions,
  type QuickActionId,
} from "@/components/conversation/conversation-quick-actions";
import { ACCEPTED_EXTENSIONS, validateUploadFiles } from "@/lib/upload";
import { ChatBubble } from "@/components/investigation/chat-bubble";
import { VayneThinking } from "@/components/shared/vayne-thinking";
import { cn } from "@/lib/utils";

interface ChatMessage extends StoredChatMessage {
  streaming?: boolean;
}

export function VayneConversation({
  resumeId,
}: {
  resumeId?: string | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [bundle, setBundle] = useState<InvestigationBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const briefStartedRef = useRef(false);
  const persistSkipRef = useRef(true);
  const skipResumeRef = useRef(false);

  const beginStream = useCallback(() => {
    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;
    return controller.signal;
  }, []);

  const investigationId = bundle?.detail.summary.id;

  const syncUrl = useCallback(
    (id: string | null) => {
      if (id) router.replace(`/?id=${id}`, { scroll: false });
      else router.replace("/", { scroll: false });
    },
    [router],
  );

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

  const persist = useCallback(
    (next?: {
      messages?: ChatMessage[];
      investigationId?: string | null;
      scrollTop?: number;
      inputDraft?: string;
    }) => {
      if (persistSkipRef.current) return;
      const invId = next?.investigationId !== undefined ? next.investigationId : investigationId ?? null;
      const msgs = (next?.messages ?? messages)
        .filter((m) => !m.streaming)
        .map(({ id, role, content }) => ({ id, role, content }));
      if (!invId && !msgs.length) return;
      saveConversationSession({
        investigationId: invId,
        messages: msgs,
        scrollTop: next?.scrollTop ?? scrollRef.current?.scrollTop ?? 0,
        inputDraft: next?.inputDraft ?? input,
        updatedAt: new Date().toISOString(),
      });
    },
    [investigationId, messages, input],
  );

  useEffect(() => {
    checkHealth().then(setBackendOnline);
    if (skipResumeRef.current) {
      persistSkipRef.current = false;
      setHydrated(true);
      return;
    }
    const session = loadConversationSession();
    const id = resumeId || session?.investigationId || null;
    if (session?.messages?.length) {
      setMessages(session.messages);
      setInput(session.inputDraft || "");
    }
    if (id && !resumeId) syncUrl(id);
    if (id && session?.messages?.length) {
      loadInvestigationBundle(id)
        .then(setBundle)
        .catch(() => null)
        .finally(() => {
          persistSkipRef.current = false;
          setHydrated(true);
          requestAnimationFrame(() => {
            if (session.scrollTop && scrollRef.current) {
              scrollRef.current.scrollTop = session.scrollTop;
            }
          });
        });
    } else {
      persistSkipRef.current = false;
      setHydrated(true);
    }
  }, [resumeId, syncUrl]);

  useEffect(() => {
    if (!hydrated) return;
    persist();
  }, [messages, investigationId, input, hydrated, persist]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (persistSkipRef.current) return;
      saveConversationSession({
        investigationId: investigationId ?? null,
        messages: messages.filter((m) => !m.streaming).map(({ id, role, content }) => ({ id, role, content })),
        scrollTop: el.scrollTop,
        inputDraft: input,
        updatedAt: new Date().toISOString(),
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [hydrated, investigationId, messages, input]);

  useEffect(() => {
    const streaming = messages.some((m) => m.streaming);
    scrollToBottom(!streaming);
  }, [messages, thinking, scrollToBottom]);

  const streamBrief = useCallback(
    async (invId: string, withLinks: boolean, signal?: AbortSignal) => {
      const streamId = `brief-${invId}`;
      const batcher = createStreamBatcher((text) => {
        setThinking(false);
        updateMessage(streamId, text, true);
      });

      setThinking(true);

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
          if (event.type === "thinking") continue;
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
    async (invId: string, userPrompt?: string, skipBrief = false) => {
      setBusy(true);
      setError("");
      syncUrl(invId);

      try {
        const data = await loadInvestigationBundle(invId);
        setBundle(data);
        saveRecentInvestigation(
          recentEntryFromBundle(
            data,
            looksLikeFilename(userPrompt) ? userPrompt : extractSourceFile(undefined, data.report),
          ),
        );

        if (userPrompt) {
          setMessages((prev) => {
            if (prev.some((m) => m.role === "user" && m.content === userPrompt)) return prev;
            return [...prev, { id: `user-${Date.now()}`, role: "user", content: userPrompt }];
          });
        }

        const hasBrief = messages.some((m) => m.id === `brief-${invId}`);
        if (!skipBrief && !hasBrief) {
          setThinking(true);
          const signal = beginStream();
          await streamBrief(invId, true, signal);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setThinking(false);
      } finally {
        setBusy(false);
      }
    },
    [beginStream, messages, streamBrief, syncUrl],
  );

  useEffect(() => {
    if (!resumeId) {
      skipResumeRef.current = false;
      if (!messages.length && !bundle) {
        persistSkipRef.current = false;
      }
      return;
    }
    if (skipResumeRef.current || bundle || briefStartedRef.current) return;
    briefStartedRef.current = true;
    const session = loadConversationSession();
    const hasHistory = session?.investigationId === resumeId && (session.messages?.length ?? 0) > 0;
    loadInvestigation(resumeId, undefined, hasHistory);
  }, [resumeId, bundle, loadInvestigation, messages.length]);

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

      const batcher = createStreamBatcher((text) => {
        setThinking(false);
        updateMessage(streamId, text, true);
      });
      let gotTokens = false;

      const signal = beginStream();

      try {
        for await (const event of streamAnalystChat(investigationId, question, history, { signal })) {
          if (signal.aborted) return;
          if (event.type === "thinking") continue;

          if (event.type === "error") {
            setThinking(false);
            batcher.finish();
            const offline =
              event.code === "llm_offline" ||
              event.code === "http_error" ||
              event.code === "llm_not_configured";
            updateMessage(streamId, offline ? ANALYST_OFFLINE_MESSAGE : event.message, false);
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
    setError("");

    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: "user", content: prompt }]);

    try {
      const label = validation.files.map((f) => f.name).join(", ");
      const result = await analyzeFiles(validation.files, label);
      const data = await loadInvestigationBundle(result.investigation_id);
      setBundle(data);
      saveRecentInvestigation(recentEntryFromBundle(data, label));
      syncUrl(result.investigation_id);
      const signal = beginStream();
      await streamBrief(result.investigation_id, true, signal);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setThinking(false);
    } finally {
      setBusy(false);
    }
  }, [backendOnline, beginStream, bundle, busy, files, input, streamBrief, streamReply, syncUrl]);

  useEffect(() => {
    const onNewChat = () => {
      streamAbortRef.current?.abort();
      persistSkipRef.current = true;
      skipResumeRef.current = true;
      briefStartedRef.current = false;
      setMessages([]);
      setInput("");
      setFiles([]);
      setBundle(null);
      setBusy(false);
      setThinking(false);
      setError("");
      clearConversationSession();
      router.replace("/", { scroll: false });
    };
    window.addEventListener("vayne:new-chat", onNewChat);
    return () => window.removeEventListener("vayne:new-chat", onNewChat);
  }, [router]);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
    };
  }, []);

  const sessionActive =
    messages.length > 0 || !!bundle || thinking || busy;

  const handleQuickAction = useCallback(
    (id: QuickActionId) => {
      if (busy) return;
      setError("");
      if (id === "analyze") {
        fileInputRef.current?.click();
        return;
      }
      if (id === "paths") {
        setInput(
          "Find the most critical attack paths in this environment and explain how an attacker would chain them.",
        );
        return;
      }
      setInput(
        "Prepare an executive report summarizing business risk, critical findings, and prioritized remediation.",
      );
    },
    [busy],
  );

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
        className={cn(
          "flex w-full items-end gap-2 rounded-[28px] border border-white/[0.14] bg-[#141414] p-2.5",
          "shadow-[0_2px_24px_rgba(0,0,0,0.35)]",
          "transition-colors hover:border-white/20 focus-within:border-white/24",
        )}
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
            <p className="mb-1 truncate px-1 text-[12px] text-white/38">
              {files.map((f) => f.name).join(", ")}
            </p>
          ) : null}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder="Upload evidence or ask VAYNE to analyze a scan..."
            rows={1}
            className="max-h-32 w-full resize-none bg-transparent px-1 text-[16px] leading-relaxed text-white outline-none placeholder:text-white/28 disabled:opacity-50"
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
      {error ? <p className="mb-2 text-center text-[11px] text-white/45">{error}</p> : null}
      {!backendOnline && !busy ? (
        <p className="mb-2 text-center text-[11px] text-white/35">
          Backend offline — start the VAYNE API on port 8000
        </p>
      ) : null}
    </>
  );

  if (!sessionActive) {
    return (
      <ConversationHome
        quickActions={
          <ConversationQuickActions onAction={handleQuickAction} disabled={busy} />
        }
      >
        {statusMessages}
        {inputForm}
      </ConversationHome>
    );
  }

  return (
    <div className="relative flex h-[calc(100vh-0px)] flex-col">
      <header className="flex items-center justify-between px-6 py-4 lg:px-8">
        <span className="text-[13px] font-semibold tracking-[0.14em] text-white/70">VAYNE</span>
        <button
          type="button"
          className="flex size-9 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70"
          aria-label="Menu"
        >
          <MoreHorizontal className="size-5" strokeWidth={1.5} />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-24">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`flex flex-col pt-2 ${CHAT_CONTAINER_CLASS}`}
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
          {thinking ? <VayneThinking /> : null}
        </motion.div>
      </div>

      <div className="sticky bottom-0 z-20 shrink-0 bg-gradient-to-t from-black via-black/95 to-transparent pt-6">
        <div className={`pb-5 ${CHAT_CONTAINER_CLASS}`}>
          {statusMessages}
          {inputForm}
        </div>
      </div>
    </div>
  );
}
