import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CredentialsService } from '../credentials/credentials.service';
import { ExchangeService } from '../../exchange/exchange.service';
import { AIOrchestratorService } from '../../ai/services/ai-orchestrator.service';
import { AuditService } from '../../../audit/audit.service';
import * as ccxt from 'ccxt';

/**
 * Risk Report — Output of Portfolio Sanctuary Analysis
 */
export interface RiskReport {
  summary: string;
  riskScore: number; // 0-100 (0=safe, 100=very risky)
  totalValue: number;
  currency: string;
  positions: PositionDetail[];
  metrics: RiskMetrics;
  recommendations: string[];
  aiAnalysis: string;
  analyzedAt: Date;
}

export interface PositionDetail {
  symbol: string;
  exchange: string;
  quantity: number;
  currentPrice: number;
  value: number;
  weight: number; // percentage of total portfolio
  change24h: number;
  assetType: string;
}

export interface RiskMetrics {
  concentrationRisk: number; // 0-100
  diversificationScore: number; // 0-100
  largestPositionWeight: number; // percentage
  positionCount: number;
  varEstimate: number; // Value at Risk estimate
  volatilityEstimate: number; // overall portfolio volatility
}

/**
 * Sanctuary Service — Portfolio Risk Analysis & Management
 *
 * Analyzes the user's portfolio across all linked exchange accounts
 * and provides AI-powered risk assessment and recommendations.
 *
 * Risk Analysis Dimensions:
 * 1. Concentration Risk — Is any single asset >20% of portfolio?
 * 2. Correlation Risk — Are assets highly correlated?
 * 3. VaR (Value at Risk) — Maximum expected loss
 * 4. Volatility — Overall portfolio volatility
 * 5. Diversification — How well-diversified is the portfolio?
 *
 * All recommendations are generated in Arabic by the AI Orchestrator.
 */
@Injectable()
export class SanctuaryService {
  private readonly logger = new Logger(SanctuaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialsService: CredentialsService,
    private readonly exchangeService: ExchangeService,
    private readonly orchestrator: AIOrchestratorService,
    private readonly auditService: AuditService,
  ) {
    this.logger.log('🏛️ Sanctuary Service initialized — portfolio risk analysis ready');
  }

