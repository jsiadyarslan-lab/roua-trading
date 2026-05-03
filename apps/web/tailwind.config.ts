import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/**
 * Tailwind v4 Config — Minimal shim
 *
 * In Tailwind v4, theme configuration is handled via @theme inline in globals.css.
 * This file exists primarily for the tailwindcss-animate plugin.
 * Color values reference CSS custom properties directly (no hsl() wrapping needed
 * since the CSS variables contain complete color values like #0B0E14, not HSL channels).
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  plugins: [tailwindcssAnimate],
};
export default config;
