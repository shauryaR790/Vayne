import type { CSSProperties } from "react";

import { renderAnsiShadow, renderAnsiShadowTitle } from "@/lib/ansi-shadow";
import { ENGINE_ASCII, VAYNE_ASCII } from "@/lib/vayne-ascii";
import { cn } from "@/lib/utils";

const ASCII_PRE_CLASS =
  "max-w-full overflow-x-auto whitespace-pre text-[10px] leading-[1.35] text-white/90 sm:text-[11px] md:text-[12px]";

const ASCII_PRE_STYLE: CSSProperties = {
  fontFamily: '"Courier New", Courier, ui-monospace, monospace',
  fontVariantLigatures: "none",
  letterSpacing: 0,
};

/** Page title in the same ANSI Shadow typography as the VAYNE brand mark. */
export function AsciiPageTitle({
  text,
  className,
  stackWords = true,
}: {
  text: string;
  className?: string;
  stackWords?: boolean;
}) {
  const art = stackWords ? renderAnsiShadowTitle(text) : renderAnsiShadow(text);
  return (
    <div className={cn("min-w-0", className)}>
      <h1 className="sr-only">{text}</h1>
      <pre aria-hidden className={ASCII_PRE_CLASS} style={ASCII_PRE_STYLE}>
        {art}
      </pre>
    </div>
  );
}

/** Brand lockup — hardcoded VAYNE + ENGINE marks for the workstation. */
export function VayneAsciiTitle({
  className,
  showEngine = true,
}: {
  className?: string;
  showEngine?: boolean;
}) {
  return (
    <div className={cn(className)} aria-label="VAYNE Engine">
      <pre className={ASCII_PRE_CLASS} style={ASCII_PRE_STYLE}>
        {VAYNE_ASCII}
      </pre>
      {showEngine ? (
        <pre className={cn(ASCII_PRE_CLASS, "mt-3")} style={ASCII_PRE_STYLE}>
          {ENGINE_ASCII}
        </pre>
      ) : null}
    </div>
  );
}