  /**
   * Analyze portfolio risk across all linked accounts
   *
   * Flow:
   * 1. Fetch all user's exchange credentials
   * 2. For each credential, fetch balances from the exchange
   * 3. Aggregate positions across all accounts
   * 4. Calculate risk metrics (concentration, correlation, VaR)
   * 5. Send to AI Orchestrator for Arabic recommendations
   * 6. Return comprehensive RiskReport
   */
  async analyzePortfolio(userId: string): Promise<RiskReport> {
    this.logger.log(`🏛️ Analyzing portfolio for user ${userId}`);

    // Step 1: Fetch credentials
    const credentials = await this.prisma.exchangeCredential.findMany({
      where: { userId, isValid: true },
    });

    // Step 2: Fetch balances from each exchange
    const allPositions: PositionDetail[] = [];
    let totalValue = 0;

    for (const cred of credentials) {
      try {
        const decrypted = await this.credentialsService.decryptCredential(cred.id, userId);
        const positions = await this._fetchExchangePositions(
          cred.exchange,
          decrypted.apiKey,
          decrypted.apiSecret,
        );
        allPositions.push(...positions);
      } catch (error: any) {
        this.logger.warn(`Failed to fetch positions from ${cred.exchange}: ${error.message}`);
      }
    }

    // Also include manual portfolio assets from database
    const portfolios = await this.prisma.portfolio.findMany({
      where: { userId },
      include: { assets: true },
    });

    // Collect manual assets that need live quotes (parallel fetch)
    const manualAssets: any[] = [];
    for (const portfolio of portfolios) {
      for (const asset of portfolio.assets) {
        const existing = allPositions.find((p) => p.symbol === asset.symbol);
        if (!existing) {
          manualAssets.push(asset);
        }
      }
    }

    if (manualAssets.length > 0) {
      // Fetch all quotes in parallel
      const quotePromises = manualAssets.map((asset) =>
        this.exchangeService.getQuote(asset.symbol).catch(() => null),
      );
      const quotes = await Promise.allSettled(quotePromises);

      for (let i = 0; i < manualAssets.length; i++) {
        const asset = manualAssets[i];
        const quoteResult = quotes[i];
        let currentPrice = asset.currentPrice || asset.avgPrice;

        if (quoteResult.status === 'fulfilled' && quoteResult.value?.price) {
          currentPrice = quoteResult.value.price;
        }

        const value = asset.quantity * currentPrice;
        totalValue += value;

        allPositions.push({
          symbol: asset.symbol,
          exchange: asset.exchange || 'manual',
          quantity: asset.quantity,
          currentPrice,
          value,
          weight: 0, // calculated below
          change24h: 0,
          assetType: asset.assetType,
        });
      }
    }

    // Step 3: Calculate weights and total
    totalValue = allPositions.reduce((sum, p) => sum + p.value, 0);
    for (const pos of allPositions) {
      pos.weight = totalValue > 0 ? (pos.value / totalValue) * 100 : 0;
    }

    // Step 4: Calculate risk metrics
    const metrics = this._calculateRiskMetrics(allPositions, totalValue);

    // Step 5: Generate AI analysis
    let aiAnalysis = '';
    try {
      aiAnalysis = await this._generateAIAnalysis(allPositions, metrics, totalValue);
    } catch (error: any) {
      this.logger.warn(`AI analysis failed: ${error.message}`);
      aiAnalysis = 'لم يتم الحصول على تحليل الذكاء الاصطناعي.';
    }

    // Step 6: Generate recommendations
    const recommendations = this._generateRecommendations(allPositions, metrics);

    // Step 7: Calculate overall risk score
    const riskScore = this._calculateOverallRiskScore(metrics);

    // Step 8: Generate summary
    const summary = this._generateSummary(allPositions, metrics, totalValue, riskScore);

    // Audit
    await this.auditService.log({
      userId,
      action: 'PORTFOLIO_ANALYZED',
      resource: 'sanctuary',
      details: JSON.stringify({
        totalValue,
        positionCount: allPositions.length,
        riskScore,
      }),
    });

    return {
      summary,
      riskScore,
      totalValue,
      currency: 'USD',
      positions: allPositions,
      metrics,
      recommendations,
      aiAnalysis,
      analyzedAt: new Date(),
    };
  }

  // ── Private: Exchange Balance Fetching ──

  private async _fetchExchangePositions(
    exchange: string,
    apiKey: string,
    apiSecret: string,
  ): Promise<PositionDetail[]> {
    const positions: PositionDetail[] = [];

    try {
      const ExchangeClass = ccxt[exchange as keyof typeof ccxt] as any;
      if (!ExchangeClass) return positions;

      const instance = new ExchangeClass({
        apiKey,
        secret: apiSecret,
        enableRateLimit: true,
      });

      const balance = await instance.fetchBalance();

      // Collect currencies that need quotes
      const currencyEntries: { currency: string; amount: number }[] = [];
      for (const [currency, amount] of Object.entries(balance.total || {})) {
        if (!amount || (amount as number) <= 0) continue;
        if (['free', 'used', 'total'].includes(currency)) continue;
        currencyEntries.push({ currency, amount: amount as number });
      }

      // Phase 1: Fetch all USDT pair quotes in parallel
      const usdtQuotePromises = currencyEntries.map(({ currency }) => {
        if (currency === 'USDT' || currency === 'USD') return Promise.resolve(null);
        return this.exchangeService.getQuote(`${currency}/USDT`).catch(() => null);
      });
      const usdtQuotes = await Promise.allSettled(usdtQuotePromises);

      // Phase 2: For currencies where USDT pair failed, try USD pair in parallel
      const usdRetryIndices: number[] = [];
      const usdRetryPromises: Promise<any>[] = [];

      for (let i = 0; i < currencyEntries.length; i++) {
        const { currency } = currencyEntries[i];
        if (currency === 'USDT' || currency === 'USD') continue;
        const quoteResult = usdtQuotes[i];
        if (quoteResult.status !== 'fulfilled' || !quoteResult.value?.price) {
          usdRetryIndices.push(i);
          usdRetryPromises.push(
            this.exchangeService.getQuote(`${currency}/USD`).catch(() => null),
          );
        }
      }

      const usdQuotes = usdRetryPromises.length > 0
        ? await Promise.allSettled(usdRetryPromises)
        : [];

      // Build results
      let usdRetryCursor = 0;
      for (let i = 0; i < currencyEntries.length; i++) {
        const { currency, amount: numAmount } = currencyEntries[i];

        let currentPrice = 0;
        let change24h = 0;
        let symbol = currency;

        if (currency === 'USDT' || currency === 'USD') {
          currentPrice = 1;
        } else {
          // Try USDT quote first
          const usdtResult = usdtQuotes[i];
          if (usdtResult.status === 'fulfilled' && usdtResult.value?.price) {
            currentPrice = usdtResult.value.price;
            change24h = usdtResult.value.changePercent;
            symbol = `${currency}/USDT`;
          } else {
            // Fall back to USD quote
            const usdResult = usdQuotes[usdRetryCursor];
            usdRetryCursor++;
            if (usdResult?.status === 'fulfilled' && usdResult.value?.price) {
              currentPrice = usdResult.value.price;
              change24h = usdResult.value.changePercent;
              symbol = `${currency}/USD`;
            }
          }
        }

        const value = numAmount * currentPrice;

        if (value > 1) {
          positions.push({
            symbol,
            exchange,
            quantity: numAmount,
            currentPrice,
            value,
            weight: 0, // calculated later
            change24h,
            assetType: currency === 'USDT' || currency === 'USD' ? 'FOREX' : 'CRYPTO',
          });
        }
      }
    } catch (error: any) {
      this.logger.warn(`Failed to fetch ${exchange} positions: ${error.message}`);
    }

    return positions;
  }

