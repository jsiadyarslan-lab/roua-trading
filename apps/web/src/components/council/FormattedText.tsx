"use client";

import { useState, useMemo, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Sparkles } from "lucide-react";
import { COLORS } from "@/lib/council/types";
import { hexToRgba } from "@/lib/council/format"

// ════════════════════════════════════════════════════════════
// Lightweight inline markdown parser (bold, code, italic)
// ════════════════════════════════════════════════════════════

function renderInline(text: string, keyBase: string): ReactNode[] {
  // Pattern matches: **bold**, *italic*, `code`
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts = text.split(pattern);
  return parts.map((p, i) => {
    if (!p) return null;
    const key = `${keyBase}-i${i}`;
    if (p.startsWith("**") && p.endsWith("**")) {
      return (
        <strong key={key} style={{ color: COLORS.textPrimary, fontWeight: 600 }}>
          {p.slice(2, -2)}
        </strong>
      );
    }
    if (p.startsWith("`") && p.endsWith("`")) {
      return (
        <code
          key={key}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.92em",
            padding: "1px 6px",
            borderRadius: 'var(--radius-sm)',
            background: hexToRgba(COLORS.council, 0.12),
            color: COLORS.council,
            border: `1px solid ${hexToRgba(COLORS.council, 0.2)}`,
            direction: "ltr",
            display: "inline-block",
            unicodeBidi: "embed",
          }}
        >
          {p.slice(1, -1)}
        </code>
      );
    }
    if (p.startsWith("*") && p.endsWith("*") && p.length > 2) {
      return (
        <em key={key} style={{ color: COLORS.textSecondary, fontStyle: "italic" }}>
          {p.slice(1, -1)}
        </em>
      );
    }
    return <span key={key}>{p}</span>;
  });
}

// ════════════════════════════════════════════════════════════
// Block-level parser: paragraphs, bullet lists, numbered lists, headings, quotes
// ════════════════════════════════════════════════════════════

interface Block {
  type: "p" | "ul" | "ol" | "h" | "quote";
  level?: number;
  items?: string[];
  text?: string;
}

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: "p", text: para.join(" ").trim() });
      para = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty line — paragraph boundary
    if (!trimmed) {
      flushPara();
      i++;
      continue;
    }

    // Heading: ## text or ### text or # text
    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      flushPara();
      blocks.push({ type: "h", level: hMatch[1].length, text: hMatch[2].trim() });
      i++;
      continue;
    }

    // Block quote: > text
    if (/^>\s+/.test(trimmed)) {
      flushPara();
      blocks.push({ type: "quote", text: trimmed.replace(/^>\s+/, "") });
      i++;
      continue;
    }

    // Bullet list: - text or • text or * text (but not ** bold)
    if (/^([-•*])\s+/.test(trimmed) && !/^\*\*/.test(trimmed)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^([-•*])\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^([-•*])\s+/, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // Numbered list: 1. text
    if (/^\d+[\.\)]\s+/.test(trimmed)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^\d+[\.\)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[\.\)]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // Regular paragraph line
    para.push(trimmed);
    i++;
  }
  flushPara();
  return blocks;
}

// ════════════════════════════════════════════════════════════
// Renderer for a single block
// ════════════════════════════════════════════════════════════

