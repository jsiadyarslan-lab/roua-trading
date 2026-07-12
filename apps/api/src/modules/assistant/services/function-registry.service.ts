// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Assistant Function Registry
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "العقل المُنفِّذ" — يوفّر للـ LLM 12+ وظيفة آمنة (read-only)
// يستطيع المساعد استدعاؤها للحصول على بيانات لحظية من النظام
//
// المبادئ:
//   1. read-only — لا تعديل، لا تنفيذ صفقات (في هذه المرحلة)
//   2. آمنة — كل استدعاء محمي بصلاحيات المستخدم
//   3. موثّقة — JSON schema واضح لكل وظيفة
//   4. معدّلة الأداء — caching + indexes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { ContextAggregatorService } from './context-aggregator.service';
import { TradingService } from '../../trading/trading.service';
import { StrategicCouncilService } from '../../ai/strategic-council/strategic-council.service';
import { TradeJournalService } from '../../ai/council-intelligence/trade-journal.service';
import { CouncilVoteAccuracyService } from '../../ai/council-intelligence/council-vote-accuracy.service';
import { SystemMemoryService } from '../../ai/council-intelligence/system-memory.service';
import { ExchangeService } from '../../exchange/exchange.service';
import { NewsService } from '../../news/news.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { getSymbolMetadata } from '../../trading/services/symbol-metadata';

// ─── Function Schema Types (لـ LLM function calling) ─────────
export interface AssistantFunctionSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface AssistantFunctionCall {
  name: string;
  arguments: Record<string, any>;
}

export interface AssistantFunctionResult {
  name: string;
  success: boolean;
  data?: any;
  error?: string;
  durationMs: number;
}

// ─── JSON Schemas للـ 12 وظيفة ────────────────────────────────
export const ASSISTANT_FUNCTIONS: AssistantFunctionSchema[] = [
  {
    name: 'getOpenPositions',
    description:
      'Get the user\'s currently open trading positions with live PnL, entry/exit prices, stop-loss, take-profit, and duration. Use this when the user asks about their current trades, exposure, or risk.',
    parameters: {
      type: 'object',
      properties: {
        credentialId: {
          type: 'string',
          description: 'Optional: filter by exchange credential ID',
        },
      },
    },
  },
  {
    name: 'getClosedTrades',
    description:
      'Get the user\'s recently closed trades with result (WIN/LOSS/BREAKEVEN), PnL, exit price, and close reason. Use this when the user asks about their trade history or past performance.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of trades to return (default: 10, max: 50)',
        },
        symbol: {
          type: 'string',
          description: 'Optional: filter by symbol (e.g. "EURUSD", "BTCUSDT")',
        },
      },
    },
  },
  {
    name: 'getCouncilVote',
    description:
      'Get the strategic council\'s latest vote on a symbol — including each of the 8 agents\' direction (BUY/SELL/NEUTRAL), reasoning, and the consensus score. Use this to explain WHY the council decided on a specific direction.',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Trading symbol (e.g. "EURUSD", "XAUUSD")',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'getCouncilConsensus',
    description:
      'Get the current council consensus across all active briefs — bullish/bearish/neutral counts, average confidence, and average consensus score. Use this for a market-wide overview.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'getTradeJournalSummary',
    description:
      'Get a summary of the trade journal for a time range — total trades, win rate, profit factor, best/worst pairs, and lessons learned. Use this when the user asks about their trading performance.',
    parameters: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'Time range in days (default: 30, max: 365)',
        },
      },
    },
  },
  {
    name: 'getSystemMemory',
    description:
      'Retrieve memories the system has learned — patterns, failed setups, lessons, market observations. Use this when the user asks "what has the system learned?" or for context on a specific symbol.',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Optional: filter memories by symbol',
        },
        type: {
          type: 'string',
          enum: [
            'INSIGHT',
            'PATTERN',
            'FAILED_SETUP',
            'REGIME_HISTORY',
            'DAILY_SUMMARY',
            'WEEKLY_PATTERN',
            'LESSON',
          ],
          description: 'Optional: filter by memory type',
        },
      },
    },
  },
  {
    name: 'getStrategyPerformance',
    description:
      'Get performance metrics for the trading strategy — vote accuracy per council role, dynamic weights, and recent accuracy trends. Use this when the user asks which council members are performing best.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'getMarketContext',
    description:
      'Get live market data for top symbols (EURUSD, GBPUSD, USDJPY, XAUUSD, BTC, ETH) and any specific symbol the user asks about. Includes price, 24h change, high, low, volume.',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Optional: specific symbol to fetch (e.g. "BTCUSDT")',
        },
      },
    },
  },
  {
    name: 'getNewsSentiment',
    description:
      'Get recent news with sentiment analysis — positive/negative/neutral, impact level, affected symbols. Use this when the user asks about market-moving news.',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Optional: filter news affecting a specific symbol',
        },
        limit: {
          type: 'number',
          description: 'Number of news items (default: 10, max: 30)',
        },
      },
    },
  },
  {
    name: 'getRiskMetrics',
    description:
      'Get the user\'s current risk metrics — exposure %, used margin, paper balance, displayed balance, risk level (LOW/MEDIUM/HIGH/CRITICAL). Use this when the user asks about their risk or position sizing.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'explainDecision',
    description:
      'Explain WHY a specific trade was opened — the council votes, AI reasoning per role, regime at entry, news context, and rejection reasons. Use this when the user asks "why did the system open this trade?"',
    parameters: {
      type: 'object',
      properties: {
        tradeId: {
          type: 'string',
          description: 'The trade/position ID to explain',
        },
      },
      required: ['tradeId'],
    },
  },
  {
    name: 'suggestAction',
    description:
      'Get a suggested action for the user based on current market context, open positions, and system health. Returns a recommendation like "monitor", "wait", "reduce risk", or "review positions". Use this when the user asks "what should I do?"',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
];

