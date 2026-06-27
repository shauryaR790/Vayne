import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconOverview(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}

export function IconPaths(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="3" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="8" cy="4" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="13" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <path d="M4.5 7.5L7 5M9 5l3.5 6.5" />
    </svg>
  );
}

export function IconGraph(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="4" cy="12" r="1.5" />
      <circle cx="8" cy="6" r="1.5" />
      <circle cx="12" cy="10" r="1.5" />
      <path d="M5 11l2.5-4M9.5 7l1.5 2" />
    </svg>
  );
}

export function IconFindings(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 3h10v10H3z" />
      <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" />
    </svg>
  );
}

export function IconReports(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 2h6l2 2v10H4z" />
      <path d="M10 2v2h2M6 7h4M6 9.5h4M6 12h2.5" />
    </svg>
  );
}

export function IconProof(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 4h10v8H3z" />
      <path d="M5.5 7l1.5 1.5L10.5 5" />
    </svg>
  );
}

export function IconUpload(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8 10V3M5.5 5.5 8 3l2.5 2.5" />
      <path d="M3 11v1.5h10V11" />
    </svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M4.05 4.05l1.06 1.06M10.9 10.9l1.06 1.06M4.05 11.95l1.06-1.06M10.9 5.1l1.06-1.06" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 8.5l2.5 2.5 6.5-6.5" />
    </svg>
  );
}
