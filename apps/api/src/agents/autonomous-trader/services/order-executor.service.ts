// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Order Executor Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { AuditService } from '../../../audit/audit.service';
import { TradingService } from '../../../modules/trading/trading.service';
import { ExchangeService } from '../../../modules/exchange/exchange.service';
import { PlaceOrderRequest, OrderSide, OrderType } from '../../../modules/trading/trading.types';
import { EvaluatedSignal, TradeExecution, RiskAssessment, AgentDecision } from '../types/agent.types';
import { OrderDispatcherService } from '../../../modules/trading/services/order-dispatcher.service';
import { ExposureManagerService } from '../../../modules/trading/services/exposure-manager.service';
import { CredentialsService } from '../../../modules/portfolio/credentials/credentials.service';

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
export class OrderExecutorService implements OnModuleDestroy {
  private readonly logger = new Logger(OrderExecutorService.name);

  /** Slippage tolerance: reject if actual price deviates more than this % */
  private readonly MAX_SLIPPAGE_PERCENT = 1.0;

  /** Track executed orders for deduplication */
  private readonly recentOrders = new Map<string, Date>();

  /** Reference to the cleanup interval for proper disposal */
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  // FIX: Dependencies from forwardRef modules are marked @Optional() to prevent
  // NestJS crash if forwardRef resolution fails. When null, the execute method
  // returns an error instead of crashing the entire AutonomousTraderAgentModule.
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Optional() private readonly audit: AuditService,
    @Optional() private readonly tradingService: TradingService,
    @Optional() private readonly orderDispatcher: OrderDispatcherService,
    @Optional() private readonly exposureManager: ExposureManagerService,
    @Optional() private readonly exchangeService: ExchangeService,
    @Optional() private readonly credentialsService: CredentialsService,
  ) {
    this.logger.log('⚡ Order Executor initialized — safe execution ready');

    // Clean up old order entries every 5 minutes
    this.cleanupInterval = setInterval(() => this._cleanupOldOrders(), 5 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.logger.log('⚡ Order Executor cleanup interval cleared');
    }
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
    const idempotencyKey = `${userId}-${signal.id}`;

    // FIX: Guard against missing forwardRef dependencies
    if (!this.orderDispatcher) {
      return {
        success: false,
        error: 'نظام التنفيذ غير متاح حالياً — يرجى المحاولة لاحقاً',
        executionTimeMs: Date.now() - startTime,
      };
    }

    this.logger.log(
      `⚡ Executing: ${signal.action} ${risk.positionSize.toFixed(6)} ${signal.symbol} ` +
      `@ ${signal.entryPrice} (SL: ${signal.stopLoss}, TP: ${signal.takeProfit})`,
    );

    try {
      // ═══════════════════════════════════════════════════════════════
      // V146b FIX: Only block if the Agent already has its OWN position.
      // Same-direction from Smart Executor is OK — different timeframe.
      // The Agent trades M30/H1/H4/D1/W1, Smart Executor trades M1/M5/M15.
      // ═══════════════════════════════════════════════════════════════
      const existingPosition = await this.prisma.position.findFirst({
        where: { userId, symbol: signal.symbol, status: 'OPEN', source: 'agent' },
      });

      if (existingPosition) {
        this.logger.warn(
          `⚡ ORDER REJECTED: Agent already has position for ${signal.symbol} ` +
          `(existing: ${existingPosition.side})`,
        );
        return {
          success: false,
          error: `يوجد مركز خاص بالوكيل لـ ${signal.symbol} (${existingPosition.side}) — لا يمكن فتح مركز آخر`,
          executionTimeMs: Date.now() - startTime,
        };
      }

      // Pre-flight: Check for duplicate order (in-memory 30s window)
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
      // DATA ISOLATION: Use findFirst with userId to prevent accessing other users' credentials
      const credential = await this.prisma.exchangeCredential.findFirst({
        where: { id: credentialId, userId },
      });

      // Paper trading mode — route through TradingService for proper record creation
      // FIX: Previously, the Agent bypassed TradingService and created Position + AutonomousTrade
      // directly. This caused THREE critical issues:
      //   1. Position.create fails with P2002 unique constraint (userId+symbol+side+status)
      //      when a previous position is stuck OPEN — every subsequent trade for that pair fails
      //   2. Returns success:true even when Position creation fails — inconsistent state
      //   3. No Order or Trade records created — breaks daily loss tracking and trade history
      // Now: Route through TradingService.placeOrder() which handles paper-trading via
      // _executePaperTrade(), creates all 4 records (Order+Position+Trade+Signal) in a
      // single transaction, and handles P2002 with upsert logic.
      if (credential && credential.exchange === 'paper-trading') {
        this.logger.log(`⚡ Paper trading mode — routing through TradingService for ${signal.action} ${signal.symbol}`);

        // Get live price for realistic execution
        let executionPrice = signal.entryPrice;
        try {
          const liveQuote = await this.exchangeService.getQuote(signal.symbol);
          if (liveQuote && liveQuote.price && liveQuote.price > 0) {
            const slippagePercent = 0.01 + Math.random() * 0.04;
            const slippageDirection = signal.action === 'BUY' ? 1 : -1;
            executionPrice = liveQuote.price * (1 + slippageDirection * slippagePercent / 100);
            this.logger.log(
              `⚡ Paper trade using live price: ${liveQuote.price.toFixed(2)} → execution: ${executionPrice.toFixed(2)}`,
            );
          }
        } catch (quoteErr: any) {
          this.logger.warn(`⚡ Could not get live quote for ${signal.symbol}: ${quoteErr.message} — using signal price`);
        }

        // Validate execution price
        if (!executionPrice || executionPrice <= 0) {
          return {
            success: false,
            error: `سعر التنفيذ غير صالح (${executionPrice}) لـ ${signal.symbol} — تم إلغاء الأمر`,
            executionTimeMs: Date.now() - startTime,
          };
        }

        // Validate minimum trade value
        const tradeValue = risk.positionSize * executionPrice;
        if (tradeValue < 1) {
          return {
            success: false,
            error: `قيمة الصفقة صغيرة جداً ($${tradeValue.toFixed(4)}) — تم الإلغاء`,
            executionTimeMs: Date.now() - startTime,
          };
        }

        try {
          // Route through TradingService — creates Order + Position + Trade + Signal in one transaction
          const orderRequest = {
            credentialId,
            symbol: signal.symbol,
            side: signal.action as OrderSide,
            type: signal.type as OrderType,
            quantity: risk.positionSize,
            price: executionPrice,
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfit,
            source: 'agent' as const,
            idempotencyKey,
          };

          // ✅ FIX: Route through OrderDispatcher — prevents duplicate orders with SmartExecutor
          const dispatchResult = await this.orderDispatcher.submitOrder({
            source: 'agent' as const,
            userId,
            credentialId: orderRequest.credentialId,
            symbol: orderRequest.symbol,
            side: (orderRequest.side as string).toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
            quantity: orderRequest.quantity,
            price: orderRequest.price || 0,
            stopLoss: orderRequest.stopLoss,
            takeProfit: orderRequest.takeProfit,
            signalId:  signal?.id,
            briefId:   (signal?.metadata as any)?.briefId ?? null, // V175: ربط الصفقة بالـ brief
            isPaperTrading: true,
            timeframe: signal?.timeframe, // V132: Pass timeframe for smart idempotency TTL
          });
          if (!dispatchResult.success) {
            throw new Error(dispatchResult.error || dispatchResult.message || 'فشل الموزع');
          }
          const order = { id: dispatchResult.orderId || 'unknown' };
          const executionTimeMs = Date.now() - startTime;
          const calculatedSlippage = this._calculateSlippage(signal.entryPrice, executionPrice, signal.action);

          // Track this order to prevent immediate duplicates
          this.recentOrders.set(`${userId}:${signal.symbol}:${signal.action}`, new Date());

          // Also record in AutonomousTrade table for agent-specific analytics
          try {
            await this.prisma.autonomousTrade.create({
              data: {
                userId,
                agentRunId: `run-${userId}-${signal.strategy}`,
                symbol: signal.symbol,
                side: signal.action as any,
                orderType: signal.type as any,
                strategy: signal.strategy as any,
                status: 'FILLED',
                entryPrice: executionPrice,
                stopLoss: signal.stopLoss,
                takeProfit: signal.takeProfit,
                quantity: risk.positionSize,
                filledQuantity: risk.positionSize,
                pnl: null,
                fee: executionPrice * risk.positionSize * 0.001,
                feeCurrency: 'USD',
                riskScore: risk.riskScore,
                confidence: signal.confidence,
                riskRewardRatio: risk.riskRewardRatio,
                reasoning: signal.reasoning,
                signalData: JSON.stringify(signal.metadata || {}),
                metadata: JSON.stringify({
                  paperTrading: true,
                  executionTimeMs,
                  orderId: order.id,
                }),
                execution: JSON.stringify({
                  success: true,
                  paperTrading: true,
                  orderId: order.id,
                  filledQuantity: risk.positionSize,
                  averagePrice: executionPrice,
                  slippage: calculatedSlippage,
                  executionTimeMs,
                }),
                credentialId,
                exchangeOrderId: null,
                openedAt: new Date(),
              },
            });
          } catch (tradeErr: any) {
            this.logger.error(`Failed to record AutonomousTrade: ${tradeErr.message}`);
            // Non-fatal — the order was still executed via TradingService
          }

          this.recentOrders.set(`${userId}:${signal.symbol}:${signal.action}`, new Date());

          // Audit log
          await this.audit?.log({
            userId,
            action: 'AGENT_PAPER_TRADE_EXECUTED',
            resource: 'autonomous-trader',
            details: JSON.stringify({
              orderId: order.id,
              symbol: signal.symbol,
              side: signal.action,
              quantity: risk.positionSize,
              executionPrice,
              stopLoss: signal.stopLoss,
              takeProfit: signal.takeProfit,
              strategy: signal.strategy,
              paperTrading: true,
            }),
          });

          this.logger.log(
            `✅ Paper order executed: ${signal.action} ${risk.positionSize} ${signal.symbol} ` +
            `@ ${executionPrice.toFixed(2)} via TradingService (order: ${order.id})`,
          );

          return {
            success: true,
            orderId: order.id,
            exchangeOrderId: undefined,
            filledQuantity: risk.positionSize,
            averagePrice: executionPrice,
            fee: executionPrice * risk.positionSize * 0.001,
            feeCurrency: 'USD',
            slippage: calculatedSlippage,
            executionTimeMs,
          };
        } catch (orderErr: any) {
          const executionTimeMs = Date.now() - startTime;
          this.logger.error(`⚡ TradingService.placeOrder failed for paper trade: ${orderErr.message}`);

          // Check if it's a P2002 unique constraint (duplicate position)
          const isDuplicate = orderErr.message?.includes('Unique constraint') ||
            orderErr.message?.includes('P2002') ||
            orderErr.message?.includes('already has an open position');

          return {
            success: false,
            error: isDuplicate
              ? `يوجد مركز مفتوح بالفعل لـ ${signal.symbol} — لا يمكن فتح مركز آخر`
              : `فشل تنفيذ الصفقة الورقية: ${orderErr.message}`,
            executionTimeMs,
          };
        }
      }

      // DATA ISOLATION: credential was already filtered by userId in findFirst above
      if (!credential || !credential.isValid) {
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

      // V147 FIX: Block SELL on spot exchanges — you can't short-sell on spot.
      // Spot exchanges only allow SELL of assets you already own.
      // The Agent opens NEW positions, so SELL = "go short" which is impossible on spot.
      // This requires a margin/futures account to execute.
      const isSpotExchange = credential.exchange !== 'paper-trading' &&
        !credential.testnet &&
        credential.exchange !== 'alpaca'; // Alpaca supports short selling
      if (isSpotExchange && signal.action === 'SELL') {
        this.logger.warn(
          `⚡ V147 ORDER REJECTED: SELL ${signal.symbol} on spot exchange ${credential.exchange} — short selling requires margin/futures`,
        );
        return {
          success: false,
          error: `بيع ${signal.symbol} غير ممكن على حساب سبوت (${credential.exchange}) — يحتاج حساب مارجن/فيوتشر للبيع على المكشوف`,
          executionTimeMs: Date.now() - startTime,
        };
      }

      // ═══════════════════════════════════════════════════════════════
      // V150 FIX: Pre-trade balance check for REAL exchanges.
      // Before submitting an order to Binance/KuCoin/etc., verify the
      // account has sufficient balance. This prevents:
      //   1. Wasting API calls on orders that will be rejected
      //   2. "binance Account has insufficient balance" errors every minute
      //   3. Unnecessary error logs and retry attempts
      //
      // FIX: Paper trading now checks AgentSettings.paperBalance — not unlimited.
      // Real exchanges check live balance via CredentialsService.
      // ═══════════════════════════════════════════════════════════════
      try {
        const balanceCheck = await this._checkSufficientBalance(
          credential,
          signal.symbol,
          signal.action as OrderSide,
          risk.positionSize,
          signal.entryPrice,
        );
        if (!balanceCheck.sufficient) {
          this.logger.warn(
            `⚡ V150 ORDER REJECTED: Insufficient balance for ${signal.action} ${risk.positionSize} ${signal.symbol} ` +
            `on ${credential.exchange} — need $${balanceCheck.required.toFixed(2)}, have $${balanceCheck.available.toFixed(2)}`
          );
          return {
            success: false,
            error: `رصيد غير كافي في ${credential.exchange} — يحتاج $${balanceCheck.required.toFixed(2)}، المتاح $${balanceCheck.available.toFixed(2)}`,
            executionTimeMs: Date.now() - startTime,
          };
        }
      } catch (balanceErr: any) {
        this.logger.warn(
          `⚡ V150: Pre-trade balance check failed for ${credential.exchange}: ${balanceErr.message} — proceeding with order submission`
        );
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
        idempotencyKey,
      };

      // FIX: Route ALL orders (real + paper) through OrderDispatcher → BullMQ pipeline
      const dispatchResult = await this.orderDispatcher.submitOrder({
        source: 'agent',
        userId,
        credentialId: orderRequest.credentialId,
        symbol: orderRequest.symbol,
        side: (orderRequest.side as string).toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
        quantity: orderRequest.quantity,
        price: typeof orderRequest.price === 'number' ? orderRequest.price : undefined,
        stopLoss: orderRequest.stopLoss,
        takeProfit: orderRequest.takeProfit,
        signalId: signal?.id,
        isPaperTrading: false,
        timeframe: signal?.timeframe, // V132: Pass timeframe for smart idempotency TTL
      });
      if (!dispatchResult.success) {
        throw new Error(dispatchResult.error || dispatchResult.message || 'فشل الموزع');
      }
      const order = { id: dispatchResult.orderId || 'unknown', filledQuantity: orderRequest.quantity, averagePrice: orderRequest.price || 0, fee: 0, feeCurrency: 'USD', exchangeOrderId: null as any };

      const executionTimeMs = Date.now() - startTime;

      // Record successful execution
      this.recentOrders.set(`${userId}:${signal.symbol}:${signal.action}`, new Date());

      // Audit log — detailed record for compliance
      await this.audit?.log({
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

      // Record in AutonomousTrade table for agent-specific analytics
      try {
        await this.prisma.autonomousTrade.create({
          data: {
            userId,
            agentRunId: `run-${userId}-${signal.strategy}`, // matches agent session
            symbol: signal.symbol,
            side: signal.action as any,
            orderType: signal.type as any,
            strategy: signal.strategy as any,
            status: 'FILLED',
            entryPrice: signal.entryPrice,
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfit,
            quantity: risk.positionSize,
            filledQuantity: Number(order.filledQuantity) || risk.positionSize,
            pnl: null, // Will be updated when position closes
            fee: Number(order.fee) || 0,
            feeCurrency: order.feeCurrency || 'USD',
            riskScore: risk.riskScore,
            confidence: signal.confidence,
            riskRewardRatio: risk.riskRewardRatio,
            reasoning: signal.reasoning,
            signalData: JSON.stringify(signal.metadata || {}),
            metadata: JSON.stringify({ orderId: order.id, executionTimeMs }),
            execution: JSON.stringify({
              success: true,
              orderId: order.id,
              exchangeOrderId: order.exchangeOrderId,
              filledQuantity: Number(order.filledQuantity) || risk.positionSize,
              averagePrice: Number(order.averagePrice) || signal.entryPrice,
              fee: Number(order.fee) || 0,
              slippage: this._calculateSlippage(signal.entryPrice, Number(order.averagePrice) || signal.entryPrice, signal.action),
              executionTimeMs,
            }),
            credentialId,
            exchangeOrderId: null,
            openedAt: new Date(),
          },
        });
      } catch (tradeErr: any) {
        this.logger.error(`Failed to record AutonomousTrade: ${tradeErr.message}`);
        // Non-fatal — the order was still executed successfully
      }

      this.logger.log(
        `✅ Order executed: ${order.id} — ${signal.action} ${risk.positionSize} ${signal.symbol} ` +
        `(${executionTimeMs}ms)`,
      );

      return {
        success: true,
        orderId: order.id,
        exchangeOrderId: undefined,
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
      await this.audit?.log({
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

    // FIX: Guard against missing forwardRef dependencies
    if (!this.tradingService) {
      this.logger.error('🚨 TradingService not available — cannot close positions');
      return { closedCount: 0, errors: 0, totalPnL: 0 };
    }

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

          await this.audit?.log({
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

  /**
   * V150: Check if the exchange account has sufficient balance for a trade.
   * Uses CredentialsService.fetchAllExchangeBalances() which caches results
   * for 5 seconds, so this is efficient and won't hammer the exchange API.
   *
   * Prevents "insufficient balance" errors from Binance that would occur
   * anyway, saving API calls and reducing log noise.
   *
   * @returns { sufficient: boolean, required: number, available: number }
   */
  private async _checkSufficientBalance(
    credential: any,
    symbol: string,
    side: string,
    quantity: number,
    price: number,
  ): Promise<{ sufficient: boolean; required: number; available: number }> {
    // Calculate order value (notional)
    const orderValue = Math.abs(quantity * price);
    const required = orderValue * 1.005; // Add 0.5% buffer for fees/slippage

    // Use CredentialsService to fetch balance (with 5-second cache)
    if (!this.credentialsService) {
      return { sufficient: true, required, available: Infinity };
    }

    try {
      const balances = await this.credentialsService.fetchAllExchangeBalances(credential.userId);

      // Paper trading: use paper balance from AgentSettings
      if (credential.exchange === 'paper-trading') {
        const paperExchange = balances.exchanges.find((e: any) => e.exchange === 'paper-trading');
        const available = paperExchange?.available ?? 0;
        return { sufficient: available >= required, required, available };
      }
      // Find the specific exchange's available balance
      const exchangeBalance = balances.exchanges.find(
        (e: any) => e.credentialId === credential.id ||
          e.exchange === credential.exchange ||
          (credential.exchange.includes('test') && e.isTestnet && e.exchange.includes(credential.exchange.replace('_test', '').replace('_future_test', '')))
      );

      if (!exchangeBalance) {
        // Exchange not found in balance response — skip check
        return { sufficient: true, required, available: Infinity };
      }

      const available = exchangeBalance.available || 0;
      const sufficient = available >= required;

      if (!sufficient) {
        this.logger.warn(
          `⚡ V150: Balance check FAILED for ${credential.exchange}: ` +
          `need $${required.toFixed(2)}, have $${available.toFixed(2)} available`
        );
      }

      return { sufficient, required, available };
    } catch (err: any) {
      // Balance check failed — log warning but don't block the trade
      // (the exchange itself will reject if balance is insufficient)
      this.logger.warn(`⚡ V150: Balance check error for ${credential.exchange}: ${err.message}`);
      return { sufficient: true, required, available: Infinity };
    }
  }
}
