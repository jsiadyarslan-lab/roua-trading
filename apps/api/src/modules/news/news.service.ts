import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AIOrchestratorService } from '../ai/services/ai-orchestrator.service';
import { t } from '../../i18n/i18n.helper';

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
  sentiment?: number;
  impactLevel?: string;
  affectedAssets?: string;
}

/**
 * News Service — Roua Trading (رؤى)
 *
 * Handles:
 * 1. Fetching news from multiple RSS/API sources
 * 2. Translating titles and content to Arabic via AI models
 * 3. Analyzing sentiment and market impact using AI Council
 * 4. Storing analyzed news in database
 * 5. Scheduled periodic fetching (every 30 minutes)
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
   * Start scheduled fetching every 30 minutes
   *
   * FIX: Changed from 15→30 minutes to reduce AI consumption.
   * News articles don't change that frequently — 30 min is sufficient
   * and cuts AI API calls by 50% (was 96 calls/day, now 48).
   */
  private startScheduledFetching() {
    const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
    this.fetchInterval = setInterval(() => {
      this._scheduledFetch();
    }, INTERVAL_MS);
    this.logger.log('⏰ Scheduled news fetching every 30 minutes');
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
      this.logger.error(`DB query failed: ${error.message}`, error.stack);
      // FIX: Previously returned [] which masked database failures.
      // Now throw so the client gets a proper 500 error instead of
      // silently showing "no news" when the DB is actually down.
      throw new Error(t('news_service.failure', { message: error.message }));
    }
  }

  /**
   * Analyze a news text manually using AI
   *
   * FIX: Previously this method made 3 separate AI calls:
   *   1. Translate (1 call)
   *   2. Sentiment analysis (1 call)
   *   3. Multi-model analysis with all 6 AI models (6 calls!)
   * Total: 8 AI calls per manual analysis — extremely wasteful.
   *
   * Now merged into a single combined prompt that handles translation,
   * sentiment analysis, AND trading recommendation in ONE AI call.
   * Multi-model analysis was removed — it's overkill for a manual
   * news analysis endpoint that already has rate limiting (5/min).
   * This reduces AI calls from 8 → 1 per request (87.5% reduction).
   */
  async analyzeNewsText(text: string, symbol?: string, language: string = 'ar') {
    // V267: language parameter controls output locale (ar/en/30 other locales)
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
      ? `\n\n🌐 LANGUAGE DIRECTIVE: Respond ONLY in ${LANGUAGE_NAMES[normalizedLang] || 'English'}. All field values MUST be in ${LANGUAGE_NAMES[normalizedLang] || 'English'}.`
      : '';
    // Single combined prompt: translation + sentiment + trading recommendation
    const result = await this.aiOrchestrator.analyze({
      symbol: symbol || 'GENERAL',
      prompt: isArabic
        ? `أنت محلل أخبار مالية محترف. حلل الخبر التالي وأجب بصيغة JSON فقط بدون أي نص آخر:
{"translatedTitle": "العنوان المترجم للعربية", "translatedContent": "المحتوى المترجم للعربية", "sentiment": "positive أو negative أو neutral", "sentimentScore": رقم بين -1 و 1, "impactLevel": "high أو medium أو low", "affectedAssets": ["BTC", "ETH"], "summary": "ملخص عربي مختصر في جملة واحدة", "marketImpact": "وصف تأثير الخبر على السوق", "recommendation": "توصية تداول واضحة مع مستوى الدخول والوقف"}

الخبر: ${text.substring(0, 2000)}`
        : `${languageDirective}
You are a professional financial news analyst. Analyze the following news and respond ONLY in JSON format with no other text:
{"translatedTitle": "title translated to ${LANGUAGE_NAMES[normalizedLang] || 'English'}", "translatedContent": "content translated to ${LANGUAGE_NAMES[normalizedLang] || 'English'}", "sentiment": "positive or negative or neutral", "sentimentScore": number between -1 and 1, "impactLevel": "high or medium or low", "affectedAssets": ["BTC", "ETH"], "summary": "one-sentence summary in ${LANGUAGE_NAMES[normalizedLang] || 'English'}", "marketImpact": "market impact description", "recommendation": "clear trading recommendation with entry and stop levels"}

News: ${text.substring(0, 2000)}`,
      type: 'sentiment',
      language: isArabic ? 'ar' : 'en',
    });

    const content = result.content || '';
    let analysisData: any = {
      translatedTitle: text.substring(0, 100),
      translatedContent: '',
      sentiment: 'neutral',
      sentimentScore: 0,
      impactLevel: 'medium',
      affectedAssets: [],
      summary: '',
      marketImpact: '',
      recommendation: '',
    };

    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisData = { ...analysisData, ...JSON.parse(jsonMatch[0]) };
      }
    } catch {
      // Fallback: use text-based heuristic parsing
      const lower = content.toLowerCase();
      if (lower.includes('إيجابي') || lower.includes('positive') || lower.includes('صعود')) {
        analysisData.sentiment = 'positive';
        analysisData.sentimentScore = 0.6;
      } else if (lower.includes('سلبي') || lower.includes('negative') || lower.includes('هبوط')) {
        analysisData.sentiment = 'negative';
        analysisData.sentimentScore = -0.6;
      }
      // Use the raw AI content as translated text if JSON parsing failed
      analysisData.translatedContent = content;
    }

    return {
      originalText: text,
      translatedText: analysisData.translatedContent || analysisData.translatedTitle || text,
      analysis: {
        sentiment: analysisData.sentiment,
        sentimentScore: analysisData.sentimentScore,
        impactLevel: analysisData.impactLevel,
        affectedAssets: analysisData.affectedAssets,
        summary: analysisData.summary,
        marketImpact: analysisData.marketImpact,
        recommendation: analysisData.recommendation,
      },
      aiAnalysis: content,
      model: result.model,
      confidence: result.confidence,
    };
  }

  /**
   * Fetch news from multiple sources and analyze them
   */
  async fetchAndAnalyzeNews() {
    // SUSTAINABLE FIX: Skip if DB not available.
    // Each prisma query on an unavailable DB creates a new connection pool,
    // leaking PostgreSQL connection slots and causing cascading failures.
    if (!this.prisma?.isAvailable?.()) {
      this.logger.warn('📰 Skipping news fetch — DB not yet available');
      return;
    }

    this.logger.log('📰 Starting news fetch and analysis...');

    const rawNews = await this._fetchAllSources();

    if (rawNews.length === 0) {
      this.logger.warn('No news fetched from any source');
      return;
    }

    this.logger.log(`📰 Fetched ${rawNews.length} raw news items`);

    // FIX: Reduced from 20→5 articles per cycle to cut AI consumption.
    // Each article requires 1 AI call (combined translation+sentiment).
    // At 5 articles every 30 min = ~240 AI calls/day (was 1920/day with 20/15min).
    // Only the 5 most recent articles matter for trading decisions.
    await this._processNewsBatch(rawNews.slice(0, 5), 3);
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

  // ── Private Methods ──

  /**
   * Fetch news from all configured sources
   */
  private async _fetchAllSources(): Promise<RawNewsItem[]> {
    const [rouaResult, ctResult, cpResult, cdResult] = await Promise.allSettled([
      this._fetchRouaNews(),
      this._fetchCoinTelegraph(),
      this._fetchCryptoPanic(),
      this._fetchCoinDesk(),
    ]);

    const rouaNews = rouaResult.status === 'fulfilled' ? rouaResult.value : [];
    const ctNews   = ctResult.status === 'fulfilled' ? ctResult.value : [];
    const cpNews   = cpResult.status === 'fulfilled' ? cpResult.value : [];
    const cdNews   = cdResult.status === 'fulfilled' ? cdResult.value : [];

    if (rouaResult.status === 'rejected') this.logger.debug(`RouaNews unavailable: ${(rouaResult as any).reason?.message}`);
    if (ctResult.status === 'rejected') {
      this.logger.warn(`CoinTelegraph fetch failed: ${ctResult.reason?.message || ctResult.reason}`);
    }
    if (cpResult.status === 'rejected') {
      this.logger.warn(`CryptoPanic fetch failed: ${cpResult.reason?.message || cpResult.reason}`);
    }
    if (cdResult.status === 'rejected') {
      this.logger.warn(`CoinDesk fetch failed: ${cdResult.reason?.message || cdResult.reason}`);
    }

    const allNews = [...rouaNews, ...ctNews, ...cpNews, ...cdNews];

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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
    const res = await fetch('https://cointelegraph.com/rss', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RouaTradingBot/1.0)',
      },
      signal: controller.signal,
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
      const linkMatch =
        /<link><!\[CDATA\[(.*?)\]\]><\/link>/.exec(content) ||
        /<link>(.*?)<\/link>/.exec(content);
      const pubDateMatch = /<pubDate>(.*?)<\/pubDate>/.exec(content);
      const categoryMatch =
        /<category><!\[CDATA\[(.*?)\]\]><\/category>/.exec(content) ||
        /<category>(.*?)<\/category>/.exec(content);

      if (titleMatch) {
        // FIX: Strip CDATA wrapper from link if present
        let link = linkMatch ? linkMatch[1].trim() : undefined;
        if (link) {
          link = link.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
          // Ensure URL starts with http
          if (link && !link.startsWith('http')) {
            link = 'https://' + link.replace(/^[hH]*t*t*p*:*\/*/, '');
          }
        }
        items.push({
          title: titleMatch[1].trim(),
          description: descMatch ? descMatch[1].trim().replace(/<[^>]*>/g, '') : undefined,
          link,
          publishedAt: pubDateMatch ? pubDateMatch[1].trim() : undefined,
          source: 'CoinTelegraph',
          category: categoryMatch ? categoryMatch[1].trim() : 'Crypto',
        });
      }
    }

    return items;
    } finally {
      clearTimeout(timeout);
    }
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'RouaTradingBot/1.0' },
      signal: controller.signal,
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
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fetch from CoinDesk RSS
   */
  private async _fetchCoinDesk(): Promise<RawNewsItem[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
    const res = await fetch('https://www.coindesk.com/arc/outboundfeeds/rss/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RouaTradingBot/1.0)',
      },
      signal: controller.signal,
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
      const linkMatch =
        /<link><!\[CDATA\[(.*?)\]\]><\/link>/.exec(content) ||
        /<link>(.*?)<\/link>/.exec(content);
      const pubDateMatch = /<pubDate>(.*?)<\/pubDate>/.exec(content);

      if (titleMatch) {
        // FIX: Strip CDATA wrapper from link if present
        let link = linkMatch ? linkMatch[1].trim() : undefined;
        if (link) {
          link = link.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
          if (link && !link.startsWith('http')) {
            link = 'https://' + link.replace(/^[hH]*t*t*p*:*\/*/, '');
          }
        }
        items.push({
          title: titleMatch[1].trim(),
          link,
          publishedAt: pubDateMatch ? pubDateMatch[1].trim() : undefined,
          source: 'CoinDesk',
          category: 'Crypto',
        });
      }
    }

    return items;
    } finally {
      clearTimeout(timeout);
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

      // FIX: If AI returned a fallback (confidence 0), don't use its content as translation.
      // Instead fall back to heuristic analysis which preserves original text.
      const content = result.content || '';
      if (result.confidence === 0 || (result as any).isFallback) {
        this.logger.warn('AI returned fallback response — using heuristic sentiment analysis');
        return this._heuristicSentiment(fullText, defaultResult);
      }

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
  private async _fetchRouaNews(): Promise<RawNewsItem[]> {
    const siteUrl = process.env.NEWS_SITE_URL || 'https://rouatradingnews-production.up.railway.app';
    const apiKey  = process.env.INTEGRATION_API_KEY;
    if (!apiKey) return [];

    try {
      const res = await fetch(`${siteUrl}/api/integration/news?limit=20`, {
        headers: { 'Content-Type': 'application/json', 'X-Integration-Key': apiKey },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      const articles = data.articles || data.news || [];
      if (!Array.isArray(articles) || !articles.length) return [];
      this.logger.log(`📰 RouaNews: ${articles.length} articles`);
      return articles.map((a: any): RawNewsItem => ({
        title:          a.titleAr || a.title || '',
        description:    a.summaryAr || a.summary || '',
        link:           a.url || (a.slug ? `${siteUrl}/news/${a.slug}` : undefined),
        publishedAt:    a.publishedAt,
        source:         'RouaNews',
        category:       a.category || 'أسواق',
        sentiment:      typeof a.sentiment === 'number' ? a.sentiment : 0,
        impactLevel:    a.impactLevel || 'medium',
        affectedAssets: Array.isArray(a.affectedAssets) ? a.affectedAssets.join(',') : (a.affectedAssets || ''),
      }));
    } catch {
      return [];
    }
  }


}
