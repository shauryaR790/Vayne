"use client";

import { useRouter } from "next/navigation";
import type { ReactNode, MouseEvent } from "react";

import { getActiveInvestigationId } from "@/lib/investigation-session";
import { cn } from "@/lib/utils";

/** Navigate home — resumes the ongoing investigation when one is active. */
export function goToWorkspaceHome(
  router: { push: (href: string) => void },
) {
  const id = getActiveInvestigationId();
  router.push(id ? `/?id=${encodeURIComponent(id)}` : "/");
}

/** Brand / logo control that returns to the active investigation instead of wiping it. */
export function WorkspaceHomeLink({
  children,
  className,
  onNavigate,
}: {
  children: ReactNode;
  className?: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    onNavigate?.();
    goToWorkspaceHome(router);
  };

  return (
    <a href="/" onClick={onClick} className={cn(className)}>
      {children}
    </a>
  );
}
