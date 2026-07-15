"use client";

import { motion } from "motion/react";

import { cn } from "@/lib/utils";

export const hoverCardClasses =
  "group relative overflow-hidden border border-white/80 bg-vx-app shadow-none transition-[border-color,box-shadow] duration-300 hover:border-white hover:shadow-[0_0_0_1px_rgba(255,255,255,0.15),0_8px_32px_rgba(0,0,0,0.55)]";

export const hoverCardMotion = {
  whileHover: { y: -3 },
  whileTap: { scale: 0.992, y: 0 },
  transition: { type: "spring" as const, stiffness: 420, damping: 28 },
};

export function HoverCardChrome() {
  return (
    <>
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-gradient-to-r from-transparent via-white to-transparent transition-transform duration-500 group-hover:scale-x-100" />
      <span className="pointer-events-none absolute inset-y-0 left-0 w-px origin-top scale-y-0 bg-white/50 transition-transform duration-500 delay-75 group-hover:scale-y-100" />
      <span className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-white/[0.07] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
    </>
  );
}

type HoverCardProps = {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "button";
  lift?: boolean;
  chrome?: boolean;
  id?: string;
  onClick?: React.MouseEventHandler<HTMLElement>;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
};

export function HoverCard({
  children,
  className,
  as = "div",
  lift = true,
  chrome = true,
  id,
  onClick,
  type,
  disabled,
}: HoverCardProps) {
  const shared = {
    id,
    onClick,
    disabled,
    ...(lift ? hoverCardMotion : {}),
    className: cn(hoverCardClasses, className),
  };

  const inner = (
    <>
      {chrome && <HoverCardChrome />}
      {children}
    </>
  );

  if (as === "section") {
    return <motion.section {...shared}>{inner}</motion.section>;
  }
  if (as === "article") {
    return <motion.article {...shared}>{inner}</motion.article>;
  }
  if (as === "button") {
    return (
      <motion.button type={type ?? "button"} {...shared}>
        {inner}
      </motion.button>
    );
  }
  return <motion.div {...shared}>{inner}</motion.div>;
}
