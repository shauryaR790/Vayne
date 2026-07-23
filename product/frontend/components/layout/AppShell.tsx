"use client";

import { Suspense, useState } from "react";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { PageEdgeVignette } from "@/components/layout/page-edge-vignette";
import { ResetWorkspaceBootstrap } from "@/components/dev/reset-workspace-bootstrap";
import { DotPattern } from "@/components/ui/dot-pattern";

function SidebarFallback() {
  return (
    <aside className="sticky top-0 z-30 hidden h-dvh w-[310px] shrink-0 border-r border-white/[0.08] bg-black lg:block" />
  );
}

export function AppShell({
  children,
  hideTopbar = false,
  workspaceMode = false,
  activeNav: _activeNav,
}: {
  children: React.ReactNode;
  hideTopbar?: boolean;
  workspaceMode?: boolean;
  /** @deprecated Sidebar no longer uses dashboard nav highlighting */
  activeNav?: string;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (workspaceMode) {
    return <>{children}</>;
  }

  return (
    <div className="relative flex min-h-dvh bg-black">
      <ResetWorkspaceBootstrap />
      <DotPattern
        width={24}
        height={24}
        cr={1}
        className="pointer-events-none fixed inset-0 z-0 text-white/[0.08]"
      />
      <PageEdgeVignette />
      <Suspense fallback={<SidebarFallback />}>
        <Sidebar
          activeNav={_activeNav}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
      </Suspense>
      <div className="relative flex min-h-dvh min-w-0 flex-1 flex-col overflow-x-hidden bg-transparent">
        {!hideTopbar && (
          <Topbar onOpenNav={() => setMobileNavOpen(true)} />
        )}
        <main className="relative z-10 min-h-0 flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
