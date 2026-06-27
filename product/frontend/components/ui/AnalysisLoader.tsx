"use client";

import { useEffect, useState } from "react";
import gsap from "gsap";

const STEPS = [
  "Discovering assets…",
  "Building graph…",
  "Loading exploit intelligence…",
  "Enumerating attack paths…",
  "Computing confidence…",
  "Generating reports…",
  "Complete.",
];

export function AnalysisLoader({ active }: { active: boolean }) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      setStep(0);
      return;
    }
    setVisible(true);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      if (i >= STEPS.length) {
        window.clearInterval(id);
        return;
      }
      setStep(i);
    }, 700);
    return () => window.clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (!visible) return;
    gsap.fromTo(".vx-loader-line", { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: 0.25 });
  }, [step, visible]);

  if (!visible) return null;

  return (
    <div className="vx-panel border border-vercel-border p-4 space-y-2">
      {STEPS.slice(0, step + 1).map((line, idx) => (
        <p
          key={line}
          className={`vx-loader-line text-body font-semibold ${
            idx === step ? "text-white" : "text-vercel-muted"
          }`}
        >
          {line}
        </p>
      ))}
    </div>
  );
}
