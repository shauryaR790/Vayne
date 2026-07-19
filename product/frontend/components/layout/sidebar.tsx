"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  FileText,
  LayoutGrid,
  Map,
  Plus,
  Radar,
  Search,
  Workflow,
  Telescope,
} from "lucide-react";

import { resetConversationToHome } from "@/lib/conversation-session";
import {
  RECENT_INVESTIGATIONS_UPDATED,
  SIDEBAR_RECENTS_MAX,
  formatHistoryLabel,
  loadRecentInvestigations,
  syncRecentInvestigationsFromApi,
  type RecentInvestigation,
} from "@/lib/recent-investigations";
import { DeveloperMenu } from "@/components/dev/developer-menu";
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
  { id: "research", label: "Research", href: "/research", icon: Telescope },
  { id: "roadmap", label: "Roadmap", href: "/roadmap", icon: Map },
];

function SidebarDivider() {
  return <div className="mx-3 border-t border-white/[0.08]" aria-hidden />;
}

function NavLink({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[14px] font-medium transition-colors",
        active
          ? "bg-white/[0.08] text-white"
          : "text-white hover:bg-white/[0.05] hover:text-white",
      )}
    >
      <Icon
        className={cn(
          "size-[18px] shrink-0 stroke-[1.5]",
          active ? "text-white" : "text-white/80 group-hover:text-white",
        )}
        aria-hidden
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavSection({
  items,
  isActive,
}: {
  items: NavItem[];
  isActive: (id: string, href: string) => boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-2">
      {items.map((item) => (
        <NavLink key={item.id} item={item} active={isActive(item.id, item.href)} />
      ))}
    </div>
  );
}

function RecentInvestigationRow({
  item,
  allItems,
  active,
  onSelect,
}: {
  item: RecentInvestigation;
  allItems: RecentInvestigation[];
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const label = formatHistoryLabel(item, allItems);
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className={cn(
        "group w-full truncate rounded-md px-2.5 py-2 text-left text-[14px] font-normal transition-colors duration-150",
        active
          ? "bg-white/[0.08] text-white"
          : "text-white hover:bg-white/[0.04] hover:text-white",
      )}
      title={label}
    >
      {label}
    </button>
  );
}

function SidebarRecents({
  activeId,
  query,
  onSelect,
}: {
  activeId: string | null;
  query: string;
  onSelect: (id: string) => void;
}) {
  const [items, setItems] = useState<RecentInvestigation[]>([]);

  const refresh = useCallback(async () => {
    const synced = await syncRecentInvestigationsFromApi(SIDEBAR_RECENTS_MAX);
    setItems(synced);
  }, []);

  useEffect(() => {
    setItems(loadRecentInvestigations(SIDEBAR_RECENTS_MAX));
    void refresh();

    const onUpdate = () => {
      void refresh();
    };
    window.addEventListener(RECENT_INVESTIGATIONS_UPDATED, onUpdate);
    window.addEventListener("focus", onUpdate);

    return () => {
      window.removeEventListener(RECENT_INVESTIGATIONS_UPDATED, onUpdate);
      window.removeEventListener("focus", onUpdate);
    };
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => (item.title || "").toLowerCase().includes(q));
  }, [items, query]);

  if (!filtered.length) {
    return (
      <p className="px-2.5 py-2 text-[13px] text-white/60">
        {query.trim() ? "No matching investigations" : "No recent investigations"}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {filtered.map((item) => (
        <RecentInvestigationRow
          key={item.id}
          item={item}
          allItems={filtered}
          active={activeId === item.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export function Sidebar({ activeNav }: { activeNav?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");

  const activeId = useMemo(() => {
    if (pathname === "/" || pathname === "/analyze") {
      return searchParams.get("id");
    }
    if (pathname.startsWith("/investigation/")) {
      return pathname.split("/")[2] ?? null;
    }
    return null;
  }, [pathname, searchParams]);

  const isActive = (id: string, href: string) => {
    if (activeNav) return activeNav === id;
    if (href === "/") return pathname === "/" || pathname === "/analyze";
    if (href === "/investigations") {
      return pathname === "/investigations" || pathname.startsWith("/investigation/");
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const startNewChat = () => {
    resetConversationToHome();
    if (pathname !== "/" && pathname !== "/analyze") {
      router.replace("/");
    }
  };

  const openConversation = (id: string) => {
    router.push(`/?id=${id}`);
  };

  return (
    <aside className="sticky top-0 z-30 hidden h-screen w-[310px] shrink-0 flex-col border-r border-white/[0.08] bg-black lg:flex">
      <div className="shrink-0 px-3 pb-2 pt-4">
        <Link
          href="/"
          className="inline-block text-[15px] font-semibold tracking-[0.16em] text-white transition-colors hover:text-white"
        >
          VAYNE
        </Link>

        <button
          type="button"
          onClick={startNewChat}
          className="mt-3 flex w-full items-center gap-2 rounded-lg border border-white/[0.1] px-2.5 py-2.5 text-[14px] font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.05]"
        >
          <Plus className="size-[18px] shrink-0 text-white" strokeWidth={1.75} aria-hidden />
          <span className="truncate">New Investigation</span>
        </button>

        <div className="relative mt-2">
          <label className="sr-only" htmlFor="sidebar-search">
            Search investigations
          </label>
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-white/60"
            strokeWidth={1.5}
            aria-hidden
          />
          <input
            id="sidebar-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search investigations"
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] py-2.5 pl-9 pr-3 text-[14px] text-white placeholder:text-white/50 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.05]"
          />
        </div>
      </div>

      <SidebarDivider />

      <nav className="shrink-0 py-2">
        <NavSection items={primaryNav} isActive={isActive} />
        <SidebarDivider />
        <div className="py-2">
          <NavSection items={intelligenceNav} isActive={isActive} />
        </div>
      </nav>

      <SidebarDivider />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 py-2">
        <p className="mb-1.5 shrink-0 px-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-white/70">
          Recent investigations
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarRecents
            activeId={activeId}
            query={searchQuery}
            onSelect={openConversation}
          />
        </div>
      </div>

      <SidebarDivider />

      <div className="shrink-0 p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-white/[0.05]"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[11px] font-semibold text-emerald-400">
              O
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-white">Operator</p>
              <p className="truncate text-[12px] text-white/70">Plan / Workspace</p>
            </div>
          </button>
          <DeveloperMenu />
        </div>
      </div>
    </aside>
  );
}
