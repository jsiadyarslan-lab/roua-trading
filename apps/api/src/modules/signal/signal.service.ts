import { Injectable, Logger, Optional, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ExchangeService } from '../exchange/exchange.service';
import { AIOrchestratorService } from '../ai/services/ai-orchestrator.service';
import { RagService } from '../ai/services/rag.service';
import { AuditService } from '../../audit/audit.service';
import { PredictionMarketService } from '../prediction-market/prediction-market.service';
import { TradingService } from '../trading/trading.service';
import { NotificationService } from '../notification/notification.service';
import { OrderSide, OrderType } from '../trading/trading.types';

/**
 * Signal Service — Roua Trading Signal Generation
 *
 * Produces intelligent trading recommendations based on multi-dimensional analysis:
 * 1. Live market data from ExchangeService (price, volume, change)
 * 2. Relevant news from RAG archive
 * 3. Sentiment analysis via GroqService
 * 4. Comprehensive analysis via AIOrchestratorService
 * 5. Prediction market signalBoost from PredictionMarketService (optional)
 *
 * Signal output includes:
 * - Action: BUY / SELL / WAIT
 * - Confidence: 0-100 (adjusted by signalBoost ±10%)
 * - Entry/StopLoss/TakeProfit levels
 * - AI-generated reasoning in Arabic
 *
 * Prediction Market Integration (Phase 3):
 * - signalBoost is applied to confidence: +5% for agreement / -8% for divergence
 * - Average boost from all relevant events (clamped ±10%)
 * - Prediction context appended to signal reason
 * - Fallback: if PredictionMarketService fails, signal is generated without boost
 */
@Injectable()
export class SignalService {
  private readonly logger = new Logger(SignalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeService: ExchangeService,
    private readonly orchestrator: AIOrchestratorService,
    private readonly ragService: RagService,
    private readonly auditService: AuditService,
    @Optional() private readonly predictionMarketService?: PredictionMarketService,
    @Optional() private readonly tradingService?: TradingService,
    @Optional() private readonly notificationService?: NotificationService,
  ) {
    this.logger.log('📡 Signal Service initialized — Roua signal generation ready' + (this.predictionMarketService ? ' (with prediction market boost)' : '') + (this.tradingService ? ' (with trading bridge)' : '') + (this.notificationService ? ' (with real-time notifications)' : ''));
  }

