"use client";

import { useSearchParams } from "next/navigation";

import { VayneConversation } from "@/components/conversation/vayne-conversation";

export function HomeCanvas() {
  const searchParams = useSearchParams();
  const resumeId = searchParams.get("id");

  return <VayneConversation resumeId={resumeId} />;
}
