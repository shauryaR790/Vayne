import { renderAnsiShadow, renderAnsiShadowTitle } from "@/lib/ansi-shadow";
import { ENGINE_ASCII, VAYNE_ASCII } from "@/lib/vayne-ascii";
import { cn } from "@/lib/utils";

/** Page / section title rendered in ANSI Shadow block typography. */
export function AsciiPageTitle({
  text,
  className,
  /** When true, each word becomes its own stacked banner (better for long titles). */
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
      {/*
        Courier New keeps box-drawing glyphs equal-width. Variable monospace
        fonts (Geist, etc.) crush ANSI Shadow titles into overlapping mush.
      */}
      <pre
        aria-hidden
        className="max-w-full overflow-x-auto whitespace-pre text-[10px] leading-[1.15] text-white sm:text-[11px] md:text-[12px] lg:text-[13px]"
        style={{
          fontFamily: '"Courier New", Courier, ui-monospace, monospace',
          fontVariantLigatures: "none",
          letterSpacing: 0,
          tabSize: 1,
        }}
      >
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
    <div
      className={cn(
        "font-mono text-[10px] leading-[1.35] text-white/90 sm:text-[11px] md:text-[12px]",
        className,
      )}
      aria-label="VAYNE Engine"
      style={{
        fontFamily: '"Courier New", Courier, ui-monospace, monospace',
        fontVariantLigatures: "none",
      }}
    >
      <pre className="max-w-full overflow-x-hidden whitespace-pre">{VAYNE_ASCII}</pre>
      {showEngine ? (
        <pre className="mt-3 max-w-full overflow-x-hidden whitespace-pre">{ENGINE_ASCII}</pre>
      ) : null}
    </div>
  );
}
