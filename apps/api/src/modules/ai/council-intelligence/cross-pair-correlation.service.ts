// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Cross-Pair Correlation Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "الارتباط بين الأزواج" — BTC ينهار → ALTs تنهار
// لا تفتح ٣ صفقات BUY على أزواج مرتبطة = مخاطرة ٣×
//
// V185: حماية رأس المال من الرهان المتكرر
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { MarketDataService } from '../services/market-data.service';
import { BINANCE_SUPPORTED_PAIRS } from '../strategic-council/strategic-council.types';

export interface CorrelationMatrix {
  [symbolA: string]: {
    [symbolB: string]: {
      correlation: number;   // -1.0 to 1.0
      riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
      sameDirectionPct: number;
    };
  };
}

export interface CorrelatedRisk {
  symbol: string;
  correlatedOpenPositions: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  effectiveExposure: number; // 1.0 = normal, 2.5 = highly correlated
  recommendation: string;
}

@Injectable()
export class CrossPairCorrelationService {
  private readonly logger = new Logger(CrossPairCorrelationService.name);
  private readonly REDIS_MATRIX_KEY = 'correlation:matrix';
  private readonly REDIS_PRICES_KEY = 'correlation:prices:';
  private _correlationCollectionInterval: NodeJS.Timeout | null = null; // V220: cleanup on destroy

