"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

export function AnimatedCounter({
  value,
  suffix = "",
  className = "",
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const obj = { n: 0 };
    const tween = gsap.to(obj, {
      n: value,
      duration: 0.8,
      ease: "power2.out",
      onUpdate: () => setDisplay(Math.round(obj.n)),
    });
    return () => {
      tween.kill();
    };
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {display}
      {suffix}
    </span>
  );
}
