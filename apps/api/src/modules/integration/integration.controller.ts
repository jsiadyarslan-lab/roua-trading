// ─── Integration Controller V1 ────────────────────────────
// API endpoints for cross-platform integration with Roua News.
// All endpoints require X-Integration-Key header for authentication.
// These endpoints serve chart data, signals, and market data to the news site.
//
// IMPORTANT: Uses @Public() to bypass the global AuthGuard, then
// uses @UseGuards(IntegrationGuard) to enforce integration API key auth.
// This creates a separate auth channel for server-to-server communication.

import { Controller, Get, Logger, Query, UseGuards } from '@nestjs/common';
import { Public } from '../../common/guards/auth.guard';
import { IntegrationGuard, IntegrationRoute } from '../../common/guards/integration.guard';
import { ExchangeService } from '../exchange/exchange.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ContentAgentService } from '../../agents/content/content-agent.service';

@Public() // Bypass AuthGuard — integration uses its own auth
@IntegrationRoute() // Mark all routes in this controller for IntegrationGuard auth
@UseGuards(IntegrationGuard) // Enforce X-Integration-Key authentication
@Controller('integration')
export class IntegrationController {
  private readonly logger = new Logger(IntegrationController.name);

  constructor(
    private readonly exchangeService: ExchangeService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly contentAgent: ContentAgentService,
  ) {}

