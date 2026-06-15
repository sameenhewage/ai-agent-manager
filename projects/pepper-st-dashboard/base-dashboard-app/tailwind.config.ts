import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/**
 * PEPPER ST. design tokens are defined as CSS variables in `app/globals.css`
 * (mapped 1:1 from the approved demo prototype: brand rose #be185d, AI violet
 * #7c3aed, WhatsApp green #25d366, radius 14px, Plus Jakarta Sans + JetBrains Mono).
 * Tailwind references those variables so shadcn/ui primitives are restyled to the
 * demo, never the default shadcn theme.
 */
const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        panel: "var(--panel)",
        panel2: "var(--panel2)",
        hover: "var(--hover)",
        text: "var(--text)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        line: "var(--line)",
        line2: "var(--line2)",
        accent: {
          DEFAULT: "var(--accent)",
          weak: "var(--accent-weak)",
          line: "var(--accent-line)",
          fg: "var(--on-accent)",
        },
        ai: {
          DEFAULT: "var(--ai)",
          weak: "var(--ai-weak)",
          line: "var(--ai-line)",
          fg: "var(--on-ai)",
        },
        wa: {
          DEFAULT: "var(--wa)",
          weak: "var(--wa-weak)",
          deep: "var(--wa-deep)",
        },
        good: { DEFAULT: "var(--good)", weak: "var(--good-weak)" },
        warn: { DEFAULT: "var(--warn)", weak: "var(--warn-weak)" },
        bad: { DEFAULT: "var(--bad)", weak: "var(--bad-weak)" },
        info: { DEFAULT: "var(--info)", weak: "var(--info-weak)" },
        teal: { DEFAULT: "var(--teal)", weak: "var(--teal-weak)" },
      },
      borderRadius: {
        lg: "var(--r)",
        md: "12px",
        sm: "var(--rs)",
      },
      boxShadow: {
        soft: "var(--shadow)",
        card: "var(--shadow-sm)",
        pop: "var(--shadow-pop)",
      },
      fontFamily: {
        sans: ["var(--ui)"],
        mono: ["var(--mono)"],
      },
      keyframes: {
        fade: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "none" },
        },
        pulse_ring: {
          "0%": { boxShadow: "0 0 0 0 color-mix(in srgb, var(--good) 60%, transparent)" },
          "70%": { boxShadow: "0 0 0 6px transparent" },
          "100%": { boxShadow: "0 0 0 0 transparent" },
        },
      },
      animation: {
        fade: "fade .25s ease",
        "pulse-ring": "pulse_ring 2s infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
