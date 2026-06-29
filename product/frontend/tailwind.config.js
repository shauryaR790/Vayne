/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#000000",
        foreground: "#ffffff",
        surface: "#181818",
        "surface-raised": "#1f1f1f",
        elevated: "#242424",
        border: "rgba(255, 255, 255, 0.2)",
        "border-strong": "rgba(255, 255, 255, 0.5)",
        muted: "#888888",
        "muted-foreground": "#666666",
        accent: "#ffffff",
        "accent-foreground": "#000000",
        "accent-soft": "rgba(255, 255, 255, 0.08)",
        vercel: {
          bg: "#000000",
          panel: "#181818",
          hover: "#242424",
          border: "#27272a",
          "border-hover": "#3f3f46",
          muted: "#71717a",
          text: "#fafafa",
          success: "#ffffff",
          warning: "#cccccc",
          danger: "#999999",
          critical: "#ffffff",
          info: "#aaaaaa",
          finding: "#ffffff",
          cyan: "#cccccc",
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
