/**
 * Shared Theme Tokens for Roua Trading Dashboard
 *
 * Central source of truth for all design tokens used across dashboard pages.
 * Instead of duplicating `const T = { ... }` in every page component,
 * import from this shared module.
 *
 * Usage:
 *   import { T } from '@/lib/theme-tokens';
 */

export const T = {
  // ── Background (aligned with globals.css --bg and --bg2) ──
  bg: '#0B0E14',
  bg2: '#0F1117',

  // ── Surface / Card (aligned with globals.css --card-bg and --surface) ──
  card: '#1A1D29',
  cardHover: '#1E2233',
  card2: '#0B0E14',
  surface: '#1A1D29',

  // ── Borders ──
  border: 'rgba(255,255,255,0.06)',
  border2: 'rgba(10,132,255,0.20)',
  borderWhite: 'rgba(255,255,255,0.06)',
  borderCyan: 'rgba(0,212,255,0.16)',

  // ── Accent Colors (aligned with globals.css --success, --danger, etc.) ──
  blue: '#0A84FF',
  cyan: '#00D4FF',
  cyanBright: '#00D4FF',
  green: '#00FFA3',
  greenAlt: '#00FFC6',
  greenDim: '#00CC82',
  red: '#FF4757',
  redAlt: '#FF4D4D',
  redDim: '#FF3344',
  amber: '#FFB800',
  amber2: '#E6A23C',
  purple: '#B388FF',

  // ── Text ──
  text: '#F0F2F5',
  textBright: '#F0F2F5',
  text2: '#8B92A8',
  text3: '#94a3b8',
  text3Alt: '#8B92A8',
  textMuted: '#5A6A80',
  text2Alt: '#94a3b8',

  // ── Semantic Aliases ──
  success: '#00FFA3',
  danger: '#FF4757',
  warning: '#FFB800',
  info: '#00D4FF',

  // ── Glass / Transparency ──
  glass: 'rgba(10,132,255,0.04)',

  // ── Spacing (px) ──
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    '2xl': 24,
    '3xl': 32,
  },

  // ── Border Radius (px) ──
  radius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    '2xl': 20,
    full: 9999,
  },
} as const;

/**
 * Minimal theme subset used by lightweight pages
 * (correlation, backtest, etc.)
 */
export const TMinimal = {
  bg: T.bg,
  bg2: T.bg2,
  card: T.card,
  blue: T.blue,
  cyan: T.cyan,
  green: T.green,
  red: T.red,
  amber: T.amber,
  purple: T.purple,
  text: T.text,
  text2: T.text2,
  border: T.border,
} as const;

/**
 * Extended theme with surface/cardHover for richer pages
 * (copy-trading, social, strategy-builder, settings)
 */
export const TExtended = {
  ...TMinimal,
  cardHover: T.cardHover,
  surface: T.surface,
  cyanBright: T.cyanBright,
  greenAlt: T.greenAlt,
  greenDim: T.greenDim,
  redAlt: T.redAlt,
  redDim: T.redDim,
  text2Alt: T.text2Alt,
  text3Alt: T.text3Alt,
  border2: T.borderCyan,
} as const;
