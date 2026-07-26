"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { VaneWorkspace } from "@/components/conversation/vayne-conversation";
import { getActiveInvestigationId } from "@/lib/investigation-session";

export function HomeCanvas() {
  const searchParams = useSearchParams();
  const urlId = searchParams.get("id");
  const resumeId = useMemo(() => urlId || getActiveInvestigationId(), [urlId]);

  return <VaneWorkspace resumeId={resumeId} />;
}
