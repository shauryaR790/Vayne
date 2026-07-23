"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import { VaneSidebarBrand } from "@/components/brand/vane-logo";
import { DeveloperMenu } from "@/components/dev/developer-menu";
import { ANALYST_RESOURCE_NAV, type AnalystNavItem } from "@/lib/analyst-panel-nav";
import { resetConversationToHome } from "@/lib/conversation-session";
import {
  HISTORY_MAX,
  RECENT_INVESTIGATIONS_UPDATED,
  loadInvestigationHistory,
  syncRecentInvestigationsFromApi,
  type RecentInvestigation,
} from "@/lib/recent-investigations";
import { InvestigationHistoryList } from "@/components/workspace/investigation-history-rows";
import { getAuthProfile } from "@/lib/auth";
import { cn } from "@/lib/utils";

const TUTORIAL_PROMO_DISMISSED_KEY = "vane-sidebar-tutorial-promo-dismissed";

function SidebarTutorialPromo({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="relative mx-3 mb-3 rounded-lg border border-vx-border bg-vx-elevated p-4">
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-2 top-2 rounded p-1 text-white transition-colors hover:bg-white/10"
        aria-label="Dismiss tutorial prompt"
      >
        <X className="size-3.5" strokeWidth={2} aria-hidden />
      </button>
      <p className="pr-6 text-[13px] font-semibold leading-snug text-white">Learn how VAYNE works</p>
      <p className="mt-2 text-[12px] leading-relaxed text-white">
        Full walkthrough of the investigation report, scores, attack graph, and Ask VAYNE AI.
      </p>
      <Link
        href="/tutorial"
        className="mt-4 flex w-full items-center justify-center rounded-md bg-white px-3 py-2.5 text-[13px] font-semibold text-black transition-opacity hover:opacity-90"
      >
        Open tutorial
      </Link>
    </div>
  );
}

function SidebarDivider() {
  return <div className="mx-4 border-t border-vx-border" aria-hidden />;
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: AnalystNavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2.5 text-[16px] transition-colors",
        active
          ? "bg-vx-elevated text-white"
          : "text-white hover:bg-vx-panel hover:text-white",
      )}
    >
      <Icon className="size-[18px] shrink-0 opacity-85" strokeWidth={1.5} aria-hidden />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function SidebarPanel({
  onNavigate,
  showClose,
  onClose,
}: {
  onNavigate?: () => void;
  showClose?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<RecentInvestigation[]>([]);
  const [promoDismissed, setPromoDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(TUTORIAL_PROMO_DISMISSED_KEY) === "1";
  });
  const authProfile = typeof window === "undefined" ? null : getAuthProfile();

  const dismissTutorialPromo = useCallback(() => {
    window.localStorage.setItem(TUTORIAL_PROMO_DISMISSED_KEY, "1");
    setPromoDismissed(true);
  }, []);

  const showTutorialPromo = !promoDismissed && pathname !== "/tutorial";

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
    const synced = await syncRecentInvestigationsFromApi(HISTORY_MAX);
    setItems(synced);
  }, []);

  useEffect(() => {
    setItems(loadInvestigationHistory(HISTORY_MAX));
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
    onNavigate?.();
    router.replace("/");
  };

  const openInvestigation = (id: string) => {
    onNavigate?.();
    router.push(`/?id=${id}`);
  };

  return (
    <>
      <div className="shrink-0 px-3 pb-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <Link href="/" onClick={onNavigate} className="block px-2">
            <VaneSidebarBrand />
          </Link>
          {showClose && onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md text-white transition-colors hover:bg-white/10"
              aria-label="Close navigation"
            >
              <X className="size-5" strokeWidth={1.75} aria-hidden />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={startNew}
          className="mt-3 flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left text-[16px] text-white transition-colors hover:bg-vx-panel hover:text-white"
        >
          <Plus className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
          New Investigation
        </button>
      </div>

      <SidebarDivider />

      <nav className="shrink-0 px-3 py-4">
        <div className="flex flex-col gap-1">
          {ANALYST_RESOURCE_NAV.map((item) => (
            <NavLink
              key={item.id}
              item={item}
              active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </nav>

      <SidebarDivider />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3">
        <p className="mb-2 shrink-0 px-3 text-[13px] font-medium text-white">
          Investigation History
        </p>
        <div className="vx-no-scrollbar min-h-0 flex-1 overflow-y-auto">
          <InvestigationHistoryList
            items={items}
            activeId={activeId}
            onSelect={openInvestigation}
            showTime="always"
          />
        </div>
      </div>

      {showTutorialPromo ? <SidebarTutorialPromo onDismiss={dismissTutorialPromo} /> : null}

      <SidebarDivider />

      <div className="shrink-0 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1 px-1">
            {authProfile ? (
              <>
                <p className="truncate text-[15px] text-white">{authProfile.name || authProfile.email}</p>
                <p className="truncate text-[13px] text-white/60">{authProfile.team_name}</p>
              </>
            ) : (
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    href="/login"
                    onClick={onNavigate}
                    className="text-[15px] text-white hover:underline"
                  >
                    Sign in
                  </Link>
                  <span className="text-white/30" aria-hidden>
                    ·
                  </span>
                  <Link
                    href="/login?mode=register"
                    onClick={onNavigate}
                    className="text-[15px] text-white hover:underline"
                  >
                    Create account
                  </Link>
                </div>
                <p className="truncate text-[13px] text-white/60">Team workspace</p>
              </div>
            )}
          </div>
          <DeveloperMenu placement="above" />
        </div>
      </div>
    </>
  );
}

export function VaneSidebar({
  mobileOpen = false,
  onMobileClose,
}: {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
} = {}) {
  const pathname = usePathname();

  useEffect(() => {
    onMobileClose?.();
    // Close drawer when the route changes (e.g. browser back).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: pathname only
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onMobileClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, onMobileClose]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  return (
    <>
      <aside className="hidden h-dvh w-[20%] min-w-[272px] max-w-[320px] shrink-0 flex-col border-r border-vx-border bg-vx-sidebar lg:flex">
        <SidebarPanel />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/70"
            onClick={onMobileClose}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute left-0 top-0 flex h-full w-[min(320px,88vw)] flex-col border-r border-vx-border bg-vx-sidebar"
          >
            <SidebarPanel showClose onClose={onMobileClose} onNavigate={onMobileClose} />
          </aside>
        </div>
      ) : null}
    </>
  );
}
