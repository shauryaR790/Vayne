"use client";



import { useEffect, useRef, type ReactNode, type RefObject } from "react";

import gsap from "gsap";

import { Plus, Loader2 } from "lucide-react";

import { HoverCard } from "@/components/shared/hover-card";
import { MarqueeStrip } from "@/components/shared/marquee-strip";
import { USER_MESSAGES } from "@/lib/user-messages";

import {

  RecentTargetCard,

  type RecentTargetItem,

} from "@/components/home/recent-target-card";



interface HomeLandingProps {

  recentTargets: RecentTargetItem[];

  files: File[];

  status: string;

  analyzing: boolean;

  backendOnline: boolean;

  onFilesSelected: (files: FileList | null) => void;

  onAnalyze: () => void;

  onRecentTarget?: (id: string) => void;

  analysisPanel?: ReactNode;

  results?: ReactNode;

  resultsAnchorRef?: RefObject<HTMLDivElement>;

}



const RECENT_TARGET_SLOTS = 4;



export function HomeLanding({

  recentTargets,

  files,

  status,

  analyzing,

  backendOnline,

  onFilesSelected,

  onAnalyze,

  onRecentTarget,

  analysisPanel,

  results,

  resultsAnchorRef,

}: HomeLandingProps) {

  const fileInputRef = useRef<HTMLInputElement>(null);

  const pageRef = useRef<HTMLDivElement>(null);

  const slots = Array.from({ length: RECENT_TARGET_SLOTS }, (_, i) => recentTargets[i]);



  useEffect(() => {

    if (!pageRef.current) return;

    const ctx = gsap.context(() => {

      gsap.fromTo(

        pageRef.current!.querySelectorAll(".vx-enter"),

        { opacity: 0, y: 24 },

        {

          opacity: 1,

          y: 0,

          duration: 0.55,

          stagger: 0.07,

          ease: "power3.out",

          delay: 0.15,

        },

      );

    }, pageRef);

    return () => ctx.revert();

  }, []);



  return (

    <div ref={pageRef} className="relative w-full overflow-x-hidden">

      <MarqueeStrip label="UPLOAD FILE" fullBleed className="mb-5 lg:mb-6" />

      <div className="px-5 pb-4 [--page-bleed-x:1.25rem] lg:px-8 lg:pb-5 lg:[--page-bleed-x:2rem]">

      <div className="mx-auto w-full max-w-[1400px]">

        <div className="grid grid-cols-1 items-stretch gap-5 lg:h-[min(720px,calc(100vh-7rem))] lg:max-h-[min(720px,calc(100vh-7rem))] lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-6 lg:overflow-hidden">

          <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden text-left">

            <input

              ref={fileInputRef}

              type="file"

              multiple

              className="hidden"

              onChange={(e) => onFilesSelected(e.target.files)}

            />



            <HoverCard className="vx-enter w-full shrink-0" lift>
              <div className="relative flex items-center gap-3 px-4 py-3">

                <button

                  type="button"

                  onClick={() => fileInputRef.current?.click()}

                  className="flex size-9 shrink-0 items-center justify-center border border-white bg-black text-white/70 transition-colors hover:bg-white hover:text-black"

                  aria-label="Upload evidence"

                >

                  <Plus className="size-4" />

                </button>

                <input

                  type="text"

                  readOnly

                  value={files.length ? files.map((f) => f.name).join(", ") : ""}

                  placeholder="Upload scan evidence or enter target"

                  className="min-w-0 flex-1 bg-black text-base font-medium text-white outline-none placeholder:text-white/40"

                />

                <button

                  type="button"

                  onClick={onAnalyze}

                  disabled={analyzing || !files.length || !backendOnline}

                  className="shrink-0 border border-white bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-black transition-colors hover:bg-background hover:text-white disabled:opacity-40"

                >

                  {analyzing ? (

                    <span className="inline-flex items-center gap-2">

                      <Loader2 className="size-3.5 animate-spin" />

                      Running

                    </span>

                  ) : (

                    "Analyze"

                  )}

                </button>

              </div>

            </HoverCard>



            {status && !analyzing && (

              <p className="vx-enter mt-4 shrink-0 text-[11px] font-bold uppercase tracking-wider text-white/50">

                {status}

              </p>

            )}



            {!backendOnline && (

              <p className="vx-enter mt-2 shrink-0 text-[11px] font-bold uppercase tracking-wider text-white/40">

                {USER_MESSAGES.serviceOfflineShort}

              </p>

            )}



            <div className="vx-enter mt-6 flex min-h-0 flex-1 flex-col">

              <p className="shrink-0 text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">

                Recent Targets

              </p>

              <div className="mt-3 grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-3">

                {slots.map((target, i) => (

                  <RecentTargetCard

                    key={target?.id ?? `empty-${i}`}

                    target={target}

                    empty={!target}

                    disabled={analyzing || !target}

                    onClick={target ? () => onRecentTarget?.(target.id) : undefined}

                  />

                ))}

              </div>

            </div>

          </div>



          <div className="vx-enter hidden h-full min-h-0 overflow-hidden lg:flex lg:flex-col">
            {analysisPanel}
          </div>

        </div>



        <div className="vx-enter mt-6 lg:hidden">{analysisPanel}</div>



        {results && (

          <div ref={resultsAnchorRef} className="vx-results mt-16 w-full scroll-mt-8">

            {results}

          </div>

        )}

      </div>

      </div>

    </div>

  );

}


