// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Exchange Types & DTOs
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Unified Quote — Standardized market quote across all exchanges
 */
export class UnifiedQuoteDto {
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

/**
 * Unified Candle — Standardized OHLCV candle across all exchanges
 */
export class UnifiedCandleDto {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: string;
}

/**
 * Exchange Adapter Interface — All market data adapters must implement this
 */
export interface IExchangeAdapter {
  readonly name: string;

  /**
   * Fetch real-time or latest quote for a symbol
   */
  fetchQuote(symbol: string): Promise<UnifiedQuoteDto>;

  /**
   * Fetch historical OHLCV data for a symbol
   */
  fetchHistoricalData(
    symbol: string,
    interval: string,
    start: Date,
    end: Date,
  ): Promise<UnifiedCandleDto[]>;
}

/**
 * Supported intervals for historical data
 */
export type HistoricalInterval =
  | '1min'
  | '5min'
  | '15min'
  | '30min'
  | '45min'
  | '1h'
  | '2h'
  | '4h'
  | '1day'
  | '1week'
  | '1month';
