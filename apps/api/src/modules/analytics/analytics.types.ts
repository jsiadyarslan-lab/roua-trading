// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Analytics Types & DTOs
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { IsString, IsNumber, IsOptional, IsEnum, IsArray, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

// ── Market Data Aggregation DTOs ──

/**
 * Unified Quote DTO — Aggregated from multiple data sources
 * Extends the exchange-level quote with cross-source metadata
 */
export class AggregatedQuoteDto {
  symbol: string;
  name: string;
  currency: string;

  /** Best bid price across sources */
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

  /** Sources that contributed to this quote */
  sources: string[];

  /** Most reliable source for this symbol */
  primarySource: string;

  /** Timestamp of the most recent data point */
  timestamp: Date;
}

/**
 * Aggregated Candle DTO — OHLCV data merged from multiple sources
 */
export class AggregatedCandleDto {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sources: string[];
  primarySource: string;
}

// ── Technical Indicator DTOs ──

export class IndicatorValueDto {
  name: string;
  value: number | number[];
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  timestamp: Date;
}

export class SmaResult {
  period: number;
  values: number[];
}

export class EmaResult {
  period: number;
  values: number[];
}

export class RsiResult {
  period: number;
  values: number[];
  /** Latest RSI interpretation */
  interpretation: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
}

export class MacdResult {
  macd: number[];
  signal: number[];
  histogram: number[];
  /** Latest MACD crossover signal */
  crossover: 'BULLISH_CROSSOVER' | 'BEARISH_CROSSOVER' | 'NONE';
}

export class BollingerBandsResult {
  upper: number[];
  middle: number[];
  lower: number[];
  /** Bandwidth (upper - lower) / middle — measures volatility */
  bandwidth: number[];
  /** Latest band position: price relative to bands */
  position: 'ABOVE_UPPER' | 'BELOW_LOWER' | 'WITHIN';
}

export class AtrResult {
  period: number;
  values: number[];
  /** Current volatility level relative to recent ATR */
  volatilityLevel: 'LOW' | 'NORMAL' | 'HIGH';
}

/**
 * Complete Technical Analysis Result
 */
export class TechnicalAnalysisDto {
  symbol: string;
  interval: string;
  candleCount: number;
  timestamp: Date;

  sma: SmaResult[];
  ema: EmaResult[];
  rsi: RsiResult | null;
  macd: MacdResult | null;
  bollingerBands: BollingerBandsResult | null;
  atr: AtrResult | null;

  /** Aggregate technical score: -100 (extremely bearish) to +100 (extremely bullish) */
  technicalScore: number;
  /** Human-readable summary */
  summary: string;
}

// ── AI Analysis DTOs ──

export class AnalysisCardDto {
  symbol: string;
  timestamp: Date;

  /** Current market data */
  quote: AggregatedQuoteDto | null;

  /** Technical analysis results */
  technical: TechnicalAnalysisDto | null;

  /** AI-generated analysis text (Arabic) */
  aiAnalysis: string;

  /** AI model used for analysis */
  aiModel: string;

  /** Sentiment from news/social media */
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'MIXED';

  /** Overall confidence 0-100 */
  confidence: number;

  /** Key factors identified by AI */
  keyFactors: string[];

  /** Risk level assessment */
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
}

// ── Signal Generation DTOs ──

export enum SignalAction {
  BUY = 'BUY',
  SELL = 'SELL',
  WAIT = 'WAIT',
}

export class GeneratedSignalDto {
  symbol: string;
  action: SignalAction;
  confidence: number;

  /** Mandatory stop loss price */
  stopLoss: number;

  /** Recommended take profit price */
  takeProfit: number | null;

  /** Entry price for the signal */
  entryPrice: number | null;

  /** AI-generated reasoning (Arabic) */
  reason: string;

  /** Technical indicators that support this signal */
  supportingIndicators: string[];

  /** Risk/reward ratio */
  riskRewardRatio: number | null;

  /** Signal expiry time */
  expiresAt: Date;

  /** Signal ID from database */
  id: string;
}

// ── Data Source Enums ──

export enum DataSource {
  TWELVE_DATA = 'TwelveData',
  BINANCE_CCXT = 'Binance',
  FINNHUB = 'Finnhub',
}

// ── Finnhub Types ──

export class FinnhubQuoteDto {
  symbol: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: number;
}
