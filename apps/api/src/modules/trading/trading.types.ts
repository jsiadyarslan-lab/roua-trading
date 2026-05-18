// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Trading Engine Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { IsString, IsNumber, IsEnum, IsOptional, IsBoolean, Min, IsUUID } from 'class-validator';
import { OrderSide as PrismaOrderSide, OrderType as PrismaOrderType } from '@prisma/client';

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

export enum PositionStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  LIQUIDATED = 'LIQUIDATED',
}

export enum TradeType {
  ENTRY = 'ENTRY',
  EXIT = 'EXIT',
  PARTIAL_EXIT = 'PARTIAL_EXIT',
}

// ── DTOs with class-validator ──

export class PlaceOrderDto {
  @IsString()
  credentialId!: string;

  @IsString()
  symbol!: string;

  @IsEnum(OrderSide)
  side!: OrderSide;

  @IsEnum(OrderType)
  type!: OrderType;

  @IsNumber()
  @Min(0.00001)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsNumber()
  stopLoss?: number;

  @IsOptional()
  @IsNumber()
  takeProfit?: number;

  @IsOptional()
  @IsString()
  signalId?: string;
}

export class ClosePositionDto {
  @IsString()
  positionId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0.00001)
  quantity?: number;
}

export interface PlaceOrderRequest {
  credentialId: string;
  symbol: string;
  side: OrderSide | PrismaOrderSide;
  type: OrderType | PrismaOrderType;
  quantity: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  signalId?: string;
  /** Source of the trade: 'user_manual' (default), 'smart_executor', 'agent', 'auto_paper' */
  source?: 'user_manual' | 'smart_executor' | 'agent' | 'auto_paper';
  /** Unique key to prevent double execution */
  idempotencyKey?: string;
}

export interface ClosePositionRequest {
  positionId: string;
  quantity?: number; // partial close if less than position quantity
  closeReason?: string; // V141: Why the position was closed (STOP_LOSS, TAKE_PROFIT, MANUAL, AUTO_STALE, STRATEGY_EXIT, etc.)
}

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
  riskScore?: number;
}

export interface OrderExecutionResult {
  success: boolean;
  orderId?: string;
  exchangeOrderId?: string;
  filledQuantity?: number;
  averagePrice?: number;
  fee?: number;
  feeCurrency?: string;
  error?: string;
}

export interface PositionSummary {
  totalPositions: number;
  totalValue: number;
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  positions: any[];
}
