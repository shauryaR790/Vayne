"use client";

import { Suspense, useState } from "react";

import { ResetWorkspaceBootstrap } from "@/components/dev/reset-workspace-bootstrap";
import { VaneSidebar } from "@/components/workspace/vane-sidebar";
import { MobileWorkspaceHeader } from "@/components/workspace/mobile-workspace-chrome";

function SidebarFallback() {
  return (
    <aside className="hidden h-dvh w-[20%] min-w-[272px] max-w-[320px] shrink-0 border-r border-vx-border bg-vx-sidebar lg:block" />
  );
}

export function VaneWorkspaceShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-vx-app text-white">
      <ResetWorkspaceBootstrap />
      <MobileWorkspaceHeader onOpenNav={() => setMobileNavOpen(true)} />
      <Suspense fallback={<SidebarFallback />}>
        <VaneSidebar
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
      </Suspense>
      <main className="min-w-0 flex-1 overflow-y-auto pt-12 [-ms-overflow-style:none] [scrollbar-width:none] lg:pt-0 [&::-webkit-scrollbar]:hidden">
        {children}
      </main>
    </div>
  );
}
