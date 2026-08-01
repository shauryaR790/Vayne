"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";

import { analyzeFiles, checkHealth } from "@/lib/api";
import {
  fetchEngineTrace,
  streamAnalyzeWithTrace,
  type EngineTraceEvent,
} from "@/lib/engine-trace";
import {
  ANALYST_OFFLINE_MESSAGE,
  ANALYST_QUOTA_MESSAGE,
  FREE_TIER_CHAT_LIMIT,
  fetchAnalystStatus,
  fetchChatQuota,
  sanitizeChatHistory,
  streamAnalystChat,
  streamGeneralChat,
} from "@/lib/analyst-chat";
import {
  loadInvestigationBundle,
  subscribeInvestigationBundle,
  type InvestigationBundle,
} from "@/lib/investigation-bundle";
import { saveRecentInvestigation, recentEntryFromBundle } from "@/lib/recent-investigations";
import { createRhythmStreamBatcher } from "@/lib/stream-buffer";
import { sleep } from "@/lib/text-reveal";
import {
  clearConversationSession,
  OPEN_INVESTIGATION_EVENT,
  materializeAnalystMessages,
  saveConversationSession,
  serializeMessages,
  type StoredChatMessage,
} from "@/lib/conversation-session";
import {
  buildInvestigationSessionFromBundle,
  findSessionForInvestigation,
  getActiveInvestigationId,
  migrateLegacyConversationSession,
  notifyInvestigationLoaded,
  patchInvestigationSessionTrace,
  loadCachedEngineTrace,
  rebuildInvestigationSession,
  saveInvestigationSession,
  sessionStorageKeyFromState,
  setActiveInvestigationId,
} from "@/lib/investigation-session";
import {
  defaultInvestigationMode,
  resolveInvestigationMode,
  type InvestigationMode,
} from "@/lib/investigation-mode";
import { attachmentsFromFiles } from "@/lib/multi-investigation-message";
import { buildAnalystBriefingMessages, interpretAnalystQuestion } from "@/lib/analyst-briefing";
import { streamAnalystBriefing } from "@/lib/analyst-stream";
import {
  advanceActivityFeed,
  buildChatActivityScript,
  initActivityFeed,
  type AgentActivityFeed,
} from "@/lib/analyst-activity";
import { ensureEngineMessages } from "@/lib/engine-messages";
import {
  combinedAnalystIntro,
  detectOverlappingAssets,
  separateAnalystIntro,
} from "@/lib/investigation-presentation";
import { validateUploadFiles } from "@/lib/upload";
import { analysisPromptForFiles } from "@/lib/staged-files-summary";
import { VaneSidebar } from "@/components/workspace/vane-sidebar";
import { VaneEnginePanel } from "@/components/workspace/vane-engine-panel";
import { VaneAnalystPanel } from "@/components/workspace/vane-analyst-panel";
import { EngineTracePanel } from "@/components/workspace/engine-trace-panel";
import {
  SwappablePanelRow,
  WorkspacePanelOrderProvider,
} from "@/components/workspace/swappable-panels";
import { MobileWorkspaceHeader } from "@/components/workspace/mobile-workspace-chrome";
import {
  InvestigationReportAskProvider,
  buildSectionAskPrompt,
} from "@/components/workspace/investigation-report-ask";
import { CommandPalette } from "@/components/workspace/home/command-palette";
import { useCommandPaletteItems } from "@/components/workspace/home/use-command-palette-items";
import { WorkspaceShortcutsOverlay } from "@/components/workspace/workspace-shortcuts-overlay";
import { useWorkspaceKeyboard } from "@/components/workspace/use-workspace-keyboard";
import { ANALYST_NAME, LOG_PREFIX } from "@/lib/brand";
import { useIsLgUp } from "@/lib/use-media-query";
import { ResetWorkspaceBootstrap } from "@/components/dev/reset-workspace-bootstrap";

import { describeAnalyzeError, sanitizeUserMessage, USER_MESSAGES } from "@/lib/user-messages";

interface ChatMessage extends StoredChatMessage {
  streaming?: boolean;
}

interface AnalystMessage extends StoredChatMessage {
  streaming?: boolean;
}

