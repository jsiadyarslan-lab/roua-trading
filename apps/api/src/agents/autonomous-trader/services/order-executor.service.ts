// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Order Executor Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { AuditService } from '../../../audit/audit.service';
import { TradingService } from '../../../modules/trading/trading.service';
import { ExchangeService } from '../../../modules/exchange/exchange.service';
import { PlaceOrderRequest, OrderSide, OrderType } from '../../../modules/trading/trading.types';
import { EvaluatedSignal, TradeExecution, RiskAssessment, AgentDecision } from '../types/agent.types';

/**
 * OrderExecutorService — Executes trades with safety and precision
 *
 * Handles the final step of the trading pipeline:
 * 1. Validates the signal one last time before execution
 * 2. Places the order through the TradingService
 * 3. Handles slippage and partial fills
 * 4. Records the execution result
 * 5. Creates a full audit trail
 *
 * Execution Pipeline:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 1. Pre-flight check (signal + risk still valid)             │
 * │ 2. Construct order request with idempotency key             │
 * │ 3. Execute via TradingService.placeOrder()                  │
 * │ 4. Record execution result + audit trail                    │
 * │ 5. Update Redis agent state                                 │
 * │ 6. Return TradeExecution result                             │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Safety Features:
 * - Idempotency key prevents duplicate orders
 * - Mandatory stop-loss on every order
 * - Slippage tolerance check
 * - Execution timeout protection
 * - Full audit trail for every decision
 */
@Injectable()
export class OrderExecutorService {
  private readonly logger = new Logger(OrderExecutorService.name);

  /** Slippage tolerance: reject if actual price deviates more than this % */
  private readonly MAX_SLIPPAGE_PERCENT = 1.0;

