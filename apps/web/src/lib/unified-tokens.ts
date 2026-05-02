/**
 * Roua Trading — Unified Design Tokens
 *
 * Single source of truth for all colors and design values.
 * Every component MUST import from here instead of defining local colors.
 *
 * Usage:
 *   import { T } from '@/lib/unified-tokens';
 */
export const T = {
  // Background
  bg: '#0B0E14',
  bgLight: '#111520',
  bgLighter: '#161B28',
  bg2: '#0F1117',

  // Cards & Surfaces
  card: '#1A1D29',
  cardHover: '#1F2335',
  cardBorder: '#252A3A',
  surface: '#1A1D29',

  // Brand
  brand: '#6C5CE7',
  brandLight: '#A29BFE',

  // Accent Colors
  blue: '#0A84FF',
  cyan: '#00D4FF',
  cyanBright: '#00D4FF',

  // Status
  green: '#00FFA3',
  greenDim: '#00CC82',
  greenAlt: '#00FFC6',
  red: '#FF4757',
  redDim: '#CC3945',
  redAlt: '#FF4D4D',
  yellow: '#FFD93D',
  amber: '#FFB800',
  purple: '#B388FF',

  // Text
  text: '#E8ECF1',
  text2: '#8892A4',
  text3: '#A0AFC3',
  textMuted: '#4A5568',

  // Borders
  border: 'rgba(10,132,255,0.12)',
  border2: 'rgba(10,132,255,0.20)',
  borderCyan: 'rgba(0,212,255,0.16)',
  borderWhite: 'rgba(255,255,255,0.06)',

  // Glass / Transparency
  glass: 'rgba(10,132,255,0.04)',

  // Semantic Aliases
  success: '#00FFA3',
  danger: '#FF4757',
  warning: '#FFB800',
  info: '#00D4FF',

  // Gradients
  gradientBrand: 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
  gradientGreen: 'linear-gradient(135deg, #00FFA3, #00CC82)',
  gradientRed: 'linear-gradient(135deg, #FF4757, #FF6B81)',

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
} as const;
