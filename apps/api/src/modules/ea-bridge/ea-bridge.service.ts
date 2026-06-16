// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — EA Bridge Service
// الخدمة المركزية لجسر الاتصال بين EA والكلاود
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// هذا هو "القلب" الذي يربط بين:
//   MT5 EA (محلي) ←→ EA Bridge Service (كلاود) ←→ Strategic Council (AI)
//
// المسار:
//   1. Strategic Council يُنشئ TradingBriefs كل 5 دقائق
//   2. EA Bridge يوزع الـ Briefs المناسبة لكل EA
//   3. EA ينفذ الصفقة مباشرة على MT5 (لا حاجة للمنفذ الذكي أو الوكيل)
//   4. EA يُبلغ الكلاود بنتيجة التنفيذ
//   5. الكلاود يُحدّث السجلات في قاعدة البيانات
//
// لماذا EA ينفذ مباشرة بدلاً من المرور عبر SmartExecutor؟
//   - EA يعمل داخل MT5 مباشرة = تنفيذ أسرع (لا تأخير شبكة إضافي)
//   - EA يتحكم في SL/TP محلياً = استجابة فورية لتغيرات السعر
//   - لا حاجة لـ MetaAPI = توفير التكلفة
//   - العزل الطبيعي = كل EA يعمل على حساب MT5 خاص بالمستخدم
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AuditService } from '../../audit/audit.service';
import { EABrief, EAConfig, EAHeartbeat, EAExecutionReport, EABridgeResponse, EAPositionUpdate } from './ea-bridge.types';
import { MT5_SUPPORTED_PAIRS } from '../ai/strategic-council/strategic-council.types';

@Injectable()
export class EABridgeService {
  private readonly logger = new Logger(EABridgeService.name);

  /** Redis keys */
  private readonly BRIEF_QUEUE_PREFIX = 'ea:briefs:';        // ea:briefs:{userId}
  private readonly HEARTBEAT_PREFIX = 'ea:heartbeat:';       // ea:heartbeat:{userId}
  private readonly CONFIG_PREFIX = 'ea:config:';             // ea:config:{userId}
  private readonly EXECUTED_BRIEF_PREFIX = 'ea:executed:';   // ea:executed:{briefId}

  /** Default EA configuration */
  private readonly DEFAULT_CONFIG: EAConfig = {
    pollIntervalMs: 30000,          // 30 ثانية
    maxSlippagePercent: 0.3,        // 0.3%
    riskPerTradePercent: 2.0,       // 2% من رأس المال
    maxOpenPositions: 5,            // 5 مراكز كحد أقصى
    maxDailyLossPercent: 5.0,       // 5% خسارة يومية كحد أقصى
    allowedPairs: [...MT5_SUPPORTED_PAIRS],
    magicNumber: 777007,           // الرقم السحري لتمييز صفقات رؤى
    enabled: true,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly auditService: AuditService,
  ) {
    this.logger.log('🌉 EA Bridge Service initialized — connecting MT5 to AI Council');

    // V227: الاستماع لقناة Redis لتلقي التوصيات فوراً من المجلس الاستراتيجي
    this._subscribeToBriefChannel();
  }

  /**
   * V227: الاشتراك في قناة Redis لتلقي التوصيات فوراً
   * عندما يُصدر المجلس الاستراتيجي توصية جديدة، نستقبلها هنا
   * ونوزعها على المستخدمين الذين لديهم EA نشط
   */
  private _subscribeToBriefChannel(): void {
    try {
      this.redis.subscribe('ea:briefs:global', (message: string) => {
        try {
          const brief: EABrief = JSON.parse(message);
          this._distributeBriefToActiveEAs(brief);
        } catch (error: any) {
          this.logger.warn(`EA Bridge: Failed to parse brief from channel: ${error.message}`);
        }
      });
      this.logger.log('🌉 EA Bridge: Subscribed to brief distribution channel');
    } catch (error: any) {
      this.logger.warn(`EA Bridge: Could not subscribe to brief channel: ${error.message}`);
    }
  }