  /**
   * Generate a trading signal for a given pair
   *
   * Flow:
   * 1. Fetch live market data
   * 2. Retrieve relevant news context
   * 3. Analyze sentiment
   * 4. Generate comprehensive signal via AI
   * 5. Parse and store signal
   */
  /**
   * V267: `language` parameter (default 'ar') controls AI output locale.
   * Pass any of the 32 UI locales. Non-ar/non-en locales use English prompts
   * + a "Respond ONLY in {language}" directive.
   */
  async generateSignal(userId: string, pair: string, language: string = 'ar') {
    const normalizedLang = (language || 'ar').toLowerCase();
    const isArabic = normalizedLang === 'ar';
    const isExtended = normalizedLang !== 'ar' && normalizedLang !== 'en';
    const LANGUAGE_NAMES: Record<string, string> = {
      fr: 'French (Français)', tr: 'Turkish (Türkçe)', es: 'Spanish (Español)',
      zh: 'Chinese (中文)', ru: 'Russian (Русский)', hi: 'Hindi (हिन्दी)',
      pt: 'Portuguese (Português)', de: 'German (Deutsch)', ja: 'Japanese (日本語)',
      ko: 'Korean (한국어)', id: 'Indonesian (Bahasa Indonesia)', vi: 'Vietnamese (Tiếng Việt)',
      th: 'Thai (ภาษาไทย)', it: 'Italian (Italiano)', pl: 'Polish (Polski)',
      nl: 'Dutch (Nederlands)', ms: 'Malay (Bahasa Melayu)', he: 'Hebrew (עברית)',
      sv: 'Swedish (Svenska)', uk: 'Ukrainian (Українська)', fa: 'Persian (فارسی)',
      ur: 'Urdu (اردو)', fil: 'Filipino', da: 'Danish (Dansk)', no: 'Norwegian (Norsk)',
      fi: 'Finnish (Suomi)', cs: 'Czech (Čeština)', hu: 'Hungarian (Magyar)',
      ro: 'Romanian (Română)', bn: 'Bengali (বাংলা)',
    };
    const languageDirective = isExtended
      ? `\n\n🌐 LANGUAGE DIRECTIVE: Respond ONLY in ${LANGUAGE_NAMES[normalizedLang] || 'English'}. All analysis and reasoning MUST be in ${LANGUAGE_NAMES[normalizedLang] || 'English'}.`
      : '';
    this.logger.log(`📡 Generating signal for ${pair} (user: ${userId})`);

    // Step 1: Fetch live market data
    let marketData: any = null;
    try {
      const quote = await this.exchangeService.getQuote(pair);
      marketData = {
        price: quote.price,
        change: quote.change,
        changePercent: quote.changePercent,
        open: quote.open,
        high: quote.high,
        low: quote.low,
        close: quote.close,
        volume: quote.volume,
        source: quote.source,
      };
    } catch (error: any) {
      this.logger.warn(`Failed to fetch market data for ${pair}: ${error.message}`);
    }

    // Step 2: Retrieve relevant news from RAG
    let newsContext = '';
    try {
      newsContext = await this.ragService.retrieveRelevantContext(
        `${pair} trading analysis`,
        3,
      );
    } catch (error: any) {
      this.logger.warn(`RAG retrieval failed for ${pair}: ${error.message}`);
    }

    // Step 3: Analyze sentiment via AI Orchestrator (was using groqService directly, bypassing orchestrator)
    // V267: Use the resolved language for the sentiment analysis prompt.
    let sentiment = '';
    try {
      const sentimentResult = await this.orchestrator.analyze({
        prompt: isArabic
          ? `حلل مشاعر السوق تجاه ${pair} بناءً على البيانات التالية:
السعر الحالي: ${marketData?.price || 'غير متاح'}
التغير: ${marketData?.changePercent || 'غير متاح'}%
الحجم: ${marketData?.volume || 'غير متاح'}
${newsContext ? `آخر الأخبار:\n${newsContext}` : ''}

أجب بشكل مختصر: هل المشاعر إيجابية أم سلبية؟ ولماذا؟`
          : `${languageDirective}
Analyze market sentiment towards ${pair} based on the following data:
Current price: ${marketData?.price || 'unavailable'}
Change: ${marketData?.changePercent || 'unavailable'}%
Volume: ${marketData?.volume || 'unavailable'}
${newsContext ? `Recent news:\n${newsContext}` : ''}

Answer briefly: is the sentiment positive or negative? Why?`,
        type: 'sentiment',
        symbol: pair,
        language: isArabic ? 'ar' : 'en',
      });

      if (sentimentResult.confidence > 0) {
        sentiment = sentimentResult.content;
      }
    } catch (error: any) {
      this.logger.warn(`Sentiment analysis failed for ${pair}: ${error.message}`);
    }

    // Step 4: Generate comprehensive signal via AI Orchestrator
    // V267: language-aware prompt
    const signalPrompt = isArabic
      ? `أنت محلل مالي خبير في منصة "رؤى لربط الحسابات". بناءً على البيانات التالية، قدم توصية تداول لـ ${pair}.

📊 بيانات السوق الحالية:
- السعر: ${marketData?.price || 'غير متاح'} ${marketData?.currency || 'USD'}
- التغير: ${marketData?.changePercent || 0}%
- أعلى سعر: ${marketData?.high || 'غير متاح'}
- أدنى سعر: ${marketData?.low || 'غير متاح'}
- الحجم: ${marketData?.volume || 'غير متاح'}

📈 تحليل المشاعر: ${sentiment || 'غير متاح'}

${newsContext ? `📰 أخبار ذات صلة:\n${newsContext}` : ''}

أجب بالصيغة التالية بالضبط (استخدم الأرقام فقط بدون رموز):
الإجراء: [شراء/بيع/انتظار]
نسبة الثقة: [0-100]
سعر الدخول: [رقم]
وقف الخسارة: [رقم]
جني الأرباح: [رقم]
السبب: [شرح مفصل بالعربية عن سبب التوصية]`
      : `${languageDirective}
You are an expert financial analyst on the Roua Trading platform. Based on the following data, provide a trading recommendation for ${pair}.

📊 Current market data:
- Price: ${marketData?.price || 'unavailable'} ${marketData?.currency || 'USD'}
- Change: ${marketData?.changePercent || 0}%
- High: ${marketData?.high || 'unavailable'}
- Low: ${marketData?.low || 'unavailable'}
- Volume: ${marketData?.volume || 'unavailable'}

📈 Sentiment analysis: ${sentiment || 'unavailable'}

${newsContext ? `📰 Relevant news:\n${newsContext}` : ''}

Answer in the following exact format (use numbers only, no symbols):
Action: [Buy/Sell/Wait]
Confidence: [0-100]
Entry price: [number]
Stop loss: [number]
Take profit: [number]
Reason: [detailed explanation of the recommendation]`;

    let aiResponse: any = null;
    try {
      aiResponse = await this.orchestrator.analyze({
        prompt: signalPrompt,
        type: 'signal_generation',
        symbol: pair,
        language: isArabic ? 'ar' : 'en',
      });
    } catch (error: any) {
      this.logger.error(`AI signal generation failed: ${error.message}`);
    }

    // Step 5: Parse AI response into structured signal
    const parsed = this._parseSignalResponse(aiResponse?.content || '', marketData);

    // Step 5.5: Apply prediction market signalBoost (Phase 3)
    let signalBoost = 0;
    let predictionContext = '';
    if (this.predictionMarketService) {
      try {
        // Extract base symbol from pair (e.g., 'BTC' from 'BTC/USDT')
        const baseSymbol = pair.split('/')[0].toUpperCase();
        const gaps = await this.predictionMarketService.getGapsForSymbol(baseSymbol);

        if (gaps.length > 0) {
          // Calculate average signalBoost across all related events
          const totalBoost = gaps.reduce((sum, g) => sum + g.signalBoost, 0);
          signalBoost = totalBoost / gaps.length;

          // Clamp signalBoost to ±10%
          signalBoost = Math.max(-0.10, Math.min(0.10, signalBoost));

          // Apply signalBoost to confidence
          parsed.confidence = Math.round(
            Math.max(0, Math.min(100, parsed.confidence + signalBoost * 100))
          );

          // Build prediction context for the signal reason
          const alignedCount = gaps.filter(g => g.gapDirection === 'aligned').length;
          const divergentCount = gaps.filter(g => g.gapDirection !== 'aligned').length;

          if (signalBoost > 0) {
            predictionContext = ` \n🔮 توافق السوق التنبؤي: ${alignedCount} أحداث متوافقة تعزز هذه الإشارة (+${Math.round(signalBoost * 100)}% ثقة)`;
          } else if (signalBoost < 0) {
            predictionContext = ` \n⚠️ تباين السوق التنبؤي: ${divergentCount} أحداث متباينة تضعف هذه الإشارة (${Math.round(signalBoost * 100)}% ثقة)`;
          } else {
            predictionContext = ` \n🔮 السوق التنبؤي: إشارات محايدة (${gaps.length} أحداث)`;
          }

          this.logger.log(`🔮 signalBoost applied for ${pair}: ${Math.round(signalBoost * 100)}% (${gaps.length} events, ${alignedCount} aligned, ${divergentCount} divergent)`);
        }
      } catch (error: any) {
        // Fallback: if prediction market service fails, continue without boost
        this.logger.warn(`Prediction market signalBoost failed for ${pair}: ${error.message} — falling back to unboosted signal`);
      }
    }

    // Append prediction context to reason if available
    if (predictionContext) {
      parsed.reason += predictionContext;
    }

    // Step 6: Store signal in database
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const signal = await this.prisma.signal.create({
      data: {
        userId,
        pair,
        action: parsed.action,
        confidence: parsed.confidence,
        reason: parsed.reason,
        entryPrice: parsed.entryPrice,
        stopLoss: parsed.stopLoss,
        takeProfit: parsed.takeProfit,
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
        pair,
        action: parsed.action,
        confidence: parsed.confidence,
        signalBoost: Math.round(signalBoost * 100) / 100,
        signalId: signal.id,
      }),
    });

