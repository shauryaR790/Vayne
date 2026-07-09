"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Target } from "lucide-react";

import { VaneSidebarBrand } from "@/components/brand/vane-logo";
import { DeveloperMenu } from "@/components/dev/developer-menu";
import { ANALYST_RESOURCE_NAV, type AnalystNavItem } from "@/lib/analyst-panel-nav";
import { resetConversationToHome } from "@/lib/conversation-session";
import {
  RECENT_INVESTIGATIONS_UPDATED,
  SIDEBAR_RECENTS_MAX,
  loadRecentInvestigations,
  syncRecentInvestigationsFromApi,
  type RecentInvestigation,
} from "@/lib/recent-investigations";
import { cn } from "@/lib/utils";

function SidebarDivider() {
  return <div className="mx-4 border-t border-vx-border" aria-hidden />;
}

function NavLink({ item, active }: { item: AnalystNavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2.5 text-[16px] transition-colors",
        active
          ? "bg-vx-elevated text-white"
          : "text-vx-secondary hover:bg-vx-panel hover:text-white",
      )}
    >
      <Icon className="size-[18px] shrink-0 opacity-85" strokeWidth={1.5} aria-hidden />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function RecentRow({
  item,
  active,
  onSelect,
}: {
  item: RecentInvestigation;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className={cn(
        "w-full truncate rounded-md px-3 py-2.5 text-left text-[16px] transition-colors",
        active
          ? "bg-vx-elevated text-white"
          : "text-vx-secondary hover:bg-vx-panel hover:text-white",
      )}
      title={item.title || "Security Investigation"}
    >
      {item.title || "Security Investigation"}
    </button>
  );
}

export function VaneSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<RecentInvestigation[]>([]);

  const activeId = useMemo(() => {
    if (pathname === "/" || pathname === "/analyze") {
      return searchParams.get("id");
    }
    if (pathname.startsWith("/investigation/")) {
      return pathname.split("/")[2] ?? null;
    }
    return null;
  }, [pathname, searchParams]);

  const refresh = useCallback(async () => {
    const synced = await syncRecentInvestigationsFromApi(SIDEBAR_RECENTS_MAX);
    setItems(synced);
  }, []);

  useEffect(() => {
    setItems(loadRecentInvestigations(SIDEBAR_RECENTS_MAX));
    void refresh();
    const onUpdate = () => void refresh();
    window.addEventListener(RECENT_INVESTIGATIONS_UPDATED, onUpdate);
    window.addEventListener("focus", onUpdate);
    return () => {
      window.removeEventListener(RECENT_INVESTIGATIONS_UPDATED, onUpdate);
      window.removeEventListener("focus", onUpdate);
    };
  }, [refresh]);

  const startNew = () => {
    resetConversationToHome();
    router.replace("/");
  };

  const openInvestigation = (id: string) => {
    router.push(`/?id=${id}`);
  };

  return (
    <aside className="flex h-screen w-[20%] min-w-[272px] max-w-[320px] shrink-0 flex-col border-r border-vx-border bg-vx-sidebar">
      <div className="shrink-0 px-3 pb-3 pt-4">
        <Link href="/" className="block">
          <VaneSidebarBrand />
        </Link>

        <button
          type="button"
          onClick={startNew}
          className="mt-3 flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left text-[16px] text-vx-secondary transition-colors hover:bg-vx-panel hover:text-white"
        >
          <Plus className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
          New Investigation
        </button>
      </div>

      <SidebarDivider />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-4">
        <p className="mb-2 px-3 text-[13px] font-medium text-vx-muted">Recent Investigations</p>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {items.length ? (
            <div className="flex flex-col gap-1">
              {items.map((item) => (
                <RecentRow
                  key={item.id}
                  item={item}
                  active={activeId === item.id}
                  onSelect={openInvestigation}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {[
                "Kerberos Attack Surface Review",
                "Apache HTTP Service Review",
                "SMB RCE Investigation",
              ].map((label) => (
                <p key={label} className="truncate px-3 py-2.5 text-[16px] text-vx-muted">
                  {label}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      <SidebarDivider />

      <nav className="shrink-0 px-3 py-4">
        <div className="flex flex-col gap-1">
          {ANALYST_RESOURCE_NAV.map((item) => (
            <NavLink
              key={item.id}
              item={item}
              active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
            />
          ))}
        </div>
      </nav>

      <SidebarDivider />

      <div className="shrink-0 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3 px-1">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-vx-panel text-vx-secondary">
              <Target className="size-4" strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[15px] text-white">Operator</p>
              <p className="truncate text-[13px] text-vx-muted">Workspace</p>
            </div>
          </div>
          <DeveloperMenu placement="above" />
        </div>
      </div>
    </aside>
  );
}
