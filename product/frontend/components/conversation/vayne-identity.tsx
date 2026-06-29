"use client";

export type VaynePersona = "analyst" | "engine";

const PERSONA_LABEL: Record<VaynePersona, string> = {
  analyst: "Senior Security Analyst",
  engine: "Attack Reasoning Engine",
};

export function VayneIdentity({
  persona = "analyst",
  compact = false,
}: {
  persona?: VaynePersona;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "mb-3" : "mb-5"}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">
        VAYNE
      </p>
      <p className="mt-0.5 text-[13px] font-normal tracking-[0.01em] text-white/35">
        {PERSONA_LABEL[persona]}
      </p>
    </div>
  );
}

export function personaFromMessageId(id: string): VaynePersona {
  if (id.startsWith("brief-")) return "analyst";
  if (id.startsWith("reply-")) return "engine";
  return "analyst";
}