@Injectable()
export class FunctionRegistryService {
  private readonly logger = new Logger(FunctionRegistryService.name);

  constructor(
    private readonly contextAggregator: ContextAggregatorService,
    private readonly prisma: PrismaService,
    @Optional() @Inject(forwardRef(() => TradingService))
    private readonly tradingService?: TradingService,
    @Optional() @Inject(forwardRef(() => StrategicCouncilService))
    private readonly councilService?: StrategicCouncilService,
    @Optional() private readonly tradeJournal?: TradeJournalService,
    @Optional() private readonly voteAccuracy?: CouncilVoteAccuracyService,
    @Optional() private readonly systemMemory?: SystemMemoryService,
    @Optional() private readonly exchangeService?: ExchangeService,
    @Optional() private readonly newsService?: NewsService,
  ) {
    this.logger.log(`⚡ FunctionRegistryService initialized — ${ASSISTANT_FUNCTIONS.length} functions`);
  }

  /**
   * يرجع JSON Schemas للـ LLM
   */
  getFunctionSchemas(): AssistantFunctionSchema[] {
    return ASSISTANT_FUNCTIONS;
  }

  /**
   * ينفّذ استدعاء وظيفة بالاسم
   */
  async executeFunction(
    name: string,
    args: Record<string, any>,
    userId: string,
  ): Promise<AssistantFunctionResult> {
    const startTime = Date.now();
    try {
      let data: any;

      switch (name) {
        case 'getOpenPositions':
          data = await this._getOpenPositions(userId, args);
          break;
        case 'getClosedTrades':
          data = await this._getClosedTrades(userId, args);
          break;
        case 'getCouncilVote':
          data = await this._getCouncilVote(userId, args);
          break;
        case 'getCouncilConsensus':
          data = await this._getCouncilConsensus(userId);
          break;
        case 'getTradeJournalSummary':
          data = await this._getTradeJournalSummary(userId, args);
          break;
        case 'getSystemMemory':
          data = await this._getSystemMemory(userId, args);
          break;
        case 'getStrategyPerformance':
          data = await this._getStrategyPerformance(userId);
          break;
        case 'getMarketContext':
          data = await this._getMarketContext(userId, args);
          break;
        case 'getNewsSentiment':
          data = await this._getNewsSentiment(args);
          break;
        case 'getRiskMetrics':
          data = await this._getRiskMetrics(userId);
          break;
        case 'explainDecision':
          data = await this._explainDecision(userId, args);
          break;
        case 'suggestAction':
          data = await this._suggestAction(userId);
          break;
        default:
          throw new Error(`Unknown function: ${name}`);
      }

      const durationMs = Date.now() - startTime;
      this.logger.debug(`✅ Function "${name}" executed in ${durationMs}ms`);

      return {
        name,
        success: true,
        data,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.logger.warn(`❌ Function "${name}" failed: ${error.message}`);
      return {
        name,
        success: false,
        error: error.message,
        durationMs,
      };
    }
  }

  /**
   * ينفّذ عدة استدعاءات بالتوازي
   */
  async executeFunctions(
    calls: AssistantFunctionCall[],
    userId: string,
  ): Promise<AssistantFunctionResult[]> {
    return Promise.all(
      calls.map((call) =>
        this.executeFunction(call.name, call.arguments || {}, userId),
      ),
    );
  }

  // ─── Functions Implementation ───────────────────────────────

  private async _getOpenPositions(userId: string, args: any): Promise<any> {
    if (!this.tradingService) return { positions: [], count: 0 };
    const positions = await this.tradingService.getOpenPositions(
      userId,
      args.credentialId,
    );
    return {
      count: positions.length,
      positions: positions.map((p: any) => ({
        id: p.id,
        symbol: p.symbol,
        side: p.side,
        entryPrice: Number(p.entryPrice),
        currentPrice: Number(p.currentPrice),
        quantity: Number(p.quantity),
        unrealizedPnl: Number(p.unrealizedPnl),
        // BUG-1: استخدم "N/A" بدل null — null يجعل LLM يولّد "[بيانات غير متاحة]" في الجداول
        // "N/A" صريح ولا يكسر تنسيق الجدول
        stopLoss: p.stopLoss != null ? Number(p.stopLoss) : 'N/A',
        takeProfit: p.takeProfit != null ? Number(p.takeProfit) : 'N/A',
        openedAt: p.openedAt,
        durationMinutes: Math.round(
          (Date.now() - new Date(p.openedAt).getTime()) / 60000,
        ),
        source: p.source,
      })),
      // BUG-1: تعليمات صريحة للـ LLM عن كيفية عرض N/A
      _formattingHint: 'لو stopLoss أو takeProfit = "N/A"، اعرضها كـ "-" في الجدول. لا تقل "بيانات غير متاحة".',
    };
  }

  private async _getClosedTrades(userId: string, args: any): Promise<any> {
    const limit = Math.min(args.limit ?? 10, 50);
    const where: any = { userId, status: 'CLOSED' };
    if (args.symbol) where.symbol = args.symbol;

    const positions = await this.prisma.position.findMany({
      where,
      orderBy: { closedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        symbol: true,
        side: true,
        entryPrice: true,
        exitPrice: true,
        realizedPnl: true,
        closeReason: true,
        openedAt: true,
        closedAt: true,
      },
    });

    return {
      count: positions.length,
      trades: positions.map((p: any) => {
        const entry = Number(p.entryPrice) || 0;
        const exit = p.exitPrice ? Number(p.exitPrice) : entry;
        const pnl = Number(p.realizedPnl) || 0;
        let pnlPercent = 0;
        if (entry > 0) {
          pnlPercent =
            p.side === 'BUY'
              ? ((exit - entry) / entry) * 100
              : ((entry - exit) / entry) * 100;
        }
        const result: string =
          pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'BREAKEVEN';
        return {
          id: p.id,
          symbol: p.symbol,
          side: p.side,
          entryPrice: entry,
          exitPrice: exit,
          pnl,
          pnlPercent: Math.round(pnlPercent * 100) / 100,
          result,
          closeReason: p.closeReason,
          openedAt: p.openedAt,
          closedAt: p.closedAt,
          durationMinutes: p.closedAt
            ? Math.round(
                (new Date(p.closedAt).getTime() -
                  new Date(p.openedAt).getTime()) /
                  60000,
              )
            : null,
        };
      }),
    };
  }

  private async _getCouncilVote(userId: string, args: any): Promise<any> {
    if (!args.symbol) {
      throw new Error('symbol is required');
    }

    // ابحث عن آخر brief للرمز المطلوب
    // RC-11: فحص صارم لـ userId — empty string لا يجب أن يتجاوز الفلتر
    const briefWhere: any = {
      OR: [{ userId }, { userId: null }],
      pair: args.symbol,
    };
    if (!userId || userId === '') {
      // لو userId فارغ، ابحث فقط في briefs العامة (userId = null)
      briefWhere.OR = [{ userId: null }];
    }
    const brief = await this.prisma.tradingBrief.findFirst({
      where: briefWhere,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        pair: true,
        direction: true,
        confidence: true,
        timeframe: true,
        issuedAt: true,
        expiresAt: true,
        isActive: true,
        reviewStatus: true,
        strictRules: true,
        analysisSummary: true,
        entryPrice: true,
        stopLoss: true,
        takeProfit: true,
      },
    });

    if (!brief) {
      return {
        symbol: args.symbol,
        message: 'No recent council vote found for this symbol',
        brief: null,
      };
    }

    // ابحث عن آخر سجل تداول (TradeJournal) لنفس الرمز للحصول على councilVotes
    const journal = await this.prisma.tradeJournal.findFirst({
      where: { userId, symbol: args.symbol },
      orderBy: { createdAt: 'desc' },
      select: {
        councilVotes: true,
        consensusScore: true,
        regimeAtEntry: true,
        aiReasoning: true,
        rejectionReasons: true,
        newsContext: true,
        result: true,
      },
    });

    // Parse councilVotes JSON
    let councilVotes: Record<string, any> = {};
    let aiReasoning: Record<string, string> = {};
    let rejectionReasons: string[] = [];
    if (journal) {
      try {
        councilVotes =
          typeof journal.councilVotes === 'string'
            ? JSON.parse(journal.councilVotes)
            : journal.councilVotes;
      } catch {
        councilVotes = {};
      }
      try {
        aiReasoning =
          typeof journal.aiReasoning === 'string'
            ? JSON.parse(journal.aiReasoning)
            : journal.aiReasoning;
      } catch {
        aiReasoning = {};
      }
      try {
        rejectionReasons =
          typeof journal.rejectionReasons === 'string'
            ? JSON.parse(journal.rejectionReasons)
            : journal.rejectionReasons;
      } catch {
        rejectionReasons = [];
      }
    }

    return {
      symbol: args.symbol,
      brief: {
        id: brief.id,
        direction: brief.direction,
        confidence: brief.confidence,
        timeframe: brief.timeframe,
        issuedAt: brief.issuedAt,
        expiresAt: brief.expiresAt,
        isActive: brief.isActive,
        reviewStatus: brief.reviewStatus,
        entryPrice: Number(brief.entryPrice),
        stopLoss: Number(brief.stopLoss),
        takeProfit: Number(brief.takeProfit),
        analysisSummary: brief.analysisSummary,
      },
      councilVotes,
      consensusScore: journal?.consensusScore ?? 0,
      regimeAtEntry: journal?.regimeAtEntry ?? null,
      aiReasoning,
      rejectionReasons,
      lastResult: journal?.result ?? null,
    };
  }

