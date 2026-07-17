/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* VANE theme — values live in styles/theme.css */
        vx: {
          app: "var(--vx-app)",
          sidebar: "var(--vx-sidebar)",
          panel: "var(--vx-panel)",
          "section-body": "var(--vx-section-body)",
          inset: "var(--vx-inset)",
          elevated: "var(--vx-elevated)",
          analyst: "var(--vx-analyst)",
          composer: "var(--vx-analyst-composer)",
          text: "var(--vx-text)",
          secondary: "var(--vx-text-secondary)",
          muted: "var(--vx-text-muted)",
          body: "var(--vx-text-body)",
          border: "var(--vx-border)",
          "border-strong": "var(--vx-border-strong)",
          accent: "var(--vx-accent)",
        },
        /* Legacy aliases → theme vars */
        background: "var(--vx-app)",
        foreground: "var(--vx-text)",
        surface: "var(--vx-panel)",
        "surface-raised": "var(--vx-elevated)",
        elevated: "var(--vx-elevated)",
        border: "var(--vx-border)",
        muted: "var(--vx-text-secondary)",
        "muted-foreground": "var(--vx-text-muted)",
        accent: "var(--vx-text)",
        "accent-foreground": "var(--vx-app)",
        "accent-soft": "var(--vx-border)",
          vercel: {
          bg: "var(--vx-app)",
          panel: "var(--vx-panel)",
          hover: "var(--vx-elevated)",
          border: "var(--vx-border)",
          "border-hover": "var(--vx-border)",
          muted: "var(--vx-text)",
          text: "var(--vx-text)",
          success: "var(--vx-text)",
          warning: "var(--vx-text)",
          danger: "var(--vx-text)",
          critical: "var(--vx-text)",
          info: "var(--vx-text)",
          finding: "var(--vx-text)",
          cyan: "var(--vx-text)",
        },
      },
      width: {
        sidebar: "200px",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "0px",
        lg: "0px",
      },
    },
  },
  plugins: [],
};
