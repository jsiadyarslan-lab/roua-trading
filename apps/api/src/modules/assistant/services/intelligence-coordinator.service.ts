// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Intelligence Coordinator Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "المايسترو" — يجمع كل ميزات Intelligence Layer
// في واجهة واحدة + يكشف أن الـ chat يحتاج ذكاء
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import { AutoDiagnosisService, DiagnosisReport } from './auto-diagnosis.service';
import { PatternDetectionService, PatternReport } from './pattern-detection.service';
import { DailyBriefService, DailyBrief } from './daily-brief.service';
import { RiskAlertService, RiskAlertSummary } from './risk-alert.service';

export interface IntelligenceOverview {
  userId: string;
  generatedAt: Date;
  diagnosis?: DiagnosisReport;
  patterns?: PatternReport;
  dailyBrief?: DailyBrief;
  riskAlerts?: RiskAlertSummary;
  // ملخص شامل
  healthScore?: number;
  overallRiskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  topInsight: string;
  topAction: string;
}

@Injectable()
export class IntelligenceCoordinatorService {
  private readonly logger = new Logger(IntelligenceCoordinatorService.name);

  constructor(
    private readonly autoDiagnosis: AutoDiagnosisService,
    private readonly patternDetection: PatternDetectionService,
    private readonly dailyBrief: DailyBriefService,
    private readonly riskAlert: RiskAlertService,
  ) {
    this.logger.log('🧠 IntelligenceCoordinatorService initialized — Phase 5 complete');
  }

  /**
   * تقرير شامل — يجمع كل ميزات Intelligence Layer
   */
  async getOverview(
    userId: string,
    language: string = 'ar',
    options: {
      includeDiagnosis?: boolean;
      includePatterns?: boolean;
      includeDailyBrief?: boolean;
      includeRiskAlerts?: boolean;
      diagnosisDays?: number;
      patternDays?: number;
    } = {},
  ): Promise<IntelligenceOverview> {
    const startTime = Date.now();
    const {
      includeDiagnosis = true,
      includePatterns = true,
      includeDailyBrief = true,
      includeRiskAlerts = true,
      diagnosisDays = 30,
      patternDays = 60,
    } = options;

    this.logger.log(
      `🧠 Generating intelligence overview for user ${userId} (D=${includeDiagnosis}, P=${includePatterns}, DB=${includeDailyBrief}, R=${includeRiskAlerts})`,
    );

    // تنفيذ متوازي
    const promises: Promise<any>[] = [];

    if (includeDiagnosis) {
      promises.push(this.autoDiagnosis.diagnose(userId, diagnosisDays).catch((e) => {
        this.logger.warn(`Diagnosis failed: ${e.message}`);
        return null;
      }));
    } else {
      promises.push(Promise.resolve(null));
    }

    if (includePatterns) {
      promises.push(this.patternDetection.detect(userId, patternDays).catch((e) => {
        this.logger.warn(`Patterns failed: ${e.message}`);
        return null;
      }));
    } else {
      promises.push(Promise.resolve(null));
    }

    if (includeDailyBrief) {
      promises.push(this.dailyBrief.generate(userId, language).catch((e) => {
        this.logger.warn(`Daily brief failed: ${e.message}`);
        return null;
      }));
    } else {
      promises.push(Promise.resolve(null));
    }

    if (includeRiskAlerts) {
      promises.push(this.riskAlert.getAlerts(userId).catch((e) => {
        this.logger.warn(`Risk alerts failed: ${e.message}`);
        return null;
      }));
    } else {
      promises.push(Promise.resolve(null));
    }

    const [diagnosis, patterns, dailyBrief, riskAlerts] = await Promise.all(promises);

    // استخراج الأهم
    const topInsight = this._extractTopInsight(diagnosis, patterns, dailyBrief, riskAlerts, language);
    const topAction = this._extractTopAction(diagnosis, patterns, dailyBrief, riskAlerts, language);

    const durationMs = Date.now() - startTime;
    this.logger.log(`✅ Intelligence overview generated in ${durationMs}ms`);

    return {
      userId,
      generatedAt: new Date(),
      diagnosis: diagnosis ?? undefined,
      patterns: patterns ?? undefined,
      dailyBrief: dailyBrief ?? undefined,
      riskAlerts: riskAlerts ?? undefined,
      healthScore: diagnosis?.summary.healthScore,
      overallRiskLevel: riskAlerts?.overallRiskLevel,
      topInsight,
      topAction,
    };
  }

