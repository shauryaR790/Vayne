import { ENGINE_ASCII, VAYNE_ASCII } from "@/lib/vayne-ascii";
import { cn } from "@/lib/utils";

/** Blocky VAYNE + ENGINE wordmark used on workstation + IDE page headers. */
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
    >
      <pre className="max-w-full overflow-x-hidden whitespace-pre">{VAYNE_ASCII}</pre>
      {showEngine ? (
        <pre className="mt-3 max-w-full overflow-x-hidden whitespace-pre">{ENGINE_ASCII}</pre>
      ) : null}
    </div>
  );
}
