import { PRODUCT_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Minimal geometric mark — two strokes forming a V. */
export function VaneMark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <path
        d="M5.5 5.5L12 18.5L18.5 5.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 5.5H15.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        opacity="0.35"
      />
    </svg>
  );
}

export function VaneLogo({
  size = "md",
  showWordmark = true,
  showMark = true,
  className,
}: {
  size?: "sm" | "sidebar" | "md" | "lg" | "hero";
  showWordmark?: boolean;
  showMark?: boolean;
  className?: string;
}) {
  const sizes = {
    sm: { mark: 20, text: "text-[13px]", gap: "gap-2.5", tracking: "tracking-[0.16em]" },
    sidebar: { mark: 28, text: "text-[17px]", gap: "gap-2.5", tracking: "tracking-[0.14em]" },
    md: { mark: 26, text: "text-[15px]", gap: "gap-2.5", tracking: "tracking-[0.16em]" },
    lg: { mark: 36, text: "text-[22px]", gap: "gap-3", tracking: "tracking-[0.14em]" },
    hero: { mark: 44, text: "text-[28px]", gap: "gap-3", tracking: "tracking-[0.12em]" },
  }[size];

  return (
    <div className={cn("flex items-center", sizes.gap, className)}>
      {showMark ? <VaneMark size={sizes.mark} className="text-white" /> : null}
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
  return <VaneLogo size="sidebar" showMark={false} className={cn("px-1", className)} />;
}

/** @deprecated Use VaneMark */
export function VaneLogoMark({
  size = 72,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return <VaneMark size={size} className={cn("text-white", className)} />;
}
