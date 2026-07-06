import Image from "next/image";

import { PRODUCT_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function VaneLogo({
  size = "md",
  showWordmark = true,
  className,
}: {
  size?: "sm" | "md" | "lg" | "hero";
  showWordmark?: boolean;
  className?: string;
}) {
  const sizes = {
    sm: { icon: 24, text: "text-[13px]" },
    md: { icon: 32, text: "text-[15px]" },
    lg: { icon: 48, text: "text-[22px]" },
    hero: { icon: 72, text: "text-[28px]" },
  }[size];

  return (
    <div className={cn("flex items-center gap-3", className)}>
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
            "font-semibold tracking-[0.2em] text-white",
            sizes.text,
          )}
        >
          {PRODUCT_NAME}
        </span>
      ) : null}
    </div>
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