  // Price history stored in Redis for correlation calculation
  // Key: correlation:prices:BTC/USDT → JSON array of {time, price}
  private readonly PRICE_HISTORY_LENGTH = 100; // Last 100 data points

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly marketData: MarketDataService,
  ) {
    this.logger.log('🔗 Cross-Pair Correlation initialized — الأزواج مرتبطة!');
    this._startPriceCollection();
  }

  /**
   * Check if opening a new position would create correlated risk
   * Called by SmartExecutor before executing a brief
   */
  async checkCorrelatedRisk(
    userId: string,
    newSymbol: string,
    newDirection: string,
    existingPositions: { symbol: string; side: string; quantity: number }[],
  ): Promise<CorrelatedRisk> {
    // Get correlation matrix
    const matrix = await this.getCorrelationMatrix();

    const correlatedOpenPositions: string[] = [];
    let maxCorrelation = 0;
    let sameDirectionCount = 0;

    for (const pos of existingPositions) {
      const corr = matrix[newSymbol]?.[pos.symbol]?.correlation
        ?? matrix[pos.symbol]?.[newSymbol]?.correlation
        ?? 0;

      const absCorr = Math.abs(corr);
      if (absCorr > 0.5) {
        correlatedOpenPositions.push(pos.symbol);
        maxCorrelation = Math.max(maxCorrelation, absCorr);

        // Check if same direction (both BUY or both SELL)
        if ((newDirection === pos.side && corr > 0.3) ||
            (newDirection !== pos.side && corr < -0.3)) {
          sameDirectionCount++;
        }
      }
    }

    // Calculate effective exposure
    const effectiveExposure = 1 + (sameDirectionCount * maxCorrelation);

    // Determine risk level
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
    let recommendation: string;

    if (maxCorrelation > 0.8 && sameDirectionCount > 0) {
      riskLevel = 'EXTREME';
      recommendation = `⚠️ خطر! ${newSymbol} مرتبط جداً (${(maxCorrelation * 100).toFixed(0)}%) مع صفقات مفتوحة. نفس الرهان عدة مرات!`;
    } else if (maxCorrelation > 0.6 && sameDirectionCount > 0) {
      riskLevel = 'HIGH';
      recommendation = `⚠️ ${newSymbol} مرتبط (${(maxCorrelation * 100).toFixed(0)}%) مع صفقات مفتوحة. فكّر بتقليل الحجم.`;
    } else if (maxCorrelation > 0.4) {
      riskLevel = 'MEDIUM';
      recommendation = `${newSymbol} له ارتباط متوسط. يمكن التنفيذ بحجم أقل.`;
    } else {
      riskLevel = 'LOW';
      recommendation = 'لا ارتباط ملحوظ. يمكن التنفيذ بشكل طبيعي.';
    }

    return {
      symbol: newSymbol,
      correlatedOpenPositions,
      riskLevel,
      effectiveExposure,
      recommendation,
    };
  }

  /**
   * Get correlation matrix for all pairs
   */
  async getCorrelationMatrix(): Promise<CorrelationMatrix> {
    // Check cache first
    try {
      const cached = await this.redis.get(this.REDIS_MATRIX_KEY);
      if (cached) return JSON.parse(cached);
    } catch { /* continue */ }

    // Calculate fresh matrix
    const matrix = await this._calculateCorrelationMatrix();

    // Cache for 1 hour
    try {
      await this.redis.set(this.REDIS_MATRIX_KEY, JSON.stringify(matrix), 3600 * 1000);
    } catch { /* non-critical */ }

    return matrix;
  }

  /**
   * Get the position size multiplier based on correlation risk
   * Returns 0.3-1.0 — lower = more correlated = smaller position
   */
  async getPositionSizeMultiplier(
    userId: string,
    symbol: string,
    direction: string,
    existingPositions: { symbol: string; side: string; quantity: number }[],
  ): Promise<number> {
    const risk = await this.checkCorrelatedRisk(userId, symbol, direction, existingPositions);

    switch (risk.riskLevel) {
      case 'EXTREME':
        return 0.3; // Only 30% of normal size
      case 'HIGH':
        return 0.5; // 50% of normal size
      case 'MEDIUM':
        return 0.75; // 75% of normal size
      case 'LOW':
      default:
        return 1.0; // Full size
    }
  }

  /**
   * Build correlation context for AI prompts
   */
  buildCorrelationContext(symbol: string, matrix: CorrelationMatrix): string {
    const correlations = matrix[symbol];
    if (!correlations) return '';

    const highCorr = Object.entries(correlations)
      .filter(([, v]) => Math.abs(v.correlation) > 0.5)
      .map(([sym, v]) => `${sym}: ${(v.correlation * 100).toFixed(0)}%`);

    if (highCorr.length === 0) return '';

    return (
      `🔗🔗🔗 ارتباطات ${symbol} مع أزواج أخرى:\n` +
      highCorr.map(c => `- ${c}`).join('\n') +
      `\n⚠️ إذا كان هناك صفقات مفتوحة على أزواج مرتبطة، لا تكرر نفس الرهان!`
    );
  }

  // ── Private Methods ──

  private async _calculateCorrelationMatrix(): Promise<CorrelationMatrix> {
    const matrix: CorrelationMatrix = {};
    const pairs = BINANCE_SUPPORTED_PAIRS;

    // Collect price histories
    const priceHistories: Record<string, number[]> = {};
    for (const pair of pairs) {
      try {
        const history = await this._getPriceHistory(pair);
        if (history.length >= 20) {
          priceHistories[pair] = history;
        }
      } catch { /* skip */ }
    }

    // Calculate pairwise correlations
    for (const pairA of Object.keys(priceHistories)) {
      matrix[pairA] = {};
      for (const pairB of Object.keys(priceHistories)) {
        if (pairA === pairB) {
          matrix[pairA][pairB] = { correlation: 1.0, riskLevel: 'LOW', sameDirectionPct: 100 };
          continue;
        }

        const corr = this._pearsonCorrelation(priceHistories[pairA], priceHistories[pairB]);
        const absCorr = Math.abs(corr);
        const sameDir = this._sameDirectionPercentage(priceHistories[pairA], priceHistories[pairB]);

        let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
        if (absCorr > 0.8) riskLevel = 'EXTREME';
        else if (absCorr > 0.6) riskLevel = 'HIGH';
        else if (absCorr > 0.4) riskLevel = 'MEDIUM';
        else riskLevel = 'LOW';

        matrix[pairA][pairB] = {
          correlation: Math.round(corr * 1000) / 1000,
          riskLevel,
          sameDirectionPct: Math.round(sameDir),
        };
      }
    }

    // Save to database
    await this._saveMatrixToDb(matrix);

    return matrix;
  }

  private async _getPriceHistory(symbol: string): Promise<number[]> {
    try {
      const data = await this.redis.get(`${this.REDIS_PRICES_KEY}${symbol}`);
      if (data) return JSON.parse(data);
    } catch { /* continue */ }

    // If no history, fetch current price and return single-point
    try {
      const market = await this.marketData.fetchQuickMarketData(symbol);
      return [market.price];
    } catch {
      return [];
    }
  }

  private async _saveMatrixToDb(matrix: CorrelationMatrix): Promise<void> {
    try {
      for (const [symbolA, correlations] of Object.entries(matrix)) {
        for (const [symbolB, data] of Object.entries(correlations)) {
          if (symbolA >= symbolB) continue; // Avoid duplicates (A-B and B-A)

          await this.prisma.crossPairCorrelation.upsert({
            where: { symbolA_symbolB: { symbolA, symbolB } },
            create: {
              symbolA,
              symbolB,
              correlation30d: data.correlation,
              correlation7d: data.correlation,
              correlation24h: data.correlation,
              riskLevel: data.riskLevel,
              sameDirectionPct: data.sameDirectionPct,
              dataPoints: 30,
            },
            update: {
              correlation30d: data.correlation,
              riskLevel: data.riskLevel,
              sameDirectionPct: data.sameDirectionPct,
              calculatedAt: new Date(),
            },
          });
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to save correlation matrix: ${error.message}`);
    }
  }

  private _pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 5) return 0;

    const xSlice = x.slice(-n);
    const ySlice = y.slice(-n);

    // Convert to returns (percentage changes)
    const xReturns: number[] = [];
    const yReturns: number[] = [];
    for (let i = 1; i < n; i++) {
      if (xSlice[i - 1] !== 0 && ySlice[i - 1] !== 0) {
        xReturns.push((xSlice[i] - xSlice[i - 1]) / xSlice[i - 1]);
        yReturns.push((ySlice[i] - ySlice[i - 1]) / ySlice[i - 1]);
      }
    }

    if (xReturns.length < 5) return 0;

    const meanX = xReturns.reduce((a, b) => a + b, 0) / xReturns.length;
    const meanY = yReturns.reduce((a, b) => a + b, 0) / yReturns.length;

    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < xReturns.length; i++) {
      const dx = xReturns[i] - meanX;
      const dy = yReturns[i] - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }

    const den = Math.sqrt(denX * denY);
    if (den === 0) return 0;
    return num / den;
  }

  private _sameDirectionPercentage(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 50;

    let sameDir = 0;
    let total = 0;

    for (let i = 1; i < n; i++) {
      const xUp = x[i] > x[i - 1];
      const yUp = y[i] > y[i - 1];
      if (xUp === yUp) sameDir++;
      total++;
    }

    return total > 0 ? (sameDir / total) * 100 : 50;
  }

  /**
   * Collect price data every 15 minutes for correlation calculation
   */
  private _startPriceCollection(): void {
    const collect = async () => {
      for (const pair of BINANCE_SUPPORTED_PAIRS) {
        try {
          const market = await this.marketData.fetchQuickMarketData(pair);
          const key = `${this.REDIS_PRICES_KEY}${pair}`;

          let history: number[] = [];
          try {
            const data = await this.redis.get(key);
            if (data) history = JSON.parse(data);
          } catch { /* start fresh */ }

          history.push(market.price);
          if (history.length > this.PRICE_HISTORY_LENGTH) {
            history = history.slice(-this.PRICE_HISTORY_LENGTH);
          }

          await this.redis.set(key, JSON.stringify(history), 7 * 24 * 3600 * 1000); // 7 day TTL
        } catch {
          // Skip this pair
        }
      }
    };

    // Collect every 15 minutes
    // V220-FIX: Store interval reference for cleanup on module destroy
    this._correlationCollectionInterval = setInterval(collect, 15 * 60 * 1000);
    // Also collect immediately
    setTimeout(collect, 5000);
  }

  onModuleDestroy(): void {
    // V220-FIX: Clean up interval to prevent memory leak on shutdown/hot-reload
    if (this._correlationCollectionInterval) {
      clearInterval(this._correlationCollectionInterval);
      this._correlationCollectionInterval = null;
    }
  }
}
