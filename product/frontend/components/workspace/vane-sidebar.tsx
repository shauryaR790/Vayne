"use client";

import Link from "next/link";

import { VaneSidebarBrand } from "@/components/brand/vane-logo";

export function VaneSidebar() {
  return (
    <aside className="flex h-screen w-[20%] min-w-[272px] max-w-[320px] shrink-0 flex-col border-r border-vx-border bg-vx-sidebar">
      <div className="shrink-0 px-3 pt-4">
        <Link href="/" className="block">
          <VaneSidebarBrand />
        </Link>
      </div>
    </aside>
  );
}
