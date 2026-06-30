/**
 * Roua Trading — Unified Design Tokens
 *
 * Single source of truth for all colors and design values.
 * Every component MUST import from here instead of defining local colors.
 *
 * IMPORTANT: These values are aligned with globals.css CSS custom properties.
 * When updating colors here, also update the corresponding CSS variables.
 *
 * CANONICAL VALUES (aligned with globals.css :root variables):
 *   --bg-app: #0B0E14        → T.bg
 *   --bg-card: #1A1D29       → T.card / T.surface
 *   --bg-card-hover: #1F2335 → T.cardHover
 *   --text-main: #F0F2F5     → T.text
 *   --text-secondary: #8B92A8 → T.text2 / T.text3
 *   --success: #00FFA3       → T.success
 *   --danger: #FF4757        → T.danger
 *   --profit: #10b981        → T.profit
 *   --loss: #ef4444          → T.loss
 *
 * Usage:
 *   import { T } from '@/lib/unified-tokens';
 */
export const T = {
  // Background (aligned with globals.css --bg-app: #0B0E14, --bg-nav: #05070efa)
  bg: '#0B0E14',
  bgLight: '#111520',
  bgLighter: '#161B28',
  bg2: '#0F1117',

  // Cards & Surfaces (aligned with globals.css --bg-card: #1A1D29, --surface: #1A1D29)
  card: '#1A1D29',
  cardHover: '#1F2335',
  cardBorder: '#252A3A',
  surface: '#1A1D29',

  // Brand
  brand: '#6C5CE7',
  brandLight: '#A29BFE',

  // Accent Colors (aligned with globals.css --accent: #059669 primary, cyan for UI highlights)
  blue: '#0A84FF',
  cyan: '#00D4FF',
  cyanBright: '#00D4FF',

  // Status (aligned with globals.css --success: #00FFA3, --danger: #FF4757, --profit: #10b981, --loss: #ef4444)
  green: '#00FFA3',
  greenDim: '#00CC82',
  greenAlt: '#00FFC6',
  profit: '#10b981',
  red: '#FF4757',
  redDim: '#CC3945',
  redAlt: '#FF4D4D',
  loss: '#ef4444',
  yellow: '#FFD93D',
  amber: '#FFB800',
  purple: '#B388FF',
  gold: '#d4af37',

  // Text (aligned with globals.css --text-main: #F0F2F5, --text-secondary: #8B92A8)
  // V594: differentiated text2/text3 for better visual hierarchy
  text: '#F0F2F5',
  text2: '#9CA3B5',   // slightly brighter than before (#8B92A8) for small text readability
  text3: '#6B7280',   // darker than text2 — for truly muted/tertiary text only
  textMuted: '#4A5568',

  // Borders (aligned with globals.css --border-subtle: #ffffff0f, --border-strong: #ffffff1a)
  border: 'rgba(255,255,255,0.06)',
  border2: 'rgba(255,255,255,0.12)',
  borderCyan: 'rgba(0,212,255,0.16)',
  borderWhite: 'rgba(255,255,255,0.06)',
  borderAccent: 'rgba(5,150,105,0.25)',

  // Glass / Transparency
  glass: 'rgba(255,255,255,0.04)',
  navGlass: 'rgba(11, 14, 20, 0.85)',

  // Semantic Aliases
  success: '#00FFA3',
  danger: '#FF4757',
  warning: '#FFB800',
  info: '#00D4FF',
  accent: '#059669',

  // Gradients
  gradientBrand: 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
  gradientGreen: 'linear-gradient(135deg, #00FFA3, #00CC82)',
  gradientRed: 'linear-gradient(135deg, #FF4757, #FF6B81)',
  gradientProfit: 'linear-gradient(135deg, #00FFA3, #10B981)',
  gradientLoss: 'linear-gradient(135deg, #FF4757, #EF4444)',
  gradientInfo: 'linear-gradient(135deg, #00D4FF, #0A84FF)',

  // Shadows (aligned with globals.css)
  shadowCard: '0 2px 12px #0000004d',
  shadowLg: '0 8px 40px #0009',
  glowAccent: '0 0 12px #0596694d',
  glowProfit: '0 0 8px #10b9814d',
  glowLoss: '0 0 8px #ef44444d',

  // Spacing
  radius: '12px',
  radiusSm: '8px',
  radiusLg: '16px',
} as const;

/**
 * Minimal theme subset used by lightweight pages
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
 */
/**
 * P/L Color Utility — Single source of truth for profit/loss coloring
 *
 * Rule: ZERO is NEUTRAL (not profit, not loss).
 *   > 0 → profit color (green)
 *   < 0 → loss color (red)
 *   = 0 → neutral/muted color (gray)
 *
 * Usage:
 *   import { getPnlColor, isPnlPositive, getPnlSign } from '@/lib/unified-tokens';
 *   color: getPnlColor(pnl)           // → T.profit | T.loss | T.text2
 *   {isPnlPositive(pnl) ? '+' : ''}   // → '+' only when truly positive
 *   {getPnlSign(pnl)}{Math.abs(pnl)}  // → '+$100' / '-$50' / '$0'
 */
export function getPnlColor(value: number): string {
  if (value > 0) return T.profit;
  if (value < 0) return T.loss;
  return T.text2; // neutral/gray for zero
}

/** Returns true ONLY when value is strictly positive (> 0) */
export function isPnlPositive(value: number): boolean {
  return value > 0;
}

/** Returns '+' for positive, '-' for negative, '' for zero */
export function getPnlSign(value: number): string {
  if (value > 0) return '+';
  if (value < 0) return '-';
  return '';
}

export const TExtended = {
  ...TMinimal,
  cardHover: T.cardHover,
  surface: T.surface,
  cyanBright: T.cyanBright,
  greenDim: T.greenDim,
  redDim: T.redDim,
  text3: T.text3,
  border2: T.border2,
  glass: T.glass,
  profit: T.profit,
  loss: T.loss,
  gold: T.gold,
  accent: T.accent,
} as const;
