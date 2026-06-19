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
 * Two layouts:
 *   - horizontal (default): sigil LEFT, wordmark + tagline RIGHT — for navbars
 *   - stacked: sigil TOP, wordmark + tagline BELOW — for the 108px orb space
 *     in the dashboard header (matches the legacy logo orb footprint exactly)
 *
 * Three sizes:
 *   - "sm"  (sigil 40)  — mobile header
 *   - "md"  (sigil 56)  — landing navbar, footer
 *   - "lg"  (sigil 92)  — desktop dashboard header (108px orb space)
 */
export interface LogoProps {
  size?: "sm" | "md" | "lg";
  /** Horizontal (sigil left) or stacked (sigil top). Default: horizontal. */
  layout?: "horizontal" | "stacked";
  /** Show the wordmark (default: true for md/lg). */
  showWordmark?: boolean;
  /** Show the "AI STRATEGIC COUNCIL" tagline. */
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
  // Sizes chosen to MATCH the legacy logo dimensions exactly:
  //   - desktop header logo orb was 108px (ORB_D constant) → 'lg' sigil=92, total ~108px
  //   - mobile header logo was 48px (MOBILE_HEADER_H) → 'sm' sigil=40, total ~48px
  //   - landing/footer mid-size → 'md' sigil=56, total ~64px
  sm: { sigil: 40, brand: 13, tagline: 6.5, gap: 8 },
  md: { sigil: 56, brand: 22, tagline: 10, gap: 12 },
  lg: { sigil: 92, brand: 14, tagline: 7, gap: 4 },
} as const;

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
}: LogoProps) {
  const t = useTranslations();
  const dims = SIZE_MAP[size];
  const showWord = showWordmark ?? size !== "sm";
  const isStacked = layout === "stacked";

  const brandName = t("common.brand");
  const tagline = "AI COUNCIL";

  const containerStyle: CSSProperties = isStacked
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
    <div
      style={containerStyle}
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
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
              letterSpacing: "-0.01em",
              lineHeight: 1.05,
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
                letterSpacing: "0.14em",
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
