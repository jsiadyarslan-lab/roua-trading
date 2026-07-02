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
    this.redis.set(
      LAZIC_REDIS_KEYS.lastOBI(tick.symbol),
      JSON.stringify({ obi, signal, spreadRatio, ts: tick.timestamp }),
      30, // TTL 30 ثانية
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

    // ── شرط أمان 3: هل يوجد مركز مفتوح على هذا الزوج؟ (Redis check ~1ms)
    const posKey = LAZIC_REDIS_KEYS.openPosition(userId, obi.symbol);
    const hasOpenPos = await this.redis.get(posKey);
    if (hasOpenPos) return;

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

    // ── تحقق من توافق المجلس الاستراتيجي (اختياري)
    const councilDir = await this.redis.get(
      LAZIC_REDIS_KEYS.councilDirection(obi.symbol),
    );
    const councilAligned =
      (councilDir === 'BUY' && obi.signal === 'BUY') ||
      (councilDir === 'SELL' && obi.signal === 'SELL');

    // ── احسب SL/TP
    const direction: 'BUY' | 'SELL' = obi.signal === 'SELL' ? 'SELL' : 'BUY';
    const { sl, tp } = this._calcSLTP(tick, direction, state.isPaperTrading);

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
      } as any);

      // ── سجّل مركزاً مفتوحاً في Redis (TTL = 10 دقائق max)
      await this.redis.set(posKey, '1', 600);

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

  // ── SL/TP لحسابات السكالبينج — نسبة % ثابتة من السعر حسب asset class
  //
  // السبب:avgSpread السابق كان يُحسب من (high - low) لمدة 24 ساعة من Binance،
  // مما أعطى SL/TP بنسبة 8-17% من السعر (مستوى صفقات swing، ليس scalping).
  //
  // الحل: استخدام نسبة % ثابتة من السعر:
  //   Crypto: 0.2% SL, 0.3% TP (R:R 1:1.5) — مناسب لتذبذب 1-5 دقائق
  //   Forex:  0.05% SL, 0.075% TP — مناسب لـ 1-3 pips على EUR/USD
  private _calcSLTP(
    tick: LazicTick,
    direction: 'BUY' | 'SELL',
    _isPaper: boolean,
  ): { sl: number; tp: number } {
    const isCrypto = tick.symbol.includes('/USDT') || tick.symbol.includes('/BTC');
    // Crypto: 0.2% SL, 0.3% TP. Forex: 0.05% SL, 0.075% TP.
    const slPct = isCrypto ? 0.002 : 0.0005;
    const tpPct = slPct * 1.5;

    const slDist = tick.price * slPct;
    const tpDist = tick.price * tpPct;

    if (direction === 'BUY') {
      return { sl: tick.price - slDist, tp: tick.price + tpDist };
    } else {
      return { sl: tick.price + slDist, tp: tick.price - tpDist };
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
          const settings = await this.prisma.agentSettings.findUnique({
            where: { userId: state.userId },
            select: { paperBalance: true },
          });
          balance = Number(settings?.paperBalance ?? 10000);
        } else {
          const cached = await this.redis.get(`user:${state.userId}:balance`);
          balance = cached ? Number(cached) : 1000;
        }
        state.cachedBalance = balance;
        state.balanceLastFetchedAt = now;
      } catch (err: any) {
        balance = 1000;
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
    // تحديد asset class من اسم الزوج (ليس من السعر — USD/JPY price=150 يُعامل كـ forex)
    // crypto: ينتهي بـ /USDT أو /BTC أو /USD (للـ BTC, ETH, BNB, SOL)
    // forex: أزواج العملات التقليدية (EUR/USD, GBP/USD, USD/JPY, USD/CHF, etc.)
    const isCrypto = symbol.includes('/USDT') || symbol.includes('/BTC');
    const stepSize = isCrypto ? 0.01 : 100;

    // قرّب إلى step size (floor — لا يتجاوز الـ rawQty)
    let quantity = Math.floor(rawQty / stepSize) * stepSize;

    // لو النتيجة 0 (rawQty < stepSize)، استخدم stepSize كحد أدنى
    if (quantity === 0) {
      // تحقق لو stepSize يطابق الـ 25% cap
      if (stepSize * price > maxNotional) {
        this.logger.warn(
          `⚠️ اللاسع: stepSize (${stepSize}) × price (${price}) = ${stepSize * price} ` +
          `> cap (${maxNotional}) — balance=${balance}, symbol=${symbol}. تخطّي التنفيذ.`
        );
        return 0;
      }
      quantity = stepSize;
    }

    // تقريب نهائي
    // crypto: 2 decimals (0.01), forex: 0 decimals (100, 200, 300)
    const decimals = isCrypto ? 2 : 0;
    return Math.round(quantity * Math.pow(10, decimals)) / Math.pow(10, decimals);
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
      // جلب كل المستخدمين الذين فعّلوا اللاسع
      // Phase 2: اقرأ الإعدادات القابلة للتخصيص من DB
      const settings = await this.prisma.agentSettings.findMany({
        where: { lazicEnabled: true } as any,
        include: { user: { select: { id: true } } },
      });

      const newActiveUsers = new Map<string, LazicUserState>();

      for (const s of settings) {
        const existing = this.activeUsers.get(s.userId);
        newActiveUsers.set(s.userId, {
          userId: s.userId,
          enabled: true,
          credentialId: existing?.credentialId ?? '',  // سيُملأ لاحقاً من Setting table
          isPaperTrading: existing?.isPaperTrading ?? true,
          // ── Phase 2: اقرأ الإعدادات من DB مع fallback للقيم الافتراضية ──
          maxOpenPositions: Number((s as any).lazicMaxOpenPositions ?? 2),
          maxDailyTrades: Number((s as any).lazicMaxDailyTrades ?? 20),
          dailyTrades: existing?.dailyTrades ?? 0,
          dailyPnL: existing?.dailyPnL ?? 0,
          lastTradeAt: existing?.lastTradeAt ?? null,
          cooldownMs: Number((s as any).lazicCooldownMs ?? 30000),
          obiThreshold: Number((s as any).lazicObiThreshold ?? 0.4),
          maxSpreadMultiplier: Number((s as any).lazicMaxSpreadMult ?? 1.5),
          riskPerTradePct: Number((s as any).lazicRiskPerTradePct ?? 0.5),
          cachedBalance: existing?.cachedBalance ?? null,
          balanceLastFetchedAt: existing?.balanceLastFetchedAt ?? null,
        });
      }

      this.activeUsers = newActiveUsers;

      if (settings.length > 0) {
        this.logger.debug(`🐝 مزامنة: ${settings.length} مستخدم نشط للاسع`);
      }
    } catch (err: any) {
      this.logger.error(`خطأ في مزامنة مستخدمي اللاسع: ${err?.message}`);
    }
  }

  // ══════════════════════════════════════════
  // Public API (للكنترولر والواجهة الأمامية)
  // ══════════════════════════════════════════

  /** تفعيل اللاسع لمستخدم — upsert لتفادي "no record found" */
  async enableForUser(userId: string): Promise<void> {
    await (this.prisma.agentSettings as any).upsert({
      where: { userId },
      update: { lazicEnabled: true },
      create: { userId, lazicEnabled: true },
    });
    await this._syncActiveUsers();
    this.logger.log(`🐝 اللاسع مُفعَّل للمستخدم ${userId}`);
  }

  /** إيقاف اللاسع لمستخدم — upsert لتفادي "no record found" */
  async disableForUser(userId: string): Promise<void> {
    await (this.prisma.agentSettings as any).upsert({
      where: { userId },
      update: { lazicEnabled: false },
      create: { userId, lazicEnabled: false },
    });
    this.activeUsers.delete(userId);
    this.logger.log(`🐝 اللاسع موقوف للمستخدم ${userId}`);
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

    return {
      enabled: !!state?.enabled,
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
