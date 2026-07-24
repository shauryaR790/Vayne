"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

import { analyzeFiles, checkHealth } from "@/lib/api";
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
import {
  clearConversationSession,
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
  rebuildInvestigationSession,
  saveInvestigationSession,
  sessionStorageKeyFromState,
  setActiveInvestigationId,
} from "@/lib/investigation-session";
import { ENGINE_MIN_DURATION_MS, ENGINE_COMPLETE_MS } from "@/components/conversation/engine-progress";
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
    }) => {
      if (persistSkipRef.current) return;

      const invId = next?.investigationId !== undefined ? next.investigationId : investigationId ?? null;
      const groupId =
        next?.investigationGroupId !== undefined ? next.investigationGroupId : investigationGroupId;
      const ids = next?.investigationIds ?? investigationIds;
      const msgs = serializeMessages(next?.messages ?? messages);
      const analystMsgs = serializeMessages(next?.analystMessages ?? analystMessages);
      const activeBundle = next?.bundle !== undefined ? next.bundle : bundle;

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

      if (!activeBundle || !sessionKey) return;

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
        }),
      );
    },
    [
      analystInput,
      analystMessages,
      bundle,
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

      streamAbortRef.current?.abort();
      briefingAbortRef.current?.abort();
      persistSkipRef.current = true;

      setActivityFeed(null);
      setAnalystInput("");
      setFiles([]);
      setInvestigationMode("combined");
      setModeExplicit(false);
      setThinking(false);
      setEnginePhase("idle");
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
        const restoredAnalyst = session.analystMessages ?? [];

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

        setActiveInvestigationId(session.id);
        syncUrl(invId);
        persistSkipRef.current = false;
        setHydrated(true);
        notifyInvestigationLoaded(session.id);
        setBusy(false);

        skipAutoScrollRef.current = true;
        requestAnimationFrame(() => {
          if (session.scrollTop && scrollRef.current) {
            scrollRef.current.scrollTop = session.scrollTop;
          } else {
            scrollToBottom(false);
          }
          skipAutoScrollRef.current = false;
        });

        const primaryBundleId = bundleIds[0];
        void Promise.all(bundleIds.map((id) => loadInvestigationBundle(id)))
          .then((loadedBundles) => {
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
            if (!restoredAnalyst.length) {
              void playAnalystBriefing(
                buildAnalystBriefingMessages(loadedBundles, {
                  sourceLabels: session.files.map((f) => f.name),
                }),
              );
            }
          })
          .catch(() => {
            // Inline report components surface load failures in the workspace.
          });
      } catch (e) {
        setMessages([]);
        setAnalystMessages([]);
        setBundle(null);
        setError(sanitizeUserMessage(e instanceof Error ? e.message : String(e)));
        setBusy(false);
      } finally {
        switchingRef.current = null;
      }
    },
    [scrollToBottom, syncUrl, playAnalystBriefing],
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
      setError(USER_MESSAGES.serviceOfflineShort);
      return;
    }
    setBackendOnline(true);

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
    setError("");
    const engineStartedAt = Date.now();

    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content: prompt, attachments },
    ]);

    try {
      const label =
        fileNames.length === 1
          ? fileNames[0]
          : fileNames.length <= 3
            ? fileNames.join(", ")
            : `${fileNames[0]} + ${fileNames.length - 1} more files`;
      const result = await analyzeFiles(validation.files, label, {
        mode: resolvedMode,
        prompt,
      });
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
        const engineElapsed = Date.now() - engineStartedAt;
        const engineRemain = Math.min(
          ENGINE_MIN_DURATION_MS,
          Math.max(0, ENGINE_MIN_DURATION_MS - engineElapsed),
        );
        if (engineRemain > 0) {
          await new Promise((r) => window.setTimeout(r, engineRemain));
        }
        setEnginePhase("complete");
        await new Promise((r) => window.setTimeout(r, ENGINE_COMPLETE_MS));
        setEnginePhase("idle");
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
    const onNewChat = () => {
      streamAbortRef.current?.abort();
      briefingAbortRef.current?.abort();
      persistSkipRef.current = true;
      skipResumeRef.current = true;
      loadedResumeIdRef.current = null;
      analyzingRef.current = false;
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
      window.setTimeout(() => focusAnalyst(), 200);

      const queued = [...filesRef.current];
      if (queued.length > 0) {
        void handleAnalyze(queued);
      } else if (prompt?.trim()) {
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
      void switchToInvestigation(id);
    },
    [switchToInvestigation],
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
        showAnalyst={investigationSessionActive}
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

      <motion.div
        className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-vx-border bg-vx-app pt-12 lg:h-dvh lg:pt-0"
        animate={{
          flex: investigationSessionActive && isLgUp ? "1 1 55%" : "1 1 100%",
        }}
        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <InvestigationReportAskProvider askSection={askAboutSection}>
          <VaneEnginePanel
            scrollRef={scrollRef}
            sessionActive={investigationSessionActive}
            hasInvestigationData={hasInvestigationData}
            busy={busy}
            backendOnline={backendOnline}
            analystOnline={analystOnline}
            error={error}
            files={files}
            enginePhase={enginePhase}
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
                const seen = new Set(prev.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
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
            }}
            onRemoveFile={removeFile}
            onClearFiles={clearFiles}
            onInvestigationModeChange={handleInvestigationModeChange}
            onBeginSession={handleHomeBegin}
            onOpenInvestigation={handleOpenInvestigation}
            onFocusAnalyst={openMobileAnalyst}
            onNewInvestigation={() => window.dispatchEvent(new Event("vayne:new-chat"))}
          />
        </InvestigationReportAskProvider>
      </motion.div>

      <AnimatePresence initial={false}>
        {investigationSessionActive && isLgUp ? (
          <motion.div
            key="analyst-panel"
            initial={{ width: 0, opacity: 0, x: 16 }}
            animate={{ width: "25%", opacity: 1, x: 0 }}
            exit={{ width: 0, opacity: 0, x: 16 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="h-dvh min-w-[300px] shrink-0 overflow-hidden"
          >
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
          </motion.div>
        ) : null}
      </AnimatePresence>

      {investigationSessionActive && !isLgUp && mobileAnalystOpen ? (
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
    </div>
  );
}

/** @deprecated Use VaneWorkspace */
export const VayneConversation = VaneWorkspace;
