"use client";

import { usePathname, useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { resetConversationToHome } from "@/lib/conversation-session";
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

export function Topbar() {
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
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-white bg-black px-5 lg:px-8">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/60">
        VAYNE / {segment}
      </p>

      <div className="flex items-center gap-2">
        {pathname !== "/" && pathname !== "/analyze" && (
          <Button variant="secondary" size="sm" onClick={goHome}>
            Home
          </Button>
        )}

        <Button size="sm" onClick={goHome}>
          <Plus className="size-4" />
          New Scan
        </Button>

        <button
          type="button"
          className="flex size-9 items-center justify-center border border-white text-[11px] font-bold uppercase"
        >
          AR
        </button>
      </div>
    </header>
  );
}
