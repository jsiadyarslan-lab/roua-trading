"use client";

import { useTranslations, useLocale } from "next-intl";
import type { CSSProperties } from "react";
import { motion } from "framer-motion";
import { CouncilSigil } from "@/components/council/CouncilSigil";

/**
 * Shared Roua Trading logo — uses the AI Council Sigil as the platform mark.
 *
 * Three sizes:
 *   - "sm"  — mobile header (sigil 36)
 *   - "md"  — landing navbar / footer (sigil 44)
 *   - "lg"  — desktop dashboard header (sigil 64)
 *
 * Two layouts:
 *   - "horizontal" (default): sigil LEFT, wordmark + tagline RIGHT
 *   - "stacked": sigil TOP, wordmark + tagline BELOW (centered)
 *
 * Tagline is locale-aware:
 *   - ar: "المجلس الذكي"
 *   - en: "AI COUNCIL"
 *   - others: "AI COUNCIL"
 *
 * Container has a living pulse animation — box-shadow breathes with the
 * council's gradient so the logo feels alive rather than static.
 */
export interface LogoProps {
  size?: "sm" | "md" | "lg";
  layout?: "horizontal" | "stacked";
  showWordmark?: boolean;
  showTagline?: boolean;
  textColor?: string;
  taglineColor?: string;
  style?: CSSProperties;
  interactive?: boolean;
  staticSigil?: boolean;
  /** Show the glassy container background + breathing glow. Default: true. */
  glowContainer?: boolean;
}

const SIZE_MAP = {
  sm: { sigil: 36, brand: 16, tagline: 8, gap: 8, padding: 8, radius: 10 },
  md: { sigil: 44, brand: 20, tagline: 9.5, gap: 10, padding: 10, radius: 12 },
  lg: { sigil: 64, brand: 26, tagline: 11.5, gap: 14, padding: 12, radius: 14 },
} as const;

const TAGLINES: Record<string, string> = {
  ar: "المجلس الذكي",
  en: "AI COUNCIL",
};

export function Logo({
  size = "md",
  layout = "horizontal",
  showWordmark,
  showTagline = true,
  textColor,
  taglineColor,
  style,
  interactive = true,
  staticSigil = false,
  glowContainer = true,
}: LogoProps) {
  const t = useTranslations();
  const locale = useLocale();
  const dims = SIZE_MAP[size];
  const showWord = showWordmark ?? true;
  const isStacked = layout === "stacked";

  const brandName = t("common.brand");
  const tagline = TAGLINES[locale] || TAGLINES.en;

  const outerStyle: CSSProperties = isStacked
    ? {
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: dims.gap,
        cursor: interactive ? "pointer" : "default",
        transition: interactive ? "transform 220ms ease" : undefined,
        ...style,
      }
    : {
        display: "inline-flex",
        alignItems: "center",
        gap: dims.gap,
        cursor: interactive ? "pointer" : "default",
        transition: interactive ? "transform 220ms ease" : undefined,
        ...style,
      };

  return (
    <motion.div
      style={outerStyle}
      onMouseEnter={interactive ? (e) => { e.currentTarget.style.transform = "scale(1.03)"; } : undefined}
      onMouseLeave={interactive ? (e) => { e.currentTarget.style.transform = "scale(1)"; } : undefined}
    >
      {/* Sigil mark — with breathing outer glow */}
      <motion.div
        style={{
          position: "relative",
          width: dims.sigil,
          height: dims.sigil,
          borderRadius: dims.radius,
          background: "radial-gradient(circle at 50% 40%, #0D1520, #020308)",
          border: "1px solid rgba(168, 85, 247, 0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          overflow: "hidden",
          padding: dims.padding,
          boxSizing: "border-box",
        }}
        animate={glowContainer && !staticSigil ? {
          boxShadow: [
            "0 0 18px rgba(168, 85, 247, 0.35), 0 0 0 1px rgba(168, 85, 247, 0.10), inset 0 0 12px rgba(168, 85, 247, 0.15)",
            "0 0 32px rgba(168, 85, 247, 0.65), 0 0 0 1px rgba(168, 85, 247, 0.30), inset 0 0 18px rgba(168, 85, 247, 0.30)",
            "0 0 18px rgba(168, 85, 247, 0.35), 0 0 0 1px rgba(168, 85, 247, 0.10), inset 0 0 12px rgba(168, 85, 247, 0.15)",
          ],
        } : undefined}
        transition={glowContainer && !staticSigil ? {
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
        } : undefined}
      >
        {/* Outer halo — rotating gradient ring */}
        {glowContainer && !staticSigil && (
          <motion.div
            aria-hidden
            style={{
              position: "absolute",
              inset: -2,
              borderRadius: dims.radius + 2,
              background: "conic-gradient(from 0deg, #A855F7, #6366F1, #06B6D4, #A855F7)",
              opacity: 0.18,
              filter: "blur(8px)",
              pointerEvents: "none",
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
          />
        )}
        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CouncilSigil size={dims.sigil - dims.padding * 2} animated={!staticSigil} />
        </div>
      </motion.div>

      {/* Wordmark + tagline */}
      {showWord && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            minWidth: 0,
            alignItems: isStacked ? "center" : "flex-start",
          }}
        >
          <span
            style={{
              fontFamily: "'Cairo', system-ui, sans-serif",
              fontWeight: 900,
              fontSize: dims.brand,
              color: textColor ?? "#F1F5F9",
              letterSpacing: "-0.015em",
              lineHeight: 1.05,
              whiteSpace: "nowrap",
              textShadow: "0 0 12px rgba(168, 85, 247, 0.25)",
            }}
          >
            {brandName}
          </span>
          {showTagline && (
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: dims.tagline,
                color: taglineColor ?? "#A855F7",
                letterSpacing: locale === "ar" ? "0.06em" : "0.18em",
                fontWeight: 700,
                opacity: 0.95,
                lineHeight: 1,
                whiteSpace: "nowrap",
                textTransform: locale === "ar" ? "none" : "uppercase",
                textShadow: "0 0 8px rgba(168, 85, 247, 0.4)",
              }}
            >
              {tagline}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
