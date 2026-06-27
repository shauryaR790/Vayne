"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { IconUpload } from "@/components/ui/icons";

export function LandingSidebar() {
  const ref = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const onUpload = pathname === "/upload";

  useEffect(() => {
    if (!ref.current) return;
    gsap.fromTo(ref.current, { x: -16, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: "power2.out" });
  }, []);

  return (
    <aside
      ref={ref}
      className="sticky top-0 h-screen w-sidebar shrink-0 border-r border-vercel-border bg-vercel-bg flex flex-col"
    >
      <div className="p-6 border-b border-vercel-border">
        <Link href="/upload" className="text-body font-bold text-white tracking-tight">
          VAYNE
        </Link>
        <p className="vx-card-title mt-3">Workstation</p>
      </div>

      <nav className="flex-1 p-3">
        <p className="px-3 py-2 vx-card-title">System</p>
        <Link
          href="/upload"
          className={`flex items-center gap-3 mx-1 px-3 py-2.5 text-body font-semibold rounded-md transition-all duration-nav ${
            onUpload ? "vx-nav-active pl-4" : "text-vercel-muted hover:bg-vercel-hover hover:text-white"
          }`}
        >
          <IconUpload className="shrink-0 w-4 h-4" />
          Upload
        </Link>
      </nav>

      <div className="p-6 border-t border-vercel-border">
        <p className="vx-card-title text-center">Attack Reasoning Engine</p>
        <p className="text-metadata text-vercel-muted text-center mt-2">v1.0.0</p>
      </div>
    </aside>
  );
}
