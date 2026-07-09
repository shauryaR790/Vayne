"use client";

import { Suspense } from "react";

import { ResetWorkspaceBootstrap } from "@/components/dev/reset-workspace-bootstrap";
import { VaneSidebar } from "@/components/workspace/vane-sidebar";

function SidebarFallback() {
  return (
    <aside className="h-screen w-[20%] min-w-[272px] max-w-[320px] shrink-0 border-r border-vx-border bg-vx-sidebar" />
  );
}

export function VaneWorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-vx-app text-white">
      <ResetWorkspaceBootstrap />
      <Suspense fallback={<SidebarFallback />}>
        <VaneSidebar />
      </Suspense>
      <main className="min-w-0 flex-1 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </main>
    </div>
  );
}