export function VaneWorkspace({
  resumeId,
}: {
  resumeId?: string | null;
}) {
  const router = useRouter();
  const isLgUp = useIsLgUp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [analystMessages, setAnalystMessages] = useState<AnalystMessage[]>([]);
  const [analystInput, setAnalystInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [bundle, setBundle] = useState<InvestigationBundle | null>(null);
  const [investigationBundles, setInvestigationBundles] = useState<InvestigationBundle[]>([]);
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [activityFeed, setActivityFeed] = useState<AgentActivityFeed | null>(null);
  const [backendOnline, setBackendOnline] = useState(false);
  const [analystOnline, setAnalystOnline] = useState(false);
  const [error, setError] = useState("");
  const [investigationMode, setInvestigationMode] = useState<InvestigationMode>("combined");
  const [modeExplicit, setModeExplicit] = useState(false);
  const [investigationGroupId, setInvestigationGroupId] = useState<string | null>(null);
  const [investigationIds, setInvestigationIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [enginePhase, setEnginePhase] = useState<"idle" | "running" | "complete">("idle");
  const [engineTraceEvents, setEngineTraceEvents] = useState<EngineTraceEvent[]>([]);
  const [engineTraceOpen, setEngineTraceOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [investigationSessionActive, setInvestigationSessionActive] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileAnalystOpen, setMobileAnalystOpen] = useState(false);
  const [chatQuotaRemaining, setChatQuotaRemaining] = useState<number | null>(FREE_TIER_CHAT_LIMIT);
  const [briefingPrompt, setBriefingPrompt] = useState<{
    messages: StoredChatMessage[];
    fileCount: number;
  } | null>(null);

  useEffect(() => {
    if (files.length <= 1) {
      setModeExplicit(false);
      setInvestigationMode("combined");
      return;
    }
    if (!modeExplicit) {
      setInvestigationMode(defaultInvestigationMode(files.length, ""));
    }
  }, [files.length, modeExplicit]);

  const handleInvestigationModeChange = useCallback((mode: InvestigationMode) => {
    setInvestigationMode(mode);
    setModeExplicit(true);
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const engineStickRef = useRef(false);
  const analystInputRef = useRef<HTMLTextAreaElement>(null);
  const analystScrollTopRef = useRef(0);
  const streamAbortRef = useRef<AbortController | null>(null);
  const briefingAbortRef = useRef<AbortController | null>(null);
  const persistSkipRef = useRef(true);
  const skipResumeRef = useRef(false);
  const switchingRef = useRef<string | null>(null);
  const loadedResumeIdRef = useRef<string | null>(null);
  const skipAutoScrollRef = useRef(false);
  const filesRef = useRef<File[]>([]);
  const analyzingRef = useRef(false);
  /** Re-run analyze once the API finishes cold-start after an offline ingest. */
  const retryAnalyzeWhenOnlineRef = useRef(false);
  filesRef.current = files;

  const beginStream = useCallback(() => {
    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;
    return controller.signal;
  }, []);

  const investigationId = bundle?.detail.summary.id;

  useEffect(() => {
    const id = investigationIds[0];
    if (!id || !investigationSessionActive) return;
    const unsubscribe = subscribeInvestigationBundle(id, setBundle);
    void loadInvestigationBundle(id);
    return unsubscribe;
  }, [investigationIds, investigationSessionActive]);

  const syncUrl = useCallback((id: string | null) => {
    // Update the URL bar WITHOUT a router navigation. `router.replace` triggers
    // a soft navigation that re-suspends useSearchParams() in HomeCanvas, which
    // flickers (and can remount + reload from session). history.replaceState
    // keeps the in-memory investigation/chat state intact.
    if (typeof window === "undefined") return;
    const url = id ? `/?id=${id}` : "/";
    window.history.replaceState(window.history.state, "", url);
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
      investigationGroupId?: string | null;
      investigationIds?: string[];
      investigationMode?: InvestigationMode;
      scrollTop?: number;
      analystScrollTop?: number;
      analystInputDraft?: string;
      analystMessages?: AnalystMessage[];
      bundle?: InvestigationBundle | null;
      engineTraceEvents?: EngineTraceEvent[];
    }) => {
      if (persistSkipRef.current) return;

      const invId = next?.investigationId !== undefined ? next.investigationId : investigationId ?? null;
      const groupId =
        next?.investigationGroupId !== undefined ? next.investigationGroupId : investigationGroupId;
      const ids = next?.investigationIds ?? investigationIds;
      const msgs = serializeMessages(next?.messages ?? messages);
      const analystMsgs = serializeMessages(next?.analystMessages ?? analystMessages);
      const activeBundle = next?.bundle !== undefined ? next.bundle : bundle;
      const traceEvents = next?.engineTraceEvents ?? engineTraceEvents;

      const sessionKey = sessionStorageKeyFromState({
        investigationId: invId,
        investigationGroupId: groupId,
        investigationIds: ids,
      });
      if (!sessionKey && !msgs.length) return;

      const legacyPayload = {
        investigationId: invId,
        investigationGroupId: groupId,
        investigationIds: ids,
        investigationMode: next?.investigationMode ?? investigationMode,
        messages: msgs,
        scrollTop: next?.scrollTop ?? scrollRef.current?.scrollTop ?? 0,
        inputDraft: "",
        updatedAt: new Date().toISOString(),
      };
      saveConversationSession(legacyPayload);

      if (!activeBundle || !sessionKey) {
        if (sessionKey && traceEvents.length) {
          patchInvestigationSessionTrace(sessionKey, traceEvents as Record<string, unknown>[]);
        }
        return;
      }

      saveInvestigationSession(
        buildInvestigationSessionFromBundle(activeBundle, {
          messages: msgs,
          analystMessages: analystMsgs,
          investigationGroupId: groupId,
          investigationIds: ids,
          investigationMode: next?.investigationMode ?? investigationMode,
          scrollTop: legacyPayload.scrollTop,
          analystScrollTop: next?.analystScrollTop ?? analystScrollTopRef.current,
          inputDraft: "",
          analystInputDraft: next?.analystInputDraft ?? analystInput,
          sessionId: sessionKey,
          engineTraceEvents: traceEvents as Record<string, unknown>[],
        }),
      );
    },
    [
      analystInput,
      analystMessages,
      bundle,
      engineTraceEvents,
      investigationGroupId,
      investigationId,
      investigationIds,
      investigationMode,
      messages,
    ],
  );

  const playAnalystBriefing = useCallback(async (briefingMessages: StoredChatMessage[]) => {
    briefingAbortRef.current?.abort();
    const controller = new AbortController();
    briefingAbortRef.current = controller;

    try {
      await streamAnalystBriefing(
        briefingMessages,
        (updater) => setAnalystMessages((prev) => updater(prev)),
        {
          signal: controller.signal,
          inlineOnly: true,
        },
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      throw error;
    }
  }, []);

  const switchToInvestigation = useCallback(
    async (invId: string) => {
      if (analyzingRef.current) return;
      if (switchingRef.current === invId) return;
      switchingRef.current = invId;

      // Flush the active session chat before tear-down so history reopen keeps Ask VAYNE.
      if (!persistSkipRef.current) {
        persist();
      }

      loadedResumeIdRef.current = invId;

      streamAbortRef.current?.abort();
      briefingAbortRef.current?.abort();
      persistSkipRef.current = true;

      setActivityFeed(null);
      setAnalystInput("");
      setFiles([]);
      setInvestigationMode("combined");
      setModeExplicit(false);
      setThinking(false);
      // History / resume always lands on the Engine workstation (Attention Queue),
      // not the full Investigation Workspace report. Trace events fill in async.
      setEnginePhase("complete");
      setEngineTraceOpen(true);
      setError("");
      setBriefingPrompt(null);
      setInvestigationSessionActive(true);
      setBusy(true);

      try {
        migrateLegacyConversationSession();

        let session = findSessionForInvestigation(invId);
        if (!session) {
          session = await rebuildInvestigationSession(invId);
          saveInvestigationSession(session);
        }

        const bundleIds = session.investigationIds?.length
          ? session.investigationIds
          : [invId];
        const sourceLabels = session.files.map((file) => file.name);
        const engineMessages = ensureEngineMessages(session.messages, bundleIds, {
          investigationGroupId: session.investigationGroupId ?? null,
          sourceLabels,
        });
        const restoredAnalyst = materializeAnalystMessages(session.analystMessages ?? []);

        setMessages(engineMessages);
        setAnalystMessages(restoredAnalyst);
        setAnalystInput(session.analystInputDraft ?? "");
        analystScrollTopRef.current = session.analystScrollTop ?? 0;
        setInvestigationGroupId(session.investigationGroupId ?? null);
        setInvestigationIds(bundleIds);
        if (session.investigationMode) {
          setInvestigationMode(session.investigationMode);
          setModeExplicit(true);
        }
        // Restore Trace before/with other state so refresh never flashes Boot/standby.
        const cachedTrace = [
          ...((session.engineTraceEvents ?? []) as EngineTraceEvent[]),
          ...(loadCachedEngineTrace(session.id) as EngineTraceEvent[]),
          ...(loadCachedEngineTrace(invId) as EngineTraceEvent[]),
          ...bundleIds.flatMap((id) => loadCachedEngineTrace(id) as EngineTraceEvent[]),
        ];
        // De-dupe by JSON identity while preserving order.
        const seenTrace = new Set<string>();
        const uniqueCachedTrace = cachedTrace.filter((ev) => {
          const key = JSON.stringify(ev);
          if (seenTrace.has(key)) return false;
          seenTrace.add(key);
          return true;
        });
        setEngineTraceEvents(uniqueCachedTrace);

        setActiveInvestigationId(session.id);
        syncUrl(invId);
        persistSkipRef.current = false;
        setHydrated(true);
        notifyInvestigationLoaded(session.id);
        setBusy(false);
        setEnginePhase("complete");
        setEngineTraceOpen(true);

        skipAutoScrollRef.current = true;
        requestAnimationFrame(() => {
          if (session.scrollTop && scrollRef.current) {
            scrollRef.current.scrollTop = session.scrollTop;
          } else {
            scrollToBottom(false);
          }
          skipAutoScrollRef.current = false;
        });

        // Restore Engine Trace telemetry for the dock + Attention Queue cards.
        void Promise.all(bundleIds.map((id) => fetchEngineTrace(id)))
          .then((traces) => {
            if (loadedResumeIdRef.current !== invId) return;
            const merged = traces.flat();
            const next = merged.length ? merged : uniqueCachedTrace;
            if (next.length) {
              setEngineTraceEvents(next);
              patchInvestigationSessionTrace(session.id, next as Record<string, unknown>[]);
              for (const id of bundleIds) {
                patchInvestigationSessionTrace(id, next as Record<string, unknown>[]);
              }
            }
            setEnginePhase("complete");
            setEngineTraceOpen(true);
          })
          .catch(() => {
            if (loadedResumeIdRef.current !== invId) return;
            if (uniqueCachedTrace.length) setEngineTraceEvents(uniqueCachedTrace);
            setEnginePhase("complete");
            setEngineTraceOpen(true);
          });

        void Promise.all(bundleIds.map((id) => loadInvestigationBundle(id)))
          .then((loadedBundles) => {
            if (loadedResumeIdRef.current !== invId) return;
            setInvestigationBundles(loadedBundles);
            setBundle(loadedBundles[0] ?? null);
            for (const row of loadedBundles) {
              saveRecentInvestigation(
                recentEntryFromBundle(
                  row,
                  session.files[0]?.name || row.report.target?.split(/[/\\]/).pop(),
                ),
              );
            }
            // Never re-stream Ask VAYNE on history navigation — chat should already be there.
            // If somehow empty (legacy session), materialize the briefing instantly with no typewriter.
            if (!restoredAnalyst.length && loadedBundles.length) {
              const briefing = buildAnalystBriefingMessages(loadedBundles, {
                sourceLabels: session.files.map((f) => f.name),
              });
              setAnalystMessages(materializeAnalystMessages(briefing));
            }
          })
          .catch(() => {
            // Inline report components surface load failures in the workspace.
          });
      } catch (e) {
        setMessages([]);
        setAnalystMessages([]);
        setBundle(null);
        setEngineTraceEvents([]);
        setEnginePhase("idle");
        setEngineTraceOpen(false);
        setError(sanitizeUserMessage(e instanceof Error ? e.message : String(e)));
        setBusy(false);
      } finally {
        if (switchingRef.current === invId) switchingRef.current = null;
      }
    },
    [persist, scrollToBottom, syncUrl],
  );

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const ok = await checkHealth();
      if (!cancelled) setBackendOnline(ok);
    };

    void poll();
    const pollId = window.setInterval(() => void poll(), 4000);
    void fetchAnalystStatus().then((status) => {
      if (!cancelled) setAnalystOnline(Boolean(status?.online));
    });
    void fetchChatQuota().then((quota) => {
      if (!cancelled && quota) setChatQuotaRemaining(quota.remaining);
    });
    migrateLegacyConversationSession();

    if (skipResumeRef.current) {
      persistSkipRef.current = false;
      setHydrated(true);
      skipResumeRef.current = false;
      return () => {
        cancelled = true;
        window.clearInterval(pollId);
      };
    }

    if (analyzingRef.current) {
      return () => {
        cancelled = true;
        window.clearInterval(pollId);
      };
    }

    if (resumeId) {
      if (loadedResumeIdRef.current === resumeId && hydrated) {
        return () => {
          cancelled = true;
          window.clearInterval(pollId);
        };
      }
      loadedResumeIdRef.current = resumeId;
      void switchToInvestigation(resumeId);
      return () => {
        cancelled = true;
        window.clearInterval(pollId);
      };
    }

    if (!resumeId && !analyzingRef.current) {
      loadedResumeIdRef.current = null;
    }
    if (!hydrated) {
      persistSkipRef.current = false;
      setHydrated(true);
    }

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [resumeId, switchToInvestigation, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    persist();
  }, [messages, analystMessages, investigationId, analystInput, hydrated, persist]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      // Track whether the reader is parked at the bottom; only then do we keep
      // following new content. Scrolling up disables the auto-follow.
      engineStickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      if (persistSkipRef.current) return;
      persist({ scrollTop: el.scrollTop });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [hydrated, persist]);

  useEffect(() => {
    if (skipAutoScrollRef.current) return;
    if (!engineStickRef.current) return;
    const streaming =
      messages.some((m) => m.streaming) || analystMessages.some((m) => m.streaming);
    if (!streaming) return;
    scrollToBottom(!streaming);
  }, [messages, analystMessages, thinking, enginePhase, scrollToBottom]);

  const pushInvestigationMessage = useCallback(
    (message: StoredChatMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
    },
    [],
  );

  const updateAnalystMessage = useCallback((id: string, content: string, streaming: boolean) => {
    setAnalystMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      if (idx === -1) {
        return [...prev, { id, role: "assistant", content, streaming }];
      }
      return prev.map((m) => (m.id === id ? { ...m, content, streaming } : m));
    });
  }, []);

  const streamReply = useCallback(
    async (question: string) => {
      if (chatQuotaRemaining !== null && chatQuotaRemaining <= 0) {
        const streamId = `quota-${Date.now()}`;
        setAnalystMessages((prev) => [
          ...prev,
          { id: `user-${Date.now()}`, role: "user", content: question },
          { id: streamId, role: "assistant", content: ANALYST_QUOTA_MESSAGE },
        ]);
        setAnalystInput("");
        return;
      }

      const streamId = `reply-${Date.now()}`;
      const history = sanitizeChatHistory(analystMessages);

      setAnalystMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: "user", content: question },
      ]);
      setAnalystInput("");

      // The live LLM answers every question (cybersecurity in general, the
      // uploaded scan, or this investigation). The deterministic workbench
      // reconstruction is kept only as an offline fallback (see error handler).
      setBusy(true);
      setThinking(true);

      const chatScript = buildChatActivityScript(question, bundle);
      let feed = initActivityFeed(chatScript, {
        title: question.length > 52 ? `${question.slice(0, 49)}…` : question,
        subtitle: ANALYST_NAME,
        waitingLabel: "Waiting for analyst model",
      });
      setActivityFeed(feed);

      const thinkStartedAt = Date.now();
      const minThinkMs = 1400;

      let activityStep = 0;
      const stepTimer = window.setInterval(() => {
        activityStep += 1;
        if (activityStep >= chatScript.length) return;
        feed = advanceActivityFeed(feed, chatScript, activityStep);
        setActivityFeed({ ...feed });
      }, 880);

      const batcher = createRhythmStreamBatcher(
        (text) => {
          window.clearInterval(stepTimer);
          setActivityFeed(null);
          setThinking(false);
          updateAnalystMessage(streamId, text, true);
        },
        { pauseMs: 175 },
      );
      let gotTokens = false;

      const signal = beginStream();
      // With an investigation loaded, chat is grounded in its context; with an
      // empty workspace, VAYNE answers general cybersecurity questions.
      const stream = investigationId
        ? streamAnalystChat(investigationId, question, history, { signal })
        : streamGeneralChat(question, history, { signal });

      try {
        for await (const event of stream) {
          if (signal.aborted) return;
          if (event.type === "thinking") continue;

          if (event.type === "error") {
            window.clearInterval(stepTimer);
            setActivityFeed(null);
            setThinking(false);
            batcher.finish();
            if (event.code === "quota_exceeded") {
              setChatQuotaRemaining(0);
              updateAnalystMessage(streamId, event.message || ANALYST_QUOTA_MESSAGE, false);
              setBusy(false);
              return;
            }
            const offline =
              event.code === "llm_offline" ||
              event.code === "http_error" ||
              event.code === "llm_not_configured";
            // Offline only: fall back to deterministic workbench reconstruction
            // when it can answer, otherwise the offline notice.
            const fallback = offline
              ? interpretAnalystQuestion(question, bundle?.workbench) ?? ANALYST_OFFLINE_MESSAGE
              : event.message;
            updateAnalystMessage(streamId, fallback, false);
            setBusy(false);
            return;
          }

          if (event.type === "token") {
            if (!gotTokens) {
              const thinkRemain = Math.max(0, minThinkMs - (Date.now() - thinkStartedAt));
              if (thinkRemain > 0) {
                await new Promise((r) => window.setTimeout(r, thinkRemain));
              }
              window.clearInterval(stepTimer);
              setActivityFeed(null);
            }
            gotTokens = true;
            setThinking(false);
            batcher.append(event.token);
          }

          if (event.type === "done") break;
        }
      } catch {
        window.clearInterval(stepTimer);
        setActivityFeed(null);
        setThinking(false);
        batcher.finish();
        updateAnalystMessage(streamId, ANALYST_OFFLINE_MESSAGE, false);
        setBusy(false);
        return;
      }

      batcher.finish();
      window.clearInterval(stepTimer);
      setActivityFeed(null);
      setThinking(false);
      updateAnalystMessage(
        streamId,
        gotTokens ? batcher.text || ANALYST_OFFLINE_MESSAGE : ANALYST_OFFLINE_MESSAGE,
        false,
      );
      if (gotTokens) {
        setChatQuotaRemaining((prev) =>
          prev === null ? prev : Math.max(0, prev - 1),
        );
        void fetchChatQuota().then((quota) => {
          if (quota) setChatQuotaRemaining(quota.remaining);
        });
      }
      setBusy(false);
    },
    [
      analystMessages,
      beginStream,
      bundle,
      chatQuotaRemaining,
      investigationId,
      updateAnalystMessage,
    ],
  );

  const handleAnalyze = useCallback(async (queuedFiles?: File[]) => {
    if (analyzingRef.current) return;

    const batch = queuedFiles?.length ? [...queuedFiles] : [...filesRef.current];
    if (!batch.length) {
      setError(USER_MESSAGES.uploadRequired);
      return;
    }

    const validation = validateUploadFiles(batch);
    if (!validation.ok) {
      setError(sanitizeUserMessage(validation.message));
      return;
    }

    const online = backendOnline || (await checkHealth());
    if (!online) {
      setBackendOnline(false);
      retryAnalyzeWhenOnlineRef.current = true;
      setInvestigationSessionActive(true);
      setError("");
      return;
    }
    setBackendOnline(true);
    retryAnalyzeWhenOnlineRef.current = false;

    analyzingRef.current = true;
    setInvestigationSessionActive(true);

    const fileNames = validation.files.map((f) => f.name);
    const prompt = analysisPromptForFiles(fileNames);
    const attachments = attachmentsFromFiles(validation.files);
    const resolvedMode = modeExplicit
      ? investigationMode
      : resolveInvestigationMode(validation.files.length, prompt);

    setBusy(true);
    setEnginePhase("running");
    setEngineTraceEvents([]);
    setEngineTraceOpen(false);
    setError("");

    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content: prompt, attachments },
    ]);

    const runStartedAt = performance.now();
    const MIN_ENGINE_FEEL_MS = 2600;

    try {
      const label =
        fileNames.length === 1
          ? fileNames[0]
          : fileNames.length <= 3
            ? fileNames.join(", ")
            : `${fileNames[0]} + ${fileNames.length - 1} more files`;

      let result: Awaited<ReturnType<typeof analyzeFiles>> | null = null;
      try {
        // Pace Trace events onto the UI so the terminal types line-by-line even
        // when the backend finishes near-instantly.
        const pending: EngineTraceEvent[] = [];
        const collected: EngineTraceEvent[] = [];
        let pumpActive = true;
        const pumpToken = { live: true };
        const pump = (async () => {
          while (pumpToken.live && (pumpActive || pending.length)) {
            const next = pending.shift();
            if (!next) {
              await sleep(24);
              continue;
            }
            collected.push(next);
            setEngineTraceEvents((prev) => [...prev, next]);
            await sleep(48);
          }
        })();

        for await (const event of streamAnalyzeWithTrace(validation.files, label, {
          mode: resolvedMode,
          prompt,
        })) {
          if (event.type === "engine_event") {
            pending.push(event.event);
          } else if (event.type === "error") {
            pumpActive = false;
            pumpToken.live = false;
            pending.length = 0;
            throw new Error(event.message || "Analysis failed");
          } else if (event.type === "complete") {
            result = event.result;
          }
        }
        pumpActive = false;
        await pump;

        // Cache Trace locally so a refresh still restores Engine + Trace.
        if (result && collected.length) {
          const cacheIds = [
            result.investigation_id,
            result.investigation_group_id,
            ...result.investigations.map((item) => item.investigation_id),
          ].filter(Boolean) as string[];
          for (const id of new Set(cacheIds)) {
            patchInvestigationSessionTrace(id, collected as Record<string, unknown>[]);
          }
        }
      } catch (streamErr) {
        // Fallback to classic analyze if streaming endpoint is unavailable.
        console.warn(`${LOG_PREFIX} Engine trace stream failed — falling back`, streamErr);
        result = await analyzeFiles(validation.files, label, {
          mode: resolvedMode,
          prompt,
        });
      }

      if (!result) {
        throw new Error("Analysis returned no result");
      }

      // Keep the Engine in "running" long enough that the Trace can feel like a
      // real terminal session (~2–3s), even on tiny uploads.
      const elapsed = performance.now() - runStartedAt;
      if (elapsed < MIN_ENGINE_FEEL_MS) {
        await sleep(MIN_ENGINE_FEEL_MS - elapsed);
      }

      if (result.warnings?.length) {
        console.warn(
          `${LOG_PREFIX} Investigation completed with warnings — ` +
            `${result.files_processed ?? "?"} processed, ${result.files_skipped ?? 0} skipped`,
        );
        for (const warning of result.warnings) {
          console.warn(`${LOG_PREFIX} \u2717 ${warning}`);
        }
      }
      const ids = result.investigations.map((item) => item.investigation_id);
      setInvestigationGroupId(result.investigation_group_id ?? null);
      setInvestigationIds(ids);
      setInvestigationMode(result.mode);
      setFiles([]);

      const finishEngineAnimation = async () => {
        // Stay on Engine Trace until the user clicks "View full report".
        setEnginePhase("complete");
      };

      if (result.mode === "separate" && result.investigations.length > 1) {
        const primaryId = result.investigations[0]?.investigation_id ?? result.investigation_id;
        loadedResumeIdRef.current = primaryId;
        syncUrl(primaryId);

        const groupId = `inv-group-${result.investigation_group_id ?? result.investigation_id}`;
        pushInvestigationMessage({
          id: groupId,
          role: "assistant",
          content: "",
          kind: "multi-investigation",
          investigationSources: result.investigations.map((item, index) => ({
            id: item.investigation_id,
            sourceLabel: fileNames[index] || item.source_filename || `Evidence ${index + 1}`,
          })),
        });

        void finishEngineAnimation();

        const bundles = await Promise.all(
          result.investigations.map((item) => loadInvestigationBundle(item.investigation_id)),
        );
        setInvestigationBundles(bundles);
        setBundle(bundles[0] ?? null);
        for (const row of bundles) {
          saveRecentInvestigation(
            recentEntryFromBundle(row, row.report.target?.split(/[/\\]/).pop() || label),
          );
        }

        const overlap = detectOverlappingAssets(bundles);
        let intro = separateAnalystIntro(bundles.length);
        if (overlap) {
          intro += " VAYNE correlated overlapping assets across uploaded evidence.";
        }
        setBriefingPrompt(null);
        void playAnalystBriefing(
          buildAnalystBriefingMessages(bundles, {
            intro,
            sourceLabels: fileNames,
          }),
        );
      } else {
        loadedResumeIdRef.current = result.investigation_id;
        syncUrl(result.investigation_id);

        pushInvestigationMessage({
          id: `inv-${result.investigation_id}`,
          role: "assistant",
          content: "",
          kind: "investigation",
          investigationId: result.investigation_id,
          sourceLabel: fileNames.length === 1 ? fileNames[0] : label,
        });

        void finishEngineAnimation();

        const data = await loadInvestigationBundle(result.investigation_id, setBundle);
        setInvestigationBundles([data]);
        saveRecentInvestigation(recentEntryFromBundle(data, label));

        const scannerTypes = data.workbench?.evidence_sources?.length ?? 0;
        const intro = combinedAnalystIntro(fileNames.length, scannerTypes);
        setBriefingPrompt(null);
        void playAnalystBriefing(
          buildAnalystBriefingMessages([data], {
            intro: intro || undefined,
            sourceLabels: fileNames,
          }),
        );
      }
    } catch (e) {
      setError(describeAnalyzeError(e));
      setEnginePhase("idle");
    } finally {
      analyzingRef.current = false;
      setBusy(false);
    }
  }, [
    backendOnline,
    investigationMode,
    modeExplicit,
    pushInvestigationMessage,
    syncUrl,
  ]);

  useEffect(() => {
    if (!backendOnline || !retryAnalyzeWhenOnlineRef.current) return;
    if (analyzingRef.current) return;
    const queued = [...filesRef.current];
    if (!queued.length) {
      retryAnalyzeWhenOnlineRef.current = false;
      return;
    }
    retryAnalyzeWhenOnlineRef.current = false;
    void handleAnalyze(queued);
  }, [backendOnline, handleAnalyze]);

  useEffect(() => {
    const onNewChat = () => {
      streamAbortRef.current?.abort();
      briefingAbortRef.current?.abort();
      persistSkipRef.current = true;
      skipResumeRef.current = true;
      loadedResumeIdRef.current = null;
      analyzingRef.current = false;
      retryAnalyzeWhenOnlineRef.current = false;
      switchingRef.current = null;
      setMessages([]);
      setAnalystMessages([]);
      setActivityFeed(null);
      setAnalystInput("");
      setFiles([]);
      setBundle(null);
      setInvestigationBundles([]);
      setInvestigationGroupId(null);
      setInvestigationIds([]);
      setInvestigationMode("combined");
      setModeExplicit(false);
      setBusy(false);
      setThinking(false);
      setActivityFeed(null);
      setEnginePhase("idle");
      setEngineTraceEvents([]);
      setEngineTraceOpen(false);
      setError("");
      setBriefingPrompt(null);
      setInvestigationSessionActive(false);
      setActiveInvestigationId(null);
      clearConversationSession();
      router.replace("/", { scroll: false });
    };
    window.addEventListener("vayne:new-chat", onNewChat);
    return () => window.removeEventListener("vayne:new-chat", onNewChat);
  }, [router]);

  const restoreTraceForId = useCallback((id: string) => {
    const session = findSessionForInvestigation(id);
    const cached = [
      ...((session?.engineTraceEvents ?? []) as EngineTraceEvent[]),
      ...(loadCachedEngineTrace(session?.id || id) as EngineTraceEvent[]),
      ...(loadCachedEngineTrace(id) as EngineTraceEvent[]),
    ];
    if (cached.length) setEngineTraceEvents(cached);
    void fetchEngineTrace(id).then((events) => {
      if (loadedResumeIdRef.current !== id) return;
      if (events.length) {
        setEngineTraceEvents(events);
        patchInvestigationSessionTrace(id, events as Record<string, unknown>[]);
        if (session?.id && session.id !== id) {
          patchInvestigationSessionTrace(session.id, events as Record<string, unknown>[]);
        }
      } else if (cached.length) {
        setEngineTraceEvents(cached);
      }
    });
  }, []);

  useEffect(() => {
    const onOpenInvestigation = (event: Event) => {
      const id = String((event as CustomEvent<{ id?: string }>).detail?.id || "").trim();
      if (!id) return;
      setInvestigationSessionActive(true);
      if (loadedResumeIdRef.current === id) {
        setEnginePhase("complete");
        setEngineTraceOpen(true);
        restoreTraceForId(id);
        syncUrl(id);
        return;
      }
      void switchToInvestigation(id);
    };
    window.addEventListener(OPEN_INVESTIGATION_EVENT, onOpenInvestigation as EventListener);
    return () =>
      window.removeEventListener(OPEN_INVESTIGATION_EVENT, onOpenInvestigation as EventListener);
  }, [restoreTraceForId, switchToInvestigation, syncUrl]);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
      briefingAbortRef.current?.abort();
    };
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setError("");
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
    setError("");
  }, []);

  const runBriefingPrompt = useCallback(() => {
    if (!briefingPrompt) return;
    void playAnalystBriefing(briefingPrompt.messages);
    setBriefingPrompt(null);
  }, [briefingPrompt, playAnalystBriefing]);

  const dismissBriefingPrompt = useCallback(() => setBriefingPrompt(null), []);

  useEffect(() => {
    if (briefingPrompt) setMobileAnalystOpen(true);
  }, [briefingPrompt]);

  const hasInvestigationData =
    !!bundle || enginePhase !== "idle" || messages.length > 0 || busy;

  const focusAnalyst = useCallback(() => {
    window.setTimeout(() => analystInputRef.current?.focus(), 100);
  }, []);

  const openMobileAnalyst = useCallback(() => {
    setMobileAnalystOpen(true);
    focusAnalyst();
  }, [focusAnalyst]);

  const askAboutSection = useCallback(
    (sectionTitle: string, engineContext: string) => {
      setInvestigationSessionActive(true);
      setMobileAnalystOpen(true);
      window.setTimeout(() => focusAnalyst(), 200);
      void streamReply(buildSectionAskPrompt(sectionTitle, engineContext));
    },
    [focusAnalyst, streamReply],
  );

  const beginInvestigationSession = useCallback(
    (prompt?: string) => {
      setInvestigationSessionActive(true);
      // Keep focus on the engine workstation — not the analyst chat.
      const queued = [...filesRef.current];
      if (queued.length > 0) {
        void handleAnalyze(queued);
      } else if (prompt?.trim()) {
        window.setTimeout(() => focusAnalyst(), 200);
        void streamReply(prompt.trim());
      }
    },
    [focusAnalyst, handleAnalyze, streamReply],
  );

  const handleHomeBegin = useCallback(
    (prompt: string) => {
      beginInvestigationSession(prompt || undefined);
    },
    [beginInvestigationSession],
  );

  const handleOpenInvestigation = useCallback(
    (id: string) => {
      setInvestigationSessionActive(true);
      // Re-selecting the active history row should return to the Engine session
      // (Attention Queue), not stay stuck on the full Investigation Workspace.
      if (loadedResumeIdRef.current === id) {
        setEnginePhase("complete");
        setEngineTraceOpen(true);
        if (engineTraceEvents.length === 0) restoreTraceForId(id);
        syncUrl(id);
        return;
      }
      void switchToInvestigation(id);
    },
    [engineTraceEvents.length, restoreTraceForId, switchToInvestigation, syncUrl],
  );

  const engineSourceLabels = useMemo(() => {
    const id = investigationIds[0] || bundle?.detail.summary.id;
    const session = id ? findSessionForInvestigation(id) : null;
    const fromSession = session?.files?.map((f) => f.name).filter(Boolean);
    if (fromSession?.length) return fromSession;

    const fromContributions = bundle?.workbench?.file_contributions
      ?.map((row) => row.file)
      .filter((name) => name && !name.toLowerCase().includes(" evidence"));
    if (fromContributions?.length) return fromContributions;

    return bundle
      ? [
          bundle.report.target?.split(/[/\\]/).pop() ||
            bundle.detail.summary.name ||
            "evidence",
        ]
      : [];
  }, [investigationIds, bundle]);

  const analystBundles = investigationBundles.length
    ? investigationBundles
    : bundle
      ? [bundle]
      : [];

  const analystContextLabel = useMemo(() => {
    if (investigationMode === "separate" && analystBundles.length > 1) {
      return `${analystBundles.length} separate analyses`;
    }
    if (engineSourceLabels.length > 1) {
      return `${engineSourceLabels.length} merged scans`;
    }
    return analystBundles[0]?.report.name?.trim() || analystBundles[0]?.detail.summary.id || ANALYST_NAME;
  }, [analystBundles, engineSourceLabels.length, investigationMode]);

  const commandPaletteItems = useCommandPaletteItems({
    onNewInvestigation: () => window.dispatchEvent(new Event("vayne:new-chat")),
    onOpenInvestigation: handleOpenInvestigation,
    onFocusAnalyst: openMobileAnalyst,
    onAnalyze: () => void handleAnalyze(),
    onShowShortcuts: () => setShortcutsOpen(true),
    onOpenCommandPalette: () => setCommandPaletteOpen(true),
    onSubmitPrompt: (p) => beginInvestigationSession(p),
    canAnalyze: files.length > 0 && !busy,
    paletteOpen: commandPaletteOpen,
  });

  useWorkspaceKeyboard({
    workspaceEmpty: !investigationSessionActive,
    canAnalyze: files.length > 0 && !busy,
    onNewInvestigation: () => window.dispatchEvent(new Event("vayne:new-chat")),
    onAnalyze: () => void handleAnalyze(),
    onFocusAnalyst: openMobileAnalyst,
    onCommandPalette: () => setCommandPaletteOpen(true),
    onShowShortcuts: () => setShortcutsOpen(true),
  });

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-vx-app text-white">
      <ResetWorkspaceBootstrap />
      <WorkspaceShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <CommandPalette
        open={commandPaletteOpen}
        items={commandPaletteItems}
        onClose={() => setCommandPaletteOpen(false)}
      />

      <MobileWorkspaceHeader
        onOpenNav={() => setMobileNavOpen(true)}
        showAnalyst
        onOpenAnalyst={openMobileAnalyst}
      />

      <Suspense
        fallback={
          <aside className="hidden h-dvh w-[20%] min-w-[260px] shrink-0 bg-vx-app lg:block" />
        }
      >
        <VaneSidebar
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
      </Suspense>

      {isLgUp ? (
        <WorkspacePanelOrderProvider>
          <div className="flex h-dvh min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
            <InvestigationReportAskProvider askSection={askAboutSection}>
              <SwappablePanelRow
                panels={{
                  engine: (
                    <div className="flex h-full min-h-0 w-full flex-col bg-vx-app">
                      <VaneEnginePanel
                        scrollRef={scrollRef}
                        sessionActive={investigationSessionActive}
                        hasInvestigationData={hasInvestigationData}
                        busy={busy}
                        backendOnline={backendOnline}
                        analystOnline={analystOnline}
                        error={error}
                        files={files}
                        enginePhase={
                          engineTraceOpen
                            ? enginePhase === "running"
                              ? "running"
                              : "complete"
                            : enginePhase
                        }
                        engineTraceEvents={engineTraceEvents}
                        onViewEngineTrace={() => {
                          const id =
                            investigationIds[0] ||
                            (bundle ? bundle.detail.summary.id : null);
                          if (id && engineTraceEvents.length === 0) {
                            restoreTraceForId(id);
                          }
                          setEngineTraceOpen(true);
                        }}
                        onCloseEngineTrace={() => {
                          setEngineTraceOpen(false);
                          setEnginePhase((phase) => (phase === "complete" ? "idle" : phase));
                        }}
                        messages={messages}
                        investigationIds={
                          investigationIds.length
                            ? investigationIds
                            : bundle
                              ? [bundle.detail.summary.id]
                              : []
                        }
                        investigationGroupId={investigationGroupId}
                        investigationMode={investigationMode}
                        sourceLabels={engineSourceLabels}
                        onSelectFiles={(picked) => {
                          setFiles((prev) => {
                            const seen = new Set(
                              prev.map((f) => `${f.name}:${f.size}:${f.lastModified}`),
                            );
                            const merged = [...prev];
                            for (const file of picked) {
                              const key = `${file.name}:${file.size}:${file.lastModified}`;
                              if (!seen.has(key)) {
                                seen.add(key);
                                merged.push(file);
                              }
                            }
                            return merged;
                          });
                          setError("");
                          setInvestigationSessionActive(true);
                          void handleAnalyze(picked);
                        }}
                        onRemoveFile={removeFile}
                        onClearFiles={clearFiles}
                        onInvestigationModeChange={handleInvestigationModeChange}
                        onBeginSession={handleHomeBegin}
                        onOpenInvestigation={handleOpenInvestigation}
                        onFocusAnalyst={openMobileAnalyst}
                        onNewInvestigation={() => window.dispatchEvent(new Event("vayne:new-chat"))}
                      />
                    </div>
                  ),
                  trace: (
                    <EngineTracePanel
                      events={engineTraceEvents}
                      running={enginePhase === "running"}
                      className="h-full min-h-0 w-full"
                    />
                  ),
                  analyst: (
                    <VaneAnalystPanel
                      bundle={bundle}
                      bundles={analystBundles}
                      contextLabel={analystContextLabel}
                      messages={analystMessages}
                      input={analystInput}
                      busy={busy}
                      thinking={thinking}
                      activityFeed={activityFeed}
                      analystOnline={analystOnline}
                      initialScrollTop={analystScrollTopRef.current}
                      onInputChange={setAnalystInput}
                      onAsk={(q) => void streamReply(q)}
                      onScroll={(top) => {
                        analystScrollTopRef.current = top;
                        persist({ analystScrollTop: top });
                      }}
                      inputRef={analystInputRef}
                      onClearChat={() => setAnalystMessages([])}
                      briefingPrompt={briefingPrompt ? { fileCount: briefingPrompt.fileCount } : null}
                      onGetSummary={runBriefingPrompt}
                      onSkipSummary={dismissBriefingPrompt}
                      sourceLabel={engineSourceLabels[0]}
                      sourceLabels={engineSourceLabels}
                      chatQuotaRemaining={chatQuotaRemaining}
                    />
                  ),
                }}
              />
            </InvestigationReportAskProvider>
          </div>
        </WorkspacePanelOrderProvider>
      ) : (
        <>
          <motion.div
            className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-vx-border bg-vx-app pt-12"
            animate={{ flex: "1 1 100%" }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <InvestigationReportAskProvider askSection={askAboutSection}>
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-hidden">
                  <VaneEnginePanel
                    scrollRef={scrollRef}
                    sessionActive={investigationSessionActive}
                    hasInvestigationData={hasInvestigationData}
                    busy={busy}
                    backendOnline={backendOnline}
                    analystOnline={analystOnline}
                    error={error}
                    files={files}
                    enginePhase={
                      engineTraceOpen
                        ? enginePhase === "running"
                          ? "running"
                          : "complete"
                        : enginePhase
                    }
                    engineTraceEvents={engineTraceEvents}
                    onViewEngineTrace={() => {
                      const id =
                        investigationIds[0] ||
                        (bundle ? bundle.detail.summary.id : null);
                      if (id && engineTraceEvents.length === 0) {
                        restoreTraceForId(id);
                      }
                      setEngineTraceOpen(true);
                    }}
                    onCloseEngineTrace={() => {
                      setEngineTraceOpen(false);
                      setEnginePhase((phase) => (phase === "complete" ? "idle" : phase));
                    }}
                    messages={messages}
                    investigationIds={
                      investigationIds.length
                        ? investigationIds
                        : bundle
                          ? [bundle.detail.summary.id]
                          : []
                    }
                    investigationGroupId={investigationGroupId}
                    investigationMode={investigationMode}
                    sourceLabels={engineSourceLabels}
                    onSelectFiles={(picked) => {
                      setFiles((prev) => {
                        const seen = new Set(
                          prev.map((f) => `${f.name}:${f.size}:${f.lastModified}`),
                        );
                        const merged = [...prev];
                        for (const file of picked) {
                          const key = `${file.name}:${file.size}:${file.lastModified}`;
                          if (!seen.has(key)) {
                            seen.add(key);
                            merged.push(file);
                          }
                        }
                        return merged;
                      });
                      setError("");
                      setInvestigationSessionActive(true);
                      void handleAnalyze(picked);
                    }}
                    onRemoveFile={removeFile}
                    onClearFiles={clearFiles}
                    onInvestigationModeChange={handleInvestigationModeChange}
                    onBeginSession={handleHomeBegin}
                    onOpenInvestigation={handleOpenInvestigation}
                    onFocusAnalyst={openMobileAnalyst}
                    onNewInvestigation={() => window.dispatchEvent(new Event("vayne:new-chat"))}
                  />
                </div>
                <div className="flex h-[42vh] min-h-0 shrink-0 flex-col overflow-hidden border-t border-white/[0.08]">
                  <EngineTracePanel
                    events={engineTraceEvents}
                    running={enginePhase === "running"}
                    className="h-full min-h-0"
                  />
                </div>
              </div>
            </InvestigationReportAskProvider>
          </motion.div>

          {mobileAnalystOpen ? (
            <div className="fixed inset-0 z-40 bg-vx-analyst">
              <VaneAnalystPanel
                bundle={bundle}
                bundles={analystBundles}
                contextLabel={analystContextLabel}
                messages={analystMessages}
                input={analystInput}
                busy={busy}
                thinking={thinking}
                activityFeed={activityFeed}
                analystOnline={analystOnline}
                initialScrollTop={analystScrollTopRef.current}
                onInputChange={setAnalystInput}
                onAsk={(q) => void streamReply(q)}
                onScroll={(top) => {
                  analystScrollTopRef.current = top;
                  persist({ analystScrollTop: top });
                }}
                inputRef={analystInputRef}
                onClearChat={() => setAnalystMessages([])}
                onClose={() => setMobileAnalystOpen(false)}
                briefingPrompt={briefingPrompt ? { fileCount: briefingPrompt.fileCount } : null}
                onGetSummary={runBriefingPrompt}
                onSkipSummary={dismissBriefingPrompt}
                sourceLabel={engineSourceLabels[0]}
                sourceLabels={engineSourceLabels}
                chatQuotaRemaining={chatQuotaRemaining}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** @deprecated Use VaneWorkspace */
export const VayneConversation = VaneWorkspace;
