/**
 * Shared Theme Tokens for Roua Trading Dashboard
 *
 * Re-exports from unified-tokens to ensure consistency.
 * For backward compatibility, this module also provides spacing/radius scales.
 *
 * Usage:
 *   import { T } from '@/lib/theme-tokens';
 */

import { T as _T } from './unified-tokens';

export const T = {
  ..._T,

  // Additional surface variants (aligned with CSS --bg-card-hover, etc.)
  card2: '#0B0E14' as const,
  cardHover: '#1F2335' as const,

  // Additional text variants (aligned with CSS --text-main, --text-secondary)
  textBright: '#F0F2F5' as const,
  text3Alt: '#8B92A8' as const,
  text2Alt: '#8B92A8' as const,

  // Additional color variants
  amber2: '#E6A23C' as const,

  // Spacing (px)
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    '2xl': 24,
    '3xl': 32,
  } as const,

  // Border Radius (px)
  radius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    '2xl': 20,
    full: 9999,
  } as const,
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
  profit: T.profit,
  loss: T.loss,
  gold: T.gold,
  accent: T.accent,
} as const;
