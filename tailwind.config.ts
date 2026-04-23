import type { Config } from "tailwindcss";

/**
 * Stackle Tailwind Theme Extension
 * Extends the default Tailwind palette with Stackle design tokens.
 * All colors map directly to theme/colors.ts semantic tokens.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./theme/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Primary / Brand ──────────────────────
        primary: {
          50:  "#F5F7FF",
          100: "#EEF2FF",
          500: "#6366F1",
          600: "#4F46E5",
          700: "#4338CA",
        },

        // ── Success ──────────────────────────────
        success: {
          50:  "#F0FDF4",
          100: "#DCFCE7",
          500: "#22C55E",
          600: "#16A34A",
        },

        // ── Danger ───────────────────────────────
        danger: {
          50:  "#FEF2F2",
          100: "#FEE2E2",
          500: "#EF4444",
          600: "#DC2626",
        },

        // ── Warning ──────────────────────────────
        warning: {
          50:  "#FFFBEB",
          100: "#FEF3C7",
          500: "#F59E0B",
          600: "#D97706",
        },

        // ── Info (use sparingly) ──────────────────
        info: {
          100: "#DBEAFE",
          600: "#2563EB",
        },
      },

      fontFamily: {
        sans: ["var(--font-jakarta-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },

      boxShadow: {
        card:      "0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.07)",
        "card-md": "0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.07)",
        "card-lg": "0 10px 15px -3px rgb(0 0 0 / 0.07), 0 4px 6px -4px rgb(0 0 0 / 0.07)",
      },

      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
    },
  },
  plugins: [],
};

export default config;
