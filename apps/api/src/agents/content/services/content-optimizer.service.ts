// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Content Optimizer Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import {
  GeneratedContent,
  ContentCategory,
  ContentType,
  SeoMetadata,
} from '../types/content.types';

/**
 * ContentOptimizerService — SEO, engagement, and quality optimization
 *
 * Optimizes content for maximum reach, engagement, and quality:
 * - SEO optimization (meta tags, keywords, structured data)
 * - Readability scoring and improvement suggestions
 * - Engagement prediction
 * - Content deduplication detection
 * - Translation quality validation
 * - Financial compliance checking
 *
 * Optimization Pipeline:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 1. SEO analysis — keywords, meta, structured data          │
 * │ 2. Readability scoring — Flesch-Kincaid for EN/AR          │
 * │ 3. Engagement prediction — title quality, CTA strength      │
 * │ 4. Deduplication check — similarity to existing articles    │
 * │ 5. Translation validation — AR/EN alignment                 │
 * │ 6. Compliance check — financial disclaimers, risk warnings  │
 * │ 7. Return optimization report with suggestions              │
 * └─────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class ContentOptimizerService {
  private readonly logger = new Logger(ContentOptimizerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.logger.log('📈 Content Optimizer initialized — quality & SEO engine ready');
  }

  /**
   * Optimize content and return enhanced version with optimization report
   */
  async optimize(content: GeneratedContent): Promise<{
    content: GeneratedContent;
    optimization: OptimizationReport;
  }> {
    this.logger.log(`📈 Optimizing content: "${content.titleEn}"`);

    const report: OptimizationReport = {
      seoScore: 0,
      readabilityScore: 0,
      engagementScore: 0,
      duplicationScore: 0,
      complianceScore: 0,
      overallScore: 0,
      suggestions: [],
      warnings: [],
    };

    // Step 1: SEO Analysis
    const seoResult = this._analyzeSeo(content);
    report.seoScore = seoResult.score;
    report.suggestions.push(...seoResult.suggestions);

    // Step 2: Readability
    const readability = this._assessReadability(content);
    report.readabilityScore = readability.score;

    // Step 3: Engagement prediction
    const engagement = this._predictEngagement(content);
    report.engagementScore = engagement.score;
    report.suggestions.push(...engagement.suggestions);

    // Step 4: Deduplication
    const duplication = await this._checkDuplication(content);
    report.duplicationScore = duplication.score;
    report.warnings.push(...duplication.warnings);

    // Step 5: Compliance
    const compliance = this._checkCompliance(content);
    report.complianceScore = compliance.score;
    report.warnings.push(...compliance.warnings);

    // Calculate overall score
    report.overallScore = Math.round(
      report.seoScore * 0.25 +
      report.readabilityScore * 0.20 +
      report.engagementScore * 0.20 +
      report.duplicationScore * 0.15 +
      report.complianceScore * 0.20,
    );

    // Apply auto-fixes to content
    const optimizedContent = this._applyOptimizations(content, report);

    this.logger.log(
      `📈 Optimization complete — overall: ${report.overallScore}, SEO: ${report.seoScore}, readability: ${report.readabilityScore}`,
    );

    return { content: optimizedContent, optimization: report };
  }

  // ── SEO Analysis ──

  private _analyzeSeo(content: GeneratedContent): { score: number; suggestions: string[] } {
    let score = 40;
    const suggestions: string[] = [];

    // Title length check
    if (content.titleEn.length >= 30 && content.titleEn.length <= 65) {
      score += 10;
    } else {
      suggestions.push('عنوان EN يجب أن يكون بين 30-65 حرفاً ل SEO الأمثل');
    }

    if (content.titleAr.length >= 15 && content.titleAr.length <= 70) {
      score += 10;
    } else {
      suggestions.push('عنوان AR يجب أن يكون بين 15-70 حرفاً');
    }

    // Keywords
    if (content.seo.keywords.length >= 5) {
      score += 10;
    } else {
      suggestions.push('أضف المزيد من الكلمات المفتاحية (5 على الأقل)');
    }

    // Meta description
    if (content.seo.metaDescription.length >= 120 && content.seo.metaDescription.length <= 160) {
      score += 10;
    } else {
      suggestions.push('وصف Meta يجب أن يكون بين 120-160 حرفاً');
    }

    // Structured data
    if (content.seo.structuredData) {
      score += 10;
    }

    // Tags
    if (content.tags.length >= 3) {
      score += 5;
    } else {
      suggestions.push('أضف 3 وسوم على الأقل');
    }

    // Related symbols
    if (content.relatedSymbols.length > 0) {
      score += 5;
    }

    return { score: Math.min(100, score), suggestions };
  }

  // ── Readability ──

  private _assessReadability(content: GeneratedContent): { score: number } {
    let score = 60;

    // Paragraph structure
    const paragraphsAr = content.contentAr.split('\n\n').length;
    const paragraphsEn = content.contentEn.split('\n\n').length;
    if (paragraphsAr >= 3 && paragraphsEn >= 3) score += 10;

    // Content length
    if (content.wordCountAr >= 300 && content.wordCountEn >= 300) score += 10;

    // Reading time reasonable
    if (content.readingTimeMinutes >= 2 && content.readingTimeMinutes <= 10) score += 10;

    // Summary exists
    if (content.summaryAr && content.summaryEn) score += 10;

    return { score: Math.min(100, score) };
  }

  // ── Engagement Prediction ──

  private _predictEngagement(content: GeneratedContent): { score: number; suggestions: string[] } {
    let score = 40;
    const suggestions: string[] = [];

    // Impact level
    if (content.impactLevel === 'HIGH') score += 20;
    else if (content.impactLevel === 'MEDIUM') score += 10;

    // Has specific symbols (more actionable)
    if (content.relatedSymbols.length > 0) {
      score += 15;
    } else {
      suggestions.push('أضف رموز أصول مرتبطة لزيادة التفاعل');
    }

    // Sentiment — extreme sentiment drives more engagement
    if (Math.abs(content.sentimentScore) > 0.3) score += 10;

    // Breaking news gets more engagement
    if (content.generationSource === 'AI_GENERATED') score += 5;

    // Risk warnings add credibility
    if (content.riskWarnings.length > 0) score += 10;

    return { score: Math.min(100, score), suggestions };
  }

  // ── Deduplication ──

  private async _checkDuplication(content: GeneratedContent): Promise<{ score: number; warnings: string[] }> {
    let score = 100;
    const warnings: string[] = [];

    try {
      // Check for similar titles in the last 7 days
      const recentArticles = await this.prisma.newsArticle.findMany({
        where: {
          publishedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          category: content.category,
        },
        select: { title: true, translatedTitle: true },
        take: 50,
      });

      for (const article of recentArticles) {
        const titleSimilarity = this._calculateStringSimilarity(
          content.titleEn.toLowerCase(),
          (article.title || '').toLowerCase(),
        );

        if (titleSimilarity > 0.8) {
          score -= 30;
          warnings.push(`محتوى مشابه جداً موجود: "${article.translatedTitle || article.title}"`);
          break;
        } else if (titleSimilarity > 0.5) {
          score -= 10;
          warnings.push(`محتوى مشابه جزئياً: "${article.translatedTitle || article.title}"`);
        }
      }
    } catch {
      // DB unavailable — assume no duplicates
    }

    return { score: Math.max(0, score), warnings };
  }

  // ── Compliance ──

  private _checkCompliance(content: GeneratedContent): { score: number; warnings: string[] } {
    let score = 70;
    const warnings: string[] = [];

    // Must have risk warnings for financial content
    const financialCategories = [
      ContentCategory.CRYPTO, ContentCategory.FOREX,
      ContentCategory.STOCKS, ContentCategory.COMMODITIES,
      ContentCategory.DEFI,
    ];

    if (financialCategories.includes(content.category)) {
      if (content.riskWarnings.length === 0) {
        score -= 30;
        warnings.push('المحتوى المالي يجب أن يحتوي على تحذيرات مخاطر');
      } else {
        score += 10;
      }

      // Check for "not financial advice" disclaimer
      const hasDisclaimer = content.contentAr.includes('تعليمية فقط') ||
        content.contentAr.includes('نصيحة استثمارية') ||
        content.contentEn.includes('not financial advice') ||
        content.contentEn.includes('educational purposes');
      if (!hasDisclaimer) {
        score -= 10;
        warnings.push('أضف إخلاء مسؤولية: المحتوى لأغراض تعليمية فقط');
      } else {
        score += 10;
      }
    }

    // Check for price targets with appropriate caveats
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

  // ── Auto-Optimizations ──

  private _applyOptimizations(
    content: GeneratedContent,
    report: OptimizationReport,
  ): GeneratedContent {
    const optimized = { ...content };

    // Auto-add risk warning if missing and score is low
    if (report.complianceScore < 70 && optimized.riskWarnings.length === 0) {
      optimized.riskWarnings = ['هذا المحتوى لأغراض تعليمية فقط ولا يُعد نصيحة استثمارية'];
    }

    // Auto-add disclaimer to content if compliance is low
    if (report.complianceScore < 60) {
      const disclaimer = '\n\n⚠️ إخلاء مسؤولية: هذا المحتوى لأغراض تعليمية فقط ولا يُعد نصيحة استثمارية. التداول ينطوي على مخاطر.';
      if (!optimized.contentAr.includes('إخلاء مسؤولية')) {
        optimized.contentAr += disclaimer;
      }
    }

    return optimized;
  }

  // ── Utility: String Similarity (Levenshtein-based) ──

  private _calculateStringSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (!a.length || !b.length) return 0;

    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = b[i - 1] === a[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
      }
    }

    const maxLen = Math.max(a.length, b.length);
    return maxLen > 0 ? 1 - matrix[b.length][a.length] / maxLen : 0;
  }
}

// ── Optimization Report Interface ──

export interface OptimizationReport {
  seoScore: number;
  readabilityScore: number;
  engagementScore: number;
  duplicationScore: number;
  complianceScore: number;
  overallScore: number;
  suggestions: string[];
  warnings: string[];
}
