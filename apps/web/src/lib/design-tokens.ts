/**
 * design-tokens.ts — ARCH-001 FIX
 * Single source of truth for all design tokens across the platform.
 * Previously each component defined its own T = { ... } object with
 * conflicting and duplicated values.
 *
 * Usage:
 *   import { tokens as T } from '@/lib/design-tokens'
 *   import { COLORS, FONTS, SHADOWS } from '@/lib/design-tokens'
 */

export const COLORS = {
  // Backgrounds
  bgApp:    '#0B0E14',
  bgCard:   '#1A1D29',
  bgCard2:  '#0F1117',
  bgInput:  'rgba(255,255,255,0.05)',

  // Primary accent (cyan / teal)
  accent:   '#00D4FF',
  accentAlt:'#00E5FF',

  // Semantic colors
  green:    '#00FFA3',
  red:      '#FF4757',
  amber:    '#FFB800',
  purple:   '#B388FF',

  // Text
  textMain: '#F0F2F5',
  textSub:  '#8B92A8',
  textMuted:'rgba(139,146,168,0.6)',

  // Borders
  border:   'rgba(255,255,255,0.05)',
  border2:  'rgba(255,255,255,0.10)',

  // Data source states
  live:     '#00FFA3',
  delayed:  '#FFB800',
  offline:  '#FF4757',
  demo:     '#8B92A8',
} as const

export const FONTS = {
  ar:    "'Cairo', sans-serif",
  en:    "'Inter', sans-serif",
  mono:  "'JetBrains Mono', monospace",
  brand: "'Orbitron', sans-serif",
} as const

export const SHADOWS = {
  card:   '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
  glow:   (color: string) => `0 0 12px ${color}40`,
  focus:  '0 0 0 2px rgba(0,212,255,0.4)',
} as const

export const RADIUS = {
  sm:  6,
  md:  10,
  lg:  14,
  xl:  20,
} as const

export const Z = {
  dropdown: 9999,
  modal:    10000,
  toast:    10001,
} as const

/** Backward-compat alias — drop-in replacement for old T = { ... } objects */
export const tokens = {
  bg:      COLORS.bgApp,
  bg2:     COLORS.bgCard,
  card:    COLORS.bgCard,
  border:  COLORS.border,
  cyan:    COLORS.accent,
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
  info:    COLORS.accent,
  fonts:   FONTS,
} as const

export type TokenColors = typeof COLORS
export type TokenFonts  = typeof FONTS