  /**
   * يكتشف إن كان السؤال يحتاج تفعيل Intelligence Layer
   * (لتحسين الـ chat service)
   */
  shouldUseIntelligence(message: string): {
    useDiagnosis: boolean;
    usePatterns: boolean;
    useDailyBrief: boolean;
    useRiskAlerts: boolean;
  } {
    const lower = message.toLowerCase();

    const hasAny = (words: string[]) =>
      words.some((w) => lower.includes(w.toLowerCase()));

    return {
      useDiagnosis: hasAny([
        'diagnose', 'diagnosis', 'why losing', 'why am i losing', 'what wrong',
        'تشخيص', 'لماذا أخسر', 'ما الخطأ', 'حلّل أدائي', 'في مشكلة',
      ]),
      usePatterns: hasAny([
        'pattern', 'patterns', 'best day', 'worst day', 'best symbol', 'when to trade',
        'نمط', 'أنماط', 'أفضل يوم', 'أسوأ يوم', 'أفضل رمز', 'متى أتاجر',
      ]),
      useDailyBrief: hasAny([
        'daily', 'brief', 'today summary', 'morning brief', 'how is today',
        'يومي', 'موجز', 'ملخص اليوم', 'صباح', 'كيف اليوم',
      ]),
      useRiskAlerts: hasAny([
        'risk', 'alert', 'warning', 'danger', 'safe',
        'مخاطر', 'تنبيه', 'تحذير', 'خطر', 'آمن',
      ]),
    };
  }

  // ─── Helpers ────────────────────────────────────────────────

  private _extractTopInsight(
    diagnosis: DiagnosisReport | null,
    patterns: PatternReport | null,
    dailyBrief: DailyBrief | null,
    riskAlerts: RiskAlertSummary | null,
    language: string,
  ): string {
    const isAr = language === 'ar';

    // أولوية: CRITICAL alerts → diagnosis topIssue → top pattern
    if (riskAlerts && riskAlerts.topPriority) {
      const top = riskAlerts.topPriority;
      if (isAr) {
        return `🚨 ${top.title}: ${top.message}`;
      }
      return `🚨 ${top.title}: ${top.message}`;
    }

    if (diagnosis && diagnosis.topIssues.length > 0) {
      const top = diagnosis.topIssues[0];
      return isAr ? `🔬 ${top.title}: ${top.description}` : `🔬 ${top.title}: ${top.description}`;
    }

    if (patterns && patterns.topStrength) {
      return isAr
        ? `✨ ${patterns.topStrength.name}: ${patterns.topStrength.insight}`
        : `✨ ${patterns.topStrength.name}: ${patterns.topStrength.insight}`;
    }

    if (dailyBrief) {
      return isAr ? `📅 ${dailyBrief.greeting}` : `📅 ${dailyBrief.greeting}`;
    }

    return isAr
      ? 'لا توجد رؤى حرجة حاليًا — الأداء مستقر'
      : 'No critical insights currently — performance is stable';
  }

  private _extractTopAction(
    diagnosis: DiagnosisReport | null,
    patterns: PatternReport | null,
    dailyBrief: DailyBrief | null,
    riskAlerts: RiskAlertSummary | null,
    language: string,
  ): string {
    const isAr = language === 'ar';

    if (riskAlerts && riskAlerts.topPriority) {
      return riskAlerts.topPriority.recommendation;
    }

    if (diagnosis && diagnosis.actionableSteps.length > 0) {
      const step = diagnosis.actionableSteps[0];
      return isAr
        ? `[${step.priority}] ${step.action}`
        : `[${step.priority}] ${step.action}`;
    }

    if (patterns && patterns.topWeakness) {
      return patterns.topWeakness.insight;
    }

    if (dailyBrief && dailyBrief.recommendations.length > 0) {
      return dailyBrief.recommendations[0];
    }

    return isAr
      ? 'تابع المراقبة — راجع أداءك أسبوعيًا'
      : 'Continue monitoring — review your performance weekly';
  }
}
