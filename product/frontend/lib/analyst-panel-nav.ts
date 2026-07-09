import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  FileText,
  FolderOpen,
  GitBranch,
  Info,
  LayoutGrid,
  Map,
  Settings,
  ShieldAlert,
  Telescope,
  Workflow,
} from "lucide-react";

export type AnalystNavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

export const ANALYST_WORKSPACE_NAV: AnalystNavItem[] = [
  { id: "investigations", label: "Investigations", href: "/investigations", icon: LayoutGrid },
  { id: "evidence", label: "Evidence", href: "/upload", icon: FolderOpen },
  { id: "attack-paths", label: "Attack Paths", href: "/attack-paths", icon: GitBranch },
  { id: "findings", label: "Findings", href: "/investigations", icon: ShieldAlert },
  { id: "reports", label: "Reports", href: "/report", icon: FileText },
  { id: "settings", label: "Settings", href: "/system", icon: Settings },
];

export const ANALYST_RESOURCE_NAV: AnalystNavItem[] = [
  { id: "playbooks", label: "Playbooks", href: "/playbooks", icon: BookOpen },
  { id: "methodology", label: "How to Use", href: "/methodology", icon: Workflow },
  { id: "research", label: "Research", href: "/research", icon: Telescope },
  { id: "roadmap", label: "Roadmap", href: "/roadmap", icon: Map },
  { id: "about", label: "About VANE", href: "/about", icon: Info },
];

export function isAnalystNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname === "/analyze";
  if (href === "/investigations") {
    return pathname === "/investigations" || pathname.startsWith("/investigation/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
