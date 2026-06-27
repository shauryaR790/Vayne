"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  IconFindings,
  IconGraph,
  IconOverview,
  IconPaths,
  IconProof,
  IconReports,
  IconSettings,
  IconUpload,
} from "@/components/ui/icons";

const ANALYSIS_NAV = [
  { href: "", label: "Overview", icon: IconOverview },
  { href: "/paths", label: "Attack Paths", icon: IconPaths },
  { href: "/graph", label: "Graph", icon: IconGraph },
];

const INTEL_NAV = [
  { href: "/findings", label: "Findings", icon: IconFindings },
  { href: "/reports", label: "Reports", icon: IconReports },
  { href: "/proof", label: "Proof", icon: IconProof },
];

function NavSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="py-2">
      <p className="px-3 py-2 vx-card-title !text-left">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof IconOverview;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`relative flex items-center gap-3 rounded-md mx-2 px-3 py-2 text-body font-semibold transition-all duration-nav ${
        active
          ? "vx-nav-active pl-4 text-white"
          : "text-vercel-muted hover:bg-vercel-hover hover:text-white"
      }`}
    >
      <Icon className={`shrink-0 w-4 h-4 ${active ? "text-vercel-info" : "opacity-70"}`} />
      {label}
    </Link>
  );
}

export function Sidebar({
  investigationId,
  investigationName,
  status,
  durationSeconds,
}: {
  investigationId: string;
  investigationName?: string;
  status?: string;
  durationSeconds?: number;
}) {
  const pathname = usePathname();
  const base = `/investigation/${investigationId}`;

  function isActive(href: string) {
    if (href === "") return pathname === base;
    return pathname.startsWith(`${base}${href}`);
  }

  const statusPill =
    status === "complete"
      ? "vx-status-pill text-vercel-success border-vercel-success/30 bg-vercel-success/5"
      : status === "failed"
        ? "vx-status-pill text-vercel-danger border-vercel-danger/30 bg-vercel-danger/5"
        : "vx-status-pill text-vercel-warning border-vercel-warning/30 bg-vercel-warning/5";

  return (
    <aside className="sticky top-0 h-screen w-sidebar shrink-0 border-r border-vercel-border bg-vercel-bg flex flex-col overflow-y-auto">
      <div className="p-4 border-b border-vercel-border space-y-3">
        <Link
          href="/upload"
          className="text-body font-bold text-white hover:text-vercel-muted transition-colors duration-nav"
        >
          VAYNE
        </Link>
        <div>
          <p className="vx-card-title !text-left">Investigation</p>
          <p className="text-body font-bold text-white truncate mt-2">
            {investigationName || "Investigation"}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {status && <span className={statusPill}>{status}</span>}
            {durationSeconds != null && (
              <span className="text-metadata text-vercel-muted">{durationSeconds.toFixed(1)}s</span>
            )}
          </div>
          <p className="text-metadata font-mono text-vercel-muted truncate mt-2">{investigationId}</p>
        </div>
      </div>

      <nav className="flex-1 py-2">
        <NavSection title="Analysis">
          {ANALYSIS_NAV.map((item) => (
            <NavLink
              key={item.href}
              href={`${base}${item.href}`}
              label={item.label}
              icon={item.icon}
              active={isActive(item.href)}
            />
          ))}
        </NavSection>

        <div className="mx-4 my-2 border-t border-vercel-border" />

        <NavSection title="Intelligence">
          {INTEL_NAV.map((item) => (
            <NavLink
              key={item.href}
              href={`${base}${item.href}`}
              label={item.label}
              icon={item.icon}
              active={isActive(item.href)}
            />
          ))}
        </NavSection>
      </nav>

      <div className="p-3 border-t border-vercel-border space-y-1">
        <p className="px-3 py-1 vx-card-title !text-left">System</p>
        <Link
          href="/upload"
          className="flex items-center gap-3 mx-2 px-3 py-2 text-body font-semibold text-vercel-muted hover:bg-vercel-hover hover:text-white rounded-md transition-all duration-nav"
        >
          <IconUpload className="shrink-0 w-4 h-4" />
          New Upload
        </Link>
        <Link
          href="/upload"
          className="flex items-center gap-3 mx-2 px-3 py-2 text-body font-semibold text-vercel-muted hover:bg-vercel-hover hover:text-white rounded-md transition-all duration-nav"
        >
          <IconSettings className="shrink-0 w-4 h-4" />
          Settings
        </Link>
      </div>
    </aside>
  );
}
