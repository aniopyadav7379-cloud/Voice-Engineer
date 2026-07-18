import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Mapped to CSS variables (see globals.css :root / .light) so the
        // same "ink-950 ... ink-50" scale reverses cleanly between dark
        // (default) and light mode instead of hardcoding one palette.
        ink: {
          950: "rgb(var(--ink-950) / <alpha-value>)",
          900: "rgb(var(--ink-900) / <alpha-value>)",
          800: "rgb(var(--ink-800) / <alpha-value>)",
          700: "rgb(var(--ink-700) / <alpha-value>)",
          600: "rgb(var(--ink-600) / <alpha-value>)",
          500: "rgb(var(--ink-500) / <alpha-value>)",
          400: "rgb(var(--ink-400) / <alpha-value>)",
          300: "rgb(var(--ink-300) / <alpha-value>)",
          200: "rgb(var(--ink-200) / <alpha-value>)",
          100: "rgb(var(--ink-100) / <alpha-value>)",
          50: "rgb(var(--ink-50) / <alpha-value>)",
        },
        signal: {
          DEFAULT: "#FF7A45",
          50: "#FFF1EA",
          100: "#FFDDC9",
          300: "#FFAB80",
          500: "#FF7A45",
          600: "#E85E2A",
          700: "#C2481C",
        },
        stream: {
          DEFAULT: "#39D3D0",
          100: "#CFF8F6",
          300: "#84E7E3",
          500: "#39D3D0",
          600: "#22ACA9",
          700: "#178683",
        },
        ok: "#4ADE80",
        warn: "#FBBF24",
        danger: "#FB7185",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 30px -12px rgba(0,0,0,0.6)",
        glow: "0 0 0 1px rgba(255,122,69,0.35), 0 0 24px -4px rgba(255,122,69,0.45)",
        "glow-stream": "0 0 0 1px rgba(57,211,208,0.35), 0 0 24px -4px rgba(57,211,208,0.45)",
      },
      keyframes: {
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "70%": { transform: "scale(1.6)", opacity: "0" },
          "100%": { transform: "scale(1.6)", opacity: "0" },
        },
        "bar-bounce": {
          "0%, 100%": { transform: "scaleY(0.3)" },
          "50%": { transform: "scaleY(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 1.8s cubic-bezier(0.2,0.6,0.4,1) infinite",
        "bar-bounce": "bar-bounce 0.9s ease-in-out infinite",
        shimmer: "shimmer 2.2s linear infinite",
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(255,122,69,0.12), transparent), radial-gradient(ellipse 60% 40% at 90% 10%, rgba(57,211,208,0.10), transparent)",
      },
    },
  },
  plugins: [],
};

export default config;
