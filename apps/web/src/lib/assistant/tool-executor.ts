// ─── Tool Executor ─────────────────────────────────────────────
// Executes assistant tool calls by dispatching to the appropriate handler.
// Used by /api/assistant to resolve [TOOL_CALL] blocks.

import { getToolByName, parseToolCall, type Locale } from './tools';
import {
  getStockFundamentals,
  getStockTechnical,
  getStockNews,
  getStockQuoteData,
  compareStocks,
  getStockRecommendations,
  searchArticles,
  summarizePage,
  getMarketEvents,
  searchByAsset,
  getForexMovers,
} from './stock-tools';
import {
  searchKnowledge,
  crossReference,
  fetchMarketPulse,
  getDBStats,
  formatCrossReferenceAsContext,
  formatMarketPulseAsContext,
} from './db-knowledge';
import { db } from '@/lib/db';

// ─── Tool Handler Map ──────────────────────────────────────────

const HANDLERS: Record<string, (params: Record<string, any>, locale: Locale, userId?: string) => Promise<Record<string, any>>> = {
  getStockFundamentals: async (params) => getStockFundamentals(params.symbol),
  getStockTechnical: async (params) => getStockTechnical(params.symbol),
  getStockNews: async (params, locale) => getStockNews(params.symbol, params.limit || 5, locale),
  getStockQuote: async (params) => getStockQuoteData(params.symbol),
  compareStocks: async (params) => compareStocks(params.symbol1, params.symbol2),
  getStockRecommendations: async (params) => getStockRecommendations(params.symbol),
  searchArticles: async (params, locale) => searchArticles(params.query, locale),
  summarizePage: async (params, locale) => summarizePage(params.pageUrl, locale),
  getMarketEvents: async (params, locale) => getMarketEvents(params.days || 3, params.importance, locale),
  searchByAsset: async (params, locale) => searchByAsset(params.symbol, params.limit || 8, locale),
  getForexMovers: async (params, locale) => getForexMovers(params.period || 'week', locale),

  // ─── NEW: Deep Database Knowledge Handlers ─────────────────
  dbSearch: async (params, locale) => {
    const types = params.types ? params.types.split(',').map((t: string) => t.trim()) : undefined;
    const results = await searchKnowledge(params.query, locale, { types: types as any, limit: params.limit || 15 });
    return {
      totalResults: results.length,
      results: results.map(r => ({
        source: r.source,
        sourceAr: r.sourceAr,
        type: r.type,
        title: locale === 'ar' && r.titleAr ? r.titleAr : r.title,
        summary: (locale === 'ar' && r.summaryAr ? r.summaryAr : r.summary)?.slice(0, 200),
        slug: r.slug,
        url: r.url,
        date: r.date,
        sentiment: r.sentiment,
        impactLevel: r.impactLevel,
        confidenceScore: r.confidenceScore,
        symbols: r.symbols,
      })),
    };
  },

  crossReference: async (params, locale) => {
    const xref = await crossReference(params.symbol, locale);
    const contextText = formatCrossReferenceAsContext(xref, locale);
    return {
      symbol: xref.symbol,
      totalResults: xref.totalResults,
      breakdown: {
        news: xref.news.length,
        analyses: xref.analyses.length,
        signals: xref.signals.length,
        reports: xref.reports.length,
        recommendations: xref.recommendations.length,
        infographics: xref.infographics.length,
        videos: xref.videos.length,
        events: xref.events.length,
        discussions: xref.discussions.length,
      },
      contextForAI: contextText,
    };
  },

  marketPulse: async (params, locale) => {
    const pulse = await fetchMarketPulse(locale);
    const contextText = formatMarketPulseAsContext(pulse, locale);
    const isSummary = params.detail !== 'full';
    return {
      sentiment: pulse.marketSentiment,
      topMovers: isSummary ? pulse.topMovers.slice(0, 5) : pulse.topMovers,
      activeSignals: isSummary ? pulse.activeSignals.slice(0, 3) : pulse.activeSignals,
      breakingNews: isSummary ? pulse.breakingNews.slice(0, 3) : pulse.breakingNews,
      upcomingEvents: isSummary ? pulse.upcomingEvents.slice(0, 3) : pulse.upcomingEvents,
      contextForAI: contextText,
    };
  },

  getMyRecommendations: async (params, locale, userId) => {
    if (!userId) {
      return { error: 'User not authenticated', recommendations: [] };
    }
    const where: any = { isDismissed: false, validUntil: { gte: new Date() }, userId };
    if (params.urgency) where.urgencyLevel = params.urgency;

    const recs = await db.personalizedRecommendation.findMany({
      where,
      select: {
        title: true, titleEn: true, recommendationType: true, summary: true, reasoning: true,
        action: true, confidenceScore: true, urgencyLevel: true, asset: true,
        entryPrice: true, targetPrice: true, stopLoss: true, timeHorizon: true,
        allocationPercent: true, validUntil: true, isRead: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      total: recs.length,
      recommendations: recs.map(r => ({
        title: locale === 'ar' ? r.title : (r.titleEn || r.title),
        type: r.recommendationType,
        action: r.action,
        asset: r.asset,
        confidence: r.confidenceScore,
        urgency: r.urgencyLevel,
        entry: r.entryPrice,
        target: r.targetPrice,
        stopLoss: r.stopLoss,
        timeHorizon: r.timeHorizon,
        reasoning: r.reasoning?.slice(0, 300),
      })),
    };
  },

  getCouncilBriefs: async (params, locale) => {
    const where: any = { reviewStatus: 'approved' };
    if (params.pair) where.pair = { contains: params.pair, mode: 'insensitive' };

    const briefs = await db.councilBrief.findMany({
      where,
      select: {
        pair: true, direction: true, entryPrice: true, stopLoss: true,
        takeProfit: true, confidence: true, timeframe: true,
        consensusJson: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      total: briefs.length,
      briefs: briefs.map(b => {
        let consensus: any = null;
        try { consensus = JSON.parse(b.consensusJson || 'null'); } catch { /* ignore */ }
        return {
          pair: b.pair,
          direction: b.direction,
          entry: b.entryPrice,
          stopLoss: b.stopLoss,
          takeProfit: b.takeProfit,
          confidence: b.confidence,
          timeframe: b.timeframe,
          consensus,
        };
      }),
    };
  },

  // ─── NEW: Active Signals from Database ────────────────────────
  getActiveSignals: async (params, locale) => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Broad status matching for resilience
    const activeWhere: any = {
      status: { in: ['ACTIVE', 'active', 'Active', 'PENDING', 'pending', 'VALID', 'valid', 'OPEN', 'open'] },
    };
    if (params.category) activeWhere.category = params.category;

    let signals = await db.tradingSignal.findMany({
      where: activeWhere,
      select: {
        pair: true, action: true, confidence: true, reason: true,
        entryPrice: true, stopLoss: true, takeProfit: true, riskReward: true,
        source: true, category: true, timeframe: true, status: true,
        rsiAtSignal: true, sma20AtSignal: true, sma50AtSignal: true,
        createdAt: true, expiresAt: true,
      },
      orderBy: { confidence: 'desc' },
      take: 20,
    });

    // Fallback: if no active signals, get recent signals from the past week
    if (signals.length === 0) {
      const recentWhere: any = { createdAt: { gte: weekAgo } };
      if (params.category) recentWhere.category = params.category;

      signals = await db.tradingSignal.findMany({
        where: recentWhere,
        select: {
          pair: true, action: true, confidence: true, reason: true,
          entryPrice: true, stopLoss: true, takeProfit: true, riskReward: true,
          source: true, category: true, timeframe: true, status: true,
          rsiAtSignal: true, sma20AtSignal: true, sma50AtSignal: true,
          createdAt: true, expiresAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 15,
      });
    }

    return {
      total: signals.length,
      isFallback: signals.length > 0 && !['ACTIVE', 'active', 'Active'].includes(signals[0]?.status || ''),
      signals: signals.map(s => ({
        pair: s.pair,
        action: s.action,
        confidence: s.confidence,
        reason: s.reason,
        entryPrice: s.entryPrice,
        stopLoss: s.stopLoss,
        takeProfit: s.takeProfit,
        riskReward: s.riskReward,
        source: s.source,
        category: s.category,
        timeframe: s.timeframe,
        status: s.status,
        rsi: s.rsiAtSignal,
        sma20: s.sma20AtSignal,
        sma50: s.sma50AtSignal,
        createdAt: s.createdAt?.toISOString(),
        expiresAt: s.expiresAt?.toISOString(),
      })),
    };
  },

  // ─── NEW: Latest Reports from Database ────────────────────────
  getLatestReports: async (params, locale) => {
    const where: any = { isPublished: true };
    if (params.reportType) where.reportType = params.reportType;
    const limit = params.limit || 5;

    const [economicReports, marketAnalyses] = await Promise.all([
      db.economicReport.findMany({
        where: { ...where, locale: { in: [locale, 'ar'] } },
        select: {
          title: true, slug: true, summary: true, reportType: true, scope: true,
          marketImpact: true, confidenceScore: true, createdAt: true, publishedAt: true,
        },
        orderBy: { publishedAt: 'desc' },
        take: limit,
      }),
      db.marketAnalysis.findMany({
        where: { isPublished: true, locale: { in: [locale, 'ar'] } },
        select: {
          title: true, slug: true, assetClass: true, analysisType: true,
          sentiment: true, confidenceScore: true, riskLevel: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ]);

    return {
      totalEconomicReports: economicReports.length,
      totalMarketAnalyses: marketAnalyses.length,
      economicReports: economicReports.map(r => ({
        title: r.title,
        slug: r.slug,
        summary: r.summary?.slice(0, 200),
        reportType: r.reportType,
        scope: r.scope,
        marketImpact: r.marketImpact,
        confidenceScore: r.confidenceScore,
        url: `/strategic-reports/${r.slug}`,
        date: r.publishedAt?.toISOString() || r.createdAt?.toISOString(),
      })),
      marketAnalyses: marketAnalyses.map(a => ({
        title: a.title,
        slug: a.slug,
        assetClass: a.assetClass,
        analysisType: a.analysisType,
        sentiment: a.sentiment,
        confidenceScore: a.confidenceScore,
        riskLevel: a.riskLevel,
        url: `/analysis/${a.slug}`,
        date: a.createdAt?.toISOString(),
      })),
    };
  },
};

// ─── Execute a Tool Call ───────────────────────────────────────

export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  data: Record<string, any>;
  error?: string;
}

export async function executeTool(
  toolName: string,
  params: Record<string, any>,
  locale: Locale = 'ar',
  userId?: string
): Promise<ToolExecutionResult> {
  // Validate tool exists
  const toolDef = getToolByName(toolName);
  if (!toolDef) {
    return {
      toolName,
      success: false,
      data: {},
      error: `Unknown tool: ${toolName}`,
    };
  }

  // Validate required parameters
  for (const param of toolDef.parameters) {
    if (param.required && !params[param.name]) {
      return {
        toolName,
        success: false,
        data: {},
        error: `Missing required parameter: ${param.name}`,
      };
    }
  }

  // Execute handler
  const handler = HANDLERS[toolDef.handler];
  if (!handler) {
    return {
      toolName,
      success: false,
      data: {},
      error: `No handler for tool: ${toolName}`,
    };
  }

  try {
    const data = await handler(params, locale, userId);
    return { toolName, success: true, data };
  } catch (error: any) {
    return {
      toolName,
      success: false,
      data: {},
      error: error.message || 'Tool execution failed',
    };
  }
}

// ─── Execute Multiple Tool Calls ───────────────────────────────

export async function executeTools(
  toolCalls: Array<{ tool: string; params: Record<string, any> }>,
  locale: Locale = 'ar',
  userId?: string
): Promise<ToolExecutionResult[]> {
  // Execute in parallel for better performance
  return Promise.all(
    toolCalls.map(tc => executeTool(tc.tool, tc.params, locale, userId))
  );
}

// ─── Format Tool Results for AI Prompt ─────────────────────────

export function formatToolResults(results: ToolExecutionResult[]): string {
  return results.map(r => {
    if (r.success) {
      return `[Tool: ${r.toolName}]\n${JSON.stringify(r.data, null, 2)}`;
    }
    return `[Tool: ${r.toolName} — ERROR: ${r.error}]`;
  }).join('\n\n');
}

// ─── Parse and Execute from AI Response ────────────────────────

/**
 * Checks if the AI response contains tool calls, executes them,
 * and returns the results formatted for a second AI call.
 * Returns null if no tool calls found.
 */
export async function processToolCalls(
  aiResponse: string,
  locale: Locale = 'ar',
  userId?: string
): Promise<{ results: ToolExecutionResult[]; formattedResults: string } | null> {
  const toolCall = parseToolCall(aiResponse);
  if (!toolCall) return null;

  const result = await executeTool(toolCall.tool, toolCall.params, locale, userId);
  const formattedResults = formatToolResults([result]);

  return { results: [result], formattedResults };
}
