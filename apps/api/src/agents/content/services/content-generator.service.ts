// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Content Generator Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../common/redis/redis.service';
import {
  ContentGenerationRequest,
  GeneratedContent,
  AiGenerationConfig,
  ContentType,
  ContentCategory,
  ContentLanguage,
  GenerationSource,
  SeoMetadata,
} from '../types/content.types';

/**
 * ContentGeneratorService — AI-powered content generation engine
 *
 * Generates high-quality, bilingual (Arabic/English) content for the
 * Roua Trading news platform using AI large language models.
 *
 * Content Pipeline:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 1. Receive generation request (topic, type, category)      │
 * │ 2. Build AI prompt with market context and templates       │
 * │ 3. Generate Arabic and English content via AI              │
 * │ 4. Generate SEO metadata, tags, and summaries              │
 * │ 5. Quality score the generated content                     │
 * │ 6. Add risk warnings for financial content                 │
 * │ 7. Return structured GeneratedContent                      │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Supported Content Types:
 * - ARTICLE: In-depth analysis articles
 * - ANALYSIS: Technical/fundamental analysis
 * - NEWS_DIGEST: Curated news summaries
 * - MARKET_REPORT: Daily/weekly market reports
 * - EDUCATIONAL: Trading education content
 * - OPINION: Market opinion pieces
 * - BREAKING: Breaking news alerts
 * - HOURLY_UPDATE: Hourly market updates
 * - WEEKLY_REVIEW: Weekly market reviews
 * - PAIR_ANALYSIS: Trading pair analysis reports
 */
@Injectable()
export class ContentGeneratorService {
  private readonly logger = new Logger(ContentGeneratorService.name);

  /** Maximum daily content generation quota */
  private readonly DAILY_QUOTA = 50;

  /** Cache TTL for generated content drafts */
  private readonly DRAFT_CACHE_TTL = 3600000; // 1 hour

  /** Default AI generation config */
  private readonly DEFAULT_AI_CONFIG: AiGenerationConfig = {
    model: 'glm-5',
    temperature: 0.7,
    maxTokens: 4000,
    language: ContentLanguage.BILINGUAL,
    tone: 'professional',
    targetAudience: 'intermediate',
    wordCountRange: { min: 800, max: 1500 },
    includeChartAnalysis: true,
    includePriceTargets: true,
    includeRiskWarning: true,
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.logger.log('✍️ Content Generator initialized — AI writing engine ready');
  }