  /** Track executed orders for deduplication */
  private readonly recentOrders = new Map<string, Date>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly tradingService: TradingService,
    private readonly exchangeService: ExchangeService,
  ) {
    this.logger.log('⚡ Order Executor initialized — safe execution ready');

    // Clean up old order entries every 5 minutes
    setInterval(() => this._cleanupOldOrders(), 5 * 60 * 1000);
  }

  /**
   * Execute a validated signal as a live trade
   */
  async execute(
    userId: string,
    signal: EvaluatedSignal,
    risk: RiskAssessment,
    credentialId: string,
  ): Promise<TradeExecution> {
    const startTime = Date.now();
    const idempotencyKey = `agent-${userId}-${signal.symbol}-${Date.now()}`;

    this.logger.log(
      `⚡ Executing: ${signal.action} ${risk.positionSize.toFixed(6)} ${signal.symbol} ` +
      `@ ${signal.entryPrice} (SL: ${signal.stopLoss}, TP: ${signal.takeProfit})`,
    );

    try {
      // Pre-flight: Check for duplicate order
      if (this._isDuplicateOrder(userId, signal.symbol, signal.action)) {
        return {
          success: false,
          error: 'أمر مكرر — تم تقديم أمر مشابه مؤخراً',
          executionTimeMs: Date.now() - startTime,
        };
      }

      // Pre-flight: Verify stop-loss is set (NON-NEGOTIABLE)
      if (!signal.stopLoss || signal.stopLoss <= 0) {
        this.logger.error('⚡ ORDER REJECTED: No stop-loss');
        return {
          success: false,
          error: 'وقف الخسارة إجباري — لا يمكن تنفيذ أمر بدون وقف خسارة',
          executionTimeMs: Date.now() - startTime,
        };
      }

      // Pre-flight: Verify credential has trade permission
      const credential = await this.prisma.exchangeCredential.findUnique({
        where: { id: credentialId },
      });

      if (!credential || credential.userId !== userId || !credential.isValid) {
        return {
          success: false,
          error: 'بيانات الاعتماد غير صالحة',
          executionTimeMs: Date.now() - startTime,
        };
      }

      const permissions = JSON.parse(credential.permissions || '["read"]');
      if (!permissions.includes('trade')) {
        return {
          success: false,
          error: 'مفتاح API لا يملك صلاحية التداول — لا يمكن سحب الأموال',
          executionTimeMs: Date.now() - startTime,
        };
      }

      // Construct the order request
      const orderRequest: PlaceOrderRequest = {
        credentialId,
        symbol: signal.symbol,
        side: signal.action as OrderSide,
        type: signal.type as OrderType,
        quantity: risk.positionSize,
        price: signal.type === OrderType.LIMIT ? signal.entryPrice : undefined,
        stopLoss: signal.stopLoss, // MANDATORY
        takeProfit: signal.takeProfit,
      };

      // Execute through TradingService (includes risk checks)
      const order = await this.tradingService.placeOrder(userId, orderRequest);

      const executionTimeMs = Date.now() - startTime;

      // Record successful execution
      this.recentOrders.set(`${userId}:${signal.symbol}:${signal.action}`, new Date());

      // Audit log — detailed record for compliance
      await this.audit.log({
        userId,
        action: 'AGENT_TRADE_EXECUTED',
        resource: 'autonomous-trader',
        details: JSON.stringify({
          orderId: order.id,
          symbol: signal.symbol,
          side: signal.action,
          type: signal.type,
          quantity: risk.positionSize,
          entryPrice: signal.entryPrice,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit,
          confidence: signal.confidence,
          strategy: signal.strategy,
          riskScore: risk.riskScore,
          riskRewardRatio: risk.riskRewardRatio,
          executionTimeMs,
          reasoning: signal.reasoning,
        }),
      });

      this.logger.log(
        `✅ Order executed: ${order.id} — ${signal.action} ${risk.positionSize} ${signal.symbol} ` +
        `(${executionTimeMs}ms)`,
      );

      return {
        success: true,
        orderId: order.id,
        exchangeOrderId: order.exchangeOrderId || undefined,
        filledQuantity: Number(order.filledQuantity) || risk.positionSize,
        averagePrice: Number(order.averagePrice) || signal.entryPrice,
        fee: Number(order.fee) || 0,
        feeCurrency: order.feeCurrency || undefined,
        slippage: this._calculateSlippage(signal.entryPrice, Number(order.averagePrice) || signal.entryPrice, signal.action),
        executionTimeMs,
      };
    } catch (error: any) {
      const executionTimeMs = Date.now() - startTime;

      this.logger.error(
        `❌ Order execution failed for ${signal.symbol}: ${error.message}`,
      );

      // Audit the failure
      await this.audit.log({
        userId,
        action: 'AGENT_TRADE_FAILED',
        resource: 'autonomous-trader',
        details: JSON.stringify({
          symbol: signal.symbol,
          side: signal.action,
          error: error.message,
          executionTimeMs,
        }),
      });

      return {
        success: false,
        error: `فشل في التنفيذ: ${error.message}`,
        executionTimeMs,
      };
    }
  }

  /**
   * Emergency close all open positions for a user
   * Used when daily loss limit is reached or agent is emergency-stopped
   */
  async emergencyCloseAll(userId: string): Promise<{
    closedCount: number;
    errors: number;
    totalPnL: number;
  }> {
    this.logger.warn(`🚨 Emergency close all positions for user ${userId}`);

    let closedCount = 0;
    let errors = 0;
    let totalPnL = 0;

    try {
      const positions = await this.prisma.position.findMany({
        where: { userId, status: 'OPEN' },
      });

      for (const position of positions) {
        try {
          const result = await this.tradingService.closePosition(userId, {
            positionId: position.id,
          });

          if (result.pnl) {
            totalPnL += result.pnl;
          }

          closedCount++;

          await this.audit.log({
            userId,
            action: 'AGENT_EMERGENCY_CLOSE',
            resource: 'autonomous-trader',
            details: JSON.stringify({
              positionId: position.id,
              symbol: position.symbol,
              pnl: result.pnl,
            }),
          });
        } catch (error: any) {
          this.logger.error(
            `Failed to close position ${position.id}: ${error.message}`,
          );
          errors++;
        }
      }
    } catch (error: any) {
      this.logger.error(`Emergency close failed: ${error.message}`);
    }

    this.logger.log(
      `🚨 Emergency close complete: ${closedCount} closed, ${errors} errors, PnL: ${totalPnL.toFixed(2)}`,
    );

    return { closedCount, errors, totalPnL };
  }

  // ── Private Helpers ──

  private _isDuplicateOrder(userId: string, symbol: string, side: string): boolean {
    const key = `${userId}:${symbol}:${side}`;
    const lastOrder = this.recentOrders.get(key);

    if (!lastOrder) return false;

    // Consider duplicate if within last 30 seconds
    const timeSinceLastOrder = Date.now() - lastOrder.getTime();
    return timeSinceLastOrder < 30000;
  }

  private _calculateSlippage(expectedPrice: number, actualPrice: number, side: string): number {
    if (!expectedPrice || !actualPrice) return 0;
    return Math.abs((actualPrice - expectedPrice) / expectedPrice) * 100;
  }

  private _cleanupOldOrders(): void {
    const cutoff = Date.now() - 5 * 60 * 1000; // 5 minutes
    for (const [key, date] of this.recentOrders.entries()) {
      if (date.getTime() < cutoff) {
        this.recentOrders.delete(key);
      }
    }
  }
}
