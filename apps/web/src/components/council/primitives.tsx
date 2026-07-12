"use client";

import { motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { COLORS, type Direction, type ReviewStatus } from "@/lib/council/types";
import { directionColor, directionSoft, statusColor } from "@/lib/council/types";
import { hexToRgba } from "@/lib/council/format";

export function GlassCard({
  children, style, className, strong = false, glow, interactive = false, padding = 20, ...rest
}: {
  children?: ReactNode; style?: CSSProperties; className?: string; strong?: boolean;
  glow?: string; interactive?: boolean; padding?: number | string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "style">) {
  const baseStyle: CSSProperties = {
    position: "relative",
    background: strong
      ? "linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.018) 100%)"
      : "linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.012) 100%)",
    backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
    border: `1px solid ${strong ? COLORS.borderStrong : COLORS.border}`,
    borderRadius: 'var(--radius-xl)',
    boxShadow: glow
      ? `0 0 0 1px ${hexToRgba(glow, 0.12)}, 0 18px 48px -16px ${hexToRgba(glow, 0.35)}, 0 6px 16px -8px rgba(0,0,0,0.4)`
      : "0 12px 32px -16px rgba(0,0,0,0.5), 0 4px 12px -6px rgba(0,0,0,0.35)",
    padding: typeof padding === "number" ? padding : padding,
    overflow: "hidden",
    transition: interactive ? "border-color 200ms ease, transform 200ms ease" : undefined,
    ...style,
  };
  return (
    <div className={className} style={baseStyle}
      onMouseEnter={interactive ? (e) => { e.currentTarget.style.borderColor = COLORS.borderStrong; e.currentTarget.style.transform = "translateY(-2px)"; } : undefined}
      onMouseLeave={interactive ? (e) => { e.currentTarget.style.borderColor = strong ? COLORS.borderStrong : COLORS.border; e.currentTarget.style.transform = "translateY(0)"; } : undefined}
      {...rest}>
      {glow ? (
        <div aria-hidden style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 80% 60% at 50% -10%, ${hexToRgba(glow, 0.18)} 0%, transparent 70%)`, pointerEvents: "none" }} />
      ) : null}
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}

export function CircularProgress({
  value, size = 120, strokeWidth = 8, color, trackColor = "rgba(255,255,255,0.06)", children, glow = true, animationDelay = 0,
}: {
  value: number; size?: number; strokeWidth?: number; color?: string; trackColor?: string; children?: ReactNode; glow?: boolean; animationDelay?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;
  const center = size / 2;
  const stroke = color ?? COLORS.council;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {glow ? (
        <div aria-hidden style={{ position: "absolute", inset: -8, background: `radial-gradient(circle, ${hexToRgba(stroke, 0.18)} 0%, transparent 70%)`, filter: "blur(8px)", pointerEvents: "none" }} />
      ) : null}
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id={`grad-${Math.round(value)}-${size}-${stroke.replace("#", "")}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={stroke} stopOpacity={1} />
            <stop offset="100%" stopColor={stroke === COLORS.council ? COLORS.info : stroke} stopOpacity={0.7} />
          </linearGradient>
        </defs>
        <circle cx={center} cy={center} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <motion.circle
          cx={center} cy={center} r={radius} fill="none"
          stroke={`url(#grad-${Math.round(value)}-${size}-${stroke.replace("#", "")})`}
          strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.1, delay: animationDelay, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}

export function DirectionBadge({ direction, size = "md", label }: { direction: Direction; size?: "sm" | "md" | "lg"; label?: string }) {
  const color = directionColor(direction);
  const soft = directionSoft(direction);
  const sizing = size === "lg" ? { padding: "8px 14px", fontSize: 'var(--text-base)', fontWeight: 700 } : size === "sm" ? { padding: "3px 8px", fontSize: 'var(--text-xs)', fontWeight: 600 } : { padding: "5px 10px", fontSize: 'var(--text-sm)', fontWeight: 700 };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 'var(--radius-md)', background: soft, border: `1px solid ${hexToRgba(color, 0.35)}`, color, textTransform: "uppercase", ...sizing }}>
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}` }} />
      {label ?? direction}
    </span>
  );
}

export function StatusPill({ status, label }: { status: ReviewStatus; label: string }) {
  const color = statusColor(status);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 9px", borderRadius: 'var(--radius-2xl)', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: "uppercase", background: hexToRgba(color, 0.1), color, border: `1px solid ${hexToRgba(color, 0.3)}` }}>
      <span aria-hidden style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

export function LiveDot({ color = COLORS.buy, size = 8, label }: { color?: string; size?: number; label?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 'var(--text-xs)', fontWeight: 600, color: COLORS.textSecondary, textTransform: "uppercase" }}>
      <span style={{ position: "relative", width: size, height: size }}>
        <motion.span aria-hidden style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color }}
          animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }} />
        <span aria-hidden style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}` }} />
      </span>
      {label}
    </span>
  );
}