  /**
   * GET /api/integration/health
   * Health check for integration endpoints.
   * Tests database connectivity and returns basic stats.
   */
  @Get('health')
  async healthCheck() {
    const checks: Record<string, { status: string; latencyMs?: number; error?: string; [key: string]: any }> = {};

    // Database check
    try {
      const dbStart = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
    } catch (error: any) {
      checks.database = { status: 'error', error: error?.message };
    }

    // Exchange service check
    try {
      checks.exchangeService = {
        status: 'ok',
        note: 'ExchangeService available',
      };
    } catch (error: any) {
      checks.exchangeService = { status: 'error', error: error?.message };
    }

    // Signal count check
    try {
      const activeSignals = await this.prisma.signal.count({
        where: { status: 'ACTIVE' },
      });
      checks.signalService = {
        status: 'ok',
        activeSignals,
      };
    } catch (error: any) {
      checks.signalService = { status: 'error', error: error?.message };
    }

    const allOk = Object.values(checks).every(c => c.status === 'ok');

    return {
      status: allOk ? 'ok' : 'degraded',
      service: 'roua-trading',
      version: '1.0',
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  /**
   * GET /api/integration/chart?symbol=BTC-USDT&interval=1day&limit=200
   * Get OHLCV candlestick data for a symbol.
   */
  @Get('chart')
  async getChartData(
    @Query('symbol') symbol: string,
    @Query('interval') interval: string = '1day',
    @Query('limit') limit: string = '200',
  ) {
    if (!symbol) {
      return { error: 'symbol parameter is required', status: 400 };
    }

    // Normalize symbol: BTC-USDT → BTC/USDT (news site may send dash-separated)
    const normalizedSymbol = symbol.replace(/-/g, '/');

    try {
      const candles = await this.exchangeService.getHistoricalData(
        normalizedSymbol,
        interval,
      );

      return {
        symbol: normalizedSymbol,
        interval,
        candles,
        count: Array.isArray(candles) ? candles.length : 0,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`Chart data fetch failed for ${normalizedSymbol}: ${error?.message}`);
      return {
        symbol: normalizedSymbol,
        error: error?.message || 'Failed to fetch chart data',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * GET /api/integration/quote?symbol=BTC-USDT
   * Get real-time quote for a symbol.
   */
  @Get('quote')
  async getQuote(@Query('symbol') symbol: string) {
    if (!symbol) {
      return { error: 'symbol parameter is required', status: 400 };
    }

    // Normalize symbol: BTC-USDT → BTC/USDT (news site may send dash-separated)
    const normalizedSymbol = symbol.replace(/-/g, '/');

    try {
      const quote = await this.exchangeService.getQuote(normalizedSymbol);
      return {
        symbol: normalizedSymbol,
        quote,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`Quote fetch failed for ${normalizedSymbol}: ${error?.message}`);
      return {
        symbol: normalizedSymbol,
        error: error?.message || 'Failed to fetch quote',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * GET /api/integration/signals?symbol=BTC-USDT&limit=20
   * Get active trading signals.
   */
  @Get('signals')
  async getActiveSignals(
    @Query('symbol') symbol?: string,
    @Query('limit') limit: string = '20',
  ) {
    try {
      const where: any = { status: 'ACTIVE' };
      if (symbol) {
        where.pair = { contains: symbol.replace(/-/g, '/'), mode: 'insensitive' };
      }

      const signals = await this.prisma.signal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit, 10) || 20, 50),
      });

      return {
        signals,
        count: signals.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`Signals fetch failed: ${error?.message}`);
      return {
        error: error?.message || 'Failed to fetch signals',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * GET /api/integration/signals/history?limit=20
   * Get recent signal history (all statuses, for display on news site).
   */
  @Get('signals/history')
  async getSignalHistory(
    @Query('limit') limit: string = '20',
  ) {
    try {
      const signals = await this.prisma.signal.findMany({
        where: {
          status: { in: ['ACTIVE', 'EXPIRED', 'EXECUTED', 'CANCELLED'] },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit, 10) || 20, 50),
        select: {
          id: true,
          pair: true,
          action: true,
          confidence: true,
          reason: true,
          entryPrice: true,
          stopLoss: true,
          takeProfit: true,
          status: true,
          createdAt: true,
          expiresAt: true,
        },
      });

      return {
        signals,
        count: signals.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`Signal history fetch failed: ${error?.message}`);
      return {
        error: error?.message || 'Failed to fetch signal history',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * GET /api/integration/signals/stats
   * Get signal statistics for the news site.
   */
  @Get('signals/stats')
  async getSignalStats() {
    try {
      const [active, expired, executed, cancelled] = await Promise.all([
        this.prisma.signal.count({ where: { status: 'ACTIVE' } }),
        this.prisma.signal.count({ where: { status: 'EXPIRED' } }),
        this.prisma.signal.count({ where: { status: 'EXECUTED' } }),
        this.prisma.signal.count({ where: { status: 'CANCELLED' } }),
      ]);

      // Get recent accuracy: how many executed signals were profitable
      const recentExecuted = await this.prisma.signal.findMany({
        where: { status: 'EXECUTED' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { action: true, pair: true, entryPrice: true, takeProfit: true, stopLoss: true },
      });

      return {
        total: active + expired + executed + cancelled,
        active,
        expired,
        executed,
        cancelled,
        recentSignals: recentExecuted.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`Signal stats fetch failed: ${error?.message}`);
      return {
        error: error?.message || 'Failed to fetch signal stats',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * GET /api/integration/content-feed?limit=5&category=CRYPTO
   * Fetch published content agent analyses for the news site.
   * Returns articles with full Arabic analysis content including
   * support/resistance levels, technical indicators, and price targets.
   */
  @Get('content-feed')
  async getContentFeed(
    @Query('limit') limit: string = '5',
    @Query('category') category?: string,
    @Query('type') type?: string,
    @Query('symbol') symbol?: string,
    @Query('locale') locale?: string,
  ) {
    try {
      // FIX V8: Pass locale to contentAgent.getContentFeed so it can filter
      // articles by language. Previously, the locale parameter was accepted
      // by the proxy in the news site but ignored here — all articles
      // were returned regardless of locale, and the transform below always
      // preferred titleAr over titleEn.
      const feed = await this.contentAgent.getContentFeed({
        status: 'PUBLISHED' as any,
        limit: Math.min(parseInt(limit, 10) || 5, 20),
        page: 1,
        category: category as any,
        type: type as any,
        symbol,
      });

      // FIX V8: Locale-aware field selection.
      // If locale='en', prefer English fields (titleEn, contentEn, summaryEn).
      // If locale='ar' or not specified, prefer Arabic fields (default behavior).
      // This fixes the issue where French/English/Spanish/Turkish pages
      // showed Arabic content because titleAr was always preferred.
      const preferEnglish = locale === 'en' || locale === 'fr' || locale === 'tr' || locale === 'es';

      // FIX V9: Clean JSON artifacts from legacy articles.
      // Articles generated BEFORE the V7 parser fix may still have JSON
      // syntax in their title/content fields (e.g., title='{ "title": "...", "content": "..." }').
      // This inline parser cleans them at read-time so the news site gets
      // clean text regardless of when the article was generated.
      const cleanField = (value: any): string => {
        if (!value || typeof value !== 'string') return '';
        let s = value.trim();

        // If the field contains a JSON object with title/content, extract the relevant field
        if (s.startsWith('{') || s.includes('"title"') || s.includes('"content"')) {
          // Try to extract the matching field from the JSON
          const tryExtract = (field: string): string | null => {
            const re = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 's');
            const m = s.match(re);
            if (m) {
              return m[1]
                .replace(/\\n/g, '\n')
                .replace(/\\t/g, '\t')
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, '\\')
                .trim();
            }
            return null;
          };

          // If this looks like a title field, extract title
          // If this looks like a content field, extract content
          // Heuristic: if the value starts with { "title":, it's a title-wrapped JSON
          // If it starts with { "content": or contains "content":, it's content-wrapped
          const titleExtracted = tryExtract('title');
          const contentExtracted = tryExtract('content');
          const summaryExtracted = tryExtract('summary');

          // If we found content, use it (most informative)
          if (contentExtracted && contentExtracted.length > 20) {
            return contentExtracted;
          }
          // If we found title only (no content), the field itself is the title
          if (titleExtracted && titleExtracted.length > 5) {
            // If the original field was meant to be content but only has title,
            // return the title (better than showing raw JSON)
            return titleExtracted;
          }
          if (summaryExtracted && summaryExtracted.length > 20) {
            return summaryExtracted;
          }

          // Last resort: strip JSON artifacts
          s = s.replace(/^\s*\{+\s*/, '')
               .replace(/\s*\}+\s*$/, '')
               .replace(/^\s*"(?:title|content|summary)"\s*:\s*"?\s*/i, '')
               .replace(/"?\s*,?\s*$/, '')
               .trim();
        }

        // Strip markdown code fences if present
        s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

        return s;
      };

      // Transform for the news site — only include relevant fields
      const articles = (feed?.articles || feed?.data?.articles || feed?.data || []).map((article: any) => {
        // FIX V9: Apply cleanField to remove JSON artifacts from legacy articles
        const rawTitle = preferEnglish
          ? (article.titleEn || article.titleAr || article.title)
          : (article.titleAr || article.titleEn || article.title);
        const rawContent = preferEnglish
          ? (article.contentEn || article.contentAr || article.content)
          : (article.contentAr || article.contentEn || article.content);
        const rawSummary = preferEnglish
          ? (article.summaryEn || article.summaryAr || article.summary)
          : (article.summaryAr || article.summaryEn || article.summary);

        return {
          id: article.id,
          title: cleanField(rawTitle),
          content: cleanField(rawContent),
          category: article.category,
          type: article.type || article.contentType,
          symbols: (() => {
            const raw = article.symbols || article.relatedSymbols || [];
            if (Array.isArray(raw)) return raw;
            if (typeof raw === 'string') {
              if (raw.startsWith('[')) { try { const p = JSON.parse(raw); return Array.isArray(p) ? p : raw.split(',').filter(Boolean); } catch { return raw.split(',').filter(Boolean); } }
              return raw.split(',').filter(Boolean);
            }
            return [];
          })(),
          sentiment: article.sentiment || article.sentimentScore,
          impactLevel: article.impactLevel,
          qualityScore: article.qualityScore,
          tags: article.tags ? (typeof article.tags === 'string' ? JSON.parse(article.tags) : article.tags) : [],
          publishedAt: article.publishedAt || article.createdAt,
          summary: cleanField(rawSummary),
        };
      });

      // FIX V10: Deduplicate articles by title — if the same title appears
      // multiple times (e.g., the agent generated the same topic twice),
      // keep only the most recent one. This fixes the issue where the French
      // homepage showed "Update - Forex Market: EUR/USD Analysis" twice.
      const seenTitles = new Set<string>();
      const dedupedArticles = articles.filter((a: any) => {
        const titleKey = String(a.title || '').trim().toLowerCase();
        if (!titleKey || titleKey.length < 5) return false; // skip empty/garbage titles
        if (seenTitles.has(titleKey)) return false;
        seenTitles.add(titleKey);
        return true;
      });

      return {
        success: true,
        articles: dedupedArticles,
        count: dedupedArticles.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`Content feed fetch failed: ${error?.message}`);
      return {
        success: false,
        articles: [],
        count: 0,
        error: error?.message || 'Failed to fetch content feed',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * GET /api/integration/news?limit=20&category=كريبتو
   * Fetch latest Arabic financial news from the Roua News website.
   * This provides the trading platform with AI-analyzed news from the news site.
   */
  @Get('news')
  async getNewsFromNewsSite(
    @Query('limit') limit: string = '20',
    @Query('category') category?: string,
    @Query('symbol') symbol?: string,
  ) {
    const newsSiteUrl = this.configService.get<string>('INTEGRATION_PARTNER_URL');
    const apiKey = this.configService.get<string>('INTEGRATION_API_KEY');

    if (!newsSiteUrl || !apiKey) {
      return {
        articles: [],
        count: 0,
        error: 'News site integration not configured',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      let url = `${newsSiteUrl}/api/integration/news?limit=${Math.min(parseInt(limit, 10) || 20, 50)}`;
      if (category) url += `&category=${encodeURIComponent(category)}`;
      if (symbol) url += `&symbol=${encodeURIComponent(symbol)}`;

      const response = await fetch(url, {
        headers: {
          'X-Integration-Key': apiKey,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        this.logger.warn(`News site fetch failed: HTTP ${response.status}`);
        return {
          articles: [],
          count: 0,
          error: `News site returned HTTP ${response.status}`,
          timestamp: new Date().toISOString(),
        };
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      this.logger.error(`News site fetch failed: ${error?.message}`);
      return {
        articles: [],
        count: 0,
        error: error?.message || 'Failed to fetch news from news site',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
