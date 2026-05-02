/**
 * Shared design tokens and constants for the admin dashboard.
 *
 * Import these instead of redefining COLORS / CARD_STYLE / CSS in every page:
 *
 *   import { COLORS, CARD_STYLE, ADMIN_STYLES } from '@/lib/admin-ui'
 */

/* ── Color palette ── */
export const COLORS = {
  bg: '#0B0E14',
  card: '#111318',
  accent: '#00E5FF',
  success: '#00E676',
  danger: '#FF5252',
  amber: '#FFB800',
  text: '#F0F2F5',
  muted: '#8B92A8',
  border: 'rgba(0,229,255,0.08)',
  purple: '#B388FF',
} as const

/* ── Card container style ── */
export const CARD_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(0,229,255,0.08)',
  borderRadius: 10,
  position: 'relative',
  overflow: 'hidden',
} as const

/* ── Shared CSS to inject via <style> tag ── */
export const ADMIN_STYLES = `
  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.15); border-radius: 2px; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }
  @media (max-width: 900px) {
    .admin-grid-2 { grid-template-columns: 1fr !important; }
  }
`

/* ── Shared empty state component (text only, styled consistently) ── */
export const EMPTY_STATE_STYLE: React.CSSProperties = {
  padding: 30,
  textAlign: 'center',
  color: COLORS.muted,
  fontSize: 12,
  fontFamily: "'Cairo', sans-serif",
} as const