    this.logger.log(`📡 Signal generated: ${parsed.action} ${pair} (confidence: ${parsed.confidence}%)`);

    // UX: Push real-time notification to user
    if (this.notificationService) {
      this.notificationService.sendNotification({
        userId,
        type: 'SIGNAL_GENERATED',
        priority: parsed.confidence >= 80 ? 'HIGH' : parsed.confidence >= 60 ? 'MEDIUM' : 'LOW',
        title: `إشارة ${parsed.action === 'BUY' ? 'شراء' : parsed.action === 'SELL' ? 'بيع' : 'انتظار'} ${pair}`,
        body: `ثقة: ${parsed.confidence}% — ${parsed.reason.substring(0, 100)}`,
        data: {
          signalId: signal.id,
          pair,
          action: parsed.action,
          confidence: parsed.confidence,
          entryPrice: parsed.entryPrice,
          stopLoss: parsed.stopLoss,
          takeProfit: parsed.takeProfit,
          signalBoost: Math.round(signalBoost * 100) / 100,
        },
        source: parsed.action === 'WAIT' ? 'ai' : 'scanner',
        action: parsed.action === 'BUY' ? 'BUY' : parsed.action === 'SELL' ? 'SELL' : 'INFO',
        pair,
      }).catch((e: any) => this.logger.warn(`Signal notification push failed: ${e.message}`));
    }

