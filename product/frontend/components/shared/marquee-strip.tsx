"use client";

import { cn } from "@/lib/utils";

const REPEAT = 24;

function MarqueeBlock({ idPrefix, label }: { idPrefix: string; label: string }) {
  return (
    <div className="flex shrink-0 items-center">
      {Array.from({ length: REPEAT }).map((_, i) => (
        <span key={`${idPrefix}-${i}`} className="inline-flex shrink-0 items-center">
          <span className="px-5 text-brutal text-lg font-black uppercase tracking-[0.06em] text-white sm:px-7 sm:text-xl">
            {label}
          </span>
          <span
            className="px-2 text-2xl font-black leading-none text-white sm:text-3xl"
            aria-hidden
          >
            ·
          </span>
        </span>
      ))}
    </div>
  );
}

export function MarqueeStrip({
  label,
  className,
  fullBleed = false,
}: {
  label: string;
  className?: string;
  fullBleed?: boolean;
}) {
  const strip = (
    <div className="overflow-hidden border-y-2 border-white bg-black py-5 sm:py-6">
      <div className="vx-marquee-track vx-marquee-forward flex w-max will-change-transform">
        <MarqueeBlock idPrefix="a" label={label} />
        <div aria-hidden className="flex shrink-0">
          <MarqueeBlock idPrefix="b" label={label} />
        </div>
      </div>
    </div>
  );

  if (!fullBleed) {
    return <div className={cn("overflow-hidden", className)}>{strip}</div>;
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        "-mx-[var(--page-bleed-x,0px)] w-[calc(100%+2*var(--page-bleed-x,0px))]",
        className,
      )}
    >
      {strip}
    </div>
  );
}