  /**
   * V227: توزيع توصية على جميع مستخدمي EA النشطين
   * يبحث عن المستخدمين الذين لديهم EA نشط ويضيف التوصية لطوابيرهم
   */
  private async _distributeBriefToActiveEAs(brief: EABrief): Promise<void> {
    try {
      // التحقق من أن الزوج مدعوم في MT5
      if (!MT5_SUPPORTED_PAIRS.includes(brief.pair)) {
        this.logger.debug(`EA Bridge: Skipping brief for ${brief.pair} — not supported on MT5`);
        return;
      }

      // البحث عن المستخدمين النشطين (لديهم heartbeat حديث)
      // نبحث في Redis عن جميع مفاتيح heartbeat
      const heartbeatKeys = await this.redis.keys('ea:heartbeat:*');

      for (const key of heartbeatKeys) {
        try {
          const raw = await this.redis.get(key);
          if (!raw) continue;

          const heartbeat = JSON.parse(raw);
          const userId = heartbeat.userId;

          if (!userId) continue;

          // التحقق من أن EA لا يزال نشطاً (آخر نبضة خلال 5 دقائق)
          const lastHeartbeat = new Date(heartbeat.receivedAt || 0);
          const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
          if (lastHeartbeat < fiveMinAgo) continue;

          // إضافة التوصية لطابور المستخدم
          await this.pushBriefToEA(userId, brief);
        } catch {
          // تخطي المستخدم الذي فشلت معالجته
        }
      }

      this.logger.log(`🌉 EA Bridge: Brief distributed to ${heartbeatKeys.length} active EAs — ${brief.pair} ${brief.direction}`);
    } catch (error: any) {
      this.logger.warn(`EA Bridge: Failed to distribute brief: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 1. BRIEF DISTRIBUTION — توزيع التوصيات على EA
  // ═══════════════════════════════════════════════════════════

  /**
   * Get pending briefs for an EA
   * EA يستدعي هذا كل 30 ثانية للحصول على التوصيات الجديدة
   */
  async getPendingBriefs(userId: string): Promise<EABridgeResponse<EABrief[]>> {
    try {
      // 1. جلب التوصيات النشطة من Redis queue
      const queueKey = `${this.BRIEF_QUEUE_PREFIX}${userId}`;
      const rawBriefs = await this.redis.getList(queueKey, 0, 19); // آخر 20 توصية

      // 2. جلب التوصيات التي لم تُنفذ بعد
      const briefs: EABrief[] = [];
      for (const raw of rawBriefs) {
        try {
          const brief: EABrief = JSON.parse(raw);

          // التحقق من أن التوصية لم تنتهِ صلاحيتها
          if (new Date(brief.expiresAt) > new Date()) {
            // التحقق من أن التوصية لم تُنفذ بالفعل
            const executedKey = `${this.EXECUTED_BRIEF_PREFIX}${brief.id}`;
            const alreadyExecuted = await this.redis.get(executedKey);
            if (!alreadyExecuted) {
              briefs.push(brief);
            }
          }
        } catch {
          // بيانات تالفة — نتخطاها
        }
      }

      // 3. إذا لم نجد في Redis، نبحث في قاعدة البيانات
      if (briefs.length === 0) {
        const dbBriefs = await this._fetchBriefsFromDB(userId);
        briefs.push(...dbBriefs);
      }

      // 4. جلب إعدادات EA
      const config = await this._getEAConfig(userId);

      this.logger.debug(`🌉 EA Bridge: ${briefs.length} pending briefs for user ${userId.substring(0, 8)}...`);

      return {
        success: true,
        data: briefs,
        serverTime: new Date().toISOString(),
        nextPollMs: config.pollIntervalMs,
      };
    } catch (error: any) {
      this.logger.error(`EA Bridge getPendingBriefs error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        serverTime: new Date().toISOString(),
      };
    }
  }

