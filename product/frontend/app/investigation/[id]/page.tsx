import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { InvestigationPageClient } from "@/components/canvas/InvestigationPageClient";
import { VayneThinking } from "@/components/shared/vayne-thinking";

export default function InvestigationPage({ params }: { params: { id: string } }) {
  return (
    <AppShell activeNav="investigations">
      <Suspense
        fallback={
          <div className="flex min-h-[50vh] items-center justify-center">
            <VayneThinking label="Loading" />
          </div>
        }
      >
        <InvestigationPageClient id={params.id} />
      </Suspense>
    </AppShell>
  );
}
