"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

const WAVE_ORDER = [0, 1, 2, 3, 4, 5];
const WAVE_DELAY = 0.1;

/** Column-wave reveal — opacity only, never transform .react-flow__node wrappers. */
export function useGraphAnimations(
  containerRef: React.RefObject<HTMLDivElement | null>,
  ready: boolean,
  options?: { hero?: boolean },
) {
  const ran = useRef(false);
  const hero = options?.hero ?? false;

  useEffect(() => {
    if (!ready || !containerRef.current || ran.current) return;
    ran.current = true;

    const root = containerRef.current;
    const waveDelay = hero ? 0.14 : WAVE_DELAY;
    const edgeDelay = hero ? 0.75 : 0.55;

    for (const wave of WAVE_ORDER) {
      const nodes = root.querySelectorAll(`.graph-node-inner[data-wave="${wave}"]`);
      gsap.fromTo(
        nodes,
        { opacity: 0 },
        {
          opacity: wave === 5 ? 0.55 : 1,
          duration: hero ? 0.35 : 0.25,
          stagger: hero ? 0.12 : 0.1,
          ease: "power2.out",
          delay: wave * waveDelay,
        },
      );
    }

    const edges = root.querySelectorAll(".react-flow__edge-path");
    gsap.fromTo(
      edges,
      { opacity: 0 },
      {
        opacity: hero ? 0.75 : 0.35,
        duration: hero ? 0.55 : 0.4,
        stagger: hero ? 0.015 : 0.008,
        ease: "power2.out",
        delay: edgeDelay,
        onComplete: () => {
          if (!hero) return;
          root.querySelectorAll(".react-flow__edge-path.vx-edge-flow").forEach((edge) => {
            edge.classList.add("vx-edge-hero-glow");
          });
        },
      },
    );
  }, [containerRef, ready, hero]);
}
