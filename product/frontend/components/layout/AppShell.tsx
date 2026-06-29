import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { PageEdgeVignette } from "@/components/layout/page-edge-vignette";
import { DotPattern } from "@/components/ui/dot-pattern";

export function AppShell({
  children,
  activeNav,
  hideTopbar = false,
}: {
  children: React.ReactNode;
  activeNav?: string;
  hideTopbar?: boolean;
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
      <Sidebar activeNav={activeNav} />
      <div className="relative flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden bg-transparent">
        {!hideTopbar && <Topbar />}
        <main className="relative z-10 min-h-screen flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
