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
  private readonly RETENTION_DAYS = {
    riskEvent: 3,           // نمو عالي جداً
    auditLog: 7,            // نمو عالي
    aiUsageLog: 7,          // نمو عالي
    orderEvent: 14,         // نمو متوسط
    tradeLifecycleLog: 14,  // نمو متوسط
    positionReconciliation: 14, // نمو منخفض
    marketRegimeSnapshot: 14,   // نمو متوسط
    systemMemory: 14,       // نمو منخفض
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
      'riskEvent',
      'createdAt',
      this.RETENTION_DAYS.riskEvent,
    );

    // 2. AuditLog — 7 أيام
    totalDeleted += await this.cleanupTable(
      'auditLog',
      'createdAt',
      this.RETENTION_DAYS.auditLog,
    );

    // 3. AiUsageLog — 7 أيام
    totalDeleted += await this.cleanupTable(
      'aiUsageLog',
      'createdAt',
      this.RETENTION_DAYS.aiUsageLog,
    );

    // 4. OrderEvent — 14 يوم (حقل التاريخ = timestamp)
    totalDeleted += await this.cleanupTable(
      'orderEvent',
      'timestamp',
      this.RETENTION_DAYS.orderEvent,
    );

    // 5. TradeLifecycleLog — 14 يوم
    totalDeleted += await this.cleanupTable(
      'tradeLifecycleLog',
      'createdAt',
      this.RETENTION_DAYS.tradeLifecycleLog,
    );

    // 6. PositionReconciliation — 14 يوم
    totalDeleted += await this.cleanupTable(
      'positionReconciliation',
      'createdAt',
      this.RETENTION_DAYS.positionReconciliation,
    );

    // 7. MarketRegimeSnapshot — 14 يوم
    totalDeleted += await this.cleanupTable(
      'marketRegimeSnapshot',
      'createdAt',
      this.RETENTION_DAYS.marketRegimeSnapshot,
    );

    // 8. SystemMemory — 14 يوم
    totalDeleted += await this.cleanupTable(
      'systemMemory',
      'createdAt',
      this.RETENTION_DAYS.systemMemory,
    );

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

      // استخدم raw SQL للحذف (أسرع من Prisma deleteMany للأعداد الكبيرة)
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
