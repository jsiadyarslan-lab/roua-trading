// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Shared Types & DTOs
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Unified Quote DTO ──
export interface UnifiedQuote {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  marketCap: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  timestamp: Date;
  source: string;
}

// ── Unified Candle DTO ──
export interface UnifiedCandle {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: string;
}

// ── Exchange Adapter Interface ──
export interface IExchangeAdapter {
  readonly name: string;
  fetchQuote(symbol: string): Promise<UnifiedQuote>;
  fetchHistoricalData(
    symbol: string,
    interval: string,
    start: Date,
    end: Date,
  ): Promise<UnifiedCandle[]>;
}

// ── Auth Types ──
export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  tier: 'FREE' | 'PRO' | 'PLUS' | 'PREMIUM' | 'INSTITUTIONAL';
}

export interface AuthSession {
  authenticated: boolean;
  user?: AuthUser;
}

// ── Audit Log Types ──
export interface AuditLogEntry {
  userId?: string;
  action: string;
  resource: string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
}

// ── Asset Types ──
export enum AssetType {
  STOCK = 'STOCK',
  FOREX = 'FOREX',
  CRYPTO = 'CRYPTO',
  COMMODITY = 'COMMODITY',
  INDEX = 'INDEX',
}

// ── User Tier ──
export enum Tier {
  FREE = 'FREE',
  PRO = 'PRO',
  PLUS = 'PLUS',
  PREMIUM = 'PREMIUM',
  INSTITUTIONAL = 'INSTITUTIONAL',
}
