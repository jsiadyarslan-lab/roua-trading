"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ContentGeneratorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentGeneratorService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const redis_service_1 = require("../../../common/redis/redis.service");
const glm_service_1 = require("../../../modules/ai/services/glm.service");
const content_types_1 = require("../types/content.types");
let ContentGeneratorService = ContentGeneratorService_1 = class ContentGeneratorService {
    constructor(configService, redis, glmService) {
        this.configService = configService;
        this.redis = redis;
        this.glmService = glmService;
        this.logger = new common_1.Logger(ContentGeneratorService_1.name);
        this.DAILY_QUOTA = 50;
        this.DRAFT_CACHE_TTL = 3600000;
        this.DEFAULT_AI_CONFIG = {
            model: 'glm-5',
            temperature: 0.7,
            maxTokens: 4000,
            language: content_types_1.ContentLanguage.BILINGUAL,
            tone: 'professional',
            targetAudience: 'intermediate',
            wordCountRange: { min: 800, max: 1500 },
            includeChartAnalysis: true,
            includePriceTargets: true,
            includeRiskWarning: true,
        };
        this.logger.log('✍️ Content Generator initialized — AI writing engine ready (GlmService connected)');
    }
    async generate(request) {
        const startTime = Date.now();
        const aiConfig = { ...this.DEFAULT_AI_CONFIG, ...request.aiConfig };
        this.logger.log(`✍️ Generating ${request.type} content: "${request.topic}" (${request.category})`);
        try {
            const systemPrompt = this._buildSystemPrompt(request, aiConfig);
            const userPrompt = this._buildUserPrompt(request, aiConfig);
            const arabicContent = await this._generateWithAI(systemPrompt, userPrompt, 'ar', aiConfig);
            const englishContent = await this._generateWithAI(systemPrompt, userPrompt, 'en', aiConfig);
            const seo = this._generateSeoMetadata(request, arabicContent, englishContent);
            const wordCountAr = this._countWords(arabicContent.content);
            const wordCountEn = this._countWords(englishContent.content);
            const readingTimeMinutes = Math.ceil(Math.max(wordCountAr, wordCountEn) / 200);
            const qualityScore = this._assessQuality(arabicContent, englishContent);
            const impactLevel = this._assessImpactLevel(request);
            const riskWarnings = this._generateRiskWarnings(request);
            const content = {
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
                generationSource: content_types_1.GenerationSource.AI_GENERATED,
                confidence: this._calculateConfidence(qualityScore, request),
                qualityScore,
                sentimentScore: this._assessSentiment(arabicContent.content),
                impactLevel,
                riskWarnings,
                sources: request.sourceData?.referenceUrls || [],
            };
            const elapsedMs = Date.now() - startTime;
            this.logger.log(`✍️ Content generated in ${elapsedMs}ms — quality: ${qualityScore}, words: AR=${wordCountAr} EN=${wordCountEn}`);
            await this._cacheDraft(content);
            return content;
        }
        catch (error) {
            this.logger.error(`Content generation failed: ${error.message}`);
            throw error;
        }
    }
    async generateBreakingAlert(topic, symbols, context) {
        return this.generate({
            type: content_types_1.ContentType.BREAKING,
            category: content_types_1.ContentCategory.CRYPTO,
            topic,
            symbols,
            language: content_types_1.ContentLanguage.BILINGUAL,
            priority: { URGENT: 'URGENT', HIGH: 'HIGH', NORMAL: 'NORMAL', LOW: 'LOW' }.URGENT,
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
    async _generateWithAI(systemPrompt, userPrompt, language, config) {
        const langPrompt = language === 'ar'
            ? 'اكتب المحتوى باللغة العربية بشكل احترافي ومفصل.'
            : 'Write the content in English in a professional and detailed manner.';
        const fullPrompt = `[السياق/الدور]: ${systemPrompt}\n\n${userPrompt}\n\n${langPrompt}\n\nRespond in the following JSON format only:\n{\n  "title": "...",\n  "content": "...",\n  "summary": "..."\n}`;
        try {
            const aiResponse = await this.glmService.analyze({
                prompt: fullPrompt,
                type: 'general',
                language: language === 'ar' ? 'ar' : 'en',
            });
            const rawContent = aiResponse.content;
            if (!rawContent || rawContent.startsWith('⚠️') || rawContent.includes('API error') || rawContent.includes('timeout')) {
                throw new Error(`AI generation returned an error instead of content: ${rawContent?.substring(0, 100) || 'empty response'}`);
            }
            try {
                let cleanResponse = rawContent.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
                let parsed = null;
                try {
                    parsed = JSON.parse(cleanResponse);
                }
                catch {
                    const firstBrace = cleanResponse.indexOf('{');
                    if (firstBrace !== -1) {
                        let depth = 0;
                        let lastValidEnd = -1;
                        for (let i = firstBrace; i < cleanResponse.length; i++) {
                            if (cleanResponse[i] === '{')
                                depth++;
                            else if (cleanResponse[i] === '}') {
                                depth--;
                                if (depth === 0) {
                                    lastValidEnd = i;
                                    break;
                                }
                            }
                        }
                        if (lastValidEnd !== -1) {
                            const jsonCandidate = cleanResponse.substring(firstBrace, lastValidEnd + 1);
                            try {
                                parsed = JSON.parse(jsonCandidate);
                            }
                            catch {
                                const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
                                if (jsonMatch) {
                                    parsed = JSON.parse(jsonMatch[0]);
                                }
                            }
                        }
                    }
                }
                if (parsed && parsed.title && parsed.content) {
                    return {
                        title: String(parsed.title).trim(),
                        content: String(parsed.content).trim(),
                        summary: parsed.summary
                            ? String(parsed.summary).trim()
                            : String(parsed.content).substring(0, 200).trim() + '...',
                    };
                }
            }
            catch {
                this.logger.warn('AI response was not valid JSON — extracting title/content from plain text');
            }
            const lines = rawContent.split('\n').filter(l => l.trim().length > 0);
            const title = lines[0]?.replace(/^#+\s*/, '').trim() || (language === 'ar' ? 'تقرير' : 'Report');
            const content = lines.slice(1).join('\n').trim() || rawContent;
            const summary = content.substring(0, 200).trim() + (content.length > 200 ? '...' : '');
            return { title, content, summary };
        }
        catch (error) {
            this.logger.error(`AI content generation failed: ${error.message}`);
            throw error;
        }
    }
    _buildSystemPrompt(request, config) {
        const roleMap = {
            [content_types_1.ContentType.ARTICLE]: 'أنت كاتب مقالات مالية محترف في منصة رؤى للتداول',
            [content_types_1.ContentType.ANALYSIS]: 'أنت محلل مالي خبير تكتب تحليلاً تقنياً وأساسياً مفصلاً',
            [content_types_1.ContentType.NEWS_DIGEST]: 'أنت محرر أخبار مالية تصيغ ملخصات إخبارية دقيقة وموجزة',
            [content_types_1.ContentType.MARKET_REPORT]: 'أنت معد تقارير سوق محترف تكتب تقارير يومية وأسبوعية',
            [content_types_1.ContentType.EDUCATIONAL]: 'أنت معلم تداول خبير تكتب محتوى تعليمي مبسط ومفيد',
            [content_types_1.ContentType.OPINION]: 'أنت محلل رأي مالي تكتب مقالات رأي مبنية على تحليل عميق',
            [content_types_1.ContentType.BREAKING]: 'أنت محرر أخبار عاجلة تكتب تنبيهات سريعة ودقيقة',
            [content_types_1.ContentType.HOURLY_UPDATE]: 'أنت محلل سوق تكتب تحديثات ساعية مركزة ومبنية على أحدث البيانات',
            [content_types_1.ContentType.WEEKLY_REVIEW]: 'أنت معد تقارير أسبوعية تكتب مراجعات شاملة لأداء الأسواق خلال الأسبوع',
            [content_types_1.ContentType.PAIR_ANALYSIS]: 'أنت محلل أزواج تداول خبير تكتب تحليلاً تقنياً مفصلاً مع مستويات وتوقعات',
        };
        return roleMap[request.type] || roleMap[content_types_1.ContentType.ARTICLE];
    }
    _buildUserPrompt(request, config) {
        const parts = [];
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
    _generateSeoMetadata(request, arabic, english) {
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
    _generateExcerpt(summaryAr, summaryEn) {
        const ar = summaryAr.substring(0, 120);
        const en = summaryEn.substring(0, 120);
        return `${ar} | ${en}`;
    }
    _assessQuality(arabic, english) {
        let score = 50;
        if (arabic.title.length > 10 && arabic.title.length < 100)
            score += 5;
        if (english.title.length > 10 && english.title.length < 100)
            score += 5;
        if (arabic.content.length > 500)
            score += 10;
        if (english.content.length > 500)
            score += 10;
        if (arabic.summary.length > 20)
            score += 5;
        if (english.summary.length > 20)
            score += 5;
        if (arabic.content.length > 100 && english.content.length > 100)
            score += 10;
        return Math.min(100, score);
    }
    _calculateConfidence(qualityScore, request) {
        let confidence = qualityScore * 0.6;
        if (request.sourceData?.marketData)
            confidence += 15;
        if (request.sourceData?.newsArticles?.length)
            confidence += 15;
        if (request.symbols?.length)
            confidence += 10;
        return Math.min(100, Math.round(confidence));
    }
    _assessSentiment(content) {
        const positiveWords = ['صعود', 'ارتفاع', 'نمو', 'فرصة', 'مكاسب', 'bullish', 'growth', 'opportunity'];
        const negativeWords = ['هبوط', 'انخفاض', 'خسارة', 'مخاطر', 'تراجع', 'bearish', 'decline', 'risk'];
        let score = 0;
        const lower = content.toLowerCase();
        for (const w of positiveWords) {
            if (lower.includes(w))
                score += 0.1;
        }
        for (const w of negativeWords) {
            if (lower.includes(w))
                score -= 0.1;
        }
        return Math.max(-1, Math.min(1, score));
    }
    _assessImpactLevel(request) {
        if (request.type === content_types_1.ContentType.BREAKING)
            return 'HIGH';
        if (request.type === content_types_1.ContentType.WEEKLY_REVIEW)
            return 'HIGH';
        if (request.type === content_types_1.ContentType.ANALYSIS && request.symbols?.length)
            return 'MEDIUM';
        if (request.type === content_types_1.ContentType.MARKET_REPORT)
            return 'MEDIUM';
        if (request.type === content_types_1.ContentType.HOURLY_UPDATE)
            return 'MEDIUM';
        if (request.type === content_types_1.ContentType.PAIR_ANALYSIS)
            return 'MEDIUM';
        return 'LOW';
    }
    _generateRiskWarnings(request) {
        const warnings = [];
        if (request.category === content_types_1.ContentCategory.CRYPTO) {
            warnings.push('العملات الرقمية ذات تقلب عالي — قد تخسر رأس مالك بالكامل');
        }
        if (request.category === content_types_1.ContentCategory.FOREX) {
            warnings.push('تداول العملات الأجنبية ينطوي على رافعة مالية عالية ومخاطر كبيرة');
        }
        if (request.type === content_types_1.ContentType.ANALYSIS || request.type === content_types_1.ContentType.PAIR_ANALYSIS) {
            warnings.push('التحليل الفني ليس ضماناً للنتائج المستقبلية');
        }
        warnings.push('هذا المحتوى لأغراض تعليمية فقط ولا يُعد نصيحة استثمارية');
        return warnings;
    }
    _countWords(text) {
        return text.split(/\s+/).filter(w => w.length > 0).length;
    }
    _getCategoryArabic(category) {
        const map = {
            [content_types_1.ContentCategory.CRYPTO]: 'عملات رقمية',
            [content_types_1.ContentCategory.FOREX]: 'فوركس',
            [content_types_1.ContentCategory.STOCKS]: 'أسهم',
            [content_types_1.ContentCategory.COMMODITIES]: 'سلع',
            [content_types_1.ContentCategory.ECONOMY]: 'اقتصاد',
            [content_types_1.ContentCategory.REGULATION]: 'تنظيمات',
            [content_types_1.ContentCategory.TECHNOLOGY]: 'تقنية',
            [content_types_1.ContentCategory.EDUCATION]: 'تعليم',
            [content_types_1.ContentCategory.GEOPOLITICS]: 'جيوسياسة',
            [content_types_1.ContentCategory.DEFI]: 'تمويل لامركزي',
            [content_types_1.ContentCategory.NFT]: 'رموز غير قابلة للاستبدال',
        };
        return map[category] || category;
    }
    _extractTags(request, arabic, english) {
        const tags = new Set();
        tags.add(request.category);
        tags.add(this._getCategoryArabic(request.category));
        request.symbols?.forEach(s => tags.add(s));
        tags.add(request.type);
        request.tags?.forEach(t => tags.add(t));
        return [...tags].slice(0, 15);
    }
    async _cacheDraft(content) {
        try {
            const key = `content:draft:${Date.now()}`;
            await this.redis.set(key, JSON.stringify(content), this.DRAFT_CACHE_TTL);
        }
        catch {
        }
    }
};
exports.ContentGeneratorService = ContentGeneratorService;
exports.ContentGeneratorService = ContentGeneratorService = ContentGeneratorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        redis_service_1.RedisService,
        glm_service_1.GlmService])
], ContentGeneratorService);
//# sourceMappingURL=content-generator.service.js.map