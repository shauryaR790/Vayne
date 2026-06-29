"use client";

import { useCallback, useEffect, useState } from "react";

import { loadInvestigationBundle, type InvestigationBundle } from "@/lib/investigation-bundle";
import { InvestigationCanvas } from "@/components/canvas/InvestigationCanvas";
import { VayneThinking } from "@/components/shared/vayne-thinking";

export function InvestigationPageClient({ id }: { id: string }) {
  const [bundle, setBundle] = useState<InvestigationBundle | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setBundle(null);
    setError("");
    loadInvestigationBundle(id)
      .then((data) => {
        if (!cancelled) setBundle(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-6 text-[13px] text-white/50">
        {error}
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <VayneThinking label="Loading investigation" />
      </div>
    );
  }

  return <InvestigationCanvas bundle={bundle} />;
}