    return signal;
  }

  /**
   * Get active signals for a user
   */
  async getActiveSignals(userId: string) {
    // First, mark expired signals
    await this.prisma.signal.updateMany({
      where: {
        userId,
        status: 'ACTIVE',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });

    return this.prisma.signal.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get signal history for a user
   */
  async getSignalHistory(userId: string, limit: number = 20) {
    return this.prisma.signal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Cancel a signal
   */
  async cancelSignal(userId: string, signalId: string) {
    // DATA ISOLATION: Use findFirst with userId to prevent accessing other users' signals
    const signal = await this.prisma.signal.findFirst({
      where: { id: signalId, userId },
    });

    if (!signal) {
      throw new Error('الإشارة غير موجودة');
    }

    return this.prisma.signal.update({
      where: { id: signalId },
      data: { status: 'CANCELLED' },
    });
  }

  /**
   * FIX: Execute a signal by placing a trade via the Trading Service
   *
   * This bridges the gap between the Analysis Engine and the Trading Engine.
   * Previously, signals were generated but users had no way to directly
   * execute them — they had to manually create orders based on signal data.
   *
   * Flow:
   * 1. Fetch the signal by ID (with user ownership check)
   * 2. Validate the signal is actionable (ACTIVE, not WAIT, has entry/SL/TP)
   * 3. Place a market order via TradingService with signal's SL/TP
   * 4. Update signal status to EXECUTED
   * 5. Return both the signal and the resulting order
   *
   * @param userId The user executing the signal
   * @param signalId The signal to execute
   * @param credentialId The exchange credential to use for execution
   * @param quantity Optional quantity override (defaults to a calculated size)
   */
  async executeSignal(userId: string, signalId: string, credentialId: string, quantity?: number) {
    // Step 1: Fetch signal with user ownership check
    const signal = await this.prisma.signal.findFirst({
      where: { id: signalId, userId },
    });

    if (!signal) {
      throw new NotFoundException('الإشارة غير موجودة');
    }

    // Step 2: Validate signal is actionable
    if (signal.status !== 'ACTIVE') {
      throw new BadRequestException(`لا يمكن تنفيذ إشارة بحالة "${signal.status}" — يجب أن تكون نشطة`);
    }

    if (signal.action === 'WAIT') {
      throw new BadRequestException('لا يمكن تنفيذ إشارة انتظار — ليست توصية شراء أو بيع');
    }

    if (!signal.entryPrice || Number(signal.entryPrice) <= 0) {
      throw new BadRequestException('الإشارة لا تحتوي على سعر دخول صالح');
    }

    if (!signal.stopLoss || Number(signal.stopLoss) <= 0) {
      throw new BadRequestException('الإشارة لا تحتوي على وقف خسارة — لا يمكن التنفيذ بدون وقف خسارة');
    }

    // Step 3: Calculate quantity if not provided
    const entryPrice = Number(signal.entryPrice);
    const stopLoss = Number(signal.stopLoss);
    const takeProfit = signal.takeProfit ? Number(signal.takeProfit) : undefined;

    // Default quantity: risk 1% of a $10,000 portfolio
    const riskPerTrade = 100; // 1% of $10,000
    const riskPerUnit = Math.abs(entryPrice - stopLoss);
    const calculatedQty = riskPerUnit > 0 ? riskPerTrade / riskPerUnit : 0.01;
    const orderQuantity = quantity || Math.max(0.01, Math.round(calculatedQty * 100) / 100);

    // Step 4: Place order via TradingService (if available)
    if (!this.tradingService) {
      throw new BadRequestException('خدمة التداول غير متاحة — لا يمكن تنفيذ الإشارة تلقائياً');
    }

    const order = await this.tradingService.placeOrder(userId, {
      credentialId,
      symbol: signal.pair,
      side: signal.action === 'BUY' ? OrderSide.BUY : OrderSide.SELL,
      type: OrderType.MARKET,
      quantity: orderQuantity,
      stopLoss,
      takeProfit,
      signalId: signal.id,
    });

    // Step 5: Update signal status to EXECUTED
    await this.prisma.signal.update({
      where: { id: signalId },
      data: { status: 'EXECUTED' },
    });

    // Audit log
    await this.auditService.log({
      userId,
      action: 'SIGNAL_EXECUTED',
      resource: 'signal',
      details: JSON.stringify({
        signalId,
        pair: signal.pair,
        action: signal.action,
        orderId: order.id,
        quantity: orderQuantity,
        entryPrice,
        stopLoss,
        takeProfit,
      }),
    });

    this.logger.log(`📡 Signal ${signalId} executed: ${signal.action} ${signal.pair} → Order ${order.id}`);

    return {
      signal,
      order,
      executionDetails: {
        quantity: orderQuantity,
        entryPrice,
        stopLoss,
        takeProfit,
        riskRewardRatio: takeProfit ? Math.abs(takeProfit - entryPrice) / riskPerUnit : null,
      },
    };
  }

  // ── Private: Parse AI Response ──

  /**
   * Parse the AI model's text response into a structured signal
   * Handles both Arabic and English responses
   */
  private _parseSignalResponse(content: string, marketData: any): {
    action: 'BUY' | 'SELL' | 'WAIT';
    confidence: number;
    reason: string;
    entryPrice: number | null;
    stopLoss: number | null;
    takeProfit: number | null;
  } {
    // Default values
    const result = {
      action: 'WAIT' as 'BUY' | 'SELL' | 'WAIT',
      confidence: 50,
      reason: content || 'لم يتم الحصول على تحليل من الذكاء الاصطناعي.',
      entryPrice: marketData?.price || null,
      stopLoss: null as number | null,
      takeProfit: null as number | null,
    };

    if (!content) return result;

    // Parse action
    const actionPatterns = [
      { pattern: /(?:الإجراء|action|توصية)[:\s]*(شراء|buy)/i, action: 'BUY' as const },
      { pattern: /(?:الإجراء|action|توصية)[:\s]*(بيع|sell)/i, action: 'SELL' as const },
      { pattern: /(?:الإجراء|action|توصية)[:\s]*(انتظار|wait|hold)/i, action: 'WAIT' as const },
      { pattern: /\b(شراء|BUY)\b/i, action: 'BUY' as const },
      { pattern: /\b(بيع|SELL)\b/i, action: 'SELL' as const },
    ];

    for (const { pattern, action } of actionPatterns) {
      if (pattern.test(content)) {
        result.action = action;
        break;
      }
    }

    // Parse confidence (0-100)
    const confidenceMatch = content.match(/(?:نسبة الثقة|confidence)[:\s]*(\d+)/i);
    if (confidenceMatch) {
      const val = parseInt(confidenceMatch[1], 10);
      result.confidence = Math.min(100, Math.max(0, val));
    }

    // Parse prices
    const entryMatch = content.match(/(?:سعر الدخول|entry)[:\s]*([\d.,]+)/i);
    if (entryMatch) {
      result.entryPrice = parseFloat(entryMatch[1].replace(/,/g, '')) || result.entryPrice;
    }

    const slMatch = content.match(/(?:وقف الخسارة|stop[\s-]?loss)[:\s]*([\d.,]+)/i);
    if (slMatch) {
      result.stopLoss = parseFloat(slMatch[1].replace(/,/g, ''));
    } else if (result.entryPrice && marketData) {
      // Default stop loss: 3% below entry for BUY, 3% above for SELL
      result.stopLoss = result.action === 'BUY'
        ? result.entryPrice * 0.97
        : result.action === 'SELL'
          ? result.entryPrice * 1.03
          : null;
    }

    const tpMatch = content.match(/(?:جني الأرباح|take[\s-]?profit|target)[:\s]*([\d.,]+)/i);
    if (tpMatch) {
      result.takeProfit = parseFloat(tpMatch[1].replace(/,/g, ''));
    } else if (result.entryPrice && marketData) {
      // Default take profit: 5% above entry for BUY, 5% below for SELL
      result.takeProfit = result.action === 'BUY'
        ? result.entryPrice * 1.05
        : result.action === 'SELL'
          ? result.entryPrice * 0.95
          : null;
    }

    // Extract reason
    const reasonMatch = content.match(/(?:السبب|reason)[:\s]*(.+)/is);
    if (reasonMatch) {
      result.reason = reasonMatch[1].trim();
    }

    return result;
  }
}
