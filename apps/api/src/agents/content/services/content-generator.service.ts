// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Content Generator Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../common/redis/redis.service';
// FIX V1: Use AiOrchestratorService instead of GlmService directly.
// This gives us 8-model fallback chain (Gemini → Groq → Cerebras → Ollama →
// GLM → Mistral → NVIDIA → Bedrock) instead of single-point-of-failure GLM.
// If one provider is rate-limited or times out, the next one is tried automatically.
import { AIOrchestratorService } from '../../../modules/ai/services/ai-orchestrator.service';
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
    // FIX V1: Inject orchestrator (8-model fallback) instead of GLM-only
    private readonly orchestrator: AIOrchestratorService,
  ) {
    this.logger.log('✍️ Content Generator initialized — AI writing engine ready (8-model orchestrator: Gemini→Groq→Cerebras→Ollama→GLM→Mistral→NVIDIA→Bedrock)');
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

      // V9: Generate French, Turkish, Spanish content in PARALLEL.
      // Uses Promise.allSettled so if one language fails, the others still succeed.
      // The 8-model orchestrator handles fallback automatically.
      // Each language gets its own _generateWithAI call with locale-specific prompt.
      const [frenchResult, turkishResult, spanishResult] = await Promise.allSettled([
        this._generateWithAI(systemPrompt, userPrompt, 'fr', aiConfig),
        this._generateWithAI(systemPrompt, userPrompt, 'tr', aiConfig),
        this._generateWithAI(systemPrompt, userPrompt, 'es', aiConfig),
      ]);

      const frenchContent = frenchResult.status === 'fulfilled' ? frenchResult.value : null;
      const turkishContent = turkishResult.status === 'fulfilled' ? turkishResult.value : null;
      const spanishContent = spanishResult.status === 'fulfilled' ? spanishResult.value : null;

      if (frenchResult.status === 'rejected') this.logger.warn(`French generation failed: ${frenchResult.reason?.message?.slice(0, 80)}`);
      if (turkishResult.status === 'rejected') this.logger.warn(`Turkish generation failed: ${turkishResult.reason?.message?.slice(0, 80)}`);
      if (spanishResult.status === 'rejected') this.logger.warn(`Spanish generation failed: ${spanishResult.reason?.message?.slice(0, 80)}`);

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

      // Build the result — includes all 5 languages
      const content: GeneratedContent = {
        titleAr: arabicContent.title,
        titleEn: englishContent.title,
        contentAr: arabicContent.content,
        contentEn: englishContent.content,
        summaryAr: arabicContent.summary,
        summaryEn: englishContent.summary,
        excerpt: this._generateExcerpt(arabicContent.summary, englishContent.summary),
        // V9: Multilingual fields
        titleFr: frenchContent?.title,
        contentFr: frenchContent?.content,
        summaryFr: frenchContent?.summary,
        titleTr: turkishContent?.title,
        contentTr: turkishContent?.content,
        summaryTr: turkishContent?.summary,
        titleEs: spanishContent?.title,
        contentEs: spanishContent?.content,
        summaryEs: spanishContent?.summary,
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
    language: 'ar' | 'en' | 'fr' | 'tr' | 'es',
    config: AiGenerationConfig,
  ): Promise<{ title: string; content: string; summary: string }> {
    // FIX V2: Improved prompt that enforces strict JSON output.
    // Old prompt was ambiguous — AI sometimes returned plain text or
    // markdown-wrapped JSON, causing the parser to fail and store
    // garbage like '{' as the title.
    const LANG_INSTRUCTIONS: Record<string, string> = {
      ar: 'اكتب المحتوى باللغة العربية بشكل احترافي ومفصل.',
      en: 'Write the content in English in a professional and detailed manner.',
      fr: 'Rédigez le contenu en français de manière professionnelle et détaillée.',
      tr: 'İçeriği profesyonel ve detaylı bir şekilde Türkçe olarak yazın.',
      es: 'Escribe el contenido en español de manera profesional y detallada.',
    };
    const langInstruction = LANG_INSTRUCTIONS[language] || LANG_INSTRUCTIONS.en;

    const fullPrompt = `${systemPrompt}

${userPrompt}

${langInstruction}

CRITICAL OUTPUT FORMAT REQUIREMENTS:
1. Respond ONLY with a valid JSON object — no markdown code fences, no text before or after the JSON.
2. The JSON must have exactly 3 string keys: "title", "content", "summary".
3. "title": 15-70 characters, plain text, no markdown, no quotes, no JSON syntax.
4. "content": ${config.wordCountRange.min}-${config.wordCountRange.max} words, use markdown for formatting (### for section headings, **bold** for emphasis, - for bullet lists).
5. "summary": 100-200 characters, plain text excerpt of the content.
6. Do NOT start "title" or "content" with "{" or any JSON syntax character.
7. All numeric values (prices, percentages) must use Western Arabic numerals (0-9), not Eastern Arabic (٠١٢٣).
8. Do NOT wrap the JSON in markdown code fences (no \`\`\`json ... \`\`\`).

Respond with the JSON object now:
{"title": "...", "content": "...", "summary": "..."}`;

    try {
      // FIX V1: Use orchestrator (8-model fallback) instead of GLM-only.
      // The orchestrator tries Gemini → Groq → Cerebras → Ollama → GLM →
      // Mistral → NVIDIA → Bedrock automatically, with circuit breaker +
      // latency-aware cooldown. If GLM times out, the next model is used.
      const aiResponse = await this.orchestrator.analyze({
        prompt: fullPrompt,
        // Use 'general' type — routes to Gemini primary with 7-model fallback.
        // 'market_analysis' would inject live market data prefix which we don't
        // want here (the prompt already contains topic + symbols).
        type: 'general',
        language: language === 'ar' ? 'ar' : 'en',
      });

      const rawContent = aiResponse.content;

      // Reject error messages that AI returns as content
      if (!rawContent || rawContent.startsWith('⚠️') || rawContent.includes('API error') || rawContent.includes('timeout')) {
        throw new Error(`AI generation returned an error instead of content: ${rawContent?.substring(0, 100) || 'empty response'}`);
      }

      // FIX V3: Use the new bulletproof JSON parser (7 strategies, ported from
      // the news site's V3.5 parser that successfully handles all GLM/Gemini
      // malformations).
      const parsed = this._parseAiResponse(rawContent, language);
      if (parsed.title && parsed.content) {
        return parsed;
      }

      // Final fallback — should rarely happen with the new parser
      this.logger.warn(`AI response parsing returned incomplete data — using raw text fallback`);
      const lines = rawContent.split('\n').filter(l => l.trim().length > 0);
      const title = lines[0]?.replace(/^#+\s*/, '').trim() || (language === 'ar' ? 'تقرير' : 'Report');
      const content = lines.slice(1).join('\n').trim() || rawContent;
      const summary = content.substring(0, 200).trim() + (content.length > 200 ? '...' : '');
      return { title, content, summary };
    } catch (error: any) {
      this.logger.error(`AI content generation failed: ${error.message}`);
      throw error;
    }
  }

  // ── FIX V3: Bulletproof JSON parser (7 strategies) ──
  // Ported from the news site's TechnicalAnalysisCard V3.5 parser.
  // Handles ALL AI response malformations:
  //   1. Valid JSON object: {"title": "...", "content": "..."}
  //   2. JSON wrapped in markdown code fences: ```json {...} ```
  //   3. Balanced brace extraction (JSON embedded in text)
  //   4. Regex field extraction (fragmented JSON — "title": "..." without braces)
  //   5. JSON with trailing/leading text
  //   6. Plain text fallback (first line = title, rest = content)
  //   7. Strip JSON artifacts from content (leftover { } characters)
  private _parseAiResponse(
    rawContent: string,
    language: 'ar' | 'en' | 'fr' | 'tr' | 'es',
  ): { title: string; content: string; summary: string } {
    // Helper: unescape JSON string escapes
    const unescape = (s: string): string => s
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');

    // Helper: regex extract a field from JSON-like text
    const extractField = (text: string, field: string): string | null => {
      const re = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 's');
      const m = text.match(re);
      return m ? unescape(m[1]) : null;
    };

    // Helper: strip leftover JSON artifacts ({, }, "field":, trailing commas)
    const cleanJsonArtifacts = (s: string): string => {
      let out = s;
      out = out.replace(/^\s*\{+\s*/, '');     // leading {
      out = out.replace(/\s*\}+\s*$/, '');     // trailing }
      out = out.replace(/^\s*"(?:title|content|summary)"\s*:\s*"?\s*/i, ''); // leading "field":
      out = out.replace(/"?\s*,?\s*$/, '');    // trailing quote/comma
      return out.trim();
    };

    // Strip markdown code fences if present
    let cleaned = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    // ── Strategy 1: Direct JSON.parse ──
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === 'object' && parsed.title && parsed.content) {
        return {
          title: String(parsed.title).trim(),
          content: String(parsed.content).trim(),
          summary: parsed.summary
            ? String(parsed.summary).trim()
            : String(parsed.content).substring(0, 200).trim() + '...',
        };
      }
    } catch {
      // Not valid JSON — continue to next strategy
    }

    // ── Strategy 2: Balanced brace extraction ──
    // Find the outermost { ... } block using depth counting.
    const firstBrace = cleaned.indexOf('{');
    if (firstBrace !== -1) {
      let depth = 0;
      let lastValidEnd = -1;
      let inString = false;
      let escapeNext = false;
      for (let i = firstBrace; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (escapeNext) { escapeNext = false; continue; }
        if (ch === '\\') { escapeNext = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) { lastValidEnd = i; break; }
        }
      }
      if (lastValidEnd !== -1) {
        const jsonCandidate = cleaned.substring(firstBrace, lastValidEnd + 1);
        try {
          const parsed = JSON.parse(jsonCandidate);
          if (parsed && parsed.title && parsed.content) {
            return {
              title: String(parsed.title).trim(),
              content: String(parsed.content).trim(),
              summary: parsed.summary
                ? String(parsed.summary).trim()
                : String(parsed.content).substring(0, 200).trim() + '...',
            };
          }
        } catch {
          // Continue to next strategy
        }
      }
    }

    // ── Strategy 3: Regex field extraction ──
    // Works for fragmented JSON: "title": "...", "content": "..." (no braces)
    const titleMatch = extractField(cleaned, 'title');
    const contentMatch = extractField(cleaned, 'content');
    const summaryMatch = extractField(cleaned, 'summary');
    if (titleMatch && contentMatch) {
      return {
        title: titleMatch,
        content: contentMatch,
        summary: summaryMatch || contentMatch.substring(0, 200).trim() + '...',
      };
    }

    // ── Strategy 4: Title-only extraction + rest as content ──
    // If we found a title but no content field, treat the rest as content
    if (titleMatch) {
      // Remove the "title":"..." part from cleaned, use rest as content
      let restContent = cleaned.replace(/"title"\s*:\s*"(?:[^"\\]|\\.)*"\s*,?\s*/s, '');
      restContent = cleanJsonArtifacts(restContent);
      if (restContent.length > 20) {
        return {
          title: titleMatch,
          content: restContent,
          summary: restContent.substring(0, 200).trim() + '...',
        };
      }
    }

    // ── Strategy 5: Strip JSON artifacts + plain text ──
    // Last resort — clean any leftover JSON syntax and use as plain text
    const stripped = cleanJsonArtifacts(cleaned);
    const lines = stripped.split('\n').filter(l => l.trim().length > 0);
    if (lines.length > 0) {
      const title = lines[0].replace(/^#+\s*/, '').trim() || (language === 'ar' ? 'تقرير' : 'Report');
      const content = lines.slice(1).join('\n').trim() || stripped;
      const summary = content.substring(0, 200).trim() + (content.length > 200 ? '...' : '');
      return { title, content, summary };
    }

    // ── Strategy 6: Absolute fallback ──
    return {
      title: language === 'ar' ? 'تقرير' : 'Report',
      content: cleaned,
      summary: cleaned.substring(0, 200).trim() + '...',
    };
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

    // ── FIX V4: Enhanced quality checks ──

    // Penalty: JSON artifacts in content (sign of parsing failure)
    if (arabic.title.startsWith('{') || arabic.title === '{') score -= 30;
    if (english.title.startsWith('{') || english.title === '{') score -= 30;
    if (arabic.title.includes('"title"') || arabic.title.includes('"content"')) score -= 25;
    if (english.title.includes('"title"') || english.title.includes('"content"')) score -= 25;
    if (arabic.content.startsWith('{') || arabic.content.includes('"title":')) score -= 20;
    if (english.content.startsWith('{') || english.content.includes('"title":')) score -= 20;

    // Penalty: suspiciously short content (likely truncated)
    if (arabic.content.length < 100) score -= 20;
    if (english.content.length < 100) score -= 20;

    // Bonus: technical analysis markers (support/resistance levels)
    const hasSupportResistance = /دعم|مقاومة|support|resistance/i.test(arabic.content + ' ' + english.content);
    if (hasSupportResistance) score += 10;

    // Bonus: price levels mentioned (numeric values with currency)
    const hasPriceLevels = /\$?\d+(\.\d+)?\s*(USDT|USD|€|¥|%)/i.test(arabic.content + ' ' + english.content);
    if (hasPriceLevels) score += 10;

    // Bonus: risk disclaimer present
    const hasDisclaimer = arabic.content.includes('تعليمية فقط') || arabic.content.includes('نصيحة استثمارية') ||
                          english.content.includes('educational purposes') || english.content.includes('financial advice');
    if (hasDisclaimer) score += 5;

    // Bonus: markdown formatting (### headings)
    const hasMarkdownHeadings = /^#{1,6}\s+/m.test(arabic.content) || /^#{1,6}\s+/m.test(english.content);
    if (hasMarkdownHeadings) score += 5;

    return Math.max(0, Math.min(100, score));
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