  /**
   * Push a trading brief to an EA's queue
   * يُستدعى من Strategic Council بعد إنشاء توصية جديدة
   */
  async pushBriefToEA(userId: string, brief: EABrief): Promise<void> {
    try {
      const queueKey = `${this.BRIEF_QUEUE_PREFIX}${userId}`;
      await this.redis.pushToList(queueKey, JSON.stringify(brief));

      // TTL للقائمة: ساعة واحدة (تنظيف تلقائي)
      await this.redis.expire(queueKey, 3600);

      this.logger.log(`🌉 Brief pushed to EA: ${brief.pair} ${brief.direction} @ ${brief.entryPrice} (confidence: ${brief.confidence}%)`);
    } catch (error: any) {
      this.logger.error(`EA Bridge pushBrief error: ${error.message}`);
    }
  }

  /**
   * Fetch active TradingBriefs from database
   * Fallback when Redis is empty
   */
  private async _fetchBriefsFromDB(userId: string): Promise<EABrief[]> {
    try {
      // البحث عن أوامر/مراكز نشطة مرتبطة بالمجلس الاستراتيجي
      const positions = await this.prisma.position.findMany({
        where: {
          userId,
          status: 'OPEN',
          source: { in: ['council', 'agent', 'smart_executor'] },
        },
        orderBy: { openedAt: 'desc' },
        take: 10,
      });

      // تحويل المراكز المفتوحة إلى EA Briefs
      // (هذا يسمح لـ EA بمزامنة المراكز المفتوحة)
      return positions.map(p => ({
        id: p.id,
        pair: p.symbol,
        direction: (p.side as 'BUY' | 'SELL'),
        entryPrice: (p.entryPrice as any)?.toNumber?.() ?? Number(p.entryPrice),
        stopLoss: (p.stopLoss as any)?.toNumber?.() ?? Number(p.stopLoss || 0),
        takeProfit: (p.takeProfit as any)?.toNumber?.() ?? Number(p.takeProfit || 0),
        confidence: 60,
        timeframe: p.timeframe || 'H1',
        analysisSummary: `مزامنة مركز مفتوح من المجلس الاستراتيجي`,
        issuedAt: p.openedAt?.toISOString() || new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        lotSize: this._calculateLotSize(p),
        strictRules: {
          maxSlippage: 0.003,
        },
      }));
    } catch (error: any) {
      this.logger.warn(`EA Bridge: Could not fetch briefs from DB: ${error.message}`);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 2. HEARTBEAT — نبضات الحياة من EA
  // ═══════════════════════════════════════════════════════════

  /**
   * Process EA heartbeat
   * EA يرسل نبضة حياة كل 30 ثانية
   */
  async processHeartbeat(userId: string, heartbeat: EAHeartbeat): Promise<EABridgeResponse<{ acknowledged: boolean }>> {
    try {
      // تخزين حالة EA في Redis
      const key = `${this.HEARTBEAT_PREFIX}${userId}`;
      await this.redis.set(key, JSON.stringify({
        ...heartbeat,
        userId,
        receivedAt: new Date().toISOString(),
      }), 5 * 60 * 1000); // TTL: 5 دقائق

      // تسجيل النبضة
      await this.auditService.log({
        userId,
        action: 'EA_HEARTBEAT',
        resource: 'ea-bridge',
        details: JSON.stringify({
          account: heartbeat.mt5AccountNumber,
          balance: heartbeat.balance,
          positions: heartbeat.openPositions,
          uptime: heartbeat.uptime,
        }),
      });

      // التحقق من إعدادات EA
      const config = await this._getEAConfig(userId);

      return {
        success: true,
        data: { acknowledged: true },
        serverTime: new Date().toISOString(),
        nextPollMs: config.pollIntervalMs,
      };
    } catch (error: any) {
      this.logger.error(`EA Bridge heartbeat error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        serverTime: new Date().toISOString(),
      };
    }
  }

  /**
   * Get EA status (last heartbeat)
   * يُستخدم في لوحة التحكم لعرض حالة EA
   */
  async getEAStatus(userId: string): Promise<{ online: boolean; lastHeartbeat?: any }> {
    try {
      const key = `${this.HEARTBEAT_PREFIX}${userId}`;
      const raw = await this.redis.get(key);
      if (raw) {
        return { online: true, lastHeartbeat: JSON.parse(raw) };
      }
      return { online: false };
    } catch {
      return { online: false };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 3. EXECUTION REPORT — تقارير التنفيذ من EA
  // ═══════════════════════════════════════════════════════════

  /**
   * Process execution report from EA
   * يُرسل بعد كل تنفيذ (نجاح أو فشل)
   */
  async processExecutionReport(userId: string, report: EAExecutionReport): Promise<EABridgeResponse> {
    try {
      // 1. تسجيل التقرير
      this.logger.log(
        `🌉 EA Execution: ${report.executed ? '✅' : '❌'} ${report.pair} ${report.direction} ` +
        `brief=${report.briefId} ticket=${report.ticket || 'N/A'} ` +
        `${report.error ? `error="${report.error}"` : `price=${report.entryPrice}`}`
      );

      // 2. تعليم التوصية كمنفذة
      const executedKey = `${this.EXECUTED_BRIEF_PREFIX}${report.briefId}`;
      await this.redis.set(executedKey, JSON.stringify({
        ...report,
        userId,
        processedAt: new Date().toISOString(),
      }), 24 * 60 * 60 * 1000); // TTL: 24 ساعة

      // 3. تحديث قاعدة البيانات إذا نجح التنفيذ
      if (report.executed && report.ticket) {
        await this._recordEAExecution(userId, report);
      }

      // 4. تسجيل تدقيق
      await this.auditService.log({
        userId,
        action: report.executed ? 'EA_TRADE_EXECUTED' : 'EA_TRADE_FAILED',
        resource: 'ea-bridge',
        details: JSON.stringify({
          briefId: report.briefId,
          pair: report.pair,
          direction: report.direction,
          executed: report.executed,
          entryPrice: report.entryPrice,
          ticket: report.ticket,
          slippage: report.actualSlippage,
          error: report.error,
        }),
      });

      return {
        success: true,
        serverTime: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`EA Bridge execution report error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        serverTime: new Date().toISOString(),
      };
    }
  }

  /**
   * Record EA trade execution in database
   * ينشئ Position و Trade في قاعدة البيانات
   */
  private async _recordEAExecution(userId: string, report: EAExecutionReport): Promise<void> {
    try {
      // البحث عن بيانات الاعتماد MT5 للمستخدم
      const credential = await this.prisma.exchangeCredential.findFirst({
        where: {
          userId,
          exchange: { in: ['mt5', 'mt5_demo', 'metatrader5', 'metatrader'] },
          isValid: true,
        },
      });

      if (!credential) {
        this.logger.warn(`EA Bridge: No MT5 credential found for user ${userId.substring(0, 8)}... — execution not recorded in DB`);
        return;
      }

      // إنشاء أو تحديث المركز في قاعدة البيانات
      const existingPosition = await this.prisma.position.findFirst({
        where: {
          userId,
          exchangeOrderId: String(report.ticket),
          status: 'OPEN',
        },
      });

      if (!existingPosition) {
        const meta = this._getSymbolMeta(report.pair);
        await this.prisma.position.create({
          data: {
            userId,
            credentialId: credential.id,
            symbol: report.pair,
            side: report.direction,
            type: 'MARKET',
            status: 'OPEN',
            entryPrice: report.entryPrice || 0,
            quantity: report.lotSize || 0.01,
            stopLoss: 0,  // EA يتحكم في SL/TP محلياً
            takeProfit: 0,
            source: 'ea_bridge',
            exchange: credential.exchange,
            exchangeOrderId: String(report.ticket),
            exchangeSymbol: this._toMT5Symbol(report.pair),
            openedAt: new Date(),
            timeframe: 'H1',
            version: 0,
          },
        });

        this.logger.log(`🌉 EA Bridge: Position recorded in DB — ticket #${report.ticket}`);
      }
    } catch (error: any) {
      this.logger.error(`EA Bridge: Could not record execution in DB: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 4. POSITION SYNC — مزامنة المراكز
  // ═══════════════════════════════════════════════════════════

  /**
   * Process position updates from EA
   * EA يرسل تحديثات المراكز بشكل دوري
   */
  async processPositionUpdate(userId: string, update: EAPositionUpdate): Promise<EABridgeResponse> {
    try {
      // تخزين المراكز الحالية في Redis (وصول سريع)
      const key = `ea:positions:${userId}`;
      await this.redis.set(key, JSON.stringify(update), 5 * 60 * 1000);

      // مزامنة المراكز المغلقة مع قاعدة البيانات
      for (const pos of update.positions) {
        await this._syncPositionWithDB(userId, pos);
      }

      return {
        success: true,
        serverTime: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`EA Bridge position update error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        serverTime: new Date().toISOString(),
      };
    }
  }

  /**
   * Sync a single position with DB
   * يحدّث المراكز المفتوحة والمغلقة
   */
  private async _syncPositionWithDB(userId: string, pos: any): Promise<void> {
    try {
      const existing = await this.prisma.position.findFirst({
        where: {
          userId,
          exchangeOrderId: String(pos.ticket),
        },
      });

      if (existing && existing.status === 'OPEN') {
        // المركز لا يزال مفتوحاً — نحدّث P&L
        await this.prisma.position.update({
          where: { id: existing.id },
          data: {
            currentPrice: pos.currentPrice,
            unrealizedPnl: pos.profit,
          },
        });
      }
    } catch (error: any) {
      // Non-critical
      this.logger.debug(`EA Bridge: Position sync skipped for ticket ${pos.ticket}: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 5. CONFIG — إعدادات EA
  // ═══════════════════════════════════════════════════════════

  /**
   * Get EA configuration
   */
  async _getEAConfig(userId: string): Promise<EAConfig> {
    try {
      const key = `${this.CONFIG_PREFIX}${userId}`;
      const cached = await this.redis.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Fallback to defaults
    }
    return { ...this.DEFAULT_CONFIG };
  }

  /**
   * Update EA configuration
   */
  async updateEAConfig(userId: string, config: Partial<EAConfig>): Promise<EAConfig> {
    const current = await this._getEAConfig(userId);
    const updated = { ...current, ...config };

    const key = `${this.CONFIG_PREFIX}${userId}`;
    await this.redis.set(key, JSON.stringify(updated), 24 * 60 * 60 * 1000);

    return updated;
  }

  // ═══════════════════════════════════════════════════════════
  // 6. TOKEN MANAGEMENT — إدارة رموز EA
  // ═══════════════════════════════════════════════════════════

  /**
   * Generate a new EA token for a user
   * كل مستخدم يحصل على رمز فريد يربط EA بحسابه
   */
  async generateEAToken(userId: string, label: string, mt5AccountNumber?: string, mt5Server?: string): Promise<{ token: string }> {
    // إنشاء رمز عشوائي آمن
    const crypto = await import('crypto');
    const randomPart = crypto.randomBytes(24).toString('hex');
    const token = `ea_live_${randomPart}`;

    try {
      // حفظ في جدول EAToken (V227: الآن نموذج Prisma موجود)
      await this.prisma.eAToken.create({
        data: {
          userId,
          token,
          label,
          mt5AccountNumber: mt5AccountNumber || null,
          mt5Server: mt5Server || null,
          isActive: true,
        },
      });
    } catch (error: any) {
      // إذا فشل حفظ في DB، نحفظ في Redis كبديل مؤقت
      this.logger.warn(`EA Bridge: Could not save token to DB: ${error.message} — storing in Redis (temporary)`);
      try {
        await this.redis.set(
          `ea-token:${token}`,
          JSON.stringify({ id: crypto.randomUUID(), userId, token, label, mt5AccountNumber, mt5Server, isActive: true }),
          365 * 24 * 60 * 60 * 1000, // سنة واحدة
        );
      } catch {
        // حتى Redis فشل — نرمي الخطأ الأصلي
        throw error;
      }
    }

    // تسجيل تدقيق
    await this.auditService.log({
      userId,
      action: 'EA_TOKEN_GENERATED',
      resource: 'ea-bridge',
      details: JSON.stringify({ label, mt5AccountNumber, mt5Server }),
    });

    this.logger.log(`🌉 EA Token generated for user ${userId.substring(0, 8)}... — label: "${label}"`);

    return { token };
  }

  /**
   * List all EA tokens for a user
   * يُستخدم في لوحة التحكم لعرض التوكنات
   */
  async listEATokens(userId: string): Promise<EABridgeResponse> {
    try {
      const tokens = await this.prisma.eAToken.findMany({
        where: { userId, isActive: true },
        orderBy: { createdAt: 'desc' },
      });

      return {
        success: true,
        data: tokens.map(t => ({
          id: t.id,
          token: t.token,
          label: t.label,
          mt5AccountNumber: t.mt5AccountNumber,
          mt5Server: t.mt5Server,
          isActive: t.isActive,
          lastHeartbeatAt: t.lastHeartbeatAt?.toISOString() || null,
          createdAt: t.createdAt.toISOString(),
        })),
        serverTime: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.warn(`EA Bridge: Could not list tokens: ${error.message}`);
      return {
        success: true,
        data: [],
        serverTime: new Date().toISOString(),
      };
    }
  }

  /**
   * Revoke an EA token
   */
  async revokeEAToken(userId: string, tokenId: string): Promise<void> {
    try {
      await this.prisma.eAToken.updateMany({
        where: { id: tokenId, userId },
        data: { isActive: false },
      });
    } catch (error: any) {
      this.logger.warn(`EA Bridge: Could not revoke token in DB: ${error.message}`);
    }

    // مسح كاش المصادقة
    try {
      const keys = await this.redis.keys('ea-token:*');
      for (const key of keys) {
        const val = await this.redis.get(key);
        if (val) {
          const parsed = JSON.parse(val);
          if (parsed.id === tokenId) {
            await this.redis.del(key);
          }
        }
      }
    } catch {
      // Non-critical
    }

    await this.auditService.log({
      userId,
      action: 'EA_TOKEN_REVOKED',
      resource: 'ea-bridge',
      details: JSON.stringify({ tokenId }),
    });
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════

  /**
   * Convert pair format: EUR/USD → EURUSD (MT5 format)
   */
  private _toMT5Symbol(pair: string): string {
    return pair.replace('/', '').replace('USDT', 'USD');
  }

  /**
   * Calculate lot size from position data
   */
  private _calculateLotSize(position: any): number {
    const qty = (position.quantity as any)?.toNumber?.() ?? Number(position.quantity || 0);
    const price = (position.entryPrice as any)?.toNumber?.() ?? Number(position.entryPrice || 1);
    // تقدير بسيط: الكمية / السعر = حجم اللوت
    // في الفوركس: 1 لوت قياسي = 100,000 وحدة
    const meta = this._getSymbolMeta(position.symbol);
    if (meta.assetClass === 'FOREX') {
      return Math.max(0.01, Math.round((qty / 100000) * 100) / 100);
    } else if (meta.assetClass === 'COMMODITY') {
      return Math.max(0.01, Math.round(qty * 100) / 100);
    }
    return Math.max(0.01, Math.round(qty * 1000) / 1000);
  }

  /**
   * Get symbol metadata (simplified)
   */
  private _getSymbolMeta(symbol: string): { assetClass: string } {
    const forexPairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'NZD/USD', 'USD/CAD'];
    const commodityPairs = ['XAU/USD', 'XAG/USD'];
    const cryptoPairs = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'ADA/USDT', 'XRP/USDT', 'DOGE/USDT'];

    if (forexPairs.includes(symbol)) return { assetClass: 'FOREX' };
    if (commodityPairs.includes(symbol)) return { assetClass: 'COMMODITY' };
    if (cryptoPairs.includes(symbol)) return { assetClass: 'CRYPTO' };
    return { assetClass: 'UNKNOWN' };
  }
}
