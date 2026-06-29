"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  FileText,
  Info,
  LayoutGrid,
  Map,
  MoreHorizontal,
  Radar,
  Search,
  Server,
  Workflow,
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

const primaryNav: NavItem[] = [
  { id: "home", label: "Home", href: "/", icon: Radar },
  { id: "investigations", label: "Investigations", href: "/investigations", icon: LayoutGrid },
  { id: "reports", label: "Reports", href: "/investigations", icon: FileText },
];

const intelligenceNav: NavItem[] = [
  { id: "playbooks", label: "Playbooks", href: "/playbooks", icon: BookOpen },
  { id: "methodology", label: "Methodology", href: "/methodology", icon: Workflow },
  { id: "research", label: "Research", href: "/research", icon: Search },
  { id: "roadmap", label: "Roadmap", href: "/roadmap", icon: Map },
];

const systemNav: NavItem[] = [
  { id: "system", label: "System", href: "/system", icon: Server },
  { id: "about", label: "About", href: "/about", icon: Info },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
        active
          ? "bg-white/10 text-white"
          : "text-white/55 hover:bg-white/[0.06] hover:text-white/90",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0 stroke-[1.5]",
          active ? "text-white" : "text-white/45 group-hover:text-white/70",
        )}
        aria-hidden
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavSection({ items, isActive }: { items: NavItem[]; isActive: (id: string, href: string) => boolean }) {
  return (
    <div className="flex flex-col gap-0.5 px-2">
      {items.map((item) => (
        <NavLink key={item.id} item={item} active={isActive(item.id, item.href)} />
      ))}
    </div>
  );
}

function NavDivider() {
  return <div className="mx-3 my-2 border-t border-white/10" aria-hidden />;
}

export function Sidebar({ activeNav }: { activeNav?: string }) {
  const pathname = usePathname();

  const isActive = (id: string, href: string) => {
    if (activeNav) return activeNav === id;
    if (href === "/") return pathname === "/" || pathname === "/analyze";
    if (href === "/investigations")
      return pathname === "/investigations" || pathname.startsWith("/investigation/");
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside className="sticky top-0 z-20 hidden h-screen w-[240px] shrink-0 flex-col border-r border-white/10 bg-black lg:flex">
      {/* Search — Vercel-style */}
      <div className="px-3 pt-3">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-2 text-left transition-colors hover:border-white/20 hover:bg-white/[0.06]"
        >
          <Search className="size-3.5 shrink-0 text-white/40" strokeWidth={1.5} aria-hidden />
          <span className="flex-1 text-[13px] text-white/40">Find…</span>
          <kbd className="rounded border border-white/15 px-1.5 py-0.5 font-mono text-[10px] text-white/35">
            F
          </kbd>
        </button>
      </div>

      {/* Brand */}
      <Link
        href="/"
        className="mx-3 mt-3 flex items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors hover:bg-white/[0.06]"
      >
        <span className="flex size-5 items-center justify-center rounded bg-white text-[9px] font-black text-black">
          V
        </span>
        <span className="text-[13px] font-semibold tracking-wide text-white">VAYNE</span>
      </Link>

      {/* Navigation */}
      <nav className="mt-2 flex flex-1 flex-col overflow-y-auto pb-3">
        <NavSection items={primaryNav} isActive={isActive} />

        <NavDivider />

        <NavSection items={intelligenceNav} isActive={isActive} />

        <NavDivider />

        <NavSection items={systemNav} isActive={isActive} />
      </nav>

      {/* User footer — Vercel-style */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2 rounded-md px-1 py-1">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-400">
            S
          </div>
          <span className="min-w-0 flex-1 truncate text-[13px] text-white/80">operator</span>
          <button
            type="button"
            className="rounded p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white/70"
            aria-label="Menu"
          >
            <MoreHorizontal className="size-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            className="relative rounded p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white/70"
            aria-label="Notifications"
          >
            <Bell className="size-4" strokeWidth={1.5} />
            <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-sky-400" />
          </button>
        </div>
      </div>
    </aside>
  );
}