function renderBlock(block: Block, idx: number, dir: "rtl" | "ltr"): ReactNode {
  const key = `b-${idx}`;
  switch (block.type) {
    case "h": {
      const lvl = block.level ?? 2;
      const fontSize = lvl === 1 ? 18 : lvl === 2 ? 15 : 13.5;
      return (
        <div
          key={key}
          dir={dir}
          style={{
            fontSize,
            fontWeight: 700,
            color: COLORS.textPrimary,
            marginTop: idx === 0 ? 0 : 10,
            marginBottom: 5,
            letterSpacing: "-0.01em",
            display: "flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 3,
              height: 14,
              borderRadius: 'var(--radius-xs)',
              background: COLORS.gradientCouncil,
              flexShrink: 0,
            }}
          />
          {block.text}
        </div>
      );
    }

    case "quote":
      return (
        <blockquote
          key={key}
          dir={dir}
          style={{
            margin: "8px 0",
            padding: "8px 12px",
            borderInlineStart: `2px solid ${COLORS.council}`,
            background: hexToRgba(COLORS.council, 0.05),
            borderRadius: "0 8px 8px 0",
            color: COLORS.textSecondary,
            fontSize: 'var(--text-sm)',
            lineHeight: 1.6,
            fontStyle: "italic",
          }}
        >
          {renderInline(block.text ?? "", key)}
        </blockquote>
      );

    case "ul":
      return (
        <ul
          key={key}
          dir={dir}
          style={{
            listStyle: "none",
            padding: 0,
            margin: "6px 0",
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          {block.items?.map((it, i) => (
            <li
              key={`${key}-li${i}`}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                fontSize: 'var(--text-sm)',
                lineHeight: 1.6,
                color: COLORS.textSecondary,
              }}
            >
              <span
                aria-hidden
                style={{
                  marginTop: 7,
                  width: 5,
                  height: 5,
                  borderRadius: 'var(--radius-xs)',
                  background: COLORS.council,
                  flexShrink: 0,
                  boxShadow: `0 0 6px ${hexToRgba(COLORS.council, 0.6)}`,
                }}
              />
              <span style={{ flex: 1, minWidth: 0, wordBreak: "break-word", overflowWrap: "anywhere" }}>
                {renderInline(it, `${key}-li${i}`)}
              </span>
            </li>
          ))}
        </ul>
      );

    case "ol":
      return (
        <ol
          key={key}
          dir={dir}
          style={{
            listStyle: "none",
            padding: 0,
            margin: "6px 0",
            display: "flex",
            flexDirection: "column",
            gap: 5,
            counterReset: "ol-counter",
          }}
        >
          {block.items?.map((it, i) => (
            <li
              key={`${key}-li${i}`}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                fontSize: 'var(--text-sm)',
                lineHeight: 1.6,
                color: COLORS.textSecondary,
              }}
            >
              <span
                aria-hidden
                style={{
                  marginTop: 1,
                  width: 18,
                  height: 18,
                  borderRadius: 'var(--radius-sm)',
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: hexToRgba(COLORS.council, 0.12),
                  border: `1px solid ${hexToRgba(COLORS.council, 0.3)}`,
                  color: COLORS.council,
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {i + 1}
              </span>
              <span style={{ flex: 1, minWidth: 0, wordBreak: "break-word", overflowWrap: "anywhere" }}>
                {renderInline(it, `${key}-li${i}`)}
              </span>
            </li>
          ))}
        </ol>
      );

    case "p":
    default:
      return (
        <p
          key={key}
          dir={dir}
          style={{
            margin: idx === 0 ? "0 0 4px" : "4px 0",
            fontSize: 'var(--text-sm)',
            lineHeight: 1.65,
            color: COLORS.textSecondary,
            wordBreak: "break-word",
            overflowWrap: "anywhere",
          }}
        >
          {renderInline(block.text ?? "", key)}
        </p>
      );
  }
}

// ════════════════════════════════════════════════════════════
// Main FormattedText component
// ════════════════════════════════════════════════════════════

export interface FormattedTextProps {
  text: string | null | undefined;
  /** Maximum characters shown before "show more" toggle. Set to 0 to disable. */
  maxLength?: number;
  /** Text direction. Default: rtl (for Arabic) */
  dir?: "rtl" | "ltr";
  /** Show "show more / less" toggle when text exceeds maxLength. */
  collapsible?: boolean;
  /** Font size override. */
  fontSize?: number;
  /** Accent color for headings/markers. */
  accent?: string;
  /** Placeholder when text is empty. */
  placeholder?: string;
  style?: CSSProperties;
  /** Whether to render the small "AI thoughts" eyebrow above the text. */
  showEyebrow?: boolean;
  eyebrowLabel?: string;
}

