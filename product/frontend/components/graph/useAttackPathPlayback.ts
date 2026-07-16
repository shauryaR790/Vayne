"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import gsap from "gsap";
import {
  buildAttackPathScript,
  revealedThroughStep,
  type AttackPathScript,
  type PlaybackPhase,
} from "@/lib/attack-path-playback";
import type { GraphData, WorkbenchData } from "@/lib/types";
import { nodeSizeForType } from "@/lib/graph-node-styles";
import { STEP_MS } from "./AttackPathPlayer";

export function useAttackPathPlayback({
  graph,
  workbench,
  flowRef,
  containerRef,
  enabled,
}: {
  graph: GraphData;
  workbench?: WorkbenchData;
  flowRef: React.RefObject<ReactFlowInstance | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  enabled: boolean;
}) {
  const script = enabled ? buildAttackPathScript(graph, workbench) : null;
  const [phase, setPhase] = useState<PlaybackPhase>("idle");
  const [stepIndex, setStepIndex] = useState(-1);
  /** Start in explore mode so the graph is visible immediately. */
  const [exploreMode, setExploreMode] = useState(true);
  const timerRef = useRef<number | null>(null);

  const canPlay = enabled && !!script;
  const playbackActive = canPlay && !exploreMode;
  const playing = phase === "playing";

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const focusStepNode = useCallback(
    (index: number) => {
      if (!script || index < 0 || !flowRef.current) return;
      const step = script.steps[index];
      const flowNode = flowRef.current.getNodes().find((n) => n.id === step.nodeId);
      if (!flowNode) return;

      const type = String(flowNode.data?.type || "unknown");
      const size = nodeSizeForType(type, Boolean(flowNode.data?.secondary));
      const cx = flowNode.position.x + size.width / 2;
      const cy = flowNode.position.y + size.height / 2;

      flowRef.current.setCenter(cx, cy, {
        zoom: 0.92,
        duration: 650,
      });
    },
    [script, flowRef],
  );

  const animateReveal = useCallback(
    (index: number) => {
      if (!containerRef.current || !script || index < 0) return;
      const step = script.steps[index];
      const nodeEl = containerRef.current.querySelector(
        `.graph-node-inner[data-node-id="${step.nodeId}"]`,
      );
      if (nodeEl) {
        gsap.fromTo(
          nodeEl,
          { opacity: 0, scale: 0.82 },
          {
            opacity: 1,
            scale: 1,
            duration: 0.55,
            ease: "back.out(1.4)",
            clearProps: "scale",
          },
        );
      }

      if (step.edgeKey) {
        const edgePaths = containerRef.current.querySelectorAll(
          ".react-flow__edge-path.vx-edge-playback",
        );
        edgePaths.forEach((el) => el.classList.remove("vx-edge-playback"));
      }

      focusStepNode(index);
    },
    [containerRef, script, focusStepNode],
  );

  const advance = useCallback(() => {
    if (!script) return;
    setStepIndex((prev) => {
      const next = prev + 1;
      if (next >= script.steps.length) {
        clearTimer();
        setPhase("complete");
        return script.steps.length - 1;
      }
      window.requestAnimationFrame(() => animateReveal(next));
      return next;
    });
  }, [script, clearTimer, animateReveal]);

  const play = useCallback(() => {
    if (!script) return;
    setExploreMode(false);
    if (phase === "complete") {
      setStepIndex(-1);
      setPhase("playing");
      window.setTimeout(advance, 400);
      return;
    }
    setPhase("playing");
    if (stepIndex < 0) {
      window.setTimeout(advance, 400);
    }
  }, [script, phase, stepIndex, advance]);

  const pause = useCallback(() => {
    clearTimer();
    setPhase("paused");
  }, [clearTimer]);

  const restart = useCallback(() => {
    clearTimer();
    setStepIndex(-1);
    setPhase("playing");
    window.setTimeout(advance, 400);
  }, [clearTimer, advance]);

  const stepForward = useCallback(() => {
    if (!script || phase === "complete") return;
    clearTimer();
    setPhase("paused");
    advance();
  }, [script, phase, clearTimer, advance]);

  const explore = useCallback(() => {
    clearTimer();
    setExploreMode(true);
    setPhase("idle");
    setStepIndex(-1);
  }, [clearTimer]);

  useEffect(() => {
    if (!playing || !script) {
      clearTimer();
      return;
    }
    timerRef.current = window.setInterval(advance, STEP_MS);
    return clearTimer;
  }, [playing, script, advance, clearTimer]);

  useEffect(() => {
    setPhase("idle");
    setStepIndex(-1);
    setExploreMode(true);
    clearTimer();
  }, [graph.nodes.length, graph.edges.length, enabled, clearTimer]);

  const revealed = useMemo(() => {
    if (!script || !playbackActive || stepIndex < 0) {
      return { nodeIds: new Set<string>(), edgeKeys: new Set<string>() };
    }
    return revealedThroughStep(script, stepIndex);
  }, [script, playbackActive, stepIndex]);

  const activeStep = useMemo(() => {
    if (!script || stepIndex < 0 || stepIndex >= script.steps.length) return null;
    return script.steps[stepIndex];
  }, [script, stepIndex]);

  return {
    script,
    playbackActive,
    exploreMode,
    phase,
    stepIndex,
    stepCount: script?.steps.length ?? 0,
    caption: activeStep?.caption ?? "",
    activeType: activeStep?.type ?? "",
    revealedNodeIds: exploreMode ? undefined : playbackActive ? revealed.nodeIds : undefined,
    revealedEdgeKeys: exploreMode ? undefined : playbackActive ? revealed.edgeKeys : undefined,
    activeNodeId: playbackActive && !exploreMode ? activeStep?.nodeId ?? null : null,
    activeEdgeKey: playbackActive && !exploreMode ? activeStep?.edgeKey ?? null : null,
    hideUntilPlay: false,
    canPlay,
    play,
    pause,
    restart,
    stepForward,
    explore,
  };
}

export type AttackPathPlaybackControls = ReturnType<typeof useAttackPathPlayback>;
