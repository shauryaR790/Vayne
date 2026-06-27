import type { ReactNode } from "react";

export function Panel({
  title,
  children,
  action,
  hero,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  hero?: boolean;
}) {
  return (
    <section className={hero ? "vx-panel-hero" : "vx-panel"}>
      {(title || action) && (
        <div className="flex items-center justify-center px-4 py-3 border-b border-vercel-border relative">
          {title ? <h3 className="vx-card-title">{title}</h3> : <span />}
          {action && <div className="absolute right-4">{action}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function SidePanel({
  title,
  children,
  centered,
}: {
  title: string;
  children: ReactNode;
  centered?: boolean;
}) {
  return (
    <section className="vx-panel">
      <div className="px-4 py-4 border-b border-vercel-border text-center">
        <h3 className="vx-card-title">{title}</h3>
      </div>
      <div className={`p-4 space-y-4 text-body text-white ${centered ? "text-center" : ""}`}>
        {children}
      </div>
    </section>
  );
}

export function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-body min-w-0">
      <span className="text-metadata text-vercel-muted uppercase tracking-wide shrink-0">{label}</span>
      <span className="text-white tabular-nums font-semibold min-w-0 max-w-[65%] text-right break-all">
        {value}
      </span>
    </div>
  );
}

export function WorkstationLayout({
  main,
  side,
}: {
  main: ReactNode;
  side: ReactNode;
}) {
  return (
    <div className="vx-workstation">
      <div className="vx-workstation-main">{main}</div>
      <aside className="vx-workstation-side vx-side-stack">{side}</aside>
    </div>
  );
}
