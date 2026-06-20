"use client";

import type { CSSProperties, ReactNode } from "react";
import { COLORS } from "@/lib/council/types";

/**
 * V312: Shared settings components — extracted from the 2800-line monolith.
 * All settings tabs use these for consistent visual design.
 */

// ─── SectionCard ───

export function SectionCard({
  icon, iconColor, iconBg, title, subtitle, children, style,
}: {
  icon?: ReactNode; iconColor?: string; iconBg?: string;
  title: string; subtitle?: string; children: ReactNode; style?: CSSProperties;
}) {
  return (
    <div style={{
      background: "linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.012) 100%)",
      backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
      border: `1px solid ${COLORS.border}`,
      borderRadius: 16,
      overflow: "hidden",
      ...style,
    }}>
      {(icon || title) && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 18px 10px", borderBottom: `1px solid ${COLORS.border}`,
        }}>
          {icon && (
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: iconBg ?? `${iconColor}14`,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              {icon}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, letterSpacing: "-0.01em" }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>{subtitle}</div>}
          </div>
        </div>
      )}
      <div style={{ padding: "4px 18px 14px" }}>{children}</div>
    </div>
  );
}

// ─── SettingRow ───

export function SettingRow({
  icon, label, description, children,
}: {
  icon?: ReactNode; label: string; description?: string; children?: ReactNode;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 12, padding: "10px 0",
      borderBottom: `1px solid ${COLORS.border}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
        {icon && <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>{icon}</div>}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textPrimary }}>{label}</div>
          {description && <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2, lineHeight: 1.4 }}>{description}</div>}
        </div>
      </div>
      {children && <div style={{ flexShrink: 0 }}>{children}</div>}
    </div>
  );
}

// ─── Toggle ───

export function Toggle({
  checked, onChange, color = COLORS.council, size = "sm",
}: {
  checked: boolean; onChange: () => void; color?: string; size?: "sm" | "md";
}) {
  const w = size === "md" ? 36 : 28;
  const h = size === "md" ? 20 : 16;
  const knob = size === "md" ? 14 : 12;
  return (
    <button
      onClick={onChange}
      style={{
        width: w, height: h, borderRadius: 999, border: "none",
        background: checked ? color : "rgba(255,255,255,0.08)",
        cursor: "pointer", position: "relative",
        transition: "background 200ms ease",
        flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute", top: (h - knob) / 2,
        left: checked ? w - knob - 2 : 2,
        width: knob, height: knob, borderRadius: "50%",
        background: "#fff",
        transition: "left 200ms ease",
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      }} />
    </button>
  );
}

// ─── SelectBox ───

export function SelectBox({
  value, onChange, options, small,
}: {
  value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  small?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        padding: small ? "4px 8px" : "6px 10px",
        borderRadius: 8,
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${COLORS.border}`,
        color: COLORS.textPrimary,
        fontSize: small ? 11 : 12,
        fontFamily: "'Cairo', sans-serif",
        fontWeight: 600,
        cursor: "pointer",
        outline: "none",
        appearance: "none",
        WebkitAppearance: "none",
        paddingRight: 24,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%2394A3B8' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 8px center",
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value} style={{ background: "#1A1D29", color: "#F1F5F9" }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ─── NumberInput ───

export function NumberInput({
  value, onChange, min, max, step, suffix,
}: {
  value: string | number; onChange: (v: string) => void;
  min?: number; max?: number; step?: number; suffix?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        type="number"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: 60, padding: "4px 8px", borderRadius: 8,
          background: "rgba(255,255,255,0.03)",
          border: `1px solid ${COLORS.border}`,
          color: COLORS.textPrimary, fontSize: 12,
          fontFamily: "'JetBrains Mono', monospace",
          textAlign: "center", outline: "none",
        }}
        dir="ltr"
      />
      {suffix && <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600 }}>{suffix}</span>}
    </div>
  );
}

// ─── SaveStatusBar ───

export function SaveStatusBar({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  if (status === "idle") return null;
  const config = {
    saving: { color: COLORS.textMuted, text: "..." },
    saved: { color: COLORS.buy, text: "✓" },
    error: { color: COLORS.sell, text: "✕" },
    idle: { color: COLORS.textMuted, text: "" },
  }[status];
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 6,
      background: `${config.color}15`,
      border: `1px solid ${config.color}30`,
      color: config.color, fontSize: 10, fontWeight: 700,
    }}>
      {config.text}
    </div>
  );
}
