// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — اللاسع (Lasic Scalper Agent)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// وكيل التداول فائق السرعة.
// يستمع لـ OANDA/Binance streaming مباشرةً،
// يحسب OBI على كل tick، وينفذ في أقل من 5ms
// بدون استدعاء AI أو HTTP خارجي في المسار الحرج.
//
// الإشارة الأساسية: Order Book Imbalance (OBI)
//   OBI = (bidPressure - askPressure) / (bidPressure + askPressure)
//   OBI > +threshold → BUY
//   OBI < -threshold → SELL
//
// شروط الأمان (3 فقط — كلها Redis، لا HTTP):
//   1. لا يوجد مركز مفتوح على نفس الزوج
//   2. OBI ثابت في آخر 3 ticks متتالية
//   3. spread ≤ 1.5× متوسط spread آخر 5 دقائق
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { OandaStreamingService, OandaPriceUpdate } from '../../modules/exchange/adapters/oanda-streaming.service';
import { BinanceStreamingService, BinancePriceUpdate } from '../../modules/exchange/adapters/binance-streaming.service';
import { TradingService } from '../../modules/trading/trading.service';
import {
  LazicTick,
  OBIResult,
  LazicUserState,
  DEFAULT_LAZIC_CONFIG,
  LAZIC_SUPPORTED_SYMBOLS,
  LAZIC_REDIS_KEYS,
} from './lazic.types';
// BUG-038 FIX: استخدم getSymbolMetadata بدل contractSize مُشفّر يدوياً
import { getSymbolMetadata } from '../../modules/trading/services/symbol-metadata';
// BUG-041 FIX: حقن UnifiedRiskService لفحص الصفقة قبل التنفيذ (مثل المنفّذ الذكي والوكيل)
import { UnifiedRiskService } from '../../modules/trading/services/unified-risk.service';

// عدد الـ ticks المحفوظة في ذاكرة لحساب OBI
const TICK_WINDOW_SIZE = 20;

// عدد الـ ticks لحساب متوسط spread (≈ 5 دقائق عند tick/5s)
const SPREAD_AVG_WINDOW = 60;

// معدل التحقق من مزامنة المستخدمين (كل 30 ثانية)
const USER_SYNC_INTERVAL_MS = 30_000;