export function ConfidenceBar({ value, color, height = 6 }: { value: number; color?: string; height?: number }) {
  const c = color ?? COLORS.council;
  return (
    <div style={{ width: "100%", height, background: "rgba(255,255,255,0.06)", borderRadius: 'var(--radius-2xl)', overflow: "hidden" }}>
      <motion.div
        style={{ height: "100%", background: `linear-gradient(90deg, ${c}, ${c === COLORS.council ? COLORS.info : c})`, borderRadius: 'var(--radius-2xl)' }}
        initial={{ width: 0 }} animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
    </div>
  );
}

export function SectionHeader({ index, eyebrow, title, subtitle, right }: {
  index?: string; eyebrow?: string; title: string; subtitle?: string; right?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        {index ? (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: "0.18em", color: COLORS.council, padding: "4px 8px", borderRadius: 'var(--radius-sm)', background: hexToRgba(COLORS.council, 0.1), border: `1px solid ${hexToRgba(COLORS.council, 0.25)}` }}>{index}</div>
        ) : null}
        <div style={{ minWidth: 0 }}>
          {eyebrow ? <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: COLORS.textMuted, marginBottom: 4 }}>{eyebrow}</div> : null}
          <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 600, letterSpacing: "-0.015em", color: COLORS.textPrimary, margin: 0, lineHeight: 1.1 }}>{title}</h2>
          {subtitle ? <p style={{ fontSize: 'var(--text-sm)', color: COLORS.textMuted, margin: "6px 0 0", lineHeight: 1.4 }}>{subtitle}</p> : null}
        </div>
      </div>
      {right ? <div style={{ flexShrink: 0 }}>{right}</div> : null}
    </div>
  );
}

export function StatTile({ label, value, sub, accent, icon }: {
  label: string; value: ReactNode; sub?: string; accent?: string; icon?: ReactNode;
}) {
  return (
    <GlassCard padding={16} style={{ height: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.textMuted }}>{label}</div>
        {icon ? <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-md)', background: accent ? hexToRgba(accent, 0.12) : "rgba(255,255,255,0.05)", color: accent ?? COLORS.textMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div> : null}
      </div>
      <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 600, letterSpacing: "-0.025em", color: accent ?? COLORS.textPrimary, lineHeight: 1, fontFamily: "var(--font-mono)" }}>{value}</div>
      {sub ? <div style={{ marginTop: 6, fontSize: 'var(--text-sm)', color: COLORS.textMuted }}>{sub}</div> : null}
    </GlassCard>
  );
}

export function SkeletonBlock({ height = 80, radius = 12 }: { height?: number; radius?: number }) {
  return (
    <div style={{ height, borderRadius: radius, background: "rgba(255,255,255,0.03)", border: `1px solid ${COLORS.border}` }}>
      <motion.div aria-hidden style={{ height: "100%", background: "rgba(255,255,255,0.04)" }}
        animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} />
    </div>
  );
}
