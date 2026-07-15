"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

const WAVE_ORDER = [0, 1, 2, 3, 4, 5];
const WAVE_DELAY = 0.1;

/** Column-wave reveal — waits for nodes in DOM before animating. */
export function useGraphAnimations(
  containerRef: React.RefObject<HTMLDivElement | null>,
  ready: boolean,
  nodeCount: number,
  options?: { hero?: boolean },
) {
  const animatedForCount = useRef(0);
  const hero = options?.hero ?? false;

  useEffect(() => {
    if (!ready || !containerRef.current || nodeCount === 0) return;
    if (animatedForCount.current === nodeCount) return;

    const root = containerRef.current;
    const waveDelay = hero ? 0.14 : WAVE_DELAY;
    const edgeDelay = hero ? 0.75 : 0.55;

    const run = () => {
      const anyNode = root.querySelector(".graph-node-inner");
      if (!anyNode) return false;

      animatedForCount.current = nodeCount;

      for (const wave of WAVE_ORDER) {
        const nodes = root.querySelectorAll(`.graph-node-inner[data-wave="${wave}"]`);
        if (!nodes.length) continue;
        gsap.fromTo(
          nodes,
          { opacity: 0 },
          {
            opacity: wave === 5 ? 0.55 : 1,
            duration: hero ? 0.35 : 0.25,
            stagger: hero ? 0.12 : 0.1,
            ease: "power2.out",
            delay: wave * waveDelay,
            clearProps: "opacity",
          },
        );
      }

      const edges = root.querySelectorAll(".react-flow__edge-path");
      if (edges.length) {
        gsap.fromTo(
          edges,
          { opacity: 0 },
          {
            opacity: hero ? 0.75 : 0.35,
            duration: hero ? 0.55 : 0.4,
            stagger: hero ? 0.015 : 0.008,
            ease: "power2.out",
            delay: edgeDelay,
            clearProps: "opacity",
            onComplete: () => {
              if (!hero) return;
              root.querySelectorAll(".react-flow__edge-path.vx-edge-flow").forEach((edge) => {
                edge.classList.add("vx-edge-hero-glow");
              });
            },
          },
        );
      }

      return true;
    };

    if (run()) return;

    const t = window.setTimeout(() => {
      run();
    }, 120);
    return () => window.clearTimeout(t);
  }, [containerRef, ready, hero, nodeCount]);
}