export function FormattedText({
  text,
  maxLength = 280,
  dir = "rtl",
  collapsible = true,
  fontSize = 13,
  accent = COLORS.council,
  placeholder = "لا يوجد تحليل متاح",
  style,
  showEyebrow = false,
  eyebrowLabel = "تفكير الذكاء الاصطناعي",
}: FormattedTextProps) {
  const [expanded, setExpanded] = useState(false);
  const t = useTranslations("councilPage");

  const blocks = useMemo(() => {
    if (!text || !text.trim()) return [] as Block[];
    return parseBlocks(text);
  }, [text]);

  if (!text || !text.trim()) {
    return (
      <div dir={dir} style={{ fontSize, color: COLORS.textDim, fontStyle: "italic", ...style }}>
        {placeholder}
      </div>
    );
  }

  // Compute total length to decide if collapsible should show
  const totalLen = text.length;
  const shouldCollapse = collapsible && maxLength > 0 && totalLen > maxLength;

  // When collapsed, only render the first 1-2 blocks (or partial text)
  let visibleBlocks = blocks;
  let truncatedLast = false;
  if (shouldCollapse && !expanded) {
    // Accumulate blocks until we hit maxLength
    const result: Block[] = [];
    let acc = 0;
    for (const b of blocks) {
      const bLen = (b.text ?? b.items?.join(" ") ?? "").length;
      if (acc + bLen > maxLength && result.length > 0) {
        // Try to fit partial of this block
        if (b.type === "p" && b.text) {
          const remaining = maxLength - acc;
          if (remaining > 30) {
            result.push({ type: "p", text: b.text.slice(0, remaining).trim() + "…" });
            truncatedLast = true;
          }
        }
        truncatedLast = true;
        break;
      }
      result.push(b);
      acc += bLen;
      if (acc >= maxLength) {
        truncatedLast = true;
        break;
      }
    }
    visibleBlocks = result;
    if (result.length === 0 && blocks.length > 0) {
      // Always show at least the first block, truncated
      const first = blocks[0];
      if (first.type === "p" && first.text) {
        visibleBlocks = [{ type: "p", text: first.text.slice(0, maxLength).trim() + "…" }];
        truncatedLast = true;
      } else {
        visibleBlocks = [first];
      }
    }
  }

  return (
    <div dir={dir} style={{ minHeight: 20, ...style }}>
      {showEyebrow && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 'var(--radius-sm)',
              background: COLORS.gradientCouncil,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: '#0B0E14',
              flexShrink: 0,
            }}
          >
            <Sparkles size={11} strokeWidth={2.5} />
          </div>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: accent,
            }}
          >
            {eyebrowLabel}
          </span>
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {visibleBlocks.map((b, i) => renderBlock(b, i, dir))}
      </div>

      {shouldCollapse && (
        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          whileTap={{ scale: 0.97 }}
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.25 }}
          style={{
            marginTop: 10,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 12px",
            borderRadius: 'var(--radius-md)',
            background: hexToRgba(accent, 0.08),
            border: `1px solid ${hexToRgba(accent, 0.25)}`,
            color: accent,
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            cursor: "pointer",
            letterSpacing: "0.04em",
          }}
          aria-expanded={expanded}
        >
          <ChevronDown size={13} strokeWidth={2.5} />
          {expanded ? t("showLess") : t("showMore")}
        </motion.button>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// LoadMore button — used for paginated lists (signals, history)
// ════════════════════════════════════════════════════════════

export interface LoadMoreButtonProps {
  count: number;
  total: number;
  onClick: () => void;
  label?: string;
  moreLabel?: string;
  accent?: string;
}

export function LoadMoreButton({
  count,
  total,
  onClick,
  label = "تحميل المزيد",
  moreLabel,
  accent = COLORS.council,
}: LoadMoreButtonProps) {
  const t = useTranslations("councilPage");
  const remaining = total - count;
  if (remaining <= 0) {
    return (
      <div
        style={{
          textAlign: "center",
          fontSize: 'var(--text-xs)',
          color: COLORS.textDim,
          padding: "12px 0 4px",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {t("noMore")} · {total} {t("items")}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "14px 0 4px" }}>
      <motion.button
        onClick={onClick}
        whileTap={{ scale: 0.97 }}
        whileHover={{ y: -1 }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 22px",
          borderRadius: 'var(--radius-lg)',
          background: hexToRgba(accent, 0.1),
          border: `1px solid ${hexToRgba(accent, 0.35)}`,
          color: accent,
          fontSize: 'var(--text-sm)',
          fontWeight: 600,
          letterSpacing: "0.06em",
          cursor: "pointer",
          boxShadow: `0 6px 18px -8px ${hexToRgba(accent, 0.4)}`,
        }}
      >
        <ChevronDown size={14} strokeWidth={2.5} style={{ transform: "rotate(0deg)" }} />
        {moreLabel || t("showMore")}
        <span
          style={{
            fontSize: 'var(--text-xs)',
            padding: "1px 7px",
            borderRadius: 'var(--radius-sm)',
            background: hexToRgba(accent, 0.18),
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
          }}
        >
          +{remaining}
        </span>
      </motion.button>
    </div>
  );
}
