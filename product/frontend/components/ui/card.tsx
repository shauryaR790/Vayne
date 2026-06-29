"use client";

import * as React from "react";

import { HoverCard } from "@/components/shared/hover-card";
import { cn } from "@/lib/utils";

function Card({ className, children }: React.ComponentProps<"div">) {
  return (
    <HoverCard className={cn("bg-surface text-foreground", className)}>
      {children}
    </HoverCard>
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "relative flex items-start justify-between gap-3 border-b border-white/20 px-5 py-4",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("text-[11px] font-bold uppercase tracking-[0.15em]", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("relative px-5 py-5", className)} {...props} />
  );
}

export { Card, CardHeader, CardTitle, CardContent };
