"use client";

import { createContext, useContext } from "react";
import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

type AskSectionFn = (sectionTitle: string, engineContext: string) => void;

const InvestigationReportAskContext = createContext<AskSectionFn | null>(null);

export function InvestigationReportAskProvider({
  askSection,
  children,
}: {
  askSection: AskSectionFn;
  children: React.ReactNode;
}) {
  return (
    <InvestigationReportAskContext.Provider value={askSection}>
      {children}
    </InvestigationReportAskContext.Provider>
  );
}

export function SectionAskVayneButton({
  sectionTitle,
  engineContext,
  className,
  variant = "inline",
}: {
  sectionTitle: string;
  engineContext: string;
  className?: string;
  variant?: "inline" | "corner" | "subtle";
}) {
  const ask = useContext(InvestigationReportAskContext);

  if (!ask || !engineContext.trim()) return null;

  return (
    <button
      type="button"
      onClick={() => ask(sectionTitle, engineContext)}
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors",
        variant === "subtle" &&
          "border-0 bg-transparent px-0 py-0 text-white hover:text-white",
        variant === "corner" &&
          "border border-white bg-transparent px-2.5 py-1.5 text-white hover:bg-white hover:text-black",
        variant === "inline" &&
          "mt-4 border border-white bg-transparent px-3 py-2 text-white hover:bg-white hover:text-black",
        className,
      )}
    >
      <Sparkles className="size-3 shrink-0" />
      Ask VAYNE about this section
    </button>
  );
}

/** One ask control per report section — lives in the section header. */
export function SectionAskAside({
  sectionTitle,
  engineContext,
}: {
  sectionTitle: string;
  engineContext: string;
}) {
  return (
    <SectionAskVayneButton
      sectionTitle={sectionTitle}
      engineContext={engineContext}
      variant="subtle"
      className="mt-0"
    />
  );
}

export function buildSectionAskPrompt(sectionTitle: string, engineContext: string): string {
  return [
    `Explain the "${sectionTitle}" section of this investigation in depth for a security analyst.`,
    "Rules:",
    "- Use only the engine facts provided below. Do not invent evidence or scores.",
    "- Start with a plain-language summary, then go deeper into what matters operationally.",
    "- End with prioritized recommendations: what to validate, fix, or escalate first.",
    "",
    "Engine context:",
    engineContext,
  ].join("\n");
}
