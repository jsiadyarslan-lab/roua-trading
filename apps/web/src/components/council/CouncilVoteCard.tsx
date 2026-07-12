"use client";

import { useState, useMemo, type CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, TrendingUp, TrendingDown, Minus, Cpu } from "lucide-react";
import { useTranslations } from "next-intl";
import { COLORS } from "@/lib/council/types";
import { hexToRgba } from "@/lib/council/format";

// ════════════════════════════════════════════════════════════
// Council Vote Card — compact widget version
// ════════════════════════════════════════════════════════════
//
// Differences from the full-page BriefCard:
// 1. Compact: 6-8px font, tight padding, fits sidebar width
// 2. Text cleaning: strips emoji spam, role-name prefixes, DECISION line
// 3. Auto language detection: sets dir based on text content, not UI locale
// 4. Smart truncation: cuts at sentence boundary, not mid-word
// 5. Visual hierarchy: role badge → vote pill → confidence ring → reason

export interface CouncilVoteCardProps {
  role: string;
  model: string;
  vote: "BUY" | "SELL" | "HOLD" | string;
  confidence: number;
  reason: string;
  /** Compact mode (sidebar) vs expanded (full card). Default: compact. */
  compact?: boolean;
  /** Accent color override (defaults to vote color). */
  accent?: string;
  style?: CSSProperties;
}

// ─── Text cleaning helpers ───

/** Strip leading emoji clusters like "📊📊📊" or "🎯🎯" */
function stripLeadingEmojis(text: string): string {
  return text.replace(/^[\s\u2190-\u21FF\u2600-\u27BF\uFE00-\uFE0F\u{1F000}-\u{1FFFF}]+/u, "").trim();
}

/** Strip role-name prefixes like "**DIVERGENCE ANALYST:**" or "Technical Analyst:" */
function stripRolePrefix(text: string, roleName: string): string {
  // Match: **ROLE NAME:** or ROLE NAME: or ## ROLE NAME
  const patterns = [
    new RegExp(`^\\*{0,2}\\s*${escapeRegex(roleName)}\\s*\\*{0,2}\\s*:?\\s*`, "i"),
    /^#{1,4}\s+\S+\s*\n/,
    /^\*{2}\s*[A-Z][A-Z\s]+\s*\*{2}\s*:?\s*/,
  ];
  let cleaned = text;
  for (const p of patterns) {
    cleaned = cleaned.replace(p, "");
  }
  return cleaned.trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip the trailing "DECISION: BUY/SELL/HOLD" line — it's already shown as a vote pill */
function stripDecisionLine(text: string): string {
  return text
    .replace(/\n*\**\s*DECISION\s*:\s*(BUY|SELL|HOLD)\s*\**\s*$/i, "")
    .replace(/\n*\s*DECISION\s*:\s*(BUY|SELL|HOLD)\s*$/i, "")
    .trim();
}

/** Detect if text is primarily Arabic (for RTL) vs Latin (for LTR) */
function detectTextDirection(text: string): "rtl" | "ltr" {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  return arabicChars > latinChars ? "rtl" : "ltr";
}

/** Smart truncation at sentence/word boundary */
function smartTruncate(text: string, maxLen: number): { visible: string; truncated: boolean } {
  if (text.length <= maxLen) return { visible: text, truncated: false };
  // Try to cut at the last sentence end (. ! ? ؟) before maxLen
  const slice = text.slice(0, maxLen);
  const sentenceEnd = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
    slice.lastIndexOf("؟ "),
    slice.lastIndexOf(".\n"),
  );
  if (sentenceEnd > maxLen * 0.5) {
    return { visible: slice.slice(0, sentenceEnd + 1).trim() + "…", truncated: true };
  }
  // Fall back to word boundary
  const wordEnd = slice.lastIndexOf(" ");
  if (wordEnd > maxLen * 0.5) {
    return { visible: slice.slice(0, wordEnd).trim() + "…", truncated: true };
  }
  return { visible: slice.trim() + "…", truncated: true };
}

/** Render inline markdown: **bold**, *italic*, `code` */
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts = text.split(pattern);
  return parts.map((p, i) => {
    if (!p) return null;
    const key = `${keyBase}-i${i}`;
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={key} style={{ color: COLORS.textPrimary, fontWeight: 700 }}>{p.slice(2, -2)}</strong>;
    }
    if (p.startsWith("`") && p.endsWith("`")) {
      return (
        <code key={key} style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.9em",
          padding: "1px 4px",
          borderRadius: 'var(--radius-xs)',
          background: "rgba(168,85,247,0.15)",
          color: COLORS.council,
        }}>
          {p.slice(1, -1)}
        </code>
      );
    }
    if (p.startsWith("*") && p.endsWith("*") && p.length > 2) {
      return <em key={key} style={{ fontStyle: "italic" }}>{p.slice(1, -1)}</em>;
    }
    return <span key={key}>{p}</span>;
  });
}

// ─── Main component ───

