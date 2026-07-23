import { PRODUCT_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

const LOGO_SRC = "/vayne-logo.png";

/** Product mark — uploaded VAYNE wordmark. */
export function VaneMark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_SRC}
      alt=""
      width={Math.round(size * 3.2)}
      height={size}
      aria-hidden
      className={cn("shrink-0 object-contain object-left", className)}
      style={{ height: size, width: "auto" }}
    />
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
  const heights = {
    sm: 20,
    sidebar: 52,
    md: 26,
    lg: 36,
    hero: 44,
  } as const;
  const height = heights[size];

  // Uploaded asset is the full VAYNE wordmark — use it as the brand lockup.
  if (!showMark && !showWordmark) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_SRC}
      alt={PRODUCT_NAME}
      height={height}
      className={cn("shrink-0 object-contain object-left", className)}
      style={{ height, width: "auto" }}
    />
  );
}

export function VaneSidebarBrand({ className }: { className?: string }) {
  return <VaneLogo size="sidebar" className={cn("px-1", className)} />;
}

/** @deprecated Use VaneMark */
export function VaneLogoMark({
  size = 72,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return <VaneMark size={size} className={className} />;
}
