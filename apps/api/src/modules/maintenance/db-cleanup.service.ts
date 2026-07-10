import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * BUG-066r: Database Cleanup Service
 *
 * المشكلة:
 *   8 جداول تنمو بلا حدود — لا يوجد cleanup في أي مكان.
 *   RiskEvent وحده يُنتج ~31,000 صف/يوم (كل validateOrder يكتب row).
 *   خلال 3 أيام: ~93,000 صف فقط من RiskEvent → تضخم DB → بطء كل queries.
 *
 * الحل:
 *   cron job يحذف السجلات القديمة من 8 جداول كل 6 ساعات.
 *   فترة الاحتفاظ تتناسب مع معدل النمو والأهمية:
 *     - RiskEvent: 3 أيام (نمو عالي جداً، للتشخيص فقط)
 *     - AuditLog: 7 أيام (نمو عالي، audit trail مهم)
 *     - AiUsageLog: 7 أيام (نمو عالي، تتبع التكاليف)
 *     - OrderEvent: 14 يوم (نمو متوسط)
 *     - TradeLifecycleLog: 14 يوم (نمو متوسط)
 *     - PositionReconciliation: 14 يوم (نمو منخفض)
 *     - MarketRegimeSnapshot: 14 يوم (نمو متوسط)
 *     - SystemMemory: 14 يوم (نمو منخفض)
 *
 * الأمان:
 *   - deleteMany فقط (لا يحذف جداول، فقط صفوف قديمة)
 *   - يفحص prisma.isAvailable() قبل أي عملية
 *   - يسجّل عدد الصفوف المحذوفة لكل جدول
 *   - لا يحذف Position, Trade, Order (بيانات مالية مهمة)
 *   - يعمل كل 6 ساعات (ليس كل دقيقة — لا حاجة)
 */
@Injectable()
export class DbCleanupService implements OnModuleInit {
  private readonly logger = new Logger('DbCleanup');

