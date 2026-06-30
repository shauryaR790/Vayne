import { Suspense } from "react";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { PageEdgeVignette } from "@/components/layout/page-edge-vignette";
import { DotPattern } from "@/components/ui/dot-pattern";

function SidebarFallback() {
  return (
    <aside className="sticky top-0 z-30 hidden h-screen w-[310px] shrink-0 border-r border-white/[0.08] bg-black lg:block" />
  );
}

export function AppShell({
  children,
  hideTopbar = false,
  activeNav: _activeNav,
}: {
  children: React.ReactNode;
  hideTopbar?: boolean;
  /** @deprecated Sidebar no longer uses dashboard nav highlighting */
  activeNav?: string;
}) {
  return (
    <div className="relative flex min-h-screen bg-black">
      <DotPattern
        width={24}
        height={24}
        cr={1}
        className="pointer-events-none fixed inset-0 z-0 text-white/[0.08]"
      />
      <PageEdgeVignette />
      <Suspense fallback={<SidebarFallback />}>
        <Sidebar activeNav={_activeNav} />
      </Suspense>
      <div className="relative flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden bg-transparent">
        {!hideTopbar && <Topbar />}
        <main className="relative z-10 min-h-screen flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
