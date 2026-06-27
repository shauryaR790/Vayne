/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        vercel: {
          bg: "#000000",
          panel: "#0a0a0a",
          hover: "#18181b",
          border: "#27272a",
          "border-hover": "#3f3f46",
          muted: "#71717a",
          text: "#fafafa",
          success: "#00C16A",
          warning: "#FFB224",
          danger: "#FF4D4D",
          critical: "#FF4D4D",
          info: "#3B82F6",
          finding: "#8B5CF6",
          cyan: "#06b6d4",
        },
      },
      width: {
        sidebar: "260px",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        "card-title": ["11px", { lineHeight: "16px", letterSpacing: "0.12em" }],
        metadata: ["12px", { lineHeight: "16px" }],
        body: ["14px", { lineHeight: "20px" }],
        card: ["16px", { lineHeight: "24px" }],
        section: ["24px", { lineHeight: "32px" }],
        title: ["48px", { lineHeight: "56px" }],
        metric: ["40px", { lineHeight: "48px" }],
      },
      transitionDuration: {
        nav: "180ms",
      },
    },
  },
  plugins: [],
};
