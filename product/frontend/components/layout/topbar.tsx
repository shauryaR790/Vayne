"use client";

import { usePathname, useRouter } from "next/navigation";
import { Menu, Plus } from "lucide-react";

import { resetConversationToHome } from "@/lib/conversation-session";
import { DeveloperMenu } from "@/components/dev/developer-menu";
import { Button } from "@/components/ui/button";

const segmentMap: Record<string, string> = {
  "/": "Home",
  "/analyze": "Home",
  "/report": "Reports",
  "/exports": "Reports",
  "/investigations": "Investigations",
  "/playbooks": "Playbooks",
  "/methodology": "Methodology",
  "/research": "Research",
  "/roadmap": "Roadmap",
  "/system": "System",
  "/about": "About",
};

export function Topbar({ onOpenNav }: { onOpenNav?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  const goHome = () => {
    resetConversationToHome();
    router.replace("/");
  };

  let segment = "Home";
  if (pathname.startsWith("/investigation/")) {
    segment = "Investigation";
  } else if (pathname.startsWith("/report/")) {
    segment = "Report";
  } else {
    segment = segmentMap[pathname] ?? "Home";
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-white bg-black px-3 sm:px-5 lg:px-8">
      <div className="flex min-w-0 items-center gap-2">
        {onOpenNav ? (
          <button
            type="button"
            onClick={onOpenNav}
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-white transition-colors hover:bg-white/10 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="size-5" strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
        <p className="truncate text-[11px] font-medium uppercase tracking-[0.2em] text-white/60">
          VAYNE / {segment}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {pathname !== "/" && pathname !== "/analyze" && (
          <Button variant="secondary" size="sm" onClick={goHome} className="hidden sm:inline-flex">
            Home
          </Button>
        )}

        <Button size="sm" onClick={goHome}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">New Scan</span>
          <span className="sm:hidden">New</span>
        </Button>

        <DeveloperMenu placement="below" />

        <button
          type="button"
          className="hidden size-9 items-center justify-center border border-white text-[11px] font-bold uppercase sm:flex"
        >
          AR
        </button>
      </div>
    </header>
  );
}
