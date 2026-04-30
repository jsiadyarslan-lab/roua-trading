// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Execution Engine Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Execution Engine shared type definitions
 * These types are used across the execution module for
 * consistent data flow and type safety.
 */

/**
 * Exchange type identifiers supported by the platform
 */
export enum ExchangeType {
  BINANCE = 'binance',
  ALPACA = 'alpaca',
  PAPER = 'paper',
}

/**
 * Connection mode for an exchange
 */
export enum ConnectionMode {
  WEBSOCKET = 'WEBSOCKET',
  REST_POLLING = 'REST_POLLING',
}

/**
 * Rate limit status for monitoring
 */
export interface RateLimitStatus {
  exchangeId: string;
  userId: string;
  perSecondRemaining: number;
  perMinuteRemaining: number;
  isLimited: boolean;
}

/**
 * Connection health status
 */
export interface ConnectionHealth {
  exchangeId: string;
  connected: boolean;
  mode: ConnectionMode;
  lastHeartbeat: Date | null;
  reconnectAttempts: number;
}
