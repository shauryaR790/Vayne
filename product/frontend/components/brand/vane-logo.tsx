import Image from "next/image";

import { PRODUCT_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function VaneLogo({
  size = "md",
  showWordmark = true,
  className,
}: {
  size?: "sm" | "sidebar" | "md" | "lg" | "hero";
  showWordmark?: boolean;
  className?: string;
}) {
  const sizes = {
    sm: { icon: 24, text: "text-[13px]", gap: "gap-3", tracking: "tracking-[0.2em]" },
    sidebar: { icon: 36, text: "text-[19px]", gap: "gap-2", tracking: "tracking-[0.16em]" },
    md: { icon: 32, text: "text-[15px]", gap: "gap-3", tracking: "tracking-[0.2em]" },
    lg: { icon: 48, text: "text-[22px]", gap: "gap-3", tracking: "tracking-[0.18em]" },
    hero: { icon: 72, text: "text-[28px]", gap: "gap-3", tracking: "tracking-[0.16em]" },
  }[size];

  return (
    <div className={cn("flex items-center", sizes.gap, className)}>
      <Image
        src="/vane-logo.png"
        alt={PRODUCT_NAME}
        width={sizes.icon}
        height={sizes.icon}
        className="shrink-0 object-contain"
        priority
      />
      {showWordmark ? (
        <span
          className={cn(
            "font-semibold leading-none text-white",
            sizes.text,
            sizes.tracking,
          )}
        >
          {PRODUCT_NAME}
        </span>
      ) : null}
    </div>
  );
}

export function VaneSidebarBrand({ className }: { className?: string }) {
  return (
    <Image
      src="/vane-logo.png"
      alt={PRODUCT_NAME}
      width={248}
      height={80}
      className={cn("h-[80px] w-full max-w-full object-contain object-left", className)}
      priority
    />
  );
}

export function VaneLogoMark({
  size = 72,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/vane-logo.png"
      alt={PRODUCT_NAME}
      width={size}
      height={size}
      className={cn("object-contain", className)}
      priority
    />
  );
}
