"use client";

import { cn } from "@/lib/utils";
import type { InvestigationMode } from "@/lib/investigation-mode";

export function InvestigationModeToggle({
  value,
  onChange,
  disabled,
  className,
}: {
  value: InvestigationMode;
  onChange: (mode: InvestigationMode) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5 px-0.5 pb-2", className)}>
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/40">
        Investigation mode
      </p>
      <div className="flex flex-col gap-1">
        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-white/75 transition-colors hover:bg-white/[0.04]">
          <input
            type="radio"
            name="investigation-mode"
            className="accent-white"
            checked={value === "combined"}
            disabled={disabled}
            onChange={() => onChange("combined")}
          />
          <span>Merge into one investigation</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-white/75 transition-colors hover:bg-white/[0.04]">
          <input
            type="radio"
            name="investigation-mode"
            className="accent-white"
            checked={value === "separate"}
            disabled={disabled}
            onChange={() => onChange("separate")}
          />
          <span>Analyze files separately</span>
        </label>
      </div>
    </div>
  );
}