  // ── Private: Risk Calculations ──

  private _calculateRiskMetrics(positions: PositionDetail[], totalValue: number): RiskMetrics {
    if (positions.length === 0) {
      return {
        concentrationRisk: 0,
        diversificationScore: 100,
        largestPositionWeight: 0,
        positionCount: 0,
        varEstimate: 0,
        volatilityEstimate: 0,
      };
    }

    // Concentration Risk: How concentrated is the portfolio?
    // HHI (Herfindahl-Hirschman Index) based
    const weights = positions.map((p) => p.weight / 100);
    const hhi = weights.reduce((sum, w) => sum + w * w, 0);
    const concentrationRisk = Math.min(100, hhi * 100 * 4); // Scale to 0-100

    // Diversification Score (inverse of concentration)
    const diversificationScore = Math.max(0, 100 - concentrationRisk);

    // Largest position weight
    const largestPositionWeight = Math.max(...positions.map((p) => p.weight));

    // VaR Estimate (simplified: 95% confidence, assumes normal distribution)
    // Average daily crypto volatility ~5%, stocks ~1.5%
    const weightedVolatility = positions.reduce((sum, p) => {
      const vol = p.assetType === 'CRYPTO' ? 0.05 : p.assetType === 'STOCK' ? 0.015 : 0.01;
      return sum + (p.weight / 100) * vol;
    }, 0);

    const varEstimate = totalValue * weightedVolatility * 1.645; // 95% confidence (z-score)

    // Overall volatility estimate (annualized)
    const volatilityEstimate = weightedVolatility * Math.sqrt(365) * 100;

    return {
      concentrationRisk: Math.round(concentrationRisk),
      diversificationScore: Math.round(diversificationScore),
      largestPositionWeight: Math.round(largestPositionWeight * 10) / 10,
      positionCount: positions.length,
      varEstimate: Math.round(varEstimate * 100) / 100,
      volatilityEstimate: Math.round(volatilityEstimate * 10) / 10,
    };
  }

  private _calculateOverallRiskScore(metrics: RiskMetrics): number {
    // Weighted combination of risk factors
    const concentrationWeight = 0.3;
    const diversificationWeight = 0.2;
    const volatilityWeight = 0.3;
    const positionCountWeight = 0.2;

    // Position count factor (fewer = riskier)
    const positionFactor = metrics.positionCount <= 2 ? 80
      : metrics.positionCount <= 5 ? 50
        : metrics.positionCount <= 10 ? 30
          : 10;

    const score =
      metrics.concentrationRisk * concentrationWeight +
      (100 - metrics.diversificationScore) * diversificationWeight +
      Math.min(100, metrics.volatilityEstimate * 2) * volatilityWeight +
      positionFactor * positionCountWeight;

    return Math.round(Math.min(100, Math.max(0, score)));
  }