  // فترات الاحتفاظ (بالأيام)
  // BUG-066s FIX: استخدم PascalCase لمطابقة أسماء الجداول الفعلية في PostgreSQL
  // (PostgreSQL quoted identifiers حساسة لحالة الأحرف)
  private readonly RETENTION_DAYS = {
    RiskEvent: 3,           // نمو عالي جداً
    AuditLog: 7,            // نمو عالي
    AiUsageLog: 7,          // نمو عالي
    OrderEvent: 14,         // نمو متوسط
    TradeLifecycleLog: 14,  // نمو متوسط
    PositionReconciliation: 14, // نمو منخفض
    MarketRegimeSnapshot: 14,   // نمو متوسط
    SystemMemory: 14,       // نمو منخفض
    // BUG-066r+: جداول إضافية بلا cleanup
    CouncilVoteAccuracy: 14,
    TradeJournal: 30,       // بيانات أداء — احتفاظ أطول
    CrossPairCorrelation: 14,
    AdaptiveSchedule: 14,
    NewsArticle: 30,
    ContentArticle: 30,
    ContentSchedule: 14,
    StrategyReport: 30,
    Alert: 14,
    UserNotification: 14,
  };

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    // شغّل cleanup مرة واحدة عند الإقلاع (لتنظيف أي تراكم من الجلسة السابقة)
    // ثم اترك الـ @Cron يتولى الباقي كل 6 ساعات.
    this.logger.log('🧹 BUG-066r: DB Cleanup Service initialized — will run on startup + every 6 hours');
    // أجّل التشغيل الأول 30 ثانية (دع المشروع يقلع أولاً)
    setTimeout(() => this.runCleanup().catch(() => {}), 30_000);
  }

  /**
   * يُشغّل كل 6 ساعات عبر @Cron.
   * أيضاً يُشغّل مرة واحدة عند الإقلاع (في onModuleInit).
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async runCleanup(): Promise<void> {
    if (!this.prisma?.isAvailable?.()) {
      this.logger.debug('DB unavailable — skipping cleanup');
      return;
    }

    this.logger.log('🧹 BUG-066r: Starting DB cleanup...');
    const startTime = Date.now();
    let totalDeleted = 0;

    // 1. RiskEvent — 3 أيام
    totalDeleted += await this.cleanupTable(
      'RiskEvent',
      'createdAt',
      this.RETENTION_DAYS.RiskEvent,
    );

    // 2. AuditLog — 7 أيام
    totalDeleted += await this.cleanupTable(
      'AuditLog',
      'createdAt',
      this.RETENTION_DAYS.AuditLog,
    );

    // 3. AiUsageLog — 7 أيام
    totalDeleted += await this.cleanupTable(
      'AiUsageLog',
      'createdAt',
      this.RETENTION_DAYS.AiUsageLog,
    );

    // 4. OrderEvent — 14 يوم (حقل التاريخ = timestamp)
    totalDeleted += await this.cleanupTable(
      'OrderEvent',
      'timestamp',
      this.RETENTION_DAYS.OrderEvent,
    );

    // 5. TradeLifecycleLog — 14 يوم
    totalDeleted += await this.cleanupTable(
      'TradeLifecycleLog',
      'createdAt',
      this.RETENTION_DAYS.TradeLifecycleLog,
    );

    // 6. PositionReconciliation — 14 يوم
    totalDeleted += await this.cleanupTable(
      'PositionReconciliation',
      'createdAt',
      this.RETENTION_DAYS.PositionReconciliation,
    );

    // 7. MarketRegimeSnapshot — 14 يوم
    totalDeleted += await this.cleanupTable(
      'MarketRegimeSnapshot',
      'createdAt',
      this.RETENTION_DAYS.MarketRegimeSnapshot,
    );

    // 8. SystemMemory — 14 يوم
    totalDeleted += await this.cleanupTable(
      'SystemMemory',
      'createdAt',
      this.RETENTION_DAYS.SystemMemory,
    );

    // 9-18. جداول إضافية (BUG-066r+)
    totalDeleted += await this.cleanupTable('CouncilVoteAccuracy', 'createdAt', this.RETENTION_DAYS.CouncilVoteAccuracy);
    totalDeleted += await this.cleanupTable('TradeJournal', 'createdAt', this.RETENTION_DAYS.TradeJournal);
    totalDeleted += await this.cleanupTable('CrossPairCorrelation', 'createdAt', this.RETENTION_DAYS.CrossPairCorrelation);
    totalDeleted += await this.cleanupTable('AdaptiveSchedule', 'createdAt', this.RETENTION_DAYS.AdaptiveSchedule);
    totalDeleted += await this.cleanupTable('NewsArticle', 'createdAt', this.RETENTION_DAYS.NewsArticle);
    totalDeleted += await this.cleanupTable('ContentArticle', 'createdAt', this.RETENTION_DAYS.ContentArticle);
    totalDeleted += await this.cleanupTable('ContentSchedule', 'createdAt', this.RETENTION_DAYS.ContentSchedule);
    totalDeleted += await this.cleanupTable('StrategyReport', 'createdAt', this.RETENTION_DAYS.StrategyReport);
    totalDeleted += await this.cleanupTable('Alert', 'createdAt', this.RETENTION_DAYS.Alert);
    totalDeleted += await this.cleanupTable('UserNotification', 'createdAt', this.RETENTION_DAYS.UserNotification);

    const elapsedMs = Date.now() - startTime;
    this.logger.log(
      `🧹 BUG-066r: DB cleanup complete — ${totalDeleted} rows deleted in ${elapsedMs}ms`,
    );

  }

  
  /**
   * يحذف الصفوف الأقدم من retentionDays من جدول واحد.
   * يستخدم deleteMany مع where على حقل التاريخ.
   * يعود بعدد الصفوف المحذوفة.
   */
  private async cleanupTable(
    modelName: string,
    dateField: string,
    retentionDays: number,
  ): Promise<number> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - retentionDays);

      // استخدم raw SQL عبر $executeRaw (tagged template — يشارك Prisma connection)
      const result = await this.prisma.$executeRaw`
        DELETE FROM "${modelName}"
        WHERE "${dateField}" < ${cutoff}
      `;

      if (result > 0) {
        this.logger.log(
          `  🗑️ ${modelName}: ${result} rows deleted (older than ${retentionDays} days)`,
        );
      }
      return result;
    } catch (err: any) {
      // لا تُسقط الـ cleanup كله لو جدول واحد فشل
      this.logger.warn(
        `  ⚠️ ${modelName} cleanup failed: ${err?.message} — continuing`,
      );
      return 0;
    }
  }
}
