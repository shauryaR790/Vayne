import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { HomeCanvas } from "@/components/canvas/HomeCanvas";
import { VayneThinking } from "@/components/shared/vayne-thinking";

export default function HomePage() {
  return (
    <AppShell activeNav="home" workspaceMode>
      <Suspense
        fallback={
          <div className="flex min-h-[50vh] items-center justify-center">
            <VayneThinking label="Loading" />
          </div>
        }
      >
        <HomeCanvas />
      </Suspense>
    </AppShell>
  );
}