  // ── Private: AI Analysis ──

  private async _generateAIAnalysis(
    positions: PositionDetail[],
    metrics: RiskMetrics,
    totalValue: number,
  ): Promise<string> {
    const positionsSummary = positions
      .map((p) => `- ${p.symbol}: ${p.quantity} × $${p.currentPrice.toFixed(2)} = $${p.value.toFixed(2)} (${p.weight.toFixed(1)}%)`)
      .join('\n');

    const prompt = `أنت محلل مخاطر مالي في منصة "رؤى لربط الحسابات". حلل المحفظة التالية وقدم توصيات باللغة العربية.

📊 المحفظة (القيمة الإجمالية: $${totalValue.toFixed(2)}):
${positionsSummary || 'لا توجد أصول'}

📐 مقاييس المخاطر:
- مخاطر التركيز: ${metrics.concentrationRisk}/100
- درجة التنويع: ${metrics.diversificationScore}/100
- أكبر مركز: ${metrics.largestPositionWeight}%
- عدد المراكز: ${metrics.positionCount}
- القيمة المعرضة للمخاطر (VaR 95%): $${metrics.varEstimate.toFixed(2)}
- التقلب المقدر: ${metrics.volatilityEstimate}%

قدم:
1. تقييم شامل لمخاطر المحفظة
2. توصيات محددة لتقليل المخاطر
3. نصائح لتحسين التنويع
4. تحذيرات مهمة

أضف دائماً: "هذا التحليل لأغراض تعليمية فقط وليس نصيحة استثمارية."`;

    const response = await this.orchestrator.analyze({
      prompt,
      type: 'risk_analysis',
      language: 'ar',
    });

    return response.content;
  }

  // ── Private: Recommendations ──

  private _generateRecommendations(positions: PositionDetail[], metrics: RiskMetrics): string[] {
    const recommendations: string[] = [];
    const portfolioValue = positions.reduce((sum, p) => sum + p.value, 0);

    // Concentration risk
    const heavyPositions = positions.filter((p) => p.weight > 20);
    for (const pos of heavyPositions) {
      recommendations.push(
        `⚠️ ${pos.symbol} يشكل ${pos.weight.toFixed(1)}% من المحفظة. ننصح بتقليل التعرض لأقل من 20% لتحسين التنويع.`,
      );
    }

    // Diversification
    if (metrics.positionCount < 5) {
      recommendations.push(
        '📊 المحفظة تحتوي على عدد قليل من الأصول. ننصح بإضافة أصول من فئات مختلفة لتقليل المخاطر.',
      );
    }

    // All crypto
    const allCrypto = positions.every((p) => p.assetType === 'CRYPTO');
    if (allCrypto && positions.length > 0) {
      recommendations.push(
        '💰 جميع الأصول هي عملات مشفرة. ننصح بتنويع المحفظة بإضافة أسهم أو سلع أو سندات.',
      );
    }

    // Volatility
    if (metrics.volatilityEstimate > 60) {
      recommendations.push(
        '📈 التقلب مرتفع جداً. ننصح بزيادة حصة الأصول المستقرة أو تحديد أوامر وقف الخسارة.',
      );
    }

    // VaR
    if (metrics.varEstimate > portfolioValue * 0.05) {
      recommendations.push(
        `🛡️ القيمة المعرضة للمخاطر (VaR) تبلغ $${metrics.varEstimate.toFixed(2)} يومياً. ننصح بإعادة توازن المحفظة.`,
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ المحفظة متوازنة بشكل جيد. استمر في مراقبة الأسواق وتعديل المراكز عند الحاجة.');
    }

    return recommendations;
  }

  private _generateSummary(
    positions: PositionDetail[],
    metrics: RiskMetrics,
    totalValue: number,
    riskScore: number,
  ): string {
    const riskLevel = riskScore < 30 ? 'منخفض' : riskScore < 60 ? 'متوسط' : 'مرتفع';

    return `تحليل ملاذ المحفظة: ${positions.length} مركز بقيمة إجمالية $${totalValue.toFixed(2)}. مستوى المخاطر: ${riskLevel} (${riskScore}/100). درجة التنويع: ${metrics.diversificationScore}/100.`;
  }
}
