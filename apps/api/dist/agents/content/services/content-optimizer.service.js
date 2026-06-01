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
var ContentOptimizerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentOptimizerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const redis_service_1 = require("../../../common/redis/redis.service");
const content_types_1 = require("../types/content.types");
let ContentOptimizerService = ContentOptimizerService_1 = class ContentOptimizerService {
    constructor(prisma, redis) {
        this.prisma = prisma;
        this.redis = redis;
        this.logger = new common_1.Logger(ContentOptimizerService_1.name);
        this.logger.log('📈 Content Optimizer initialized — quality & SEO engine ready');
    }
    async optimize(content) {
        this.logger.log(`📈 Optimizing content: "${content.titleEn}"`);
        const report = {
            seoScore: 0,
            readabilityScore: 0,
            engagementScore: 0,
            duplicationScore: 0,
            complianceScore: 0,
            overallScore: 0,
            suggestions: [],
            warnings: [],
        };
        const seoResult = this._analyzeSeo(content);
        report.seoScore = seoResult.score;
        report.suggestions.push(...seoResult.suggestions);
        const readability = this._assessReadability(content);
        report.readabilityScore = readability.score;
        const engagement = this._predictEngagement(content);
        report.engagementScore = engagement.score;
        report.suggestions.push(...engagement.suggestions);
        const duplication = await this._checkDuplication(content);
        report.duplicationScore = duplication.score;
        report.warnings.push(...duplication.warnings);
        const compliance = this._checkCompliance(content);
        report.complianceScore = compliance.score;
        report.warnings.push(...compliance.warnings);
        report.overallScore = Math.round(report.seoScore * 0.25 +
            report.readabilityScore * 0.20 +
            report.engagementScore * 0.20 +
            report.duplicationScore * 0.15 +
            report.complianceScore * 0.20);
        const optimizedContent = this._applyOptimizations(content, report);
        this.logger.log(`📈 Optimization complete — overall: ${report.overallScore}, SEO: ${report.seoScore}, readability: ${report.readabilityScore}`);
        return { content: optimizedContent, optimization: report };
    }
    _analyzeSeo(content) {
        let score = 40;
        const suggestions = [];
        if (content.titleEn.length >= 30 && content.titleEn.length <= 65) {
            score += 10;
        }
        else {
            suggestions.push('عنوان EN يجب أن يكون بين 30-65 حرفاً ل SEO الأمثل');
        }
        if (content.titleAr.length >= 15 && content.titleAr.length <= 70) {
            score += 10;
        }
        else {
            suggestions.push('عنوان AR يجب أن يكون بين 15-70 حرفاً');
        }
        if (content.seo.keywords.length >= 5) {
            score += 10;
        }
        else {
            suggestions.push('أضف المزيد من الكلمات المفتاحية (5 على الأقل)');
        }
        if (content.seo.metaDescription.length >= 120 && content.seo.metaDescription.length <= 160) {
            score += 10;
        }
        else {
            suggestions.push('وصف Meta يجب أن يكون بين 120-160 حرفاً');
        }
        if (content.seo.structuredData) {
            score += 10;
        }
        if (content.tags.length >= 3) {
            score += 5;
        }
        else {
            suggestions.push('أضف 3 وسوم على الأقل');
        }
        if (content.relatedSymbols.length > 0) {
            score += 5;
        }
        return { score: Math.min(100, score), suggestions };
    }
    _assessReadability(content) {
        let score = 60;
        const paragraphsAr = content.contentAr.split('\n\n').length;
        const paragraphsEn = content.contentEn.split('\n\n').length;
        if (paragraphsAr >= 3 && paragraphsEn >= 3)
            score += 10;
        if (content.wordCountAr >= 300 && content.wordCountEn >= 300)
            score += 10;
        if (content.readingTimeMinutes >= 2 && content.readingTimeMinutes <= 10)
            score += 10;
        if (content.summaryAr && content.summaryEn)
            score += 10;
        return { score: Math.min(100, score) };
    }
    _predictEngagement(content) {
        let score = 40;
        const suggestions = [];
        if (content.impactLevel === 'HIGH')
            score += 20;
        else if (content.impactLevel === 'MEDIUM')
            score += 10;
        if (content.relatedSymbols.length > 0) {
            score += 15;
        }
        else {
            suggestions.push('أضف رموز أصول مرتبطة لزيادة التفاعل');
        }
        if (Math.abs(content.sentimentScore) > 0.3)
            score += 10;
        if (content.generationSource === 'AI_GENERATED')
            score += 5;
        if (content.riskWarnings.length > 0)
            score += 10;
        return { score: Math.min(100, score), suggestions };
    }
    async _checkDuplication(content) {
        let score = 100;
        const warnings = [];
        try {
            const recentArticles = await this.prisma.newsArticle.findMany({
                where: {
                    publishedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
                    category: content.category,
                },
                select: { title: true, translatedTitle: true },
                take: 50,
            });
            for (const article of recentArticles) {
                const titleSimilarity = this._calculateStringSimilarity(content.titleEn.toLowerCase(), (article.title || '').toLowerCase());
                if (titleSimilarity > 0.8) {
                    score -= 30;
                    warnings.push(`محتوى مشابه جداً موجود: "${article.translatedTitle || article.title}"`);
                    break;
                }
                else if (titleSimilarity > 0.5) {
                    score -= 10;
                    warnings.push(`محتوى مشابه جزئياً: "${article.translatedTitle || article.title}"`);
                }
            }
        }
        catch {
        }
        return { score: Math.max(0, score), warnings };
    }
    _checkCompliance(content) {
        let score = 70;
        const warnings = [];
        const financialCategories = [
            content_types_1.ContentCategory.CRYPTO, content_types_1.ContentCategory.FOREX,
            content_types_1.ContentCategory.STOCKS, content_types_1.ContentCategory.COMMODITIES,
            content_types_1.ContentCategory.DEFI,
        ];
        if (financialCategories.includes(content.category)) {
            if (content.riskWarnings.length === 0) {
                score -= 30;
                warnings.push('المحتوى المالي يجب أن يحتوي على تحذيرات مخاطر');
            }
            else {
                score += 10;
            }
            const hasDisclaimer = content.contentAr.includes('تعليمية فقط') ||
                content.contentAr.includes('نصيحة استثمارية') ||
                content.contentEn.includes('not financial advice') ||
                content.contentEn.includes('educational purposes');
            if (!hasDisclaimer) {
                score -= 10;
                warnings.push('أضف إخلاء مسؤولية: المحتوى لأغراض تعليمية فقط');
            }
            else {
                score += 10;
            }
        }
        if (content.relatedSymbols.length > 0 && content.impactLevel === 'HIGH') {
            const hasCaveat = content.contentAr.includes('محتمل') ||
                content.contentAr.includes('قد') ||
                content.contentEn.includes('potential') ||
                content.contentEn.includes('may');
            if (!hasCaveat) {
                score -= 10;
                warnings.push('الأهداف السعرية يجب أن تتضمن تحفظات لغوية');
            }
        }
        return { score: Math.min(100, Math.max(0, score)), warnings };
    }
    _applyOptimizations(content, report) {
        const optimized = { ...content };
        if (report.complianceScore < 70 && optimized.riskWarnings.length === 0) {
            optimized.riskWarnings = ['هذا المحتوى لأغراض تعليمية فقط ولا يُعد نصيحة استثمارية'];
        }
        if (report.complianceScore < 60) {
            const disclaimer = '\n\n⚠️ إخلاء مسؤولية: هذا المحتوى لأغراض تعليمية فقط ولا يُعد نصيحة استثمارية. التداول ينطوي على مخاطر.';
            if (!optimized.contentAr.includes('إخلاء مسؤولية')) {
                optimized.contentAr += disclaimer;
            }
        }
        return optimized;
    }
    _calculateStringSimilarity(a, b) {
        if (a === b)
            return 1;
        if (!a.length || !b.length)
            return 0;
        const matrix = [];
        for (let i = 0; i <= b.length; i++)
            matrix[i] = [i];
        for (let j = 0; j <= a.length; j++)
            matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                const cost = b[i - 1] === a[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
            }
        }
        const maxLen = Math.max(a.length, b.length);
        return maxLen > 0 ? 1 - matrix[b.length][a.length] / maxLen : 0;
    }
};
exports.ContentOptimizerService = ContentOptimizerService;
exports.ContentOptimizerService = ContentOptimizerService = ContentOptimizerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService])
], ContentOptimizerService);
//# sourceMappingURL=content-optimizer.service.js.map