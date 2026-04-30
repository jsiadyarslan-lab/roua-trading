import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AnalyticalAIService } from './analytical-ai.service';
import { MarketDataAggregatorService } from './aggregator.service';
import { TechnicalIndicatorService } from './indicators.service';
import { AuditService } from '../../audit/audit.service';
import {
  GeneratedSignalDto,
  SignalAction,
  AggregatedQuoteDto,
  TechnicalAnalysisDto,
  AnalysisCardDto,
} from './analytics.types';

/**
 * Signal Generator Service — Intelligent Trading Signal Generation
 *
 * Generates trading signals with mandatory stop-loss protection.
 * Combines technical analysis, AI insights, and market data
 * to produce actionable trading recommendations.
 *
 * Signal Generation Pipeline:
 * ┌────────────────────────────────────────────────────────────────┐
 * │ 1. Fetch Aggregated Market Data                               │
 * │ 2. Compute Technical Indicators                               │
 * │ 3. Generate AI Analysis                                       │
 * │ 4. Determine Signal Action (BUY/SELL/WAIT)                   │
 * │ 5. Calculate Stop Loss (MANDATORY)                           │
 * │ 6. Calculate Take Profit                                      │
 * │ 7. Calculate Risk/Reward Ratio                                │
 * │ 8. Persist Signal to Database                                 │
 * └────────────────────────────────────────────────────────────────┘
 *
 * Stop Loss Rules (MANDATORY):
 * - BUY signals: SL = entry - (2 × ATR) or entry × 0.97 (3% below)
 * - SELL signals: SL = entry + (2 × ATR) or entry × 1.03 (3% above)
 * - ATR-based SL is preferred when available (adaptive to volatility)
 * - Minimum SL distance: 1% from entry price
 *
 * Take Profit Rules:
 * - Risk/Reward ratio target: 1:2 minimum
 * - TP = entry ± 2 × (entry - SL) — ensures 1:2 reward/risk
 * - Can be overridden by AI-generated targets
 */
@Injectable()
export class SignalGeneratorService {
  private readonly logger = new Logger(SignalGeneratorService.name);

  /** Minimum risk/reward ratio */
  private readonly MIN_RISK_REWARD = 1.5;

  /** Default stop loss percentage if ATR not available */
  private readonly DEFAULT_SL_PERCENT = 0.03; // 3%

  /** Minimum stop loss distance (1%) */
  private readonly MIN_SL_DISTANCE = 0.01; // 1%

  /** Signal expiry duration (24 hours) */
  private readonly SIGNAL_EXPIRY_MS = 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticalAI: AnalyticalAIService,
    private readonly aggregator: MarketDataAggregatorService,
    private readonly indicators: TechnicalIndicatorService,
    private readonly auditService: AuditService,
  ) {
    this.logger.log('📡 Signal Generator Service initialized — mandatory stop-loss enforced');
  }

  /**
   * Generate a trading signal for a given symbol and user
   *
   * This is the main entry point. It performs full analysis,
   * determines the signal action, calculates SL/TP, and persists.
   *
   * @param userId The user requesting the signal
   * @param symbol Asset symbol (e.g., BTC/USDT, AAPL)
   */
  async generateSignal(userId: string, symbol: string, preComputedAnalysis?: AnalysisCardDto): Promise<GeneratedSignalDto> {
    this.logger.log(`📡 Generating signal for ${symbol} (user: ${userId})`);

    // Step 1: Use pre-computed analysis if provided, otherwise run full analysis
    const analysisCard = preComputedAnalysis || await this.analyticalAI.analyzeAsset(symbol);

    // Step 2: Determine signal action based on technical score + AI analysis
    const action = this._determineAction(analysisCard.technical, analysisCard.confidence);

    // Step 3: Get current price for entry
    const entryPrice = analysisCard.quote?.price || null;

    if (!entryPrice || entryPrice === 0) {
      // No market data available — return WAIT signal
      this.logger.warn(`No price data for ${symbol} — generating WAIT signal`);
      return this._createWaitSignal(symbol, 'لا تتوفر بيانات سعرية كافية');
    }

    // Step 4: Calculate mandatory stop loss
    const stopLoss = this._calculateStopLoss(
      action,
      entryPrice,
      analysisCard.technical,
    );

    // Step 5: Calculate take profit
    const takeProfit = this._calculateTakeProfit(
      action,
      entryPrice,
      stopLoss,
      analysisCard.technical,
    );

    // Step 6: Calculate risk/reward ratio
    const riskRewardRatio = this._calculateRiskReward(entryPrice, stopLoss, takeProfit, action);

    // Step 7: Extract supporting indicators
    const supportingIndicators = this._getSupportingIndicators(analysisCard.technical, action);

    // Step 8: Build reason from AI analysis
    const reason = this._buildSignalReason(action, analysisCard);

    // Step 9: Determine confidence
    const confidence = this._calculateSignalConfidence(analysisCard, action);

    // Step 10: Persist signal to database
    const expiresAt = new Date(Date.now() + this.SIGNAL_EXPIRY_MS);

    const signal = await this.prisma.signal.create({
      data: {
        userId,
        pair: symbol,
        action,
        confidence,
        reason,
        entryPrice,
        stopLoss,
        takeProfit,
        status: 'ACTIVE',
        expiresAt,
      },
    });

    // Audit log
    await this.auditService.log({
      userId,
      action: 'SIGNAL_GENERATED',
      resource: 'signal',
      details: JSON.stringify({
        symbol,
        action,
        confidence,
        entryPrice,
        stopLoss,
        takeProfit,
        riskRewardRatio,
        signalId: signal.id,
        technicalScore: analysisCard.technical?.technicalScore,
      }),
    });

    this.logger.log(
      `📡 Signal generated: ${action} ${symbol} @ ${entryPrice} (SL: ${stopLoss}, TP: ${takeProfit}, R:R ${riskRewardRatio})`,
    );

    return {
      symbol,
      action,
      confidence,
      stopLoss,
      takeProfit,
      entryPrice,
      reason,
      supportingIndicators,
      riskRewardRatio,
      expiresAt,
      id: signal.id,
    };
  }

  /**
   * Get recent signals for a symbol
   */
  async getSignalsForSymbol(userId: string, symbol: string, limit: number = 10): Promise<GeneratedSignalDto[]> {
    // Mark expired signals first
    await this.prisma.signal.updateMany({
      where: {
        userId,
        pair: symbol,
        status: 'ACTIVE',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });

    const signals = await this.prisma.signal.findMany({
      where: { userId, pair: symbol },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return signals.map((s) => ({
      symbol: s.pair,
      action: s.action as SignalAction,
      confidence: s.confidence,
      stopLoss: Number(s.stopLoss ?? 0),
      takeProfit: s.takeProfit != null ? Number(s.takeProfit) : null,
      entryPrice: s.entryPrice != null ? Number(s.entryPrice) : null,
      reason: s.reason,
      supportingIndicators: [],
      riskRewardRatio: s.stopLoss && s.takeProfit && s.entryPrice
        ? this._calculateRiskReward(Number(s.entryPrice), Number(s.stopLoss), Number(s.takeProfit), s.action as SignalAction)
        : null,
      expiresAt: s.expiresAt,
      id: s.id,
    }));
  }

  // ── Private: Action Determination ──

  /**
   * Determine signal action based on technical analysis and confidence
   *
   * Decision Matrix:
   * ┌──────────────────┬────────────────────────┐
   * │ Technical Score   │ Action                 │
   * ├──────────────────┼────────────────────────┤
   * │ > 40             │ BUY (strong)           │
   * │ 20 to 40         │ BUY (moderate)         │
   * │ -20 to 20        │ WAIT                   │
   * │ -40 to -20       │ SELL (moderate)        │
   * │ < -40            │ SELL (strong)          │
   * └──────────────────┴────────────────────────┘
   *
   * Additional rules:
   * - If confidence < 30, always WAIT
   * - If RSI is extreme (> 80 or < 20), it strengthens the signal
   */
  private _determineAction(
    technical: TechnicalAnalysisDto | null,
    confidence: number,
  ): SignalAction {
    // Low confidence = WAIT
    if (confidence < 30) return SignalAction.WAIT;

    if (!technical) return SignalAction.WAIT;

    const score = technical.technicalScore;

    // Strong signals
    if (score > 40) return SignalAction.BUY;
    if (score < -40) return SignalAction.SELL;

    // Moderate signals — check RSI for confirmation
    if (score > 20) {
      // Check if RSI is overbought (which would weaken BUY)
      if (technical.rsi?.interpretation === 'OVERBOUGHT') {
        return SignalAction.WAIT; // Don't buy when overbought
      }
      return SignalAction.BUY;
    }

    if (score < -20) {
      // Check if RSI is oversold (which would weaken SELL)
      if (technical.rsi?.interpretation === 'OVERSOLD') {
        return SignalAction.WAIT; // Don't sell when oversold
      }
      return SignalAction.SELL;
    }

    // Neutral zone
    return SignalAction.WAIT;
  }

  // ── Private: Stop Loss Calculation (MANDATORY) ──

  /**
   * Calculate stop loss — ALWAYS returns a value
   *
   * Strategy:
   * 1. ATR-based: entry ± 2×ATR (preferred — adaptive to volatility)
   * 2. Percentage-based: entry × (1 ± 3%) (fallback)
   * 3. Minimum distance: 1% from entry
   */
  private _calculateStopLoss(
    action: SignalAction,
    entryPrice: number,
    technical: TechnicalAnalysisDto | null,
  ): number {
    if (action === SignalAction.WAIT) {
      return entryPrice; // No SL needed for WAIT
    }

    let stopLoss: number;

    // Try ATR-based stop loss
    if (technical?.atr && technical.atr.values.length > 0) {
      const latestAtr = technical.atr.values[technical.atr.values.length - 1];

      if (latestAtr > 0) {
        // Use 2×ATR for stop loss distance
        const atrDistance = 2 * latestAtr;

        if (action === SignalAction.BUY) {
          stopLoss = entryPrice - atrDistance;
        } else {
          stopLoss = entryPrice + atrDistance;
        }

        // Validate: ensure minimum distance
        const slDistance = Math.abs(entryPrice - stopLoss) / entryPrice;
        if (slDistance < this.MIN_SL_DISTANCE) {
          this.logger.debug(`ATR SL too close (${(slDistance * 100).toFixed(2)}%) — applying minimum distance`);
          stopLoss = action === SignalAction.BUY
            ? entryPrice * (1 - this.MIN_SL_DISTANCE)
            : entryPrice * (1 + this.MIN_SL_DISTANCE);
        }

        this.logger.debug(`ATR-based SL for ${action}: ${stopLoss} (ATR=${latestAtr.toFixed(2)})`);
        return stopLoss;
      }
    }

    // Fallback: percentage-based stop loss
    if (action === SignalAction.BUY) {
      stopLoss = entryPrice * (1 - this.DEFAULT_SL_PERCENT);
    } else {
      stopLoss = entryPrice * (1 + this.DEFAULT_SL_PERCENT);
    }

    this.logger.debug(`Percentage-based SL for ${action}: ${stopLoss} (${(this.DEFAULT_SL_PERCENT * 100)}%)`);
    return stopLoss;
  }

  // ── Private: Take Profit Calculation ──

  /**
   * Calculate take profit based on risk/reward ratio
   *
   * Strategy: Target 1:2 risk/reward minimum
   * TP = entry ± 2 × |entry - SL|
   */
  private _calculateTakeProfit(
    action: SignalAction,
    entryPrice: number,
    stopLoss: number,
    technical: TechnicalAnalysisDto | null,
  ): number | null {
    if (action === SignalAction.WAIT) return null;

    const risk = Math.abs(entryPrice - stopLoss);

    if (risk === 0) return null;

    // Target: 2× risk (1:2 risk/reward)
    const reward = risk * 2;

    let takeProfit: number;

    if (action === SignalAction.BUY) {
      takeProfit = entryPrice + reward;
    } else {
      takeProfit = entryPrice - reward;
    }

    // Check if Bollinger Bands suggest a closer target
    if (technical?.bollingerBands) {
      const bb = technical.bollingerBands;
      const latestUpper = bb.upper[bb.upper.length - 1];
      const latestLower = bb.lower[bb.lower.length - 1];

      if (action === SignalAction.BUY && latestUpper && latestUpper < takeProfit) {
        // Upper band is closer than our TP — use it as a conservative target
        takeProfit = latestUpper;
      } else if (action === SignalAction.SELL && latestLower && latestLower > takeProfit) {
        takeProfit = latestLower;
      }
    }

    return takeProfit;
  }

  // ── Private: Risk/Reward Ratio ──

  /**
   * Calculate risk/reward ratio
   * Returns the ratio of potential reward to risk
   */
  private _calculateRiskReward(
    entry: number,
    stopLoss: number,
    takeProfit: number | null,
    action: SignalAction,
  ): number | null {
    if (!takeProfit || action === SignalAction.WAIT) return null;

    const risk = Math.abs(entry - stopLoss);
    const reward = Math.abs(takeProfit - entry);

    if (risk === 0) return null;
    return Math.round((reward / risk) * 100) / 100;
  }

  // ── Private: Supporting Indicators ──

  /**
   * Get list of indicators that support the signal action
   */
  private _getSupportingIndicators(
    technical: TechnicalAnalysisDto | null,
    action: SignalAction,
  ): string[] {
    if (!technical) return [];

    const supporting: string[] = [];

    // SMA check
    const sma20Val = technical.sma.find((s) => s.period === 20)?.values.slice(-1)[0];
    const sma50Val = technical.sma.find((s) => s.period === 50)?.values.slice(-1)[0];

    if (sma20Val && sma50Val) {
      if (action === SignalAction.BUY && sma20Val > sma50Val) {
        supporting.push('SMA20 > SMA50 (Golden Cross)');
      } else if (action === SignalAction.SELL && sma20Val < sma50Val) {
        supporting.push('SMA20 < SMA50 (Death Cross)');
      }
    }

    // RSI
    if (technical.rsi) {
      const rsiLatest = technical.rsi.values.slice(-1)[0];
      if (action === SignalAction.BUY && technical.rsi.interpretation === 'OVERSOLD') {
        supporting.push(`RSI(${technical.rsi.period}) = ${rsiLatest.toFixed(1)} Oversold`);
      } else if (action === SignalAction.SELL && technical.rsi.interpretation === 'OVERBOUGHT') {
        supporting.push(`RSI(${technical.rsi.period}) = ${rsiLatest.toFixed(1)} Overbought`);
      }
    }

    // MACD
    if (technical.macd) {
      if (action === SignalAction.BUY && technical.macd.crossover === 'BULLISH_CROSSOVER') {
        supporting.push('MACD Bullish Crossover');
      } else if (action === SignalAction.SELL && technical.macd.crossover === 'BEARISH_CROSSOVER') {
        supporting.push('MACD Bearish Crossover');
      }
    }

    // Bollinger Bands
    if (technical.bollingerBands) {
      if (action === SignalAction.BUY && technical.bollingerBands.position === 'BELOW_LOWER') {
        supporting.push('Price below Bollinger Lower Band');
      } else if (action === SignalAction.SELL && technical.bollingerBands.position === 'ABOVE_UPPER') {
        supporting.push('Price above Bollinger Upper Band');
      }
    }

    return supporting;
  }

  // ── Private: Signal Reason Builder ──

  /**
   * Build a concise reason for the signal
   */
  private _buildSignalReason(
    action: SignalAction,
    analysisCard: any,
  ): string {
    const parts: string[] = [];

    // Action description
    if (action === SignalAction.BUY) {
      parts.push('إشارة شراء');
    } else if (action === SignalAction.SELL) {
      parts.push('إشارة بيع');
    } else {
      parts.push('إشارة انتظار');
    }

    // Technical justification
    if (analysisCard.technical) {
      const score = analysisCard.technical.technicalScore;
      parts.push(`النتيجة الفنية: ${score > 0 ? '+' : ''}${score}`);

      if (analysisCard.technical.rsi) {
        parts.push(`RSI: ${analysisCard.technical.rsi.interpretation}`);
      }

      if (analysisCard.technical.macd?.crossover !== 'NONE') {
        parts.push(`MACD: ${analysisCard.technical.macd.crossover}`);
      }
    }

    // AI analysis summary (truncate to 300 chars)
    if (analysisCard.aiAnalysis && analysisCard.aiAnalysis.length > 0) {
      const aiSummary = analysisCard.aiAnalysis.slice(0, 300);
      parts.push(`التحليل: ${aiSummary}`);
    }

    return parts.join(' | ');
  }

  // ── Private: Signal Confidence ──

  /**
   * Calculate signal-specific confidence
   */
  private _calculateSignalConfidence(
    analysisCard: any,
    action: SignalAction,
  ): number {
    let confidence = analysisCard.confidence || 50;

    // WAIT signals have lower confidence (uncertainty)
    if (action === SignalAction.WAIT) {
      confidence = Math.min(confidence, 40);
    }

    // Boost confidence if multiple indicators agree
    if (analysisCard.technical) {
      const supportingIndicators = this._getSupportingIndicators(analysisCard.technical, action);
      confidence += supportingIndicators.length * 5;
    }

    return Math.min(100, Math.max(0, confidence));
  }

  // ── Private: WAIT Signal Helper ──

  /**
   * Create a WAIT signal when conditions don't support BUY/SELL
   */
  private _createWaitSignal(symbol: string, reason: string): GeneratedSignalDto {
    return {
      symbol,
      action: SignalAction.WAIT,
      confidence: 0,
      stopLoss: 0,
      takeProfit: null,
      entryPrice: null,
      reason,
      supportingIndicators: [],
      riskRewardRatio: null,
      expiresAt: new Date(Date.now() + this.SIGNAL_EXPIRY_MS),
      id: 'wait',
    };
  }
}