  /**
   * Generate full content based on a generation request
   */
  async generate(request: ContentGenerationRequest): Promise<GeneratedContent> {
    const startTime = Date.now();
    const aiConfig = { ...this.DEFAULT_AI_CONFIG, ...request.aiConfig };

    this.logger.log(
      `✍️ Generating ${request.type} content: "${request.topic}" (${request.category})`,
    );

    try {
      // Build the AI prompt
      const systemPrompt = this._buildSystemPrompt(request, aiConfig);
      const userPrompt = this._buildUserPrompt(request, aiConfig);

      // Generate Arabic content
      const arabicContent = await this._generateWithAI(
        systemPrompt,
        userPrompt,
        'ar',
        aiConfig,
      );

      // Generate English content
      const englishContent = await this._generateWithAI(
        systemPrompt,
        userPrompt,
        'en',
        aiConfig,
      );

      // Generate SEO metadata
      const seo = this._generateSeoMetadata(request, arabicContent, englishContent);

      // Calculate reading time and word counts
      const wordCountAr = this._countWords(arabicContent.content);
      const wordCountEn = this._countWords(englishContent.content);
      const readingTimeMinutes = Math.ceil(Math.max(wordCountAr, wordCountEn) / 200);

      // Assess content quality
      const qualityScore = this._assessQuality(arabicContent, englishContent);

      // Determine impact level
      const impactLevel = this._assessImpactLevel(request);

      // Build risk warnings for financial content
      const riskWarnings = this._generateRiskWarnings(request);

      // Build the result
      const content: GeneratedContent = {
        titleAr: arabicContent.title,
        titleEn: englishContent.title,
        contentAr: arabicContent.content,
        contentEn: englishContent.content,
        summaryAr: arabicContent.summary,
        summaryEn: englishContent.summary,
        excerpt: this._generateExcerpt(arabicContent.summary, englishContent.summary),
        category: request.category,
        categoryAr: this._getCategoryArabic(request.category),
        tags: this._extractTags(request, arabicContent, englishContent),
        relatedSymbols: request.symbols || [],
        seo,
        readingTimeMinutes,
        wordCountAr,
        wordCountEn,
        aiModel: aiConfig.model,
        generationSource: GenerationSource.AI_GENERATED,
        confidence: this._calculateConfidence(qualityScore, request),
        qualityScore,
        sentimentScore: this._assessSentiment(arabicContent.content),
        impactLevel,
        riskWarnings,
        sources: request.sourceData?.referenceUrls || [],
      };

      const elapsedMs = Date.now() - startTime;
      this.logger.log(
        `✍️ Content generated in ${elapsedMs}ms — quality: ${qualityScore}, words: AR=${wordCountAr} EN=${wordCountEn}`,
      );

      // Cache the draft
      await this._cacheDraft(content);

      return content;
    } catch (error: any) {
      this.logger.error(`Content generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Quick-generate a breaking news alert (shorter, faster)
   */
  async generateBreakingAlert(
    topic: string,
    symbols: string[],
    context: string,
  ): Promise<GeneratedContent> {
    return this.generate({
      type: ContentType.BREAKING,
      category: ContentCategory.CRYPTO,
      topic,
      symbols,
      language: ContentLanguage.BILINGUAL,
      priority: { URGENT: 'URGENT', HIGH: 'HIGH', NORMAL: 'NORMAL', LOW: 'LOW' }.URGENT as any,
      sourceData: { customContext: context },
      aiConfig: {
        temperature: 0.3,
        maxTokens: 800,
        tone: 'urgent',
        wordCountRange: { min: 200, max: 400 },
        includeChartAnalysis: false,
        includePriceTargets: false,
      },
    });
  }

  // ── Private: AI Integration ──

  private async _generateWithAI(
    systemPrompt: string,
    userPrompt: string,
    language: 'ar' | 'en',
    config: AiGenerationConfig,
  ): Promise<{ title: string; content: string; summary: string }> {
    // In production, this calls the z-ai-web-dev-sdk or OpenAI API
    // For now, we use a structured template-based generation
    // that will be replaced by actual AI API calls

    const langLabel = language === 'ar' ? 'Arabic' : 'English';

    // Build the language-specific prompt
    const langPrompt = language === 'ar'
      ? 'اكتب المحتوى باللغة العربية بشكل احترافي ومفصل.'
      : 'Write the content in English in a professional and detailed manner.';

    const fullPrompt = `${userPrompt}\n\n${langPrompt}\n\nRespond in the following JSON format only:\n{\n  "title": "...",\n  "content": "...",\n  "summary": "..."\n}`;

    // Placeholder: In production, call AI API here
    // const zai = await ZAI.create();
    // const completion = await zai.chat.completions.create({...});
    const title = language === 'ar' ? 'عنوان المقال' : 'Article Title';
    const content = language === 'ar'
      ? `محتوى مفصل حول الموضوع المطلوب. يتم إنشاؤه بواسطة الذكاء الاصطناعي مع تحليل شامل للسوق.`
      : `Detailed content about the requested topic. Generated by AI with comprehensive market analysis.`;
    const summary = language === 'ar'
      ? `ملخص مختصر للمحتوى المُنشأ`
      : `Brief summary of the generated content`;

    return { title, content, summary };
  }

  // ── Private: Prompt Building ──

  private _buildSystemPrompt(request: ContentGenerationRequest, config: AiGenerationConfig): string {
    const roleMap: Record<ContentType, string> = {
      [ContentType.ARTICLE]: 'أنت كاتب مقالات مالية محترف في منصة رؤى للتداول',
      [ContentType.ANALYSIS]: 'أنت محلل مالي خبير تكتب تحليلاً تقنياً وأساسياً مفصلاً',
      [ContentType.NEWS_DIGEST]: 'أنت محرر أخبار مالية تصيغ ملخصات إخبارية دقيقة وموجزة',
      [ContentType.MARKET_REPORT]: 'أنت معد تقارير سوق محترف تكتب تقارير يومية وأسبوعية',
      [ContentType.EDUCATIONAL]: 'أنت معلم تداول خبير تكتب محتوى تعليمي مبسط ومفيد',
      [ContentType.OPINION]: 'أنت محلل رأي مالي تكتب مقالات رأي مبنية على تحليل عميق',
      [ContentType.BREAKING]: 'أنت محرر أخبار عاجلة تكتب تنبيهات سريعة ودقيقة',
      [ContentType.HOURLY_UPDATE]: 'أنت محلل سوق تكتب تحديثات ساعية مركزة ومبنية على أحدث البيانات',
      [ContentType.WEEKLY_REVIEW]: 'أنت معد تقارير أسبوعية تكتب مراجعات شاملة لأداء الأسواق خلال الأسبوع',
      [ContentType.PAIR_ANALYSIS]: 'أنت محلل أزواج تداول خبير تكتب تحليلاً تقنياً مفصلاً مع مستويات وتوقعات',
    };

    return roleMap[request.type] || roleMap[ContentType.ARTICLE];
  }

  private _buildUserPrompt(request: ContentGenerationRequest, config: AiGenerationConfig): string {
    const parts: string[] = [];

    parts.push(`الموضوع: ${request.topic}`);
    parts.push(`التصنيف: ${request.category}`);
    if (request.symbols?.length) {
      parts.push(`الأصول المرتبطة: ${request.symbols.join(', ')}`);
    }
    if (request.sourceData?.customContext) {
      parts.push(`السياق الإضافي: ${request.sourceData.customContext}`);
    }
    if (request.sourceData?.newsArticles?.length) {
      const newsContext = request.sourceData.newsArticles
        .slice(0, 5)
        .map(n => `- ${n.title}: ${n.content?.substring(0, 200)}`)
        .join('\n');
      parts.push(`الأخبار المرجعية:\n${newsContext}`);
    }
    if (request.sourceData?.marketData) {
      const m = request.sourceData.marketData;
      parts.push(`بيانات السوق: ${m.symbol} @ ${m.price}, تغيير 24س: ${m.change24h}%, الاتجاه: ${m.trend}`);
    }

    parts.push(`الحد الأدنى للكلمات: ${config.wordCountRange.min}`);
    parts.push(`الحد الأقصى للكلمات: ${config.wordCountRange.max}`);

    if (config.includeChartAnalysis) {
      parts.push('يجب تضمين تحليل فني مع مستويات دعم ومقاومة');
    }
    if (config.includePriceTargets) {
      parts.push('يجب تضمين أهداف سعرية محتملة');
    }
    if (config.includeRiskWarning) {
      parts.push('يجب تضمين تحذير مخاطر في نهاية المحتوى');
    }

    return parts.join('\n');
  }

  // ── Private: SEO & Metadata ──

  private _generateSeoMetadata(
    request: ContentGenerationRequest,
    arabic: { title: string; content: string; summary: string },
    english: { title: string; content: string; summary: string },
  ): SeoMetadata {
    const keywords = [
      request.category.toLowerCase(),
      ...(request.symbols || []),
      request.type.toLowerCase(),
      'تداول', 'رؤى', 'trading', 'roua',
    ];

    return {
      metaTitle: english.title.substring(0, 60),
      metaDescription: english.summary.substring(0, 160),
      keywords: [...new Set(keywords)],
      ogType: 'article',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: english.title,
        description: english.summary,
        datePublished: new Date().toISOString(),
        author: { '@type': 'Organization', name: 'Roua Trading رؤى' },
      },
    };
  }

  private _generateExcerpt(summaryAr: string, summaryEn: string): string {
    const ar = summaryAr.substring(0, 120);
    const en = summaryEn.substring(0, 120);
    return `${ar} | ${en}`;
  }

  // ── Private: Quality Assessment ──

  private _assessQuality(
    arabic: { title: string; content: string; summary: string },
    english: { title: string; content: string; summary: string },
  ): number {
    let score = 50; // Base score

    // Title quality
    if (arabic.title.length > 10 && arabic.title.length < 100) score += 5;
    if (english.title.length > 10 && english.title.length < 100) score += 5;

    // Content length
    if (arabic.content.length > 500) score += 10;
    if (english.content.length > 500) score += 10;

    // Summary exists
    if (arabic.summary.length > 20) score += 5;
    if (english.summary.length > 20) score += 5;

    // Bilingual completeness
    if (arabic.content.length > 100 && english.content.length > 100) score += 10;

    return Math.min(100, score);
  }

  private _calculateConfidence(qualityScore: number, request: ContentGenerationRequest): number {
    let confidence = qualityScore * 0.6;
    if (request.sourceData?.marketData) confidence += 15;
    if (request.sourceData?.newsArticles?.length) confidence += 15;
    if (request.symbols?.length) confidence += 10;
    return Math.min(100, Math.round(confidence));
  }

  private _assessSentiment(content: string): number {
    // Simple keyword-based sentiment — in production, use NLP model
    const positiveWords = ['صعود', 'ارتفاع', 'نمو', 'فرصة', 'مكاسب', 'bullish', 'growth', 'opportunity'];
    const negativeWords = ['هبوط', 'انخفاض', 'خسارة', 'مخاطر', 'تراجع', 'bearish', 'decline', 'risk'];

    let score = 0;
    const lower = content.toLowerCase();
    for (const w of positiveWords) { if (lower.includes(w)) score += 0.1; }
    for (const w of negativeWords) { if (lower.includes(w)) score -= 0.1; }

    return Math.max(-1, Math.min(1, score));
  }

  private _assessImpactLevel(request: ContentGenerationRequest): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (request.type === ContentType.BREAKING) return 'HIGH';
    if (request.type === ContentType.WEEKLY_REVIEW) return 'HIGH';
    if (request.type === ContentType.ANALYSIS && request.symbols?.length) return 'MEDIUM';
    if (request.type === ContentType.MARKET_REPORT) return 'MEDIUM';
    if (request.type === ContentType.HOURLY_UPDATE) return 'MEDIUM';
    if (request.type === ContentType.PAIR_ANALYSIS) return 'MEDIUM';
    return 'LOW';
  }

  private _generateRiskWarnings(request: ContentGenerationRequest): string[] {
    const warnings: string[] = [];

    if (request.category === ContentCategory.CRYPTO) {
      warnings.push('العملات الرقمية ذات تقلب عالي — قد تخسر رأس مالك بالكامل');
    }
    if (request.category === ContentCategory.FOREX) {
      warnings.push('تداول العملات الأجنبية ينطوي على رافعة مالية عالية ومخاطر كبيرة');
    }
    if (request.type === ContentType.ANALYSIS || request.type === ContentType.PAIR_ANALYSIS) {
      warnings.push('التحليل الفني ليس ضماناً للنتائج المستقبلية');
    }

    warnings.push('هذا المحتوى لأغراض تعليمية فقط ولا يُعد نصيحة استثمارية');

    return warnings;
  }

  // ── Private: Utilities ──

  private _countWords(text: string): number {
    return text.split(/\s+/).filter(w => w.length > 0).length;
  }

  private _getCategoryArabic(category: ContentCategory): string {
    const map: Record<ContentCategory, string> = {
      [ContentCategory.CRYPTO]: 'عملات رقمية',
      [ContentCategory.FOREX]: 'فوركس',
      [ContentCategory.STOCKS]: 'أسهم',
      [ContentCategory.COMMODITIES]: 'سلع',
      [ContentCategory.ECONOMY]: 'اقتصاد',
      [ContentCategory.REGULATION]: 'تنظيمات',
      [ContentCategory.TECHNOLOGY]: 'تقنية',
      [ContentCategory.EDUCATION]: 'تعليم',
      [ContentCategory.GEOPOLITICS]: 'جيوسياسة',
      [ContentCategory.DEFI]: 'تمويل لامركزي',
      [ContentCategory.NFT]: 'رموز غير قابلة للاستبدال',
    };
    return map[category] || category;
  }

  private _extractTags(
    request: ContentGenerationRequest,
    arabic: { title: string; content: string },
    english: { title: string; content: string },
  ): string[] {
    const tags = new Set<string>();

    // Add category
    tags.add(request.category);
    tags.add(this._getCategoryArabic(request.category));

    // Add symbols
    request.symbols?.forEach(s => tags.add(s));

    // Add type
    tags.add(request.type);

    // Add provided tags
    request.tags?.forEach(t => tags.add(t));

    return [...tags].slice(0, 15);
  }

  private async _cacheDraft(content: GeneratedContent): Promise<void> {
    try {
      const key = `content:draft:${Date.now()}`;
      await this.redis.set(key, JSON.stringify(content), this.DRAFT_CACHE_TTL);
    } catch {
      // Non-critical — draft caching is optional
    }
  }
}
