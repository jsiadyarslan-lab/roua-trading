import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AIOrchestratorService } from '../ai/services/ai-orchestrator.service';

export interface TradeStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  totalPnl: number;
  maxDrawdown: number;
  sharpeRatio: number | null;
  mostTradedSymbol: string;
  avgTradeDuration: string;
  riskCompliance: string;
  biggestWin: number;
  biggestLoss: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  longWinRate: number;
  shortWinRate: number;
}

@Injectable()
export class CoachService {
  private readonly logger = new Logger(CoachService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: AIOrchestratorService,
  ) {}

  /**
   * Get performance advice based on user's trading history
   */
  async getPerformanceAdvice(userId: string, locale: 'ar' | 'en' | 'es' = 'ar') {
    this.logger.log(`Generating performance advice for user ${userId}`);

    // 1. Fetch last 50 trades
    const trades = await this.prisma.trade.findMany({
      where: { userId },
      orderBy: { executedAt: 'desc' },
      take: 50,
    });

    // 2. Fetch closed positions
    const closedPositions = await this.prisma.position.findMany({
      where: { userId, status: 'CLOSED' },
      orderBy: { closedAt: 'desc' },
      take: 50,
    });

    // 3. Fetch paper orders (primary trading data for this platform)
    const paperOrders = await this.prisma.paperOrder.findMany({
      where: { userId, status: 'FILLED' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // 4. Calculate statistics
    const paperPnl = this.calculatePaperPnl(paperOrders);
    const stats = this.calculateStats(trades, closedPositions, paperPnl);

    // 4. Determine performance rating
    const rating = this.calculateRating(stats);

    // 5. Build context for AI
    const contextSummary = this.buildContextSummary(stats, trades.slice(0, 20), closedPositions.slice(0, 20));

    // 6. Call AI orchestrator for analysis
    const isAr = locale === 'ar';
    const isEs = locale === 'es';

    const arPrompt = `أنت مُدرّب ربط حسابات خبير في منصة "رؤى". حلل أداء المتداول بناءً على الإحصائيات التالية وسجل الصفقات. قدم 3-5 نصائح محددة وقابلة للتنفيذ لتحسين الأداء. ركز على إدارة المخاطر، الانضباط، حجم الصفقات، واختيار الأصول. اذكر نقاط القوة والضعف. اجعل النصائح بالعربية ومباشرة.

الإحصائيات:
${contextSummary}

أجب بالصيغة التالية:
تقييم_عام: [ممتاز/جيد/يحتاج_تحسين]
---
1. [نوع النصيحة: تحذير/فرصة/تعليم] نص النصيحة الأولى
2. [نوع النصيحة: تحذير/فرصة/تعليم] نص النصيحة الثانية
3. [نوع النصيحة: تحذير/فرصة/تعليم] نص النصيحة الثالثة
---
نقاط_القوة: [نقاط القوة]
نقاط_الضعف: [نقاط الضعف]
خطة_تحسين: [خطة التحسين الموصى بها]`;

    const esPrompt = `Eres un entrenador de trading experto en la plataforma "Roua". Analiza el rendimiento del trader basándote en las siguientes estadísticas y registro de operaciones. Proporciona 3-5 consejos específicos y accionables para mejorar el rendimiento. Enfócate en gestión de riesgos, disciplina, tamaño de posiciones y selección de activos. Menciona puntos fuertes y débiles. Haz los consejos en español de forma directa.

Estadísticas:
${contextSummary}

Responde en el siguiente formato:
evaluación_general: [excelente/bueno/necesita_mejora]
---
1. [tipo de consejo: advertencia/oportunidad/educación] texto del primer consejo
2. [tipo de consejo: advertencia/oportunidad/educación] texto del segundo consejo
3. [tipo de consejo: advertencia/oportunidad/educación] texto del tercer consejo
---
puntos_fuertes: [puntos fuertes]
puntos_débiles: [puntos débiles]
plan_mejora: [plan de mejora recomendado]`;

    const enPrompt = `You are an expert trading coach on the "Roua" platform. Analyze the trader's performance based on the following statistics and trade log. Provide 3-5 specific, actionable tips to improve performance. Focus on risk management, discipline, position sizing, and asset selection. Mention strengths and weaknesses. Keep advice direct and professional.

Statistics:
${contextSummary}

Respond in the following format:
overall_rating: [excellent/good/needs_improvement]
---
1. [advice type: warning/opportunity/education] first advice text
2. [advice type: warning/opportunity/education] second advice text
3. [advice type: warning/opportunity/education] third advice text
---
strengths: [strengths]
weaknesses: [weaknesses]
improvement_plan: [recommended improvement plan]`;

    const aiPrompt = isAr ? arPrompt : isEs ? esPrompt : enPrompt;

    let adviceText = '';
    let adviceItems: { type: string; icon: string; text: string }[] = [];

    try {
      const result = await this.orchestrator.analyze({
        prompt: aiPrompt,
        type: 'risk_analysis',
        language: isAr ? 'ar' : isEs ? 'es' : 'en',
      });
      adviceText = result.content;

      // Parse advice items from AI response
      adviceItems = this.parseAdviceItems(result.content);
    } catch (error: any) {
      this.logger.warn(`AI analysis failed, using rule-based fallback: ${error.message}`);
      const fallback = this.generateRuleBasedAdvice(stats, locale);
      adviceText = fallback.text;
      adviceItems = fallback.items;
    }

    // 7. Store in database
    const advice = await this.prisma.coachAdvice.create({
      data: {
        userId,
        rating,
        statisticsSnapshot: JSON.stringify(stats),
        adviceText,
        adviceItems: JSON.stringify(adviceItems),
      },
    });

    return {
      success: true,
      data: {
        id: advice.id,
        rating,
        statistics: stats,
        adviceText,
        adviceItems,
        createdAt: advice.createdAt,
      },
    };
  }

  /**
   * Ask the coach a specific question
   */
  async askCoach(userId: string, question: string, contextAdviceId?: string, locale: 'ar' | 'en' | 'es' = 'ar') {
    this.logger.log(`Coach question from user ${userId}: ${question}`);

    // Get user's recent stats for context
    const trades = await this.prisma.trade.findMany({
      where: { userId },
      orderBy: { executedAt: 'desc' },
      take: 30,
    });
    const closedPositions = await this.prisma.position.findMany({
      where: { userId, status: 'CLOSED' },
      orderBy: { closedAt: 'desc' },
      take: 30,
    });
    const paperOrders = await this.prisma.paperOrder.findMany({
      where: { userId, status: 'FILLED' },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    const paperPnl = this.calculatePaperPnl(paperOrders);
    const stats = this.calculateStats(trades, closedPositions, paperPnl);
    const contextSummary = this.buildContextSummary(stats, trades.slice(0, 10), closedPositions.slice(0, 10));

    // Get previous advice if provided
    // DATA ISOLATION: Use findFirst with userId to prevent IDOR —
    // users must not access other users' advice via contextAdviceId
    let previousAdvice = '';
    if (contextAdviceId) {
      const prev = await this.prisma.coachAdvice.findFirst({
        where: { id: contextAdviceId, userId },
      });
      if (prev) {
        previousAdvice = `\n\nنصيحة سابقة من المُدرّب:\n${prev.adviceText}`;
      }
    }

    const isAr = locale === 'ar';
    const isEs = locale === 'es';

    const arPrompt = `أنت مُدرّب ربط حسابات خبير في منصة "رؤى". المتداول يسألك سؤالاً حول أدائه. أجب بالعربية بشكل مهني ومفيد ومباشر.

إحصائيات المتداول:
${contextSummary}
${previousAdvice}

سؤال المتداول: ${question}

أجب بشكل مبدد وعملي. قدم خطوات واضحة إن لزم الأمر.`;

    const esPrompt = `Eres un entrenador de trading experto en la plataforma "Roua". El trader te hace una pregunta sobre su rendimiento. Responde en español de forma profesional, útil y directa.

Estadísticas del trader:
${contextSummary}
${previousAdvice}

Pregunta del trader: ${question}

Responde de forma práctica. Proporciona pasos claros si es necesario.`;

    const enPrompt = `You are an expert trading coach on the "Roua" platform. The trader is asking you a question about their performance. Answer in English in a professional, helpful, and direct manner.

Trader statistics:
${contextSummary}
${previousAdvice}

Trader's question: ${question}

Answer practically. Provide clear steps if needed.`;

    const aiPrompt = isAr ? arPrompt : isEs ? esPrompt : enPrompt;

    let answer = '';
    try {
      const result = await this.orchestrator.analyze({
        prompt: aiPrompt,
        type: 'general',
        language: isAr ? 'ar' : isEs ? 'es' : 'en',
      });
      answer = result.content;
    } catch (error: any) {
      this.logger.warn(`AI question answer failed: ${error.message}`);
      answer = this.generateFallbackAnswer(question, stats, locale);
    }

    return {
      success: true,
      data: {
        question,
        answer,
        model: 'ai-coach',
      },
    };
  }

  /**
   * Get advice history for a user
   */
  async getAdviceHistory(userId: string) {
    const history = await this.prisma.coachAdvice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Mark unread as read
    await this.prisma.coachAdvice.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return {
      success: true,
      data: history.map(h => ({
        id: h.id,
        rating: h.rating,
        adviceText: h.adviceText,
        adviceItems: JSON.parse(h.adviceItems || '[]'),
        statistics: JSON.parse(h.statisticsSnapshot || '{}'),
        isRead: h.isRead,
        createdAt: h.createdAt,
      })),
    };
  }

  // ── Private: Calculate trading statistics ──
  private calculateStats(trades: any[], closedPositions: any[], paperPnl: number[] = []): TradeStats {
    const allPnl = [
      ...trades.map(t => Number(t.pnl) || 0),
      ...closedPositions.map(p => Number(p.realizedPnl) || 0),
      ...paperPnl,
    ];

    const winningTrades = allPnl.filter(p => p > 0);
    const losingTrades = allPnl.filter(p => p < 0);
    const totalTrades = allPnl.length;

    const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;
    const avgWin = winningTrades.length > 0 ? winningTrades.reduce((s, v) => s + v, 0) / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((s, v) => s + v, 0) / losingTrades.length) : 0;
    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;
    const totalPnl = allPnl.reduce((s, v) => s + v, 0);
    const biggestWin = winningTrades.length > 0 ? Math.max(...winningTrades) : 0;
    const biggestLoss = losingTrades.length > 0 ? Math.min(...losingTrades) : 0;

    // Max drawdown
    let peak = 0, maxDrawdown = 0, cumPnl = 0;
    const sortedByDate = [...allPnl].reverse();
    sortedByDate.forEach(pnl => {
      cumPnl += pnl;
      if (cumPnl > peak) peak = cumPnl;
      const dd = peak - cumPnl;
      if (dd > maxDrawdown) maxDrawdown = dd;
    });

    // Consecutive wins/losses
    let consecutiveWins = 0, consecutiveLosses = 0, tempW = 0, tempL = 0;
    allPnl.forEach(pnl => {
      if (pnl > 0) { tempW++; tempL = 0; consecutiveWins = Math.max(consecutiveWins, tempW); }
      else if (pnl < 0) { tempL++; tempW = 0; consecutiveLosses = Math.max(consecutiveLosses, tempL); }
      else { tempW = 0; tempL = 0; }
    });

    // Most traded symbol
    const symbolCounts: Record<string, number> = {};
    trades.forEach(t => { symbolCounts[t.symbol] = (symbolCounts[t.symbol] || 0) + 1; });
    const mostTradedSymbol = Object.entries(symbolCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

    // Long vs short win rates
    const longTrades = trades.filter(t => t.side === 'BUY');
    const shortTrades = trades.filter(t => t.side === 'SELL');
    const longWinRate = longTrades.length > 0
      ? (longTrades.filter(t => (t.pnl || 0) > 0).length / longTrades.length) * 100 : 0;
    const shortWinRate = shortTrades.length > 0
      ? (shortTrades.filter(t => (t.pnl || 0) > 0).length / shortTrades.length) * 100 : 0;

    // Risk compliance (rough: % of trades with stop loss)
    const positionsWithSL = closedPositions.filter(p => p.stopLoss != null);
    const riskCompliance = closedPositions.length > 0
      ? `${Math.round((positionsWithSL.length / closedPositions.length) * 100)}%`
      : 'غير محدد';

    // Sharpe ratio (annualized)
    let sharpeRatio: number | null = null;
    if (allPnl.length >= 2) {
      const mean = allPnl.reduce((s, r) => s + r, 0) / allPnl.length;
      const variance = allPnl.reduce((s, r) => s + (r - mean) ** 2, 0) / (allPnl.length - 1);
      const stdDev = Math.sqrt(variance);
      sharpeRatio = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : null;
    }

    return {
      totalTrades,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: Math.round(winRate * 10) / 10,
      avgWin: Math.round(avgWin * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100,
      profitFactor: profitFactor === Infinity ? -1 : Math.round(profitFactor * 100) / 100,
      totalPnl: Math.round(totalPnl * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      sharpeRatio: sharpeRatio !== null ? Math.round(sharpeRatio * 100) / 100 : null,
      mostTradedSymbol,
      avgTradeDuration: 'غير محدد',
      riskCompliance,
      biggestWin: Math.round(biggestWin * 100) / 100,
      biggestLoss: Math.round(biggestLoss * 100) / 100,
      consecutiveWins,
      consecutiveLosses,
      longWinRate: Math.round(longWinRate * 10) / 10,
      shortWinRate: Math.round(shortWinRate * 10) / 10,
    };
  }

  // ── Private: Calculate performance rating ──
  private calculateRating(stats: TradeStats): string {
    if (stats.totalTrades < 10) return 'insufficient_data';
    let score = 0;
    if (stats.winRate >= 60) score += 3;
    else if (stats.winRate >= 45) score += 2;
    else score += 1;

    if (stats.profitFactor >= 2) score += 3;
    else if (stats.profitFactor >= 1.5) score += 2;
    else if (stats.profitFactor >= 1) score += 1;

    if (stats.maxDrawdown < 500) score += 2;
    else if (stats.maxDrawdown < 2000) score += 1;

    if (score >= 7) return 'excellent';
    if (score >= 4) return 'good';
    return 'needs_improvement';
  }

  // ── Private: Build context summary for AI ──
  private buildContextSummary(stats: TradeStats, trades: any[], closedPositions: any[]): string {
    const tradeSummary = trades.slice(0, 10).map(t =>
      `${t.symbol} ${t.side === 'BUY' ? 'شراء' : 'بيع'} @ ${t.price} | ربح/خسارة: ${t.pnl || 0}`
    ).join('\n');

    return `إجمالي الصفقات: ${stats.totalTrades}
صفقات رابحة: ${stats.winningTrades} | صفقات خاسرة: ${stats.losingTrades}
نسبة الفوز: ${stats.winRate}%
متوسط الربح: $${stats.avgWin} | متوسط الخسارة: $${stats.avgLoss}
عامل الربح: ${stats.profitFactor === -1 ? '∞' : stats.profitFactor}
إجمالي الربح/الخسارة: $${stats.totalPnl}
أقصى تراجع: $${stats.maxDrawdown}
أكبر ربح: $${stats.biggestWin} | أكبر خسارة: $${stats.biggestLoss}
سلسلة أرباح متتالية: ${stats.consecutiveWins} | سلسلة خسائر متتالية: ${stats.consecutiveLosses}
نسبة فوز الشراء: ${stats.longWinRate}% | نسبة فوز البيع: ${stats.shortWinRate}%
الأكثر تداولاً: ${stats.mostTradedSymbol}
التزام إدارة المخاطر: ${stats.riskCompliance}
مؤشر شارب: ${stats.sharpeRatio ?? 'غير محدد'}

آخر 10 صفقات:
${tradeSummary}`;
  }

  // ── Private: Parse advice items from AI text ──
  private parseAdviceItems(text: string): { type: string; icon: string; text: string }[] {
    const items: { type: string; icon: string; text: string }[] = [];
    const lines = text.split('\n').filter(l => l.trim());

    for (const line of lines) {
      const match = line.match(/^\d+\.\s*\[?(تحذير|فرصة|تعليم|خطر)\]?\s*(.+)/);
      if (match) {
        const rawType = match[1];
        const content = match[2].trim();
        let type = 'education';
        let icon = 'book';
        if (rawType === 'تحذير' || rawType === 'خطر') { type = 'warning'; icon = 'alert'; }
        else if (rawType === 'فرصة') { type = 'opportunity'; icon = 'trending-up'; }
        else { type = 'education'; icon = 'book'; }
        items.push({ type, icon, text: content });
      }
    }

    // If no structured items found, extract sentences as education items
    if (items.length === 0) {
      const sentences = text.split(/[.؟!]/).filter(s => s.trim().length > 15);
      sentences.slice(0, 5).forEach(s => {
        items.push({ type: 'education', icon: 'book', text: s.trim() });
      });
    }

    return items;
  }

  // ── Private: Rule-based fallback advice ──
  private generateRuleBasedAdvice(stats: TradeStats, locale: 'ar' | 'en' | 'es' = 'ar'): { text: string; items: { type: string; icon: string; text: string }[] } {
    const items: { type: string; icon: string; text: string }[] = [];
    const isAr = locale === 'ar';
    const isEs = locale === 'es';

    if (stats.winRate < 40) {
      items.push({ type: 'warning', icon: 'alert', text: isAr ? 'نسبة فوزك أقل من 40%. راجع استراتيجية الدخول وتأكد من استخدام التحليل المتعدد الأطر الزمنية قبل فتح أي صفقة.' : isEs ? 'Tu tasa de acierto es inferior al 40%. Revisa tu estrategia de entrada y asegúrate de usar análisis multitemporal antes de abrir cualquier operación.' : 'Your win rate is below 40%. Review your entry strategy and ensure you use multi-timeframe analysis before opening any trade.' });
    }
    if (stats.profitFactor < 1 && stats.profitFactor > 0) {
      items.push({ type: 'warning', icon: 'alert', text: isAr ? 'عامل الربح أقل من 1.0 مما يعني أن خسائرك تتجاوز أرباحك. قلل حجم الصفقات وحدد وقف خسارة صارم لكل صفقة.' : isEs ? 'El factor de beneficio es menor a 1.0, lo que significa que tus pérdidas superan tus ganancias. Reduce el tamaño de las posiciones y establece un stop loss estricto para cada operación.' : 'Profit factor is below 1.0, meaning your losses exceed your gains. Reduce position sizes and set a strict stop loss for each trade.' });
    }
    if (stats.consecutiveLosses >= 3) {
      items.push({ type: 'warning', icon: 'alert', text: isAr ? `سلسلة خسائر متتالية (${stats.consecutiveLosses}). توقف عن التداول لفترة، راجع الصفقات الخاسرة، ولا تلاحق السوق بالتعويض.` : isEs ? `Racha de pérdidas consecutivas (${stats.consecutiveLosses}). Deja de operar por un tiempo, revisa las operaciones perdedoras y no persigas al mercado para compensar.` : `Consecutive losing streak (${stats.consecutiveLosses}). Stop trading for a while, review losing trades, and don't chase the market to compensate.` });
    }
    if (stats.maxDrawdown > 1000) {
      items.push({ type: 'warning', icon: 'alert', text: isAr ? `أقصى تراجع مرتفع ($${stats.maxDrawdown}). استخدم وقف خسارة لكل صفقة ولا تخاطر بأكثر من 2% من رأس المال في الصفقة الواحدة.` : isEs ? `Drawdown máximo elevado ($${stats.maxDrawdown}). Usa stop loss en cada operación y no arriesgues más del 2% del capital en una sola operación.` : `High max drawdown ($${stats.maxDrawdown}). Use stop loss for each trade and don't risk more than 2% of capital per trade.` });
    }
    if (stats.longWinRate > stats.shortWinRate + 20) {
      items.push({ type: 'opportunity', icon: 'trending-up', text: isAr ? `أداء الشراء أفضل بكثير من البيع (${stats.longWinRate}% مقابل ${stats.shortWinRate}%). ركز على صفقات الشراء حتى تحسن استراتيجية البيع.` : isEs ? `El rendimiento de compra es mucho mejor que el de venta (${stats.longWinRate}% vs ${stats.shortWinRate}%). Enfócate en operaciones de compra hasta mejorar tu estrategia de venta.` : `Buy performance is much better than sell (${stats.longWinRate}% vs ${stats.shortWinRate}%). Focus on buy trades until you improve your sell strategy.` });
    }
    if (stats.riskCompliance === 'غير محدد' || stats.riskCompliance === '0%') {
      items.push({ type: 'education', icon: 'book', text: isAr ? 'لا تستخدم وقف الخسارة بشكل منتظم. وقف الخسارة ضروري لحماية رأس المال. حدد وقف خسارة قبل فتح أي صفقة.' : isEs ? 'No usas stop loss de forma regular. El stop loss es esencial para proteger el capital. Establece un stop loss antes de abrir cualquier operación.' : 'You don\'t use stop loss regularly. Stop loss is essential for capital protection. Set a stop loss before opening any trade.' });
    }
    if (stats.winRate >= 55 && stats.profitFactor >= 1.5) {
      items.push({ type: 'opportunity', icon: 'trending-up', text: isAr ? 'أداؤك جيد! حافظ على الانضباط وزِد حجم الصفقات تدريجياً مع الحفاظ على إدارة المخاطر.' : isEs ? '¡Tu rendimiento es bueno! Mantén la disciplina y aumenta el tamaño de las posiciones gradualmente manteniendo la gestión de riesgos.' : 'Your performance is good! Maintain discipline and gradually increase position sizes while keeping risk management.' });
    }

    if (items.length === 0) {
      items.push({ type: 'education', icon: 'book', text: isAr ? 'استمر في التداول مع الالتزام بخطة واضحة. سجل كل صفقة وراجع أداءك أسبوعياً لتحديد الأنماط.' : isEs ? 'Continúa operando con un plan claro. Registra cada operación y revisa tu rendimiento semanalmente para identificar patrones.' : 'Continue trading with a clear plan. Log every trade and review your performance weekly to identify patterns.' });
    }

    const text = items.map((item, i) => {
      const typeLabel = item.type === 'warning' ? (isAr ? 'تحذير' : isEs ? 'advertencia' : 'warning') : item.type === 'opportunity' ? (isAr ? 'فرصة' : isEs ? 'oportunidad' : 'opportunity') : (isAr ? 'تعليم' : isEs ? 'educación' : 'education');
      return `${i + 1}. [${typeLabel}] ${item.text}`;
    }).join('\n');

    return { text, items };
  }

  // ── Private: Fallback answer ──
  private generateFallbackAnswer(question: string, stats: TradeStats, locale: 'ar' | 'en' | 'es' = 'ar'): string {
    const isAr = locale === 'ar';
    const isEs = locale === 'es';

    if (question.includes('وقفة') || question.includes('وقف') || question.includes('stop loss') || (isEs && (question.includes('pérdida') || question.includes('stop')))) {
      return isAr ? 'وقف الخسارة أداة أساسية لحماية رأس المال. يجب تحديد مستوى وقف الخسارة قبل فتح الصفقة بناءً على مستويات الدعم والمقاومة، وليس بشكل عشوائي. القاعدة العامة: لا تخاطر بأكثر من 1-2% من رأس المال في الصفقة الواحدة.' : isEs ? 'El stop loss es una herramienta esencial para proteger el capital. Debe establecerse antes de abrir la operación basándose en niveles de soporte y resistencia, no de forma aleatoria. Regla general: no arriesgues más del 1-2% del capital en una sola operación.' : 'Stop loss is an essential tool for capital protection. It should be set before opening a trade based on support and resistance levels, not randomly. General rule: don\'t risk more than 1-2% of capital per trade.';
    }
    if (question.includes('حجم') || question.includes('position size') || (isEs && (question.includes('tamaño') || question.includes('posición')))) {
      return isAr ? `بناءً على أدائك الحالي (نسبة فوز ${stats.winRate}%)، أنصحك بحجم صفقات صغير ومتسق. استخدم قاعدة 1%: لا تخاطر بأكثر من 1% من رأس المال في أي صفقة. هذا يحميك من الخسائر الكبيرة ويسمح لك بالبقاء في السوق لفترة أطول.` : isEs ? `Basándote en tu rendimiento actual (tasa de acierto ${stats.winRate}%), te aconsejo un tamaño de posición pequeño y consistente. Usa la regla del 1%: no arriesgues más del 1% del capital en ninguna operación. Esto te protege de pérdidas grandes y te permite permanecer más tiempo en el mercado.` : `Based on your current performance (win rate ${stats.winRate}%), I advise small, consistent position sizes. Use the 1% rule: don\'t risk more than 1% of capital in any trade. This protects you from large losses and allows you to stay in the market longer.`;
    }
    return isAr ? `بناءً على تحليل أدائك: نسبة الفوز ${stats.winRate}%، عامل الربح ${stats.profitFactor}، أقصى تراجع $${stats.maxDrawdown}. أنصحك بالتركيز على تحسين نقاط الدخول والخروج، واستخدام وقف الخسارة دائماً، وعدم المخاطرة بأكثر من 2% من رأس المال في الصفقة الواحدة. الرجاء كن أكثر تحديداً في سؤالك لأعطيك نصيحة أدق.` : isEs ? `Basándote en el análisis de tu rendimiento: tasa de acierto ${stats.winRate}%, factor de beneficio ${stats.profitFactor}, drawdown máximo $${stats.maxDrawdown}. Te aconsejo enfocarte en mejorar los puntos de entrada y salida, usar siempre stop loss y no arriesgar más del 2% del capital por operación. Por favor, sé más específico en tu pregunta para darte un consejo más preciso.` : `Based on your performance analysis: win rate ${stats.winRate}%, profit factor ${stats.profitFactor}, max drawdown $${stats.maxDrawdown}. I advise focusing on improving entry and exit points, always using stop loss, and not risking more than 2% of capital per trade. Please be more specific in your question for a more precise advice.`;
  }

  /**
   * Calculate PnL from paper orders by matching BUY+SELL pairs (FIFO).
   * PaperOrders don't have explicit PnL, so we estimate it.
   */
  private calculatePaperPnl(paperOrders: any[]): number[] {
    // Group by symbol
    const bySymbol: Record<string, any[]> = {};
    for (const order of paperOrders) {
      const sym = order.symbol;
      if (!bySymbol[sym]) bySymbol[sym] = [];
      bySymbol[sym].push({
        side: order.side,
        price: Number(order.averagePrice) || 0,
        qty: Number(order.quantity) || 0,
        fee: Number(order.fee) || 0,
      });
    }

    const pnlResults: number[] = [];

    for (const [symbol, orders] of Object.entries(bySymbol)) {
      // Sort oldest first
      orders.reverse();

      // FIFO matching
      const buyQueue: { price: number; qty: number; fee: number }[] = [];

      for (const order of orders) {
        if (order.side === 'BUY') {
          buyQueue.push({ price: order.price, qty: order.qty, fee: order.fee });
        } else if (order.side === 'SELL' && buyQueue.length > 0) {
          let remainingQty = order.qty;
          let totalPnl = -order.fee;

          while (remainingQty > 0 && buyQueue.length > 0) {
            const buy = buyQueue[0];
            const matchedQty = Math.min(remainingQty, buy.qty);
            const pairPnl = (order.price - buy.price) * matchedQty;
            totalPnl += pairPnl;
            totalPnl -= buy.fee * (matchedQty / buy.qty);
            buy.qty -= matchedQty;
            remainingQty -= matchedQty;
            if (buy.qty <= 0) buyQueue.shift();
          }

          pnlResults.push(Math.round(totalPnl * 100) / 100);
        }
      }
    }

    return pnlResults;
  }
}
