"use client";

import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { CouncilSigil } from "@/components/council/CouncilSigil";

/**
 * Shared Roua Trading logo — uses the AI Council Sigil as the platform mark.
 *
 * Replaces the previous CosmicOrb/TrendingUp icons with the unified
 * "seven glowing points" sigil: 6 council members around the ring + 1 central
 * consensus node. This is the same sigil that powers /dashboard/council, so
 * the brand identity is now synonymous with the council architecture itself.
 *
 * Three sizes:
 *   - "sm"  (sigil 26) — mobile header, footer
 *   - "md"  (sigil 40) — desktop nav, landing navbar
 *   - "lg"  (sigil 60) — auth pages, big brand moments
 *
 * Tagline below the logo reads "AI STRATEGIC COUNCIL" in JetBrains Mono
 * uppercase — the same voice used by the council dashboard.
 */
export interface LogoProps {
  size?: "sm" | "md" | "lg";
  /** Show the wordmark next to the sigil (default: true for md/lg). */
  showWordmark?: boolean;
  /** Show the "AI STRATEGIC COUNCIL" tagline below. */
  showTagline?: boolean;
  /** Override brand text color (defaults to theme primary). */
  textColor?: string;
  /** Override tagline color (defaults to council purple). */
  taglineColor?: string;
  style?: CSSProperties;
  /** Wrap the logo in a hover scale animation (default: true). */
  interactive?: boolean;
  /** Disable sigil animation (for static contexts). */
  staticSigil?: boolean;
}

const SIZE_MAP = {
  sm: { sigil: 26, brand: 14, tagline: 7, gap: 8 },
  md: { sigil: 40, brand: 18, tagline: 8.5, gap: 12 },
  lg: { sigil: 60, brand: 26, tagline: 11, gap: 16 },
} as const;

export function Logo({
  size = "md",
  showWordmark,
  showTagline = true,
  textColor,
  taglineColor,
  style,
  interactive = true,
  staticSigil = false,
}: LogoProps) {
  const t = useTranslations();
  const dims = SIZE_MAP[size];
  const showWord = showWordmark ?? size !== "sm";

  const brandName = t("common.brand");
  const tagline = "AI STRATEGIC COUNCIL";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: dims.gap,
        cursor: interactive ? "pointer" : "default",
        transition: interactive ? "transform 220ms ease" : undefined,
        ...style,
      }}
      onMouseEnter={interactive ? (e) => { e.currentTarget.style.transform = "scale(1.04)"; } : undefined}
      onMouseLeave={interactive ? (e) => { e.currentTarget.style.transform = "scale(1)"; } : undefined}
    >
      {/* Sigil mark */}
      <div
        style={{
          position: "relative",
          width: dims.sigil,
          height: dims.sigil,
          borderRadius: Math.round(dims.sigil * 0.22),
          background: "radial-gradient(circle at 50% 40%, #0D1520, #020308)",
          border: "1px solid rgba(168, 85, 247, 0.28)",
          boxShadow: "0 0 18px rgba(168, 85, 247, 0.35), 0 0 0 1px rgba(168, 85, 247, 0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <CouncilSigil size={Math.round(dims.sigil * 0.85)} animated={!staticSigil} />
      </div>

      {/* Wordmark + tagline */}
      {showWord && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span
            style={{
              fontFamily: "'Cairo', system-ui, sans-serif",
              fontWeight: 900,
              fontSize: dims.brand,
              color: textColor ?? "#F1F5F9",
              letterSpacing: "-0.015em",
              lineHeight: 1.1,
              whiteSpace: "nowrap",
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
                letterSpacing: "0.16em",
                fontWeight: 600,
                opacity: 0.95,
                lineHeight: 1,
                whiteSpace: "nowrap",
                textTransform: "uppercase",
              }}
            >
              {tagline}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
