"use client";

import { useSearchParams } from "next/navigation";

import { VaneWorkspace } from "@/components/conversation/vayne-conversation";

export function HomeCanvas() {
  const searchParams = useSearchParams();
  const resumeId = searchParams.get("id");

  return <VaneWorkspace resumeId={resumeId} />;
}
