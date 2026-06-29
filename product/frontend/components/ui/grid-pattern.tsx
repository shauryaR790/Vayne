import { cn } from "@/lib/utils";

export function GridPattern({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("vx-page-grid-bg pointer-events-none", className)}
    />
  );
}