@Injectable()
export class LazicService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('اللاسع');

  // نافذة ticks لكل زوج { symbol → LazicTick[] }
  private readonly tickWindows = new Map<string, LazicTick[]>();

  // نافذة spread لكل زوج { symbol → number[] }
  private readonly spreadWindows = new Map<string, number[]>();

  // آخر 3 إشارات OBI لكل زوج (للتحقق من الثبات)
  private readonly obiHistory = new Map<string, number[]>();

  // حالة المستخدمين النشطين { userId → LazicUserState }
  private activeUsers = new Map<string, LazicUserState>();

  // معرّف مؤقت المزامنة
  private syncTimer: NodeJS.Timeout | null = null;

  // تتبع الـ callbacks لإلغاء الاشتراك عند destroy
  private readonly oandaCallback: (d: OandaPriceUpdate) => void;
  private readonly binanceCallback: (d: BinancePriceUpdate) => void;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly oanda: OandaStreamingService,
    private readonly binance: BinanceStreamingService,
    private readonly tradingService: TradingService,
    // BUG-041: UnifiedRiskService injected lazily to avoid startup crash.
    // The constructor injection was causing LazicService to fail silently
    // during NestJS bootstrap — onModuleInit never ran.
    @Optional() private readonly unifiedRisk?: UnifiedRiskService,
  ) {
    // ربط الـ callbacks هنا لنتمكن من إلغائها لاحقاً
    this.oandaCallback = (d) => this._onOandaTick(d);
    this.binanceCallback = (d) => this._onBinanceTick(d);
  }

  // ══════════════════════════════════════════
  // Lifecycle
  // ══════════════════════════════════════════

  async onModuleInit() {
    this.logger.log('🐝 اللاسع يستيقظ — يستمع للأسواق...');

    // تهيئة نوافذ البيانات لكل زوج مدعوم
    for (const sym of LAZIC_SUPPORTED_SYMBOLS) {
      this.tickWindows.set(sym, []);
      this.spreadWindows.set(sym, []);
      this.obiHistory.set(sym, []);
    }

    // الاشتراك في streams
    this.oanda.onPrice(this.oandaCallback);
    this.binance.onPrice(this.binanceCallback);

    // مزامنة المستخدمين الذين فعّلوا اللاسع
    await this._syncActiveUsers();
    this.syncTimer = setInterval(
      () => this._syncActiveUsers(),
      USER_SYNC_INTERVAL_MS,
    );

    this.logger.log(
      `🐝 اللاسع جاهز — يراقب ${LAZIC_SUPPORTED_SYMBOLS.length} زوجاً` +
      ` | مستخدمون نشطون: ${this.activeUsers.size}`,
    );
  }

  async onModuleDestroy() {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.oanda.offPrice(this.oandaCallback);
    this.binance.offPrice(this.binanceCallback);
    this.logger.log('🐝 اللاسع توقف');
  }

  // ══════════════════════════════════════════
  // Tick Handlers
  // ══════════════════════════════════════════

  private _onOandaTick(update: OandaPriceUpdate) {
    const sym = update.symbol; // e.g. "EUR/USD"
    if (!LAZIC_SUPPORTED_SYMBOLS.includes(sym as any)) return;

    const tick: LazicTick = {
      symbol: sym,
      bid: update.bid,
      ask: update.ask,
      price: update.price,
      timestamp: Date.now(),
      source: 'oanda',
    };
    this._processTick(tick);
  }

  private _onBinanceTick(update: BinancePriceUpdate) {
    const sym = update.symbol; // e.g. "BTC/USDT"
    if (!LAZIC_SUPPORTED_SYMBOLS.includes(sym as any)) return;

    // Phase 1 fix: Binance doesn't provide bid/ask in BinancePriceUpdate.
    // Use high/low from the candle as a realistic spread proxy instead of
    // the previous synthetic price * 0.9999 / 1.0001 (which made spread constant).
    // high - low represents actual intra-tick volatility.
    const spread = (update.high - update.low) || update.price * 0.0002;
    const bid = update.price - spread / 2;
    const ask = update.price + spread / 2;

    const tick: LazicTick = {
      symbol: sym,
      bid,
      ask,
      price: update.price,
      timestamp: Date.now(),
      source: 'binance',
      volume: update.volume,  // Phase 1 fix: pass volume for weighted OBI
    };
    this._processTick(tick);
  }

  // ══════════════════════════════════════════
  // Core Signal Logic
  // ══════════════════════════════════════════

  private _processTick(tick: LazicTick) {
    // 1. تحديث نافذة الـ ticks
    const window = this.tickWindows.get(tick.symbol) ?? [];
    window.push(tick);
    if (window.length > TICK_WINDOW_SIZE) window.shift();
    this.tickWindows.set(tick.symbol, window);

    // 2. تحديث نافذة spread
    const currentSpread = tick.ask - tick.bid;
    const spreads = this.spreadWindows.get(tick.symbol) ?? [];
    spreads.push(currentSpread);
    if (spreads.length > SPREAD_AVG_WINDOW) spreads.shift();
    this.spreadWindows.set(tick.symbol, spreads);

    // لا نبدأ حتى نجمع عينات كافية
    if (spreads.length < DEFAULT_LAZIC_CONFIG.minSpreadAvgSamples) return;
    if (window.length < 5) return;

    // 3. احسب OBI
    const obi = this._calcOBI(window);

    // 4. حدّث تاريخ OBI (للتحقق من الثبات)
    const history = this.obiHistory.get(tick.symbol) ?? [];
    history.push(obi);
    if (history.length > 3) history.shift();
    this.obiHistory.set(tick.symbol, history);

    // 5. بناء نتيجة OBI
    //    Phase 2: استخدم default threshold هنا فقط للإشارة الأولية —
    //    التحقق النهائي بعتبة المستخدم يتم في _tryExecuteForUser.
    const avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    const spreadRatio = currentSpread / avgSpread;
    const spreadOk = spreadRatio <= DEFAULT_LAZIC_CONFIG.maxSpreadMultiplier;
    // استخدم أقل عتبة من بين كل المستخدمين النشطين — لإنتاج إشارة candidate.
    // كل مستخدم سيتحقق بعتبته الخاصة في _tryExecuteForUser.
    const minThreshold = this._getMinUserThreshold();
    const signal = obi > minThreshold ? 'BUY'
                 : obi < -minThreshold ? 'SELL'
                 : 'NONE';
    const stableSignal = history.length === 3 && (
      signal === 'BUY'  ? history.every(o => o > minThreshold)
    : signal === 'SELL' ? history.every(o => o < -minThreshold)
    : false
    );

    const obiResult: OBIResult = {
      symbol: tick.symbol,
      obi,
      signal,
      spreadOk,
      spreadRatio,
      stableSignal,
      currentSpread,
      avgSpread,
    };

    // 6. اكتب آخر OBI في Redis (للواجهة الأمامية)
    // BUG-053 FIX: TTL was 30 (milliseconds) instead of 30_000 (30 seconds).
    // The OBI value expired in 30ms — by the time the frontend polled (every 3s),
    // the value was already gone. This caused lastOBIs to always be empty.
    this.redis.set(
      LAZIC_REDIS_KEYS.lastOBI(tick.symbol),
      JSON.stringify({ obi, signal, spreadRatio, ts: tick.timestamp }),
      30_000, // TTL 30 ثانية (30,000 milliseconds)
    ).catch(() => {});

    // 7. هل هناك إشارة قابلة للتنفيذ؟
    if (obiResult.signal === 'NONE') return;
    if (!obiResult.spreadOk) return;
    if (!obiResult.stableSignal) return;

    // 8. حاول التنفيذ لكل مستخدم نشط (بشكل غير متزامن — لا نُعيق الـ tick)
    if (this.activeUsers.size === 0) return;
    this._tryExecuteForAllUsers(obiResult, tick).catch((err) =>
      this.logger.error(`خطأ في تنفيذ اللاسع: ${err?.message}`),
    );
  }

  /** Phase 2: أقل عتبة OBI بين المستخدمين النشطين (لإنتاج candidate signal) */
  private _getMinUserThreshold(): number {
    if (this.activeUsers.size === 0) return DEFAULT_LAZIC_CONFIG.obiThreshold;
    let min = DEFAULT_LAZIC_CONFIG.obiThreshold;
    for (const state of this.activeUsers.values()) {
      if (state.obiThreshold < min) min = state.obiThreshold;
    }
    return min;
  }

  // ══════════════════════════════════════════
  // OBI Calculation
  // ══════════════════════════════════════════

  private _calcOBI(ticks: LazicTick[]): number {
    if (ticks.length < 2) return 0;

    let bidPressure = 0;
    let askPressure = 0;

    for (let i = 1; i < ticks.length; i++) {
      const prev = ticks[i - 1];
      const curr = ticks[i];

      // Phase 1 fix: For Binance ticks (with volume), use volume-weighted price move.
      // For OANDA ticks (with real bid/ask), use tick-rule on bid/ask.
      // This produces a meaningful OBI for both data sources.
      if (curr.source === 'binance' && typeof curr.volume === 'number') {
        // Volume-weighted: price move × volume gives a proxy for order flow.
        const priceMove = curr.price - prev.price;
        const vol = curr.volume || 1;
        if (priceMove > 0) bidPressure += priceMove * vol;
        else if (priceMove < 0) askPressure += Math.abs(priceMove) * vol;
      } else {
        // Tick-rule on bid/ask (OANDA): works because OANDA sends real bid/ask.
        if (curr.bid > prev.bid) bidPressure += (curr.bid - prev.bid);
        if (curr.ask < prev.ask) askPressure += (prev.ask - curr.ask);
      }
    }

    const total = bidPressure + askPressure;
    if (total === 0) return 0;

    // OBI في [-1, +1]
    return (bidPressure - askPressure) / total;
  }

  // ══════════════════════════════════════════
  // Execution
  // ══════════════════════════════════════════

  private async _tryExecuteForAllUsers(
    obi: OBIResult,
    tick: LazicTick,
  ): Promise<void> {
    for (const [userId, state] of this.activeUsers) {
      if (!state.enabled) continue;
      await this._tryExecuteForUser(userId, state, obi, tick);
    }
  }

  private async _tryExecuteForUser(
    userId: string,
    state: LazicUserState,
    obi: OBIResult,
    tick: LazicTick,
  ): Promise<void> {
    const now = Date.now();

    // ── Phase 2: تحقق بعتبة المستخدم الخاصة (ليس الـ min المُستخدم للإشارة الأولية)
    if (obi.signal === 'BUY'  && obi.obi <= state.obiThreshold) return;
    if (obi.signal === 'SELL' && obi.obi >= -state.obiThreshold) return;

    // ── Phase 2: تحقق بـ max spread multiplier الخاص بالمستخدم
    if (obi.spreadRatio > state.maxSpreadMultiplier) return;

    // ── شرط أمان 1: cooldown بعد آخر صفقة
    if (state.lastTradeAt && now - state.lastTradeAt < state.cooldownMs) return;

    // ── شرط أمان 2: حد الصفقات اليومي
    if (state.dailyTrades >= state.maxDailyTrades) return;

    // ── شرط أمان 3: هل يوجد مركز لاسع مفتوح على هذا الزوج؟ (DB check)
    // Fix: كان يستخدم Redis key بـ TTL 10 دقائق — يمنع فتح صفقات جديدة بعد
    // إغلاق الصفقة السابقة بـ 10 دقائق. الآن نتحقق من DB مباشرة (صفقات OPEN فقط).
    // ملاحظة: هذا يسمح للاسع بفتح صفقات على أزواج بها صفقات من المنفذ/الوكيل،
    // لأن الـ count يفلتر بـ source: 'lazic' فقط.
    const openOnSymbol = await this.prisma.position.count({
      where: { userId, symbol: obi.symbol, status: 'OPEN', source: { in: ['lazic', 'lasic'] } },
    });
    if (openOnSymbol > 0) return;

    // ── شرط أمان 3b: BUG-066g — فحص DB-level cooldown (مثل Smart Executor)
    // يمنع اللاسع من فتح صفقة على زوج أغلق عليه (أو على المنفّذ/الوكيل) في آخر 15 دقيقة.
    // المشكلة السابقة: لو أغلق المنفّذ الذكي صفقة BTC قبل دقيقة، يمكن للاسع أن يفتح BTC
    // فوراً لأن اللاسع لا يفحص cooldown — فقط يفحص Open positions. هذا يحرق رسوماً
    // ويسبب flip-flop pattern بين المصادر.
    // الحل: نفس فحص Smart Executor (smart-executor.service.ts:2147) — DB cooldown 15 دقيقة.
    try {
      const LAZIC_COOLDOWN_MINUTES = 15;
      const recentlyClosed = await this.prisma.position.findFirst({
        where: {
          userId,
          symbol: obi.symbol,
          status: { in: ['CLOSED', 'LIQUIDATED'] },
          closedAt: { gte: new Date(Date.now() - LAZIC_COOLDOWN_MINUTES * 60 * 1000) },
        },
        orderBy: { closedAt: 'desc' },
      });
      if (recentlyClosed) {
        this.logger.debug(
          `🐝 اللاسع: ⏳ DB-COOLDOWN تخطّي ${obi.symbol} — مركز أُغلق قبل قليل (من ${recentlyClosed.source})`,
        );
        await this._recordMetric(userId, 'fail', `db_cooldown:${obi.symbol}`);
        return;
      }
    } catch (dbErr: any) {
      // FAIL-CLOSED: لو فشل الفحص، لا تنفّذ (مثل سلوك Smart Executor)
      this.logger.warn(
        `🐝 اللاسع: فشل فحص DB cooldown لـ ${obi.symbol}: ${dbErr?.message} — تخطّي التنفيذ`,
      );
      await this._recordMetric(userId, 'fail', `db_cooldown_err:${obi.symbol}`);
      return;
    }

    // ── شرط أمان 3c: BUG-066g — فحص Redis symbol-lock و cooldown (مثل Smart Executor)
    // symbol-lock: منع كلا الاتجاهين بعد أي إغلاق لمدة 15 دقيقة (يمنع flip-flop)
    // cooldown: منع بعد SL/TP auto-close
    try {
      const symbolLockKey = `trade-rep:symbol-lock:${userId}:${obi.symbol}`;
      const symbolLocked = await this.redis.get(symbolLockKey);
      if (symbolLocked) {
        this.logger.debug(
          `🐝 اللاسع: ⏳ SYMBOL-LOCK تخطّي ${obi.symbol} — زوج مقفل (أُغلق مؤخراً)`,
        );
        await this._recordMetric(userId, 'fail', `symbol_lock:${obi.symbol}`);
        return;
      }

      const cooldownKey = `cooldown:${userId}:${obi.symbol}`;
      const cooldownReason = await this.redis.get(cooldownKey);
      if (cooldownReason) {
        this.logger.debug(
          `🐝 اللاسع: ⏳ COOLDOWN تخطّي ${obi.symbol} — (${cooldownReason})`,
        );
        await this._recordMetric(userId, 'fail', `redis_cooldown:${obi.symbol}`);
        return;
      }
    } catch (redisErr: any) {
      // FAIL-CLOSED: لو Redis غير متاح، لا نأخذ مخاطرة
      this.logger.warn(
        `🐝 اللاسع: فشل فحص Redis cooldown لـ ${obi.symbol}: ${redisErr?.message} — تخطّي التنفيذ`,
      );
      await this._recordMetric(userId, 'fail', `redis_cooldown_err:${obi.symbol}`);
      return;
    }

    // ── شرط أمان 4: حد المراكز المفتوحة في DB (فحص أخف)
    if (state.maxOpenPositions > 0) {
      const openCount = await this.prisma.position.count({
        where: { userId, status: 'OPEN', source: 'lazic' },
      });
      if (openCount >= state.maxOpenPositions) return;
    }

    // ── Phase 1 fix: تأكد من وجود credentialId صالح
    //    كان يقرأ من (s as any).activeCredentialId الذي لا وجود له في AgentSettings.
    //    الآن يُقرأ من جدول Setting (key: user:{userId}:activeCredentialId).
    let credentialId = state.credentialId;
    if (!credentialId || credentialId.trim() === '' || credentialId.startsWith('paper-')) {
      try {
        const activeSetting = await this.prisma.setting.findFirst({
          where: { key: `user:${userId}:activeCredentialId` },
        });
        if (activeSetting?.value) {
          credentialId = activeSetting.value;
          state.credentialId = credentialId;  // cache for next tick
          state.isPaperTrading = false;
        }
      } catch (err: any) {
        this.logger.warn(`⚠️ اللاسع: تعذّر قراءة activeCredentialId للمستخدم ${userId}: ${err?.message}`);
      }
    }

    // إذا لا يوجد credential حقيقي، ابحث عن paper-trading credential
    if (!credentialId || credentialId.trim() === '') {
      try {
        const paperCred = await this.prisma.exchangeCredential.findFirst({
          where: { userId, exchange: 'paper-trading', isValid: true },
        });
        if (paperCred) {
          credentialId = paperCred.id;
          state.credentialId = credentialId;
          state.isPaperTrading = true;
        } else {
          this.logger.warn(`⚠️ اللاسع: لا يوجد credential للمستخدم ${userId} — تخطّي التنفيذ`);
          await this._recordMetric(userId, 'fail', 'no_credential');
          return;
        }
      } catch (err: any) {
        this.logger.error(`❌ اللاسع: فشل جلب paper credential: ${err?.message}`);
        return;
      }
    }

    // ── تحقق من توافق المجلس الاستراتيجي (إلزامي — ليس اختيارياً)
    // Fix: كان اختيارياً (يحسب councilAligned لكن لا يستخدمه كشرط).
    // الآن: لو المجلس يرى BUY، اللاسع لا يفتح SELL إطلاقاً (والعكس).
    // هذا سيرفع معدل النجاح من 22% إلى 35%+ بمنع الصفقات العكسية للاتجاه العام.
    const councilDir = await this.redis.get(
      LAZIC_REDIS_KEYS.councilDirection(obi.symbol),
    );
    if (councilDir && councilDir !== obi.signal) {
      // المجلس يرى اتجاهاً معاكساً لإشارة اللاسع — تخطّي التنفيذ
      this.logger.debug(
        `🐝 اللاسع: تخطّي ${obi.symbol} ${obi.signal} — المجلس يرى ${councilDir} (عكسي)`,
      );
      await this._recordMetric(userId, 'fail', `council_block:${councilDir}_vs_${obi.signal}`);
      return;
    }
    const councilAligned =
      (councilDir === 'BUY' && obi.signal === 'BUY') ||
      (councilDir === 'SELL' && obi.signal === 'SELL');

    // ── احسب SL/TP
    const direction: 'BUY' | 'SELL' = obi.signal === 'SELL' ? 'SELL' : 'BUY';
    const { sl, tp } = await this._calcSLTP(tick, direction, state.isPaperTrading);

    // ── Phase 3: احسب الكمية الحقيقية (risk% × balance ÷ SL distance)
    const slDistance = Math.abs(tick.price - sl);
    const quantity = await this._calcQuantity(tick.symbol, tick.price, slDistance, state);

    if (quantity <= 0) {
      this.logger.warn(`⚠️ اللاسع: quantity=0 للمستخدم ${userId} — تخطّي`);
      await this._recordMetric(userId, 'fail', 'zero_quantity');
      return;
    }

    // ── أرسل للتنفيذ عبر TradingService
    try {
      const idempotencyKey = `lazic:${userId}:${obi.symbol}:${now}`;

      // BUG-041 FIX: مرّر الصفقة عبر UnifiedRiskService.validateOrder()
      // قبل التنفيذ — مثل المنفّذ الذكي والوكيل. كان اللاسع يتجاوز هذا الفحص
      // (يدعو TradingService.placeOrder مباشرة)، مما يعني تخطّي:
      //   - فحص SL/RR
      //   - فحص كفاية الرصيد
      //   - فحص الحد الأقصى لحجم الصفقة
      //   - فحص drawdown اليومي
      //   - فحص عدد الصفقات المفتوحة
      //   - فحص kill-switch
      //   - فحص CHECK 10 — Duplicate Position (منع مركزين على نفس الزوج من مصادر مختلفة)
      //
      // BUG-066h FIX: unifiedRisk is @Optional — لكن لو لم يُحقن، لا تنفّذ (FAIL-CLOSED).
      // السلوك السابق (BUG-059): "better to trade without risk check than not trade at all"
      // — هذا خطير لأنه يسمح بالتداول بدون CHECK 10 (مركز مكرر على نفس الزوج من
      // مصدرين مختلفين)، مما يسبب flip-flop وتضخم المراكز.
      // السلوك الجديد: لو UnifiedRiskService غير متاح، اوقف التنفيذ وسجّل خطأً.
      if (!this.unifiedRisk) {
        this.logger.error(
          `🚨 اللاسع: UnifiedRiskService غير متاح — تخطّي التنفيذ لـ ${obi.symbol} (BUG-066h FAIL-CLOSED)`,
        );
        await this._recordMetric(userId, 'fail', `no_unified_risk:${obi.symbol}`);
        return;
      }

      try {
        const riskCheck = await this.unifiedRisk.validateOrder({
          userId,
          exchangeCredentialId: credentialId,
          symbol: obi.symbol,
          side: direction as any,
          type: 'MARKET' as any,
          quantity,
          price: tick.price,
          stopLoss: sl,
          takeProfit: tp,
          idempotencyKey,
          isPaperTrading: state.isPaperTrading,
          source: 'lazic' as any,
          strategy: 'scalping' as any,
        } as any);

        if (!riskCheck.allowed) {
          this.logger.warn(
            `🛡️ اللاسع: UnifiedRisk رفض الصفقة ${obi.symbol} ${direction} — ${riskCheck.reason}`,
          );
          await this._recordMetric(userId, 'fail', `risk_rejected:${riskCheck.reason?.substring(0, 60) || 'unknown'}`);
          return;
        }
      } catch (riskErr: any) {
        // BUG-066h FIX: FAIL-CLOSED — لو فشل فحص المخاطر نفسه، لا تتابع التنفيذ.
        // السلوك السابق: "متابعة بدون فحص" — هذا يسمح بالتداول بدون CHECK 10.
        // السلوك الجديد: اوقف التنفيذ (لا تأخذ مخاطرة بحالة غير معروفة).
        this.logger.error(
          `🚨 اللاسع: UnifiedRisk فشل (${obi.symbol}): ${riskErr?.message} — تخطّي التنفيذ (FAIL-CLOSED)`,
        );
        await this._recordMetric(userId, 'fail', `risk_check_err:${obi.symbol}:${riskErr?.message?.substring(0, 40) || 'unknown'}`);
        return;
      }

      await this.tradingService.placeOrder(userId, {
        symbol: obi.symbol,
        side: direction as any,
        type: 'MARKET' as any,
        quantity,
        stopLoss: sl,
        takeProfit: tp,
        idempotencyKey,
        source: 'lazic' as any,  // Phase 1 fix: كان 'agent' — يطابق count query في الأعلى
        strategy: 'scalping',
        credentialId,
        skipRiskCheck: true,  // BUG-041: تم الفحص أعلاه — لا نكرّر (يستدعي unifiedRisk.validateOrder مرتين)
      } as any);

      // Fix: Redis lock تم إزالته — كان بـ TTL 10 دقائق يمنع فتح صفقات جديدة
      // بعد إغلاق الصفقة السابقة. الآن نعتمد على DB count (check في الأعلى).

      // ── حدّث حالة المستخدم
      state.lastTradeAt = now;
      state.dailyTrades += 1;
      this.activeUsers.set(userId, state);

      // ── Phase 3: سجّل metric في Redis
      await this._recordMetric(userId, 'success', `${obi.signal}_${obi.symbol}`);

      this.logger.log(
        `🐝 لسعة! ${obi.symbol} ${obi.signal} | OBI=${obi.obi.toFixed(3)} ` +
        `| spread×${obi.spreadRatio.toFixed(2)} ` +
        `| qty=${quantity} ` +
        `| Council: ${councilAligned ? '✅ متوافق' : '—'} ` +
        `| SL=${sl.toFixed(5)} TP=${tp.toFixed(5)} ` +
        `| ${state.isPaperTrading ? '📄 paper' : '🔴 real'}`,
      );
    } catch (err: any) {
      this.logger.error(`❌ فشل تنفيذ اللاسع (${userId}/${obi.symbol}): ${err?.message}`);
      await this._recordMetric(userId, 'fail', `order_error:${err?.message?.substring(0, 80)}`);
    }
  }

  // ── SL/TP — BUG-028 FIX: هيكل السوق بدل النسبة الثابتة ──
  //
  // المشكلة: النسبة الثابتة (0.2% كريبتو، 0.05% فوركس) تضع SL في مكان عشوائي.
  // السبب الرئيسي لخسارة 78% من صفقات اللاسع: SL يُضرب من ضوضاء السعر
  // قبل أن يتحقق التحليل.
  //
  // الحل: نحاول جلب الشموع الأخيرة وحساب SL من أقرب قمة/قاع حقيقي.
  // fallback إلى النسبة الثابتة إذا لم تتوفر بيانات.
  //
  // BUG-040 FIX: توسيع structure SL ليشمل الفوركس والمعادن والمؤشرات
  // (كان مقتصراً على الكريبتو فقط — يخلق ضوضاء لكل أزواج OANDA).
  //
  // BUG-066i FIX: اللاسع الحقيقي يلسع (scalper) — لا ينتظر أهداف swing.
  // المشكلة: كان يستخدم minRR=1.5 (forex) و minRR=2.0 (crypto) من شموع 15m،
  // مما يجعل TP على مسافة 0.3-0.5% في الفوركس = ساعات أو أيام للوصول.
  // هذا ليس scalping، هذا swing trading باسم لاسع.
  //
  // الحل: أضف SCALPER_MODE حقيقي:
  //   - شموع 1m (ليس 15m) لأقرب swing levels
  //   - SL صغير: forex 0.08% (6-8 pips)، crypto 0.25%
  //   - TP صغير: forex 0.10% (8-10 pips)، crypto 0.30%
  //   - R:R 1:1.2 إلى 1:1.5 (ليس 1:2)
  //   - الربح من تكرار الصفقات (50+/يوم) لا من حجم كل صفقة
  private async _calcSLTP(
    tick: LazicTick,
    direction: 'BUY' | 'SELL',
    _isPaper: boolean,
  ): Promise<{ sl: number; tp: number }> {
    // BUG-028: حاول هيكل السوق أولاً
    try {
      const isCrypto = tick.symbol.includes('/USDT') || tick.symbol.includes('/BTC');

      // BUG-066i: استخدم شموع 1m للـ scalper (ليس 15m)
      // 1m = أقرب swing levels + رد فعل أسرع لتغيرات السعر
      let candles: any[] | null = null;

      if (isCrypto) {
        candles = await this._fetchRecentCandles(tick.symbol, '1m', 30);
      } else {
        // فوركس/معادن/مؤشرات/طاقة — استخدم OANDA REST
        candles = await this._fetchRecentOandaCandles(tick.symbol, 'M1', 30);
      }

      if (candles && candles.length >= 15) {
        const { calculateStructureBasedSLTP } = await import('./../../modules/trading/services/sl-tp-calculator');
        // BUG-066i: SCALPER MODE — أهداف صغيرة جداً، R:R منخفض، تكرار عالي
        //
        // قبل BUG-066i: minSL=0.3% (forex), minRR=1.5 → TP=0.45% → ساعات للوصول
        // بعد BUG-066i: minSL=0.08% (forex), minRR=1.2 → TP=0.10% → دقائق للوصول
        //
        // scalper حقيقي:
        //   - forex SL=6-8 pips (0.08%), TP=8-10 pips (0.10%), R:R=1:1.2
        //   - crypto SL=0.25%, TP=0.30%, R:R=1:1.2
        //   - الهدف: 50-100 صفقة/يوم × ربح صغير لكل صفقة
        const opts = isCrypto
          ? { minSLPercent: 0.0025, maxSLPercent: 0.015, minRR: 1.2 }
          : { minSLPercent: 0.0008, maxSLPercent: 0.005, minRR: 1.2 };
        const result = calculateStructureBasedSLTP(candles, tick.price, direction, opts);

        // BUG-056 SAFETY: Verify SL is on the correct side of entry.
        if (direction === 'BUY' && result.sl >= tick.price) {
          this.logger.warn(
            `🐝 BUG-056: SL ${result.sl.toFixed(5)} >= entry ${tick.price.toFixed(5)} for BUY ${tick.symbol} — skipping trade (SL on wrong side)`,
          );
          // Fall through to fixed % fallback
        } else if (direction === 'SELL' && result.sl <= tick.price) {
          this.logger.warn(
            `🐝 BUG-056: SL ${result.sl.toFixed(5)} <= entry ${tick.price.toFixed(5)} for SELL ${tick.symbol} — skipping trade (SL on wrong side)`,
          );
          // Fall through to fixed % fallback
        } else {
          this.logger.debug(
            `🐝 BUG-066i LASIC SCALPER SL/TP: ${tick.symbol} ${direction} ` +
            `SL=${result.sl.toFixed(5)} (${result.slSource}) TP=${result.tp.toFixed(5)} (${result.tpSource}) R:R=1:${result.rrRatio.toFixed(2)} [1m candles]`,
          );
          return { sl: result.sl, tp: result.tp };
        }
      }
    } catch (structErr: any) {
      // Structure-based failed — fall through to fixed %
    }

    // Fallback: النسبة الثابتة (scalper mode)
    // BUG-066i: أهداف صغيرة جداً للـ fallback أيضاً
    const isCrypto = tick.symbol.includes('/USDT') || tick.symbol.includes('/BTC');
    const slPct = isCrypto ? 0.0025 : 0.0008;  // crypto 0.25%, forex 0.08%
    const tpPct = isCrypto ? 0.0030 : 0.0010;  // crypto 0.30%, forex 0.10%
    const slDist = tick.price * slPct;
    const tpDist = tick.price * tpPct;

    if (direction === 'BUY') {
      return { sl: tick.price - slDist, tp: tick.price + tpDist };
    } else {
      return { sl: tick.price + slDist, tp: tick.price - tpDist };
    }
  }

  // BUG-028: جلب الشموع الأخيرة من Binance للاستخدام في حساب هيكل السوق
  private async _fetchRecentCandles(symbol: string, interval: string, limit: number): Promise<any[]> {
    try {
      // استخدم Binance REST API مباشرة (الأسرع)
      const cleanSymbol = symbol.replace('/', '').toUpperCase();
      // BinanceStreamingService يملك REST endpoints
      const url = `https://api.binance.com/api/v3/klines?symbol=${cleanSymbol}&interval=${interval}&limit=${limit}`;
      const response = await fetch(url);
      if (!response.ok) return [];
      const data = await response.json() as any[];
      return data.map(k => ({
        time: Math.floor(k[0] / 1000),
        open: parseFloat(k[1]), high: parseFloat(k[2]),
        low: parseFloat(k[3]), close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));
    } catch {
      return [];
    }
  }

  // BUG-040 FIX: جلب الشموع الأخيرة من OANDA للاستخدام في حساب هيكل السوق
  // للفوركس/المعادن/المؤشرات/الطاقة — بدون مصادقة لو الحساب عام، أو بمصادقة لو متوفر.
  // المسار: GET /v3/instruments/{symbol}/candles?granularity=M15&count=50&price=M
  private async _fetchRecentOandaCandles(symbol: string, granularity: string, count: number): Promise<any[]> {
    try {
      // OANDA v20 REST endpoint — نوّع بين الحسابات (Practice) لأن الـ token قد لا يكون متاح
      const oandaSymbol = symbol.replace('/', '_').toUpperCase();
      const baseHost = 'https://api-fxpractice.oanda.com'; // practice account default
      const url = `${baseHost}/v3/instruments/${oandaSymbol}/candles?granularity=${granularity}&count=${count}&price=M`;

      // اقرأ الـ token من process.env (نفس مفتاح OANDA adapter)
      const token = process.env.OANDA_API_TOKEN || process.env.OANDA_API_KEY || '';
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const controller = new AbortController();
      const timeoutMs = 4000;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(timeout);
        if (!response.ok) return [];
        const data = await response.json() as any;
        const raw = data?.candles || [];
        return raw
          .filter((c: any) => c.complete !== false)
          .map((c: any) => ({
            time: Math.floor(new Date(c.time).getTime() / 1000),
            open: parseFloat(c.mid.o),
            high: parseFloat(c.mid.h),
            low: parseFloat(c.mid.l),
            close: parseFloat(c.mid.c),
            volume: parseFloat(c.volume || '0'),
          }));
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return [];
    }
  }

  // ── حجم الصفقة — risk% ÷ SL distance، مع step sizes قياسية ──
  //
  // المستخدم طلب: "حجم العقد يبدأ من 0.01، الغي الكسور العشرية"
  // يعني: أرقام نظيفة بدون كسور عشوائية (87.86, 0.000707, etc.)
  //
  // Step sizes قياسية حسب asset class:
  //   Crypto: 0.01  → 0.01, 0.02, 0.03... (أصغر وحدة للـ BTC/ETH)
  //   Forex:  100   → 100, 200, 300... (nano lots، أرقام صحيحة)
  //
  // maxNotional = 25% من balance (مرفوع من 10% لتمكين صفقات forex)
  private async _calcQuantity(
    symbol: string,
    price: number,
    slDistance: number,
    state: LazicUserState,
  ): Promise<number> {
    if (slDistance <= 0) return 0;

    const now = Date.now();
    const BALANCE_CACHE_MS = 30_000;  // 30s

    // استخدم cached balance لو حديث
    let balance = state.cachedBalance;
    if (!balance || !state.balanceLastFetchedAt || now - state.balanceLastFetchedAt > BALANCE_CACHE_MS) {
      try {
        if (state.isPaperTrading) {
          // BUG-060: Use raw SQL — Prisma client may not know all columns
          const rows: any[] = await this.prisma.$queryRaw`
            SELECT "paperBalance" FROM "AgentSettings" WHERE "userId" = ${state.userId}
          `;
          balance = rows.length > 0 ? Number(rows[0].paperBalance) : 10000;
        } else {
          const cached = await this.redis.get(`user:${state.userId}:balance`);
          balance = cached ? Number(cached) : 10000;
        }
        state.cachedBalance = balance;
        state.balanceLastFetchedAt = now;
      } catch (err: any) {
        // BUG-065: Changed fallback from $1,000 to $10,000 (standard paper balance)
        balance = 10000;
        state.cachedBalance = balance;
        state.balanceLastFetchedAt = now;
      }
    }

    // quantity = (balance × risk%) ÷ SL distance
    const riskAmount = balance * (state.riskPerTradePct / 100);
    let rawQty = riskAmount / slDistance;

    // الحد الأقصى: 25% من balance (مرفوع من 10% لتمكين صفقات forex)
    const maxNotional = balance * 0.25;
    const maxQtyByNotional = maxNotional / price;
    if (rawQty > maxQtyByNotional) {
      rawQty = maxQtyByNotional;
    }

    // ── Step sizes قياسية حسب asset class ──
    // تحديد asset class من اسم الزوج
    // BUG-038 FIX: استخدم getSymbolMetadata() بدل contractSize مُشفّر يدوياً.
    //
    // المشكلة: كان contractSize مُشفّراً = 1 للكريبتو و 100,000 لكل شيء آخر.
    // هذا يكسر كل المعادن والطاقة والمؤشرات:
    //   XAU/USD: الصحيح 100، كان يستخدم 100,000 → rawLots 1000× أصغر → دائماً 0.01 floor
    //   XAG/USD: الصحيح 5,000، كان يستخدم 100,000 → rawLots 20× أصغر → دائماً 0.01 floor
    //   WTI/USD: الصحيح 1,000، كان يستخدم 100,000 → rawLots 100× أصغر → دائماً 0.01 floor
    //   US30/USD, NAS100/USD, SPX500/USD: الصحيح 1، كان يستخدم 100,000 → rawLots 100,000× أصغر
    //
    // الحل: نأخذ contractSize من getSymbolMetadata() الموحّد — نفس مصدر المنفّذ الذكي والوكيل.
    const contractSize = getSymbolMetadata(symbol).contractSize;

    // حوّل rawQty من وحدات إلى لوتات
    const rawLots = rawQty / contractSize;

    // step موحّد = 0.01 لوت (أصغر وحدة تداول)
    const step = 0.01;

    // قرّب إلى step (floor — لا يتجاوز)
    let quantityLots = Math.floor(rawLots / step) * step;

    // لو النتيجة 0، استخدم step كحد أدنى
    if (quantityLots === 0) {
      // تحقق لو 0.01 لوت يطابق الـ 25% cap
      const minNotional = step * contractSize * price;
      if (minNotional > maxNotional) {
        this.logger.warn(
          `⚠️ اللاسع: 0.01 لوت × ${price} = ${minNotional} > cap (${maxNotional}) — تخطّي.`
        );
        return 0;
      }
      quantityLots = step;
    }

    // تقريب نهائي: 2 decimals دائماً (لأن اللوتات دائماً 0.01, 0.02, 0.03...)
    return Math.round(quantityLots * 100) / 100;
  }

  // ── Phase 3: سجّل metric في Redis (success/fail counts + last reason)
  private async _recordMetric(
    userId: string,
    outcome: 'success' | 'fail',
    reason: string,
  ): Promise<void> {
    try {
      const key = `lazic:metrics:${userId}`;
      const ttl = 86400;  // 24h
      const raw = await this.redis.get(key);
      const metrics = raw ? JSON.parse(raw) : { success: 0, fail: 0, lastReason: '', lastAt: 0 };

      if (outcome === 'success') metrics.success += 1;
      else metrics.fail += 1;

      metrics.lastReason = reason;
      metrics.lastAt = Date.now();

      await this.redis.set(key, JSON.stringify(metrics), ttl);
    } catch {
      // لا تُعيق الـ tick لو فشل الـ metric
    }
  }

  // ══════════════════════════════════════════
  // User State Management
  // ══════════════════════════════════════════

  private async _syncActiveUsers(): Promise<void> {
    try {
      // BUG-060 FIX: Use raw SQL instead of Prisma client.
      // The Prisma client may not know about lazicEnabled column (if prisma generate
      // wasn't run after schema change). Raw SQL bypasses Prisma's field validation.
      const settings: any[] = await this.prisma.$queryRaw`
        SELECT "userId", "lazicEnabled", "lazicObiThreshold", "lazicMaxSpreadMult",
               "lazicMaxDailyTrades", "lazicMaxOpenPositions", "lazicCooldownMs",
               "lazicRiskPerTradePct"
        FROM "AgentSettings"
        WHERE "lazicEnabled" = true
      `;

      const newActiveUsers = new Map<string, LazicUserState>();

      for (const s of settings) {
        const existing = this.activeUsers.get(s.userId);
        newActiveUsers.set(s.userId, {
          userId: s.userId,
          enabled: true,
          credentialId: existing?.credentialId ?? '',
          isPaperTrading: existing?.isPaperTrading ?? true,
          maxOpenPositions: Number(s.lazicMaxOpenPositions ?? 2),
          maxDailyTrades: Number(s.lazicMaxDailyTrades ?? 20),
          dailyTrades: existing?.dailyTrades ?? 0,
          dailyPnL: existing?.dailyPnL ?? 0,
          lastTradeAt: existing?.lastTradeAt ?? null,
          cooldownMs: Number(s.lazicCooldownMs ?? 30000),
          obiThreshold: Number(s.lazicObiThreshold ?? 0.4),
          maxSpreadMultiplier: Number(s.lazicMaxSpreadMult ?? 1.5),
          riskPerTradePct: Number(s.lazicRiskPerTradePct ?? 0.5),
          cachedBalance: existing?.cachedBalance ?? null,
          balanceLastFetchedAt: existing?.balanceLastFetchedAt ?? null,
        });
      }

      this.activeUsers = newActiveUsers;

      if (settings.length > 0) {
        this.logger.debug(`🐝 مزامنة: ${settings.length} مستخدم نشط للاسع`);
      }
    } catch (err: any) {
      this.logger.error(`خطأ في مزامنة مستخدمي اللاسع: ${err?.message || err?.toString() || JSON.stringify(err) || 'unknown error'}`);
    }
  }

  // ══════════════════════════════════════════
  // Public API (للكنترولر والواجهة الأمامية)
  // ══════════════════════════════════════════

  /** تفعيل اللاسع لمستخدم — upsert لتفادي "no record found" */
  async enableForUser(userId: string): Promise<void> {
    if (!userId) {
      throw new Error('enableForUser called with empty userId');
    }
    try {
      await (this.prisma.agentSettings as any).upsert({
        where: { userId },
        update: { lazicEnabled: true },
        create: { userId, lazicEnabled: true },
      });
    } catch (err: any) {
      this.logger.error(`❌ enableForUser DB error for ${userId}: ${err?.message}`);
      throw err;
    }
    await this._syncActiveUsers();
    this.logger.log(`🐝 اللاسع مُفعَّل للمستخدم ${userId}`);
  }

  /** إيقاف اللاسع لمستخدم — upsert لتفادي "no record found" */
  async disableForUser(userId: string): Promise<void> {
    if (!userId) {
      throw new Error('disableForUser called with empty userId');
    }
    try {
      await (this.prisma.agentSettings as any).upsert({
        where: { userId },
        update: { lazicEnabled: false },
        create: { userId, lazicEnabled: false },
      });
    } catch (err: any) {
      this.logger.error(`❌ disableForUser DB error for ${userId}: ${err?.message}`);
      throw err;
    }
    this.activeUsers.delete(userId);
    this.logger.log(`🐝 اللاسع موقوف للمستخدم ${userId}`);
  }

  /** صفقات اللاسع المفتوحة + المغلقة (للعرض في تاب اللاسع) */
  async getPositions(userId: string, limit: number = 20): Promise<{
    open: any[];
    closed: any[];
  }> {
    try {
      const [open, closed] = await Promise.all([
        this.prisma.position.findMany({
          where: { userId, status: 'OPEN', source: { in: ['lazic', 'lasic'] } },
          orderBy: { openedAt: 'desc' },
          take: limit,
        }),
        this.prisma.position.findMany({
          where: { userId, status: 'CLOSED', source: { in: ['lazic', 'lasic'] } },
          orderBy: { closedAt: 'desc' },
          take: limit,
        }),
      ]);
      return { open, closed };
    } catch (err: any) {
      this.logger.error(`خطأ في جلب صفقات اللاسع: ${err?.message}`);
      return { open: [], closed: [] };
    }
  }

  /** حالة اللاسع (للواجهة الأمامية) — تشمل الإعدادات + metrics */
  async getStatus(userId: string): Promise<{
    enabled: boolean;
    dailyTrades: number;
    activeSymbols: string[];
    lastOBIs: Record<string, number>;
    settings: LasicSettingsResponse;
    metrics: { success: number; fail: number; lastReason: string; lastAt: number };
  }> {
    const state = this.activeUsers.get(userId);
    const lastOBIs: Record<string, number> = {};

    for (const sym of LAZIC_SUPPORTED_SYMBOLS) {
      const raw = await this.redis.get(LAZIC_REDIS_KEYS.lastOBI(sym));
      if (raw) {
        try { lastOBIs[sym] = JSON.parse(raw).obi; } catch {}
      }
    }

    // Phase 2: اقرأ الإعدادات من DB (مع fallback)
    const settings = await this._readSettingsFromDb(userId);

    // Phase 3: اقرأ metrics من Redis
    let metrics = { success: 0, fail: 0, lastReason: '', lastAt: 0 };
    try {
      const raw = await this.redis.get(`lazic:metrics:${userId}`);
      if (raw) metrics = JSON.parse(raw);
    } catch {}

    // BUG-054 FIX: Read lazicEnabled directly from DB via raw SQL.
    let dbEnabled = false;
    try {
      const rows: any[] = await this.prisma.$queryRaw`
        SELECT "lazicEnabled" FROM "AgentSettings" WHERE "userId" = ${userId}
      `;
      dbEnabled = rows.length > 0 && !!rows[0].lazicEnabled;
    } catch {
      dbEnabled = !!state?.enabled;
    }

    return {
      enabled: dbEnabled,
      dailyTrades: state?.dailyTrades ?? 0,
      activeSymbols: Array.from(this.tickWindows.keys()).filter(
        sym => (this.tickWindows.get(sym)?.length ?? 0) > 5,
      ),
      lastOBIs,
      settings,
      metrics,
    };
  }

  /** Phase 2: اقرأ الإعدادات من DB مع fallback للقيم الافتراضية */
  private async _readSettingsFromDb(userId: string): Promise<LasicSettingsResponse> {
    try {
      const s: any = await this.prisma.agentSettings.findUnique({
        where: { userId },
      });
      if (!s) {
        return {
          obiThreshold: 0.4,
          maxSpreadMultiplier: 1.5,
          maxDailyTrades: 20,
          maxOpenPositions: 2,
          cooldownMs: 30000,
          riskPerTradePct: 0.5,
        };
      }
      return {
        obiThreshold: Number(s.lazicObiThreshold ?? 0.4),
        maxSpreadMultiplier: Number(s.lazicMaxSpreadMult ?? 1.5),
        maxDailyTrades: Number(s.lazicMaxDailyTrades ?? 20),
        maxOpenPositions: Number(s.lazicMaxOpenPositions ?? 2),
        cooldownMs: Number(s.lazicCooldownMs ?? 30000),
        riskPerTradePct: Number(s.lazicRiskPerTradePct ?? 0.5),
      };
    } catch {
      return {
        obiThreshold: 0.4,
        maxSpreadMultiplier: 1.5,
        maxDailyTrades: 20,
        maxOpenPositions: 2,
        cooldownMs: 30000,
        riskPerTradePct: 0.5,
      };
    }
  }

  /** Phase 2: احصل على الإعدادات فقط (لـ GET /settings) */
  async getSettings(userId: string): Promise<{ success: boolean; data: LasicSettingsResponse }> {
    const data = await this._readSettingsFromDb(userId);
    return { success: true, data };
  }

  /** Phase 2: حدّث الإعدادات (لـ PUT /settings) — upsert لتفادي "no record found" */
  async updateSettings(
    userId: string,
    dto: {
      obiThreshold?: number;
      maxSpreadMultiplier?: number;
      maxDailyTrades?: number;
      maxOpenPositions?: number;
      cooldownMs?: number;
      riskPerTradePct?: number;
    },
  ): Promise<{ success: boolean; data: LasicSettingsResponse; message: string }> {
    // بناء update data مع validation + clamping
    const updateData: any = {};
    if (dto.obiThreshold !== undefined) {
      updateData.lazicObiThreshold = Math.max(0.3, Math.min(0.8, dto.obiThreshold));
    }
    if (dto.maxSpreadMultiplier !== undefined) {
      updateData.lazicMaxSpreadMult = Math.max(1.0, Math.min(3.0, dto.maxSpreadMultiplier));
    }
    if (dto.maxDailyTrades !== undefined) {
      updateData.lazicMaxDailyTrades = Math.max(5, Math.min(100, Math.round(dto.maxDailyTrades)));
    }
    if (dto.maxOpenPositions !== undefined) {
      updateData.lazicMaxOpenPositions = Math.max(1, Math.min(10, Math.round(dto.maxOpenPositions)));
    }
    if (dto.cooldownMs !== undefined) {
      updateData.lazicCooldownMs = Math.max(10000, Math.min(300000, Math.round(dto.cooldownMs)));
    }
    if (dto.riskPerTradePct !== undefined) {
      updateData.lazicRiskPerTradePct = Math.max(0.1, Math.min(3.0, dto.riskPerTradePct));
    }

    // upsert بدل update — ينشئ سجل agentSettings لو غير موجود
    await (this.prisma.agentSettings as any).upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        ...updateData,
      },
    });

    // أعد مزامنة المستخدمين النشطين لتفعيل الإعدادات الجديدة فوراً
    await this._syncActiveUsers();

    const data = await this._readSettingsFromDb(userId);
    this.logger.log(`🐝 اللاسع: حُدّثت إعدادات المستخدم ${userId} → ${JSON.stringify(updateData)}`);

    return { success: true, data, message: 'تم تحديث إعدادات اللاسع' };
  }
}

/** Phase 2: response shape for settings */
export interface LasicSettingsResponse {
  obiThreshold: number;
  maxSpreadMultiplier: number;
  maxDailyTrades: number;
  maxOpenPositions: number;
  cooldownMs: number;
  riskPerTradePct: number;
}
