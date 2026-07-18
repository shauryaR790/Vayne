"use client";

import Link from "next/link";
import { BookOpen, FolderOpen, MessageSquare, Plus } from "lucide-react";
import { motion } from "motion/react";

import { SessionAnalyzingBar } from "@/components/workspace/home/session-analyzing-bar";
import { cn } from "@/lib/utils";

function ActionCard({
  icon: Icon,
  label,
  onClick,
  href,
}: {
  icon: typeof FolderOpen;
  label: string;
  onClick?: () => void;
  href?: string;
}) {
  const className = cn(
    "group flex h-[92px] flex-col justify-between rounded-xl border border-white/[0.08]",
    "bg-white/[0.03] p-4 text-left transition-colors duration-150",
    "hover:border-white/[0.14] hover:bg-white/[0.05]",
  );
  const body = (
    <>
      <Icon
        className="size-[18px] text-white/45 transition-colors group-hover:text-white/70"
        strokeWidth={1.5}
        aria-hidden
      />
      <span className="text-[13px] text-white/65 transition-colors group-hover:text-white/90">
        {label}
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

export function InvestigationNoEvidence({
  onUpload,
  onFocusAnalyst,
  onNewInvestigation,
  onOpenInvestigation: _onOpenInvestigation,
  busy,
  analyzingLabel,
}: {
  onUpload: () => void;
  onFocusAnalyst: () => void;
  onNewInvestigation: () => void;
  onOpenInvestigation: (id: string) => void;
  busy?: boolean;
  analyzingLabel?: string;
}) {
  return (
    <>
      <div className="flex min-h-full w-full flex-1 items-center justify-center px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
          className="mx-auto w-full max-w-[380px]"
        >
          <div className="grid grid-cols-2 gap-3">
            <ActionCard icon={FolderOpen} label="Upload evidence" onClick={onUpload} />
            <ActionCard icon={MessageSquare} label="Ask analyst" onClick={onFocusAnalyst} />
            <ActionCard icon={Plus} label="New investigation" onClick={onNewInvestigation} />
            <ActionCard icon={BookOpen} label="Tutorial" href="/tutorial" />
          </div>
        </motion.div>
      </div>
      {busy ? <SessionAnalyzingBar label={analyzingLabel} /> : null}
    </>
  );
}
