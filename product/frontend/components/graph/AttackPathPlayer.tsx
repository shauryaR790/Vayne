"use client";

import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { PlaybackPhase } from "@/lib/attack-path-playback";
import { GraphTimeline } from "./GraphTimeline";

const STEP_MS = 1400;

export { STEP_MS };

export function AttackPathPlayer({
  phase,
  stepIndex,
  stepCount,
  caption,
  activeType,
  confidence,
  exploreMode,
  onPlay,
  onPause,
  onRestart,
  onStepForward,
  onExplore,
}: {
  phase: PlaybackPhase;
  stepIndex: number;
  stepCount: number;
  caption: string;
  activeType: string;
  confidence: number;
  exploreMode?: boolean;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  onStepForward: () => void;
  onExplore: () => void;
}) {
  const progress = stepCount > 0 ? ((stepIndex + 1) / stepCount) * 100 : 0;
  const inCinematic = !exploreMode && phase !== "idle";
  const showIdleCta = exploreMode || phase === "idle";

  return (
    <>
      {/* Always-visible watch control */}
      {showIdleCta ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[5] flex items-center justify-between gap-3 border-b border-white/[0.08] bg-black/60 px-3 py-2 backdrop-blur-sm">
          <p className="text-[10px] text-white/40">Attack flow · drag to pan</p>
          <button
            type="button"
            onClick={onPlay}
            className="pointer-events-auto inline-flex items-center gap-2 border border-white/35 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-black transition-opacity hover:opacity-90"
          >
            <Play className="size-3 fill-current" />
            Watch attack path
          </button>
        </div>
      ) : null}

      {inCinematic ? (
        <div className="pointer-events-none absolute inset-x-0 top-10 z-[3] border-b border-white/[0.08] bg-black/50 backdrop-blur-sm">
          <GraphTimeline activeType={activeType} compact />
        </div>
      ) : null}

      {inCinematic ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] border-t border-white/[0.08] bg-gradient-to-t from-black/90 via-black/75 to-transparent px-4 pb-4 pt-8">
          <div className="pointer-events-auto mx-auto max-w-3xl">
            <AnimatePresence mode="wait">
              <motion.p
                key={`${stepIndex}-${caption}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="mb-3 text-center font-mono text-[15px] font-bold leading-snug text-white md:text-[17px]"
              >
                <span className="mr-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">
                  Step {stepIndex + 1}/{stepCount}
                </span>
                {caption}
              </motion.p>
            </AnimatePresence>

            <div className="mb-3 h-0.5 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full bg-white/80"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {phase === "complete" ? (
                <button
                  type="button"
                  onClick={onRestart}
                  className="inline-flex items-center gap-1.5 border border-white/25 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/80 transition-colors hover:border-white/50 hover:text-white"
                >
                  <RotateCcw className="size-3" />
                  Replay
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={phase === "playing" ? onPause : onPlay}
                    className="inline-flex items-center gap-1.5 border border-white/40 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-black transition-opacity hover:opacity-90"
                  >
                    {phase === "playing" ? (
                      <>
                        <Pause className="size-3" /> Pause
                      </>
                    ) : (
                      <>
                        <Play className="size-3 fill-current" /> Resume
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onStepForward}
                    className="inline-flex items-center gap-1.5 border border-white/25 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/70 transition-colors hover:border-white/45 hover:text-white"
                  >
                    <SkipForward className="size-3" />
                    Next
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onExplore}
                className="inline-flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/40 transition-colors hover:text-white/70"
              >
                Explore full graph
              </button>
              {confidence > 0 ? (
                <span className="ml-1 font-mono text-[10px] text-white/35">{confidence}% conf</span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