export function CouncilVoteCard({
  role,
  model,
  vote,
  confidence,
  reason,
  compact = true,
  accent,
  style,
}: CouncilVoteCardProps) {
  const [expanded, setExpanded] = useState(false);
  const t = useTranslations("councilPage");

  const voteUpper = (vote || "HOLD").toUpperCase() as "BUY" | "SELL" | "HOLD";
  const voteColor = voteUpper === "BUY" ? COLORS.buy : voteUpper === "SELL" ? COLORS.sell : COLORS.hold;
  const cardAccent = accent ?? voteColor;

  // Clean the reason text once
  const cleanedReason = useMemo(() => {
    let r = reason || "";
    r = stripLeadingEmojis(r);
    r = stripRolePrefix(r, role);
    r = stripDecisionLine(r);
    return r.trim();
  }, [reason, role]);

  const dir = useMemo(() => detectTextDirection(cleanedReason), [cleanedReason]);
  const maxLen = compact ? 120 : 280;
  const { visible, truncated } = useMemo(() => smartTruncate(cleanedReason, maxLen), [cleanedReason, maxLen]);
  const displayText = expanded ? cleanedReason : visible;
  const canExpand = truncated || cleanedReason.length > maxLen;

  // Model short name (e.g., "Bedrock/nova-micro-v1:0" → "Bedrock")
  const modelShort = (model || "").split("/")[0].split(":")[0] || "AI";

  // Role icon
  const VoteIcon = voteUpper === "BUY" ? TrendingUp : voteUpper === "SELL" ? TrendingDown : Minus;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        position: "relative",
        padding: compact ? "8px 10px" : "12px 14px",
        borderRadius: 'var(--radius-lg)',
        background: `linear-gradient(180deg, ${hexToRgba(cardAccent, 0.04)} 0%, rgba(255,255,255,0.015) 100%)`,
        border: `1px solid ${hexToRgba(cardAccent, 0.18)}`,
        overflow: "hidden",
        ...style,
      }}
    >
      {/* Accent left border (visual hierarchy) */}
      <div aria-hidden style={{
        position: "absolute",
        insetInlineStart: 0,
        top: 0,
        bottom: 0,
        width: 2,
        background: `linear-gradient(180deg, ${cardAccent}, ${hexToRgba(cardAccent, 0.3)})`,
      }} />

      {/* Header: role + vote pill */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, flex: 1 }}>
          <div style={{
            width: compact ? 16 : 20,
            height: compact ? 16 : 20,
            borderRadius: 'var(--radius-sm)',
            background: hexToRgba(voteColor, 0.15),
            border: `1px solid ${hexToRgba(voteColor, 0.35)}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <VoteIcon size={compact ? 9 : 11} color={voteColor} strokeWidth={2.5} />
          </div>
          <span style={{
            fontSize: compact ? 10 : 12,
            fontWeight: 700,
            color: COLORS.textPrimary,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
          }}>
            {role}
          </span>
        </div>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          padding: compact ? "2px 6px" : "3px 8px",
          borderRadius: 'var(--radius-sm)',
          background: hexToRgba(voteColor, 0.15),
          border: `1px solid ${hexToRgba(voteColor, 0.4)}`,
          color: voteColor,
          fontSize: compact ? 8 : 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          flexShrink: 0,
        }}>
          {voteUpper}
        </div>
      </div>

      {/* Confidence bar + model badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <div style={{
          flex: 1,
          height: compact ? 2 : 3,
          borderRadius: 'var(--radius-2xl)',
          background: "rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, Math.max(0, confidence))}%` }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            style={{
              height: "100%",
              background: `linear-gradient(90deg, ${voteColor}, ${hexToRgba(voteColor, 0.6)})`,
              borderRadius: 'var(--radius-2xl)',
            }}
          />
        </div>
        <span style={{
          fontSize: compact ? 8 : 10,
          fontFamily: "var(--font-mono)",
          fontWeight: 700,
          color: COLORS.textSecondary,
          minWidth: compact ? 22 : 28,
          textAlign: "right",
        }}>
          {confidence}%
        </span>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 2,
          fontSize: compact ? 7 : 8,
          fontFamily: "var(--font-mono)",
          fontWeight: 600,
          color: COLORS.textMuted,
          padding: "1px 4px",
          borderRadius: 'var(--radius-xs)',
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}>
          <Cpu size={8} style={{ opacity: 0.6 }} />
          {modelShort}
        </span>
      </div>

      {/* Reason text — cleaned, dir-detected, smart-truncated */}
      <div dir={dir} style={{
        fontSize: compact ? 9 : 11,
        lineHeight: 1.5,
        color: COLORS.textSecondary,
        wordBreak: "break-word",
        overflowWrap: "anywhere",
      }}>
        {renderInline(displayText, "reason")}
      </div>

      {/* Show more/less toggle */}
      {canExpand && (
        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          whileTap={{ scale: 0.96 }}
          style={{
            marginTop: 6,
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            padding: "3px 8px",
            borderRadius: 'var(--radius-sm)',
            background: hexToRgba(cardAccent, 0.08),
            border: `1px solid ${hexToRgba(cardAccent, 0.2)}`,
            color: cardAccent,
            fontSize: compact ? 8 : 9,
            fontWeight: 600,
            cursor: "pointer",
            letterSpacing: "0.02em",
          }}
        >
          <ChevronDown
            size={10}
            strokeWidth={2.5}
            style={{
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 200ms",
            }}
          />
          {expanded ? t("showLess") : t("showMore")}
        </motion.button>
      )}
    </motion.div>
  );
}
