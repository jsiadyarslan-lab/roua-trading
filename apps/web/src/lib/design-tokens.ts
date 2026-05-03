/**
 * design-tokens.ts — ARCH-001 FIX
 * Single source of truth for all design tokens across the platform.
 * Re-exports from unified-tokens for backward compatibility.
 *
 * CANONICAL VALUES aligned with globals.css — see unified-tokens.ts for mapping.
 *
 * Usage:
 *   import { tokens as T } from '@/lib/design-tokens'
 *   import { COLORS, FONTS, SHADOWS } from '@/lib/design-tokens'
 */

import { T as _T } from './unified-tokens';

export const COLORS = {
  // Backgrounds (aligned with CSS --bg-app: #0B0E14, --bg-card: #1A1D29)
  bgApp:    _T.bg,
  bgCard:   _T.card,
  bgCard2:  _T.bg2,
  bgInput:  'rgba(255,255,255,0.05)',

  // Primary accent (green primary / cyan for UI highlights)
  accent:   _T.accent,
  accentAlt:'#00E5FF',

  // Semantic colors (aligned with CSS --success, --danger, --profit, --loss)
  green:    _T.green,
  red:      _T.red,
  amber:    _T.amber,
  purple:   _T.purple,
  profit:   _T.profit,
  loss:     _T.loss,

  // Text (aligned with CSS --text-main: #F0F2F5, --text-secondary: #8B92A8)
  textMain: _T.text,
  textSub:  _T.text2,
  textMuted:'rgba(139,146,168,0.6)',

  // Borders (aligned with CSS --border-subtle, --border-strong)
  border:   _T.border,
  border2:  _T.border2,

  // Data source states
  live:     _T.success,
  delayed:  _T.warning,
  offline:  _T.danger,
  demo:     _T.text3,
} as const;

export const FONTS = {
  ar:    "'Cairo', sans-serif",
  en:    "'Inter', sans-serif",
  mono:  "'JetBrains Mono', monospace",
  brand: "'Orbitron', sans-serif",
} as const;

export const SHADOWS = {
  card:   '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
  glow:   (color: string) => `0 0 12px ${color}40`,
  focus:  '0 0 0 2px rgba(0,212,255,0.4)',
} as const;

export const RADIUS = {
  sm:  6,
  md:  10,
  lg:  14,
  xl:  20,
} as const;

export const Z = {
  dropdown: 9999,
  modal:    10000,
  toast:    10001,
} as const;

/** Backward-compat alias — drop-in replacement for old T = { ... } objects */
export const tokens = {
  bg:      COLORS.bgApp,
  bg2:     COLORS.bgCard,
  card:    COLORS.bgCard,
  border:  COLORS.border,
  cyan:    _T.cyan,
  accent:  COLORS.accent,
  green:   COLORS.green,
  red:     COLORS.red,
  amber:   COLORS.amber,
  purple:  COLORS.purple,
  text:    COLORS.textMain,
  text2:   COLORS.textSub,
  text3:   COLORS.textSub,
  success: COLORS.green,
  danger:  COLORS.red,
  warning: COLORS.amber,
  info:    _T.cyan,
  profit:  COLORS.profit,
  loss:    COLORS.loss,
  fonts:   FONTS,
} as const;

export type TokenColors = typeof COLORS;
export type TokenFonts  = typeof FONTS;