  private async _getCouncilConsensus(userId: string): Promise<any> {
    // RC-11: فحص صارم لـ userId
    const where: any = {
      isActive: true,
      reviewStatus: 'ACTIVE',
    };
    if (userId && userId !== '') {
      where.OR = [{ userId }, { userId: null }];
    } else {
      where.userId = null;
    }
    const briefs = await this.prisma.tradingBrief.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        pair: true,
        direction: true,
        confidence: true,
        timeframe: true,
        issuedAt: true,
      },
    });

    const bullish = briefs.filter((b) => b.direction === 'BUY').length;
    const bearish = briefs.filter((b) => b.direction === 'SELL').length;
    // V462: BriefDirection enum = BUY | SELL only (no NEUTRAL in schema)
    const neutral = 0;
    const avgConfidence =
      briefs.length > 0
        ? Math.round(
            (briefs.reduce((s, b) => s + b.confidence, 0) / briefs.length) * 10,
          ) / 10
        : 0;

    return {
      totalActiveBriefs: briefs.length,
      bullishCount: bullish,
      bearishCount: bearish,
      neutralCount: neutral,
      avgConfidence,
      briefs: briefs.slice(0, 10).map((b) => ({
        symbol: b.pair,
        direction: b.direction,
        confidence: b.confidence,
        timeframe: b.timeframe,
        issuedAt: b.issuedAt,
      })),
    };
  }

  private async _getTradeJournalSummary(userId: string, args: any): Promise<any> {
    if (!this.tradeJournal) {
      // fallback: حساب مباشر من Position
      const days = Math.min(args.days ?? 30, 365);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const positions = await this.prisma.position.findMany({
        where: {
          userId,
          status: 'CLOSED',
          closedAt: { gte: since },
        },
        select: { realizedPnl: true, symbol: true },
      });

      const wins = positions.filter((p) => Number(p.realizedPnl) > 0).length;
      const losses = positions.filter((p) => Number(p.realizedPnl) < 0).length;
      const breakeven = positions.filter((p) => Number(p.realizedPnl) === 0).length;
      const totalPnl = positions.reduce(
        (s, p) => s + (Number(p.realizedPnl) || 0),
        0,
      );
      const winRate =
        positions.length > 0 ? (wins / positions.length) * 100 : 0;

      // best/worst pair
      const byPair: Record<string, number> = {};
      for (const p of positions) {
        byPair[p.symbol] = (byPair[p.symbol] || 0) + (Number(p.realizedPnl) || 0);
      }
      const sortedPairs = Object.entries(byPair).sort((a, b) => b[1] - a[1]);
      const bestPair = sortedPairs[0]?.[0];
      const worstPair = sortedPairs[sortedPairs.length - 1]?.[0];

      return {
        days,
        totalTrades: positions.length,
        wins,
        losses,
        breakeven,
        winRate: Math.round(winRate * 10) / 10,
        totalPnl: Math.round(totalPnl * 100) / 100,
        avgWin:
          wins > 0
            ? Math.round(
                (positions
                  .filter((p) => Number(p.realizedPnl) > 0)
                  .reduce((s, p) => s + Number(p.realizedPnl), 0) /
                  wins) *
                  100,
              ) / 100
            : 0,
        avgLoss:
          losses > 0
            ? Math.round(
                (positions
                  .filter((p) => Number(p.realizedPnl) < 0)
                  .reduce((s, p) => s + Number(p.realizedPnl), 0) /
                  losses) *
                  100,
              ) / 100
            : 0,
        bestPair,
        worstPair,
      };
    }

    const days = Math.min(args.days ?? 30, 365);
    return await this.tradeJournal.getTradeStats(userId, days);
  }

  private async _getSystemMemory(userId: string, args: any): Promise<any> {
    // RC-11: فحص صارم لـ userId
    const where: any = {
      isActive: true,
    };
    if (userId && userId !== '') {
      where.OR = [{ userId }, { userId: null }];
    } else {
      where.userId = null;
    }
    if (args.symbol) where.symbol = args.symbol;
    if (args.type) where.type = args.type;

    const memories = await this.prisma.systemMemory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        type: true,
        content: true,
        symbol: true,
        confidence: true,
        createdAt: true,
        validUntil: true,
        timesUsed: true,
        timesCorrect: true,
      },
    });

    return {
      count: memories.length,
      memories: memories.map((m) => ({
        id: m.id,
        type: m.type,
        symbol: m.symbol,
        content: m.content,
        confidence: m.confidence,
        createdAt: m.createdAt,
        validUntil: m.validUntil,
        accuracy:
          m.timesUsed > 0
            ? Math.round((m.timesCorrect / m.timesUsed) * 100)
            : null,
      })),
    };
  }

  private async _getStrategyPerformance(userId: string): Promise<any> {
    if (this.voteAccuracy) {
      const report = await this.voteAccuracy.getAccuracyReport(userId);
      const weights = await this.voteAccuracy.getAllRoleWeights(userId);
      return {
        roles: report,
        weights,
      };
    }
    return { roles: [], weights: {} };
  }

  private async _getMarketContext(userId: string, args: any): Promise<any> {
    // إذا طلب رمزًا محددًا
    if (args.symbol && this.exchangeService) {
      try {
        const quote = await this.exchangeService.getQuote(args.symbol);
        const meta = getSymbolMetadata(args.symbol);
        return {
          symbol: args.symbol,
          price: Number(quote.price),
          change24h: Number(quote.change),
          changePercent24h: Number(quote.changePercent),
          high24h: Number(quote.high),
          low24h: Number(quote.low),
          volume24h: Number(quote.volume),
          assetClass: meta.assetClass,
          timestamp: new Date(),
        };
      } catch (e) {
        return { symbol: args.symbol, error: `Failed to fetch quote: ${e.message}` };
      }
    }

    // استخدم الـ context aggregator للحصول على السياق الكامل
    const context = await this.contextAggregator.getContext({
      userId,
      skipCache: false,
    });
    return {
      topSymbols: context.market.topSymbols,
      userSymbols: context.market.userSymbols,
      marketSentiment: context.market.marketSentiment,
      volatilityIndex: context.market.volatilityIndex,
      fetchedAt: context.market.fetchedAt,
    };
  }

  private async _getNewsSentiment(args: any): Promise<any> {
    const limit = Math.min(args.limit ?? 10, 30);
    const where: any = {};
    if (args.symbol) where.affectedAssets = { contains: args.symbol };

    const news = await this.prisma.newsArticle.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        translatedTitle: true,
        summary: true,
        source: true,
        sentimentLabel: true,
        sentiment: true,
        impactLevel: true,
        publishedAt: true,
        affectedAssets: true,
        url: true,
      },
    });

    return {
      count: news.length,
      news: news.map((n) => {
        let symbols: string[] = [];
        try {
          symbols =
            typeof n.affectedAssets === 'string'
              ? JSON.parse(n.affectedAssets)
              : Array.isArray(n.affectedAssets)
              ? n.affectedAssets
              : [];
        } catch {
          symbols = [];
        }
        return {
          id: n.id,
          title: n.translatedTitle ?? n.title,
          summary: n.summary,
          source: n.source,
          sentiment: (n.sentimentLabel ?? 'neutral').toUpperCase(),
          sentimentScore: n.sentiment ? Number(n.sentiment) : null,
          impact: (n.impactLevel ?? 'medium').toUpperCase(),
          publishedAt: n.publishedAt,
          symbols,
          url: n.url,
        };
      }),
    };
  }

  private async _getRiskMetrics(userId: string): Promise<any> {
    const context = await this.contextAggregator.getContext({
      userId,
      skipCache: false,
    });
    return {
      openPositions: context.userTrading.positionSummary.count,
      totalValue: context.userTrading.positionSummary.totalValue,
      totalUnrealizedPnl: context.userTrading.positionSummary.totalUnrealizedPnl,
      totalRealizedPnl: context.userTrading.positionSummary.totalRealizedPnl,
      usedMargin: context.userTrading.positionSummary.usedMargin,
      paperBalance: context.userTrading.positionSummary.paperBalance,
      displayedBalance: context.userTrading.positionSummary.displayedBalance,
      riskExposurePercent: context.userTrading.positionSummary.riskExposurePercent,
      riskLevel: context.systemHealth.riskLevel,
      cooldownActive: context.systemHealth.cooldownActive,
      cooldownEndsAt: context.systemHealth.cooldownEndsAt,
      todayStats: context.userTrading.todayStats,
    };
  }

  private async _explainDecision(userId: string, args: any): Promise<any> {
    if (!args.tradeId) {
      throw new Error('tradeId is required');
    }

    // ابحث عن Position
    const position = await this.prisma.position.findFirst({
      where: { id: args.tradeId, userId },
      select: {
        id: true,
        symbol: true,
        side: true,
        entryPrice: true,
        currentPrice: true,
        stopLoss: true,
        takeProfit: true,
        openedAt: true,
        source: true,
        closeReason: true,
        realizedPnl: true,
        status: true,
      },
    });

    if (!position) {
      throw new Error('Trade not found');
    }

    // ابحث عن TradeJournal المرتبط (إن وُجد)
    const journal = await this.prisma.tradeJournal.findFirst({
      where: { userId, symbol: position.symbol },
      orderBy: { createdAt: 'desc' },
      select: {
        councilVotes: true,
        consensusScore: true,
        regimeAtEntry: true,
        newsContext: true,
        rejectionReasons: true,
        aiReasoning: true,
        lesson: true,
        tags: true,
        result: true,
      },
    });

    let councilVotes = {};
    let aiReasoning = {};
    let rejectionReasons: string[] = [];
    let newsContext: string[] = [];
    if (journal) {
      try {
        councilVotes =
          typeof journal.councilVotes === 'string'
            ? JSON.parse(journal.councilVotes)
            : journal.councilVotes;
      } catch {
        councilVotes = {};
      }
      try {
        aiReasoning =
          typeof journal.aiReasoning === 'string'
            ? JSON.parse(journal.aiReasoning)
            : journal.aiReasoning;
      } catch {
        aiReasoning = {};
      }
      try {
        rejectionReasons =
          typeof journal.rejectionReasons === 'string'
            ? JSON.parse(journal.rejectionReasons)
            : journal.rejectionReasons;
      } catch {
        rejectionReasons = [];
      }
      try {
        newsContext =
          typeof journal.newsContext === 'string'
            ? JSON.parse(journal.newsContext)
            : journal.newsContext;
      } catch {
        newsContext = [];
      }
    }

    return {
      trade: {
        id: position.id,
        symbol: position.symbol,
        side: position.side,
        entryPrice: Number(position.entryPrice),
        currentPrice: position.currentPrice
          ? Number(position.currentPrice)
          : null,
        stopLoss: position.stopLoss ? Number(position.stopLoss) : null,
        takeProfit: position.takeProfit ? Number(position.takeProfit) : null,
        openedAt: position.openedAt,
        source: position.source,
        status: position.status,
        realizedPnl: position.realizedPnl
          ? Number(position.realizedPnl)
          : null,
        closeReason: position.closeReason,
      },
      councilDecision: {
        votes: councilVotes,
        consensusScore: journal?.consensusScore ?? 0,
        regimeAtEntry: journal?.regimeAtEntry ?? null,
        aiReasoning,
        rejectionReasons,
        newsContext,
        lesson: journal?.lesson ?? null,
        tags: journal?.tags ?? [],
        result: journal?.result ?? null,
      },
    };
  }

  private async _suggestAction(userId: string): Promise<any> {
    const context = await this.contextAggregator.getContext({
      userId,
      skipCache: false,
    });

    const suggestions: string[] = [];
    let primaryAction = 'MONITOR';
    let priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';

    // تحليل الوضع واقتراح إجراء
    if (context.systemHealth.cooldownActive) {
      primaryAction = 'WAIT_FOR_COOLDOWN';
      priority = 'HIGH';
      suggestions.push(
        `النظام في وضع تبريد حتى ${context.systemHealth.cooldownEndsAt?.toISOString() ?? 'غير معروف'}. انتظر قبل فتح صفقات جديدة.`,
      );
    }

    if (context.userTrading.positionSummary.riskExposurePercent > 30) {
      primaryAction = 'REDUCE_RISK';
      priority = 'HIGH';
      suggestions.push(
        `مخاطرتك ${context.userTrading.positionSummary.riskExposurePercent.toFixed(1)}% — مرتفعة. فكر في إغلاق بعض الصفقات أو تقليل حجم الصفقات القادمة.`,
      );
    }

    const bigLoss = context.userTrading.openPositions.find(
      (p) => p.unrealizedPnlPercent < -5,
    );
    if (bigLoss) {
      primaryAction = 'REVIEW_LOSING_POSITION';
      priority = 'HIGH';
      suggestions.push(
        `صفقة ${bigLoss.symbol} خاسرة ${bigLoss.unrealizedPnlPercent.toFixed(2)}%. راجع السبب — هل SL بعيد؟ هل السوق تغيّر؟`,
      );
    }

    if (context.userTrading.openPositions.length === 0) {
      if (context.council.activeBriefs.length > 0) {
        primaryAction = 'REVIEW_COUNCIL_BRIEFS';
        priority = 'MEDIUM';
        suggestions.push(
          `لا توجد صفقات مفتوحة، لكن لدى المجلس ${context.council.activeBriefs.length} brief نشط. راجعها.`,
        );
      } else {
        primaryAction = 'WAIT_FOR_SIGNALS';
        priority = 'LOW';
        suggestions.push(
          'لا صفقات مفتوحة ولا briefs نشطة. النظام ينتظر إشارات من المجلس.',
        );
      }
    }

    if (context.userTrading.todayStats.winRate < 40 && context.userTrading.todayStats.tradesClosed > 3) {
      suggestions.push(
        `نسبة فوز اليوم ${context.userTrading.todayStats.winRate}% فقط — فكر في إيقاف التداول لبقية اليوم.`,
      );
      if (priority === 'LOW') priority = 'MEDIUM';
    }

    if (context.systemHealth.systemStatus === 'DEGRADED') {
      suggestions.push(
        'النظام في حالة تدهور — بعض المكوّنات قد لا تعمل بشكل صحيح.',
      );
      if (priority === 'LOW') priority = 'MEDIUM';
    }

    if (suggestions.length === 0) {
      suggestions.push('الوضع طبيعي. راقب صفقاتك المفتوحة وانتظر إشارات جديدة.');
    }

    return {
      primaryAction,
      priority,
      suggestions,
      contextSnapshot: {
        openPositions: context.userTrading.positionSummary.count,
        riskExposurePercent: context.userTrading.positionSummary.riskExposurePercent,
        activeBriefs: context.council.activeBriefs.length,
        marketSentiment: context.market.marketSentiment,
        systemStatus: context.systemHealth.systemStatus,
        todayWinRate: context.userTrading.todayStats.winRate,
      },
    };
  }
}
