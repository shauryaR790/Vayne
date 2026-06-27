"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

const WAVE_ORDER = [0, 1, 2, 3, 4, 5];
const WAVE_DELAY = 0.1;

/** Column-wave reveal — opacity only, never transform .react-flow__node wrappers. */
export function useGraphAnimations(
  containerRef: React.RefObject<HTMLDivElement | null>,
  ready: boolean,
) {
  const ran = useRef(false);

  useEffect(() => {
    if (!ready || !containerRef.current || ran.current) return;
    ran.current = true;

    const root = containerRef.current;

    for (const wave of WAVE_ORDER) {
      const nodes = root.querySelectorAll(`.graph-node-inner[data-wave="${wave}"]`);
      gsap.fromTo(
        nodes,
        { opacity: 0 },
        {
          opacity: wave === 5 ? 0.55 : 1,
          duration: 0.25,
          stagger: 0.1,
          ease: "power2.out",
          delay: wave * WAVE_DELAY,
        },
      );
    }

    const edges = root.querySelectorAll(".react-flow__edge-path");
    gsap.fromTo(
      edges,
      { opacity: 0 },
      { opacity: 0.35, duration: 0.4, stagger: 0.008, ease: "power2.out", delay: 0.55 },
    );
  }, [containerRef, ready]);
}
