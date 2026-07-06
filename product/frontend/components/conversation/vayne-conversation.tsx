"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useRouter } from "next/navigation";

import { analyzeFiles, getApiBase, checkHealth } from "@/lib/api";
import {
  ANALYST_OFFLINE_MESSAGE,
  sanitizeChatHistory,
  streamAnalystChat,
} from "@/lib/analyst-chat";
import { loadInvestigationBundle, type InvestigationBundle } from "@/lib/investigation-bundle";
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
  investigationDisplayId,
  migrateLegacyConversationSession,
  notifyInvestigationLoaded,
  rebuildInvestigationSession,
  saveInvestigationSession,
  sessionStorageKeyFromState,
  setActiveInvestigationId,
} from "@/lib/investigation-session";
import { ENGINE_MIN_DURATION_MS } from "@/components/conversation/engine-progress";
import {
  defaultInvestigationMode,
  resolveInvestigationMode,
  type InvestigationMode,
} from "@/lib/investigation-mode";
import { attachmentsFromFiles } from "@/lib/multi-investigation-message";
import { buildAnalystBriefingMessages } from "@/lib/analyst-briefing";
import { ANALYST_THINKING_STEPS, streamAnalystBriefing } from "@/lib/analyst-stream";
import { ensureEngineMessages } from "@/lib/engine-messages";
import {
  combinedAnalystIntro,
  detectOverlappingAssets,
  separateAnalystIntro,
} from "@/lib/investigation-presentation";
import { validateUploadFiles } from "@/lib/upload";
import { VaneSidebar } from "@/components/workspace/vane-sidebar";
import { VaneEnginePanel } from "@/components/workspace/vane-engine-panel";
import { VaneAnalystPanel } from "@/components/workspace/vane-analyst-panel";
import { LOG_PREFIX } from "@/lib/brand";
import { ResetWorkspaceBootstrap } from "@/components/dev/reset-workspace-bootstrap";

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [analystMessages, setAnalystMessages] = useState<AnalystMessage[]>([]);
  const [analystInput, setAnalystInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [bundle, setBundle] = useState<InvestigationBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [thinkingStep, setThinkingStep] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState(false);
  const [error, setError] = useState("");
  const [investigationMode, setInvestigationMode] = useState<InvestigationMode>("combined");
  const [modeExplicit, setModeExplicit] = useState(false);
  const [investigationGroupId, setInvestigationGroupId] = useState<string | null>(null);
  const [investigationIds, setInvestigationIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [enginePhase, setEnginePhase] = useState<"idle" | "running" | "complete">("idle");

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

  const scrollRef = useRef<HTMLDivElement>(null);
  const analystScrollTopRef = useRef(0);
  const streamAbortRef = useRef<AbortController | null>(null);
  const briefingAbortRef = useRef<AbortController | null>(null);
  const persistSkipRef = useRef(true);
  const skipResumeRef = useRef(false);
  const switchingRef = useRef<string | null>(null);
  const loadedResumeIdRef = useRef<string | null>(null);
  const skipAutoScrollRef = useRef(false);

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

    setAnalystMessages([]);
    setThinking(true);

    try {
      await streamAnalystBriefing(
        briefingMessages,
        (updater) => setAnalystMessages((prev) => updater(prev)),
        {
          onThinkingStep: setThinkingStep,
          signal: controller.signal,
        },
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      throw error;
    } finally {
      setThinking(false);
      setThinkingStep(null);
    }
  }, []);

  const switchToInvestigation = useCallback(
    async (invId: string) => {
      if (switchingRef.current === invId) return;
      switchingRef.current = invId;

      console.log(LOG_PREFIX);
      console.log("Clearing current state...");

      streamAbortRef.current?.abort();
      briefingAbortRef.current?.abort();
      persistSkipRef.current = true;

      setMessages([]);
      setAnalystMessages([]);
      setThinkingStep(null);
      setAnalystInput("");
      setFiles([]);
      setBundle(null);
      setInvestigationGroupId(null);
      setInvestigationIds([]);
      setInvestigationMode("combined");
      setModeExplicit(false);
      setBusy(true);
      setThinking(false);
      setEnginePhase("idle");
      setError("");

      try {
        migrateLegacyConversationSession();

        let session = findSessionForInvestigation(invId);

        console.log("Hydrating investigation state...");

        if (!session) {
          session = await rebuildInvestigationSession(invId);
          saveInvestigationSession(session);
        }

        const displayId = investigationDisplayId(session);
        console.log(`Loading investigation: ${displayId}`);

        console.log("Restoring chat...");
        const bundleIds = session.investigationIds?.length
          ? session.investigationIds
          : [invId];
        const sourceLabels = session.files.map((file) => file.name);
        const engineMessages = ensureEngineMessages(session.messages, bundleIds, {
          investigationGroupId: session.investigationGroupId ?? null,
          sourceLabels,
        });
        setMessages(engineMessages);
        let restoredAnalyst = session.analystMessages ?? [];
        setAnalystInput(session.analystInputDraft ?? "");
        analystScrollTopRef.current = session.analystScrollTop ?? 0;
        setInvestigationGroupId(session.investigationGroupId ?? null);
        setInvestigationIds(session.investigationIds ?? [invId]);
        if (session.investigationMode) {
          setInvestigationMode(session.investigationMode);
          setModeExplicit(true);
        }

        const primaryBundleId = session.investigationIds?.[0] ?? invId;
        console.log("Restoring graph...");
        const bundles = await Promise.all(bundleIds.map((id) => loadInvestigationBundle(id)));
        const data = bundles[0];
        setBundle(data);
        if (!restoredAnalyst.length) {
          void playAnalystBriefing(
            buildAnalystBriefingMessages(bundles, {
              sourceLabels: session.files.map((f) => f.name),
            }),
          );
        } else {
          setAnalystMessages(restoredAnalyst);
        }
        saveRecentInvestigation(
          recentEntryFromBundle(
            data,
            session.files[0]?.name || data.report.target?.split(/[/\\]/).pop(),
          ),
        );

        console.log("Restoring findings...");

        setActiveInvestigationId(session.id);
        syncUrl(invId);

        persistSkipRef.current = false;
        setHydrated(true);
        notifyInvestigationLoaded(session.id);

        skipAutoScrollRef.current = true;
        requestAnimationFrame(() => {
          if (session.scrollTop && scrollRef.current) {
            scrollRef.current.scrollTop = session.scrollTop;
          } else {
            scrollToBottom(false);
          }
          skipAutoScrollRef.current = false;
        });

        console.log("Investigation loaded successfully.");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
        switchingRef.current = null;
      }
    },
    [scrollToBottom, syncUrl, playAnalystBriefing],
  );

  useEffect(() => {
    checkHealth().then(setBackendOnline);
    migrateLegacyConversationSession();

    if (skipResumeRef.current) {
      persistSkipRef.current = false;
      setHydrated(true);
      skipResumeRef.current = false;
      return;
    }

    if (resumeId) {
      if (loadedResumeIdRef.current === resumeId && hydrated) return;
      loadedResumeIdRef.current = resumeId;
      void switchToInvestigation(resumeId);
      return;
    }

    loadedResumeIdRef.current = null;
    if (!hydrated) {
      persistSkipRef.current = false;
      setHydrated(true);
    }
  }, [resumeId, switchToInvestigation, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    persist();
  }, [messages, analystMessages, investigationId, analystInput, hydrated, persist]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (persistSkipRef.current) return;
      persist({ scrollTop: el.scrollTop });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [hydrated, persist]);

  useEffect(() => {
    if (skipAutoScrollRef.current) return;
    const streaming = messages.some((m) => m.streaming);
    scrollToBottom(!streaming);
  }, [messages, thinking, enginePhase, scrollToBottom]);

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
      if (!investigationId) return;

      const streamId = `reply-${Date.now()}`;
      const history = sanitizeChatHistory(analystMessages);

      setAnalystMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: "user", content: question },
      ]);
      setAnalystInput("");
      setBusy(true);
      setThinking(true);
      setThinkingStep(ANALYST_THINKING_STEPS[0]);

      let stepIndex = 0;
      const stepTimer = window.setInterval(() => {
        stepIndex = (stepIndex + 1) % ANALYST_THINKING_STEPS.length;
        setThinkingStep(ANALYST_THINKING_STEPS[stepIndex]);
      }, 600);

      const batcher = createRhythmStreamBatcher((text) => {
        window.clearInterval(stepTimer);
        setThinkingStep(null);
        setThinking(false);
        updateAnalystMessage(streamId, text, true);
      });
      let gotTokens = false;

      const signal = beginStream();

      try {
        for await (const event of streamAnalystChat(investigationId, question, history, { signal })) {
          if (signal.aborted) return;
          if (event.type === "thinking") continue;

          if (event.type === "error") {
            window.clearInterval(stepTimer);
            setThinkingStep(null);
            setThinking(false);
            batcher.finish();
            const offline =
              event.code === "llm_offline" ||
              event.code === "http_error" ||
              event.code === "llm_not_configured";
            updateAnalystMessage(streamId, offline ? ANALYST_OFFLINE_MESSAGE : event.message, false);
            setBusy(false);
            return;
          }

          if (event.type === "token") {
            if (!gotTokens) {
              window.clearInterval(stepTimer);
              setThinkingStep(null);
            }
            gotTokens = true;
            setThinking(false);
            batcher.append(event.token);
          }

          if (event.type === "done") break;
        }
      } catch {
        window.clearInterval(stepTimer);
        setThinkingStep(null);
        setThinking(false);
        batcher.finish();
        updateAnalystMessage(streamId, ANALYST_OFFLINE_MESSAGE, false);
        setBusy(false);
        return;
      }

      batcher.finish();
      window.clearInterval(stepTimer);
      setThinkingStep(null);
      setThinking(false);
      updateAnalystMessage(
        streamId,
        gotTokens ? batcher.text || ANALYST_OFFLINE_MESSAGE : ANALYST_OFFLINE_MESSAGE,
        false,
      );
      setBusy(false);
    },
    [analystMessages, beginStream, investigationId, updateAnalystMessage],
  );

  const handleAnalyze = useCallback(async () => {
    if (busy) return;

    if (!files.length) {
      setError("Upload evidence files, then click Analyze.");
      return;
    }

    const validation = validateUploadFiles(files);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    if (!backendOnline) {
      setError(`Backend offline (${getApiBase()})`);
      return;
    }

    const prompt = `Analyze ${validation.files.map((f) => f.name).join(", ")}`;
    const attachments = attachmentsFromFiles(validation.files);
    const resolvedMode = modeExplicit
      ? investigationMode
      : resolveInvestigationMode(validation.files.length, prompt);

    setFiles([]);
    setBusy(true);
    setEnginePhase("running");
    setError("");
    const engineStartedAt = Date.now();

    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content: prompt, attachments },
    ]);

    try {
      const label = validation.files.map((f) => f.name).join(", ");
      const fileNames = validation.files.map((f) => f.name);
      const result = await analyzeFiles(validation.files, label, {
        mode: resolvedMode,
        prompt,
      });
      const ids = result.investigations.map((item) => item.investigation_id);
      setInvestigationGroupId(result.investigation_group_id ?? null);
      setInvestigationIds(ids);
      setInvestigationMode(result.mode);

      const engineElapsed = Date.now() - engineStartedAt;
      const engineRemain = Math.max(0, ENGINE_MIN_DURATION_MS - engineElapsed);
      if (engineRemain > 0) {
        await new Promise((r) => window.setTimeout(r, engineRemain));
      }
      setEnginePhase("complete");
      await new Promise((r) => window.setTimeout(r, 900));

      if (result.mode === "separate" && result.investigations.length > 1) {
        const bundles = await Promise.all(
          result.investigations.map((item) => loadInvestigationBundle(item.investigation_id)),
        );
        setBundle(bundles[0] ?? null);
        for (const row of bundles) {
          saveRecentInvestigation(
            recentEntryFromBundle(
              row,
              row.report.target?.split(/[/\\]/).pop() || label,
            ),
          );
        }
        syncUrl(bundles[0]?.detail.summary.id ?? result.investigation_id);

        const overlap = detectOverlappingAssets(bundles);
        let intro = separateAnalystIntro(bundles.length);
        if (overlap) {
          intro += " VANE correlated overlapping assets across uploaded evidence.";
        }

        const groupId = `inv-group-${result.investigation_group_id ?? result.investigation_id}`;
        pushInvestigationMessage({
          id: groupId,
          role: "assistant",
          content: "",
          kind: "multi-investigation",
          investigationSources: bundles.map((row, index) => ({
            id: row.detail.summary.id,
            sourceLabel:
              fileNames[index] ||
              row.report.target?.split(/[/\\]/).pop() ||
              `Evidence ${index + 1}`,
          })),
        });
        void playAnalystBriefing(
          buildAnalystBriefingMessages(bundles, {
            intro,
            sourceLabels: fileNames,
          }),
        );
      } else {
        const data = await loadInvestigationBundle(result.investigation_id);
        setBundle(data);
        saveRecentInvestigation(recentEntryFromBundle(data, label));
        syncUrl(result.investigation_id);

        const intro = combinedAnalystIntro(fileNames.length);
        pushInvestigationMessage({
          id: `inv-${result.investigation_id}`,
          role: "assistant",
          content: "",
          kind: "investigation",
          investigationId: result.investigation_id,
          sourceLabel: fileNames.length === 1 ? fileNames[0] : label,
        });
        void playAnalystBriefing(
          buildAnalystBriefingMessages([data], {
            intro: intro || undefined,
            sourceLabels: [fileNames.length === 1 ? fileNames[0] : label],
          }),
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.toLowerCase().includes("failed to fetch")) {
        setError(
          `Cannot reach VANE API at ${getApiBase()}. Start the backend (uvicorn) and ensure NEXT_PUBLIC_API_URL matches.`,
        );
      } else {
        setError(message);
      }
    } finally {
      setEnginePhase("idle");
      setBusy(false);
    }
  }, [
    backendOnline,
    busy,
    files,
    investigationMode,
    modeExplicit,
    pushInvestigationMessage,
    playAnalystBriefing,
    syncUrl,
  ]);

  useEffect(() => {
    const onNewChat = () => {
      streamAbortRef.current?.abort();
      briefingAbortRef.current?.abort();
      persistSkipRef.current = true;
      skipResumeRef.current = true;
      loadedResumeIdRef.current = null;
      switchingRef.current = null;
      setMessages([]);
      setAnalystMessages([]);
      setThinkingStep(null);
      setAnalystInput("");
      setFiles([]);
      setBundle(null);
      setInvestigationGroupId(null);
      setInvestigationIds([]);
      setInvestigationMode("combined");
      setModeExplicit(false);
      setBusy(false);
      setThinking(false);
      setThinkingStep(null);
      setEnginePhase("idle");
      setError("");
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

  const showEngineResults = !!bundle || enginePhase !== "idle" || messages.length > 0;
  const engineSourceLabels = bundle
    ? [
        bundle.report.target?.split(/[/\\]/).pop() ||
          investigationIds.find((id) => id === bundle.detail.summary.id) ||
          "evidence",
      ]
    : [];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-vx-app text-white">
      <ResetWorkspaceBootstrap />

      <Suspense
        fallback={
          <aside className="h-screen w-[20%] min-w-[260px] shrink-0 bg-vx-app" />
        }
      >
        <VaneSidebar />
      </Suspense>

      <VaneEnginePanel
        scrollRef={scrollRef}
        showResults={showEngineResults}
        busy={busy}
        backendOnline={backendOnline}
        error={error}
        files={files}
        investigationMode={investigationMode}
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
        onModeChange={(mode) => {
          setModeExplicit(true);
          setInvestigationMode(mode);
        }}
        onAnalyze={() => void handleAnalyze()}
      />

      <VaneAnalystPanel
        bundle={bundle}
        messages={analystMessages}
        input={analystInput}
        busy={busy}
        thinking={thinking}
        thinkingStep={thinkingStep}
        analystOnline={backendOnline}
        initialScrollTop={analystScrollTopRef.current}
        onInputChange={setAnalystInput}
        onAsk={(q) => void streamReply(q)}
        onScroll={(top) => {
          analystScrollTopRef.current = top;
          persist({ analystScrollTop: top });
        }}
      />
    </div>
  );
}

/** @deprecated Use VaneWorkspace */
export const VayneConversation = VaneWorkspace;
