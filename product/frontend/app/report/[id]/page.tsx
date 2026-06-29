import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ReportPageClient } from "@/components/canvas/ReportPageClient";
import { VayneThinking } from "@/components/shared/vayne-thinking";

export default function ReportPage({ params }: { params: { id: string } }) {
  return (
    <AppShell activeNav="reports">
      <Suspense
        fallback={
          <div className="flex min-h-[50vh] items-center justify-center">
            <VayneThinking label="Loading" />
          </div>
        }
      >
        <ReportPageClient id={params.id} />
      </Suspense>
    </AppShell>
  );
}
