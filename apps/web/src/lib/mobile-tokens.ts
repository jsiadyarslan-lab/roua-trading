/**
 * Roua Trading — Mobile Design Tokens
 *
 * Bridge between the canonical unified-tokens.ts and mobile pages.
 * Provides the SAME key names mobile pages currently use (accent, success, danger, etc.)
 * but mapped to the CORRECT canonical values from unified-tokens.
 *
 * BEFORE (local, wrong values):
 *   const c = {
 *     accent: '#00D4FF',           // ❌ wrong — should be #059669
 *     success: '#32D74B',          // ❌ wrong — should be #00FFA3
 *     danger: '#FF453A',           // ❌ wrong — should be #FF4757
 *     text2: 'rgba(235,235,245,0.5)', // ❌ wrong — should be #8B92A8
 *     bg: '#1C1C1E',              // ❌ wrong — should be #0B0E14
 *     border: 'rgba(255,255,255,0.08)', // ❌ wrong — should be rgba(255,255,255,0.06)
 *   }
 *
 * AFTER (import canonical values):
 *   import { M, FONT_AR, FONT_MONO } from '@/lib/mobile-tokens';
 *   // M.accent  → '#059669'  ✅
 *   // M.success → '#00FFA3'  ✅
 *   // M.danger  → '#FF4757'  ✅
 */

import { T } from '@/lib/unified-tokens';

// ─── Font Constants ───────────────────────────────────────────────────────────
// Used throughout mobile pages as fontFamily values

/** Arabic / UI font — Cairo */
export const FONT_AR = "'Cairo', sans-serif" as const;

/** Monospace / numeric font — JetBrains Mono */
export const FONT_MONO = "'JetBrains Mono', monospace" as const;

// ─── Mobile Token Object ─────────────────────────────────────────────────────
// M = Mobile. Drop-in replacement for the local `const c = {…}` objects.
// Keys match the naming convention mobile pages already use.
// Values are canonical — sourced from unified-tokens T.

export const M = {
  // ── Core colors (matches existing mobile key names) ──

  /** Primary accent / CTA — maps to T.accent */
  accent: T.accent,                    // '#059669'

  /** Success / positive — maps to T.success */
  success: T.success,                  // '#00FFA3'

  /** Danger / negative — maps to T.danger */
  danger: T.danger,                    // '#FF4757'

  /** Amber / warning — maps to T.amber */
  amber: T.amber,                      // '#FFB800'

  // ── Text ──

  /** Primary text — maps to T.text */
  text: T.text,                        // '#F0F2F5'

  /** Secondary / muted text — maps to T.text2 */
  text2: T.text2,                      // '#8B92A8'

  // ── Backgrounds ──

  /** Page background — maps to T.bg */
  bg: T.bg,                            // '#0B0E14'

  /** Card background — maps to T.card */
  card: T.card,                        // '#1A1D29'

  /** Card hover state — maps to T.cardHover */
  cardHover: T.cardHover,              // '#1F2335'

  // ── Borders ──

  /** Default border — maps to T.border */
  border: T.border,                    // 'rgba(255,255,255,0.06)'

  // ── Additional commonly used mobile tokens ──

  /** Purple / brand highlight — maps to T.purple */
  purple: T.purple,                    // '#B388FF'

  /** Gold / premium — maps to T.gold */
  gold: T.gold,                        // '#d4af37'

  /** Cyan / info — maps to T.cyan */
  cyan: T.cyan,                        // '#00D4FF'

  /** Profit (P/L green) — maps to T.profit */
  profit: T.profit,                    // '#10b981'

  /** Loss (P/L red) — maps to T.loss */
  loss: T.loss,                        // '#ef4444'
} as const;

// ─── Type Exports ─────────────────────────────────────────────────────────────

/** Type for the mobile token object — useful for component props */
export type MobileTokens = typeof M;
