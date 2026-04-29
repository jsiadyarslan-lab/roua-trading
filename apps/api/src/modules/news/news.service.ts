import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AIOrchestratorService } from '../ai/services/ai-orchestrator.service';

interface NewsFilter {
  symbol?: string;
  sentiment?: string;
  category?: string;
  limit?: number;
}

interface RawNewsItem {
  title: string;
  description?: string;
  link?: string;
  publishedAt?: string;
  source: string;
  category?: string;
  imageUrl?: string;
}

/**
 * News Service — Roua Trading (رؤى)
 *
 * Handles:
 * 1. Fetching news from multiple RSS/API sources
 * 2. Translating titles and content to Arabic via AI models
 * 3. Analyzing sentiment and market impact using AI Council
 * 4. Storing analyzed news in database
 * 5. Scheduled periodic fetching (every 15 minutes)
 */
@Injectable()
export class NewsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NewsService.name);
  private fetchInterval: NodeJS.Timeout | null = null;
  private isFetchingNews = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiOrchestrator: AIOrchestratorService,
  ) {
    this.logger.log('📰 News Service initialized');
  }

  async onModuleInit() {
    // Start periodic news fetching every 15 minutes
    this.startScheduledFetching();
    // Defer initial fetch — don't block app startup with AI analysis
    // This prevents the 45s+ startup delay that blocks all API routes
    setTimeout(() => {
      this._scheduledFetch();
    }, 5000); // Wait 5s after startup before fetching
  }

  async onModuleDestroy() {
    if (this.fetchInterval) {
      clearInterval(this.fetchInterval);
      this.fetchInterval = null;
    }
  }

  /**
   * Start scheduled fetching every 15 minutes
   */
  private startScheduledFetching() {
    const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
    this.fetchInterval = setInterval(() => {
      this._scheduledFetch();
    }, INTERVAL_MS);
    this.logger.log('⏰ Scheduled news fetching every 15 minutes');
  }

  /**
   * Scheduled fetch wrapper with overlap protection.
   * Prevents concurrent fetches if the previous cycle is still running.
   */
  private async _scheduledFetch() {
    if (this.isFetchingNews) {
      this.logger.warn('📰 News fetch already in progress, skipping');
      return;
    }
    this.isFetchingNews = true;
    try {
      await this.fetchAndAnalyzeNews();
    } catch (error: any) {
      this.logger.error(`Scheduled fetch failed: ${error.message}`);
    } finally {
      this.isFetchingNews = false;
    }
  }

  /**
   * Get latest news with filtering
   */
  async getLatestNews(filter: NewsFilter) {
    const where: any = {};

    if (filter.sentiment) {
      where.sentimentLabel = filter.sentiment;
    }

    if (filter.category) {
      where.category = filter.category;
    }

    if (filter.symbol) {
      // Search in affectedAssets JSON array
      where.affectedAssets = { contains: filter.symbol };
    }

    try {
      return await this.prisma.newsArticle.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        take: filter.limit || 20,
      });
    } catch (error: any) {
      this.logger.error(`DB query failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Analyze a news text manually using AI Council
   */
  async analyzeNewsText(text: string, symbol?: string) {
    // Step 1: Translate to Arabic
    const translationResult = await this.aiOrchestrator.analyze({
      symbol: symbol || 'GENERAL',
      prompt: `ترجم النص التالي إلى العربية بشكل احترافي ومختصر مع الحفاظ على المعنى الدقيق:\n\n${text}`,
      type: 'general',
      language: 'ar',
    });

    const translatedText = translationResult.content || text;

    // Step 2: Analyze sentiment and impact
    const sentimentResult = await this.aiOrchestrator.analyze({
      symbol: symbol || 'GENERAL',
      prompt: `حلل الخبر التالي من منظور تداول العملات الرقمية والأسواق المالية. أجب بصيغة JSON فقط بالشكل التالي:
{"sentiment": "positive/negative/neutral", "sentimentScore": 0.8, "impactLevel": "high/medium/low", "affectedAssets": ["BTC", "ETH"], "summary": "ملخص عربي مختصر", "marketImpact": "وصف تأثير الخبر على السوق"}

الخبر:\n${text}`,
      type: 'sentiment',
      language: 'ar',
    });

    let analysisData: any = {
      sentiment: 'neutral',
      sentimentScore: 0,
      impactLevel: 'medium',
      affectedAssets: [],
      summary: '',
      marketImpact: '',
    };

    try {
      // Try to extract JSON from the response
      const content = sentimentResult.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisData = { ...analysisData, ...JSON.parse(jsonMatch[0]) };
      }
    } catch {
      // Fallback: use text-based parsing
      const content = (sentimentResult.content || '').toLowerCase();
      if (content.includes('إيجابي') || content.includes('positive') || content.includes('صعود')) {
        analysisData.sentiment = 'positive';
        analysisData.sentimentScore = 0.6;
      } else if (content.includes('سلبي') || content.includes('negative') || content.includes('هبوط')) {
        analysisData.sentiment = 'negative';
        analysisData.sentimentScore = -0.6;
      }
    }

    // Step 3: Get comprehensive analysis from all models
    let fullAnalysis = '';
    try {
      const multiModel = await this.aiOrchestrator.analyzeWithAllModels({
        symbol: symbol || 'GENERAL',
        prompt: `حلل الخبر التالي من منظور التداول وأعطِ توصية واضحة:\n${text}`,
        type: 'market_analysis',
        language: 'ar',
      });
      fullAnalysis = JSON.stringify(
        multiModel.analyses.map((a) => ({
          model: a.model,
          content: a.content?.substring(0, 500),
          confidence: a.confidence,
        })),
      );
    } catch {
      fullAnalysis = sentimentResult.content || '';
    }

    return {
      originalText: text,
      translatedText,
      analysis: analysisData,
      aiAnalysis: fullAnalysis,
      model: sentimentResult.model,
      confidence: sentimentResult.confidence,
    };
  }

  /**
   * Fetch news from multiple sources and analyze them
   */
  async fetchAndAnalyzeNews() {
    this.logger.log('📰 Starting news fetch and analysis...');

    const rawNews = await this._fetchAllSources();

    if (rawNews.length === 0) {
      this.logger.warn('No news fetched from any source');
      return;
    }

    this.logger.log(`📰 Fetched ${rawNews.length} raw news items`);

    // Process news items in batches with concurrency limit
    await this._processNewsBatch(rawNews.slice(0, 20), 3);
  }

  /**
   * Process news items in batches with concurrency limit
   * Duplicate check happens BEFORE AI calls to avoid wasted work
   */
  private async _processNewsBatch(items: RawNewsItem[], concurrency: number = 3): Promise<void> {
    let processed = 0;

    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);

      const results = await Promise.allSettled(batch.map(async (item) => {
        try {
          // Check duplicate FIRST before AI calls
          const existing = await this.prisma.newsArticle.findFirst({
            where: {
              OR: [
                { url: item.link || undefined },
                { title: item.title },
              ],
            },
          });

          if (existing) return; // Skip — already processed

          // FIX: Merge translation + sentiment into ONE AI call instead of 2-3.
          // Previously: translateTitle (1 call) + translateDescription (1 call) + sentiment (1 call) = 2-3 calls
          // Now: single combined prompt handles translation AND sentiment analysis together.
          const combinedResult = await this._translateAndAnalyze(
            item.title,
            item.description,
            item.category,
          );

          // Map category to Arabic
          const categoryAr = this._mapCategoryToArabic(item.category || 'General');

          // Store in database
          await this.prisma.newsArticle.create({
            data: {
              source: item.source,
              title: item.title,
              translatedTitle: combinedResult.translatedTitle,
              content: item.description || '',
              translatedContent: combinedResult.translatedContent || item.description || '',
              summary: combinedResult.summary || '',
              url: item.link || null,
              sentiment: combinedResult.sentimentScore || 0,
              sentimentLabel: combinedResult.sentiment || 'neutral',
              impactLevel: combinedResult.impactLevel || 'medium',
              affectedAssets: JSON.stringify(combinedResult.affectedAssets || []),
              category: item.category || 'General',
              categoryAr,
              aiAnalysis: combinedResult.fullAnalysis || '',
              imageUrl: item.imageUrl || null,
              publishedAt: item.publishedAt
                ? new Date(item.publishedAt)
                : new Date(),
            },
          });

          processed++;
        } catch (error: any) {
          this.logger.warn(`Failed to process news item: ${error.message}`);
        }
      }));

      // Delay between batches to avoid overwhelming AI services
      if (i + concurrency < items.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    this.logger.log(`📰 Processed and stored ${processed} new articles`);
  }

  /**
   * Generic concurrency-limited batch processor.
   * Processes items in batches of `concurrency` size, collecting
   * fulfilled results and silently dropping rejected ones.
   */
  private async _processBatch<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    concurrency: number = 3,
  ): Promise<R[]> {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(batch.map(processor));
      for (const result of batchResults) {
        if (result.status === 'fulfilled') results.push(result.value);
      }
    }
    return results;
  }

  // ── Private Methods ──

  /**
   * Fetch news from all configured sources
   */
  private async _fetchAllSources(): Promise<RawNewsItem[]> {
    const [ctResult, cpResult, cdResult] = await Promise.allSettled([
      this._fetchCoinTelegraph(),
      this._fetchCryptoPanic(),
      this._fetchCoinDesk(),
    ]);

    const ctNews = ctResult.status === 'fulfilled' ? ctResult.value : [];
    const cpNews = cpResult.status === 'fulfilled' ? cpResult.value : [];
    const cdNews = cdResult.status === 'fulfilled' ? cdResult.value : [];

    if (ctResult.status === 'rejected') {
      this.logger.warn(`CoinTelegraph fetch failed: ${ctResult.reason?.message || ctResult.reason}`);
    }
    if (cpResult.status === 'rejected') {
      this.logger.warn(`CryptoPanic fetch failed: ${cpResult.reason?.message || cpResult.reason}`);
    }
    if (cdResult.status === 'rejected') {
      this.logger.warn(`CoinDesk fetch failed: ${cdResult.reason?.message || cdResult.reason}`);
    }

    const allNews = [...ctNews, ...cpNews, ...cdNews];

    // Deduplicate by title
    const seen = new Set<string>();
    return allNews.filter((item) => {
      const key = item.title.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Fetch from CoinTelegraph RSS
   */
  private async _fetchCoinTelegraph(): Promise<RawNewsItem[]> {
    const res = await fetch('https://cointelegraph.com/rss', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RouaTradingBot/1.0)',
      },
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();

    const items: RawNewsItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && items.length < 15) {
      const content = match[1];
      const titleMatch =
        /<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(content) ||
        /<title>(.*?)<\/title>/.exec(content);
      const descMatch =
        /<description><!\[CDATA\[(.*?)\]\]><\/description>/.exec(content) ||
        /<description>(.*?)<\/description>/.exec(content);
      const linkMatch = /<link>(.*?)<\/link>/.exec(content);
      const pubDateMatch = /<pubDate>(.*?)<\/pubDate>/.exec(content);
      const categoryMatch =
        /<category><!\[CDATA\[(.*?)\]\]><\/category>/.exec(content) ||
        /<category>(.*?)<\/category>/.exec(content);

      if (titleMatch) {
        items.push({
          title: titleMatch[1].trim(),
          description: descMatch ? descMatch[1].trim().replace(/<[^>]*>/g, '') : undefined,
          link: linkMatch ? linkMatch[1].trim() : undefined,
          publishedAt: pubDateMatch ? pubDateMatch[1].trim() : undefined,
          source: 'CoinTelegraph',
          category: categoryMatch ? categoryMatch[1].trim() : 'Crypto',
        });
      }
    }

    return items;
  }

  /**
   * Fetch from CryptoPanic API
   */
  private async _fetchCryptoPanic(): Promise<RawNewsItem[]> {
    const apiKey = process.env.CRYPTOPANIC_API_KEY;
    // CryptoPanic API v1 requires auth_token for all requests.
    // Without an API key, skip CryptoPanic entirely (it returns 401/403).
    // The platform still gets news from CoinTelegraph and CoinDesk RSS feeds.
    if (!apiKey) {
      this.logger.warn('CRYPTOPANIC_API_KEY not set — skipping CryptoPanic fetch');
      return [];
    }

    const url = `https://cryptopanic.com/api/v1/posts/?auth_token=${apiKey}&currencies=BTC,ETH,SOL&kind=news&filter=hot`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'RouaTradingBot/1.0' },
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (!data.results || !Array.isArray(data.results)) return [];

    return data.results.slice(0, 15).map((item: any) => ({
      title: item.title || '',
      description: item.title || '',
      link: item.url || undefined,
      publishedAt: item.published_at || undefined,
      source: item.source?.domain || 'CryptoPanic',
      category: item.currencies?.[0] || 'Crypto',
    }));
  }

  /**
   * Fetch from CoinDesk RSS
   */
  private async _fetchCoinDesk(): Promise<RawNewsItem[]> {
    const res = await fetch('https://www.coindesk.com/arc/outboundfeeds/rss/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RouaTradingBot/1.0)',
      },
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();

    const items: RawNewsItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && items.length < 10) {
      const content = match[1];
      const titleMatch = /<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(content) ||
        /<title>(.*?)<\/title>/.exec(content);
      const linkMatch = /<link>(.*?)<\/link>/.exec(content);
      const pubDateMatch = /<pubDate>(.*?)<\/pubDate>/.exec(content);

      if (titleMatch) {
        items.push({
          title: titleMatch[1].trim(),
          link: linkMatch ? linkMatch[1].trim() : undefined,
          publishedAt: pubDateMatch ? pubDateMatch[1].trim() : undefined,
          source: 'CoinDesk',
          category: 'Crypto',
        });
      }
    }

    return items;
  }

  /**
   * Translate text to Arabic using AI models
   */
  private async _translateToArabic(text: string): Promise<string> {
    try {
      const result = await this.aiOrchestrator.analyze({
        symbol: 'TRANSLATE',
        prompt: `ترجم العنوان التالي إلى العربية فقط (بدون أي شرح إضافي):\n${text}`,
        type: 'general',
        language: 'ar',
      });

      return result.content || text;
    } catch {
      return text;
    }
  }

  /**
   * FIX: Combined translation + sentiment analysis in ONE AI call.
   * Previously, each news item required 2-3 AI calls:
   *   translateTitle (1) + translateDescription (1) + sentiment (1) = 2-3 calls
   * This merged function does both in a single call, cutting AI usage by 50-66%.
   */
  private async _translateAndAnalyze(
    title: string,
    description: string | undefined,
    category?: string,
  ): Promise<{
    translatedTitle: string;
    translatedContent: string;
    sentiment: string;
    sentimentScore: number;
    impactLevel: string;
    affectedAssets: string[];
    summary: string;
    fullAnalysis: string;
  }> {
    const defaultResult = {
      translatedTitle: title,
      translatedContent: description || '',
      sentiment: 'neutral',
      sentimentScore: 0,
      impactLevel: 'medium',
      affectedAssets: [] as string[],
      summary: '',
      fullAnalysis: '',
    };

    const fullText = title + (description ? '. ' + description : '');

    try {
      const result = await this.aiOrchestrator.analyze({
        symbol: 'NEWS',
        prompt: `أنت محلل أخبار مالية. حلل الخبر التالي وأجب بصيغة JSON فقط بدون أي نص آخر:
{"translatedTitle": "العنوان المترجم للعربية", "translatedContent": "المحتوى المترجم للعربية", "sentiment": "positive أو negative أو neutral", "sentimentScore": رقم بين -1 و 1, "impactLevel": "high أو medium أو low", "affectedAssets": ["BTC", "ETH"], "summary": "ملخص عربي في جملة واحدة"}

الخبر: ${fullText.substring(0, 1500)}`,
        type: 'sentiment',
        language: 'ar',
      });

      const content = result.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return { ...defaultResult, ...parsed, fullAnalysis: content };
        } catch {
          // JSON parse failed, use heuristics
        }
      }

      // Fallback: heuristic analysis with simple translation
      return this._heuristicSentiment(fullText, defaultResult);
    } catch (error: any) {
      this.logger.warn(`Combined translation+sentiment analysis failed: ${error.message}`);
      return this._heuristicSentiment(fullText, defaultResult);
    }
  }

  /**
   * Analyze sentiment of news text
   */
  private async _analyzeSentiment(
    text: string,
    category?: string,
  ): Promise<{
    sentiment: string;
    sentimentScore: number;
    impactLevel: string;
    affectedAssets: string[];
    summary: string;
    fullAnalysis: string;
  }> {
    const defaultResult = {
      sentiment: 'neutral',
      sentimentScore: 0,
      impactLevel: 'medium',
      affectedAssets: [] as string[],
      summary: '',
      fullAnalysis: '',
    };

    try {
      // Use Groq for fast sentiment analysis
      const result = await this.aiOrchestrator.analyze({
        symbol: 'NEWS',
        prompt: `حلل الخبر المالي التالي وأجب بصيغة JSON فقط بدون أي نص آخر:
{"sentiment": "positive أو negative أو neutral", "sentimentScore": رقم بين -1 و 1, "impactLevel": "high أو medium أو low", "affectedAssets": ["BTC", "ETH"], "summary": "ملخص عربي في جملة واحدة"}

الخبر: ${text.substring(0, 1000)}`,
        type: 'sentiment',
        language: 'ar',
      });

      const content = result.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return { ...defaultResult, ...parsed, fullAnalysis: content };
        } catch {
          // JSON parse failed, use heuristics
        }
      }

      // Fallback: heuristic analysis
      return this._heuristicSentiment(text, defaultResult);
    } catch (error: any) {
      this.logger.warn(`AI sentiment analysis failed: ${error.message}`);
      return this._heuristicSentiment(text, defaultResult);
    }
  }

  /**
   * Heuristic-based sentiment analysis (fallback)
   */
  private _heuristicSentiment(
    text: string,
    defaultResult: any,
  ) {
    const lower = text.toLowerCase();
    let score = 0;
    const assets: string[] = [];

    // Positive keywords
    const positiveWords = ['surge', 'rally', 'bull', 'gain', 'rise', 'soar', 'jump', 'upgrade', 'adopt', 'approval', 'breakthrough', 'صعود', 'ارتفاع', 'إيجابي'];
    const negativeWords = ['crash', 'dump', 'bear', 'fall', 'drop', 'decline', 'hack', 'ban', 'regulate', 'risk', 'loss', 'هبوط', 'انخفاض', 'سلبي', 'حظر'];

    for (const word of positiveWords) {
      if (lower.includes(word)) score += 0.15;
    }
    for (const word of negativeWords) {
      if (lower.includes(word)) score -= 0.15;
    }

    // Detect affected assets
    const assetPatterns = [
      { pattern: /\bbtc\b|\bbitcoin\b/i, asset: 'BTC' },
      { pattern: /\beth\b|\bethereum\b/i, asset: 'ETH' },
      { pattern: /\bsol\b|\bsolana\b/i, asset: 'SOL' },
      { pattern: /\bxrp\b/i, asset: 'XRP' },
      { pattern: /\bada\b/i, asset: 'ADA' },
      { pattern: /\bbnb\b/i, asset: 'BNB' },
    ];

    for (const { pattern, asset } of assetPatterns) {
      if (pattern.test(lower)) assets.push(asset);
    }

    const sentimentScore = Math.max(-1, Math.min(1, score));
    let sentiment = 'neutral';
    if (sentimentScore > 0.2) sentiment = 'positive';
    else if (sentimentScore < -0.2) sentiment = 'negative';

    return {
      ...defaultResult,
      sentiment,
      sentimentScore,
      impactLevel: Math.abs(sentimentScore) > 0.4 ? 'high' : 'medium',
      affectedAssets: assets,
      summary: '',
    };
  }

  /**
   * Map English category to Arabic
   */
  private _mapCategoryToArabic(category: string): string {
    const lower = category.toLowerCase();
    if (lower.includes('bitcoin') || lower.includes('crypto')) return 'كريبتو';
    if (lower.includes('market') || lower.includes('stock')) return 'أسهم';
    if (lower.includes('regulation') || lower.includes('policy')) return 'تنظيم';
    if (lower.includes('economy') || lower.includes('macro')) return 'اقتصاد';
    if (lower.includes('etf') || lower.includes('fund')) return 'صناديق';
    if (lower.includes('forex') || lower.includes('currency')) return 'فوركس';
    if (lower.includes('oil') || lower.includes('energy')) return 'طاقة';
    if (lower.includes('gold') || lower.includes('metal')) return 'معادن';
    if (lower.includes('tech') || lower.includes('ai')) return 'تقنية';
    return 'أسواق';
  }
}
