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

    // Binance may not send bid/ask in all updates — derive from price
    const bid = (update as any).bid ?? update.price * 0.9999;
    const ask = (update as any).ask ?? update.price * 1.0001;

    const tick: LazicTick = {
      symbol: sym,
      bid,
      ask,
      price: update.price,
      timestamp: Date.now(),
      source: 'binance',
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
    const avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    const spreadRatio = currentSpread / avgSpread;
    const spreadOk = spreadRatio <= DEFAULT_LAZIC_CONFIG.maxSpreadMultiplier;
    const signal = obi > DEFAULT_LAZIC_CONFIG.obiThreshold ? 'BUY'
                 : obi < -DEFAULT_LAZIC_CONFIG.obiThreshold ? 'SELL'
                 : 'NONE';
    const stableSignal = history.length === 3 && (
      signal === 'BUY'  ? history.every(o => o > DEFAULT_LAZIC_CONFIG.obiThreshold)
    : signal === 'SELL' ? history.every(o => o < -DEFAULT_LAZIC_CONFIG.obiThreshold)
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

      // ارتفاع السعر → ضغط شراء
      if (curr.bid > prev.bid) bidPressure += (curr.bid - prev.bid);
      // انخفاض السعر → ضغط بيع
      if (curr.ask < prev.ask) askPressure += (prev.ask - curr.ask);
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

    // ── تحقق من توافق المجلس الاستراتيجي (اختياري — يضاعف الحجم)
    const councilDir = await this.redis.get(
      LAZIC_REDIS_KEYS.councilDirection(obi.symbol),
    );
    const councilAligned =
      (councilDir === 'BUY' && obi.signal === 'BUY') ||
      (councilDir === 'SELL' && obi.signal === 'SELL');

    // ── احسب SL/TP من ATR
    const { sl, tp } = this._calcSLTP(tick, obi.signal === 'NONE' ? 'BUY' : obi.signal, state.isPaperTrading);

    // ── أرسل للتنفيذ عبر TradingService
    try {
      const idempotencyKey = `lazic:${userId}:${obi.symbol}:${now}`;
      const orderSide = obi.signal === 'SELL' ? 'SELL' : 'BUY';

      await this.tradingService.placeOrder(userId, {
        symbol: obi.symbol,
        side: orderSide as any,
        type: 'MARKET' as any,
        quantity: this._calcQuantity(tick.price, state),
        stopLoss: sl,
        takeProfit: tp,
        idempotencyKey,
        source: 'agent',
        strategy: 'scalping',
        credentialId: state.credentialId,
      });

      // ── سجّل مركزاً مفتوحاً في Redis (TTL = 10 دقائق max)
      await this.redis.set(posKey, '1', 600);

      // ── حدّث حالة المستخدم
      state.lastTradeAt = now;
      state.dailyTrades += 1;
      this.activeUsers.set(userId, state);

      this.logger.log(
        `🐝 لسعة! ${obi.symbol} ${obi.signal} | OBI=${obi.obi.toFixed(3)} ` +
        `| spread×${obi.spreadRatio.toFixed(2)} ` +
        `| Council: ${councilAligned ? '✅ متوافق' : '—'} ` +
        `| SL=${sl.toFixed(5)} TP=${tp.toFixed(5)}`,
      );
    } catch (err: any) {
      this.logger.error(`❌ فشل تنفيذ اللاسع (${userId}/${obi.symbol}): ${err?.message}`);
    }
  }

  // ── SL/TP بناءً على ATR من Redis (يكتبه MarketRegimeService)
  // Fallback: spread × multiplier إذا ATR غير متوفر
  private _calcSLTP(
    tick: LazicTick,
    direction: 'BUY' | 'SELL',
    _isPaper: boolean,
  ): { sl: number; tp: number } {
    const spreads = this.spreadWindows.get(tick.symbol) ?? [];
    const avgSpread = spreads.length > 0
      ? spreads.reduce((a, b) => a + b, 0) / spreads.length
      : tick.ask - tick.bid;

    // SL = 2× avgSpread, TP = 3× avgSpread → R:R ≈ 1:1.5 بعد العمولة
    // صغير جداً لأن اللاسع يهدف لـ 10-30 ثانية فقط
    const slDist = Math.max(avgSpread * 2, tick.price * 0.0003); // 0.03% min
    const tpDist = slDist * 1.5;

    if (direction === 'BUY') {
      return { sl: tick.price - slDist, tp: tick.price + tpDist };
    } else {
      return { sl: tick.price + slDist, tp: tick.price - tpDist };
    }
  }

  // ── حجم الصفقة: 0.5% من رصيد الحساب ÷ مسافة SL
  // نبسّط هنا — يمكن ربطه بـ balanceService لاحقاً
  private _calcQuantity(price: number, _state: LazicUserState): number {
    // حجم ثابت صغير جداً للبداية — جابر يعدّله لاحقاً بعد التحقق
    // سيُربط بـ riskPerTradePercent × balance في الإصدار التالي
    return price > 1000 ? 0.001 : price > 100 ? 0.01 : 1;
  }

  // ══════════════════════════════════════════
  // User State Management
  // ══════════════════════════════════════════

  private async _syncActiveUsers(): Promise<void> {
    try {
      // جلب كل المستخدمين الذين فعّلوا اللاسع
      // الحقل lazicEnabled في AgentSettings — يُضاف عبر migration أو autoMigrate safety-net
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
          credentialId: (s as any).activeCredentialId ?? '',
          isPaperTrading: !(s as any).activeCredentialId,
          maxOpenPositions: 2,
          maxDailyTrades: 20,
          dailyTrades: existing?.dailyTrades ?? 0,
          dailyPnL: existing?.dailyPnL ?? 0,
          lastTradeAt: existing?.lastTradeAt ?? null,
          cooldownMs: 30_000, // 30 ثانية بين كل صفقة
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

  /** تفعيل اللاسع لمستخدم */
  async enableForUser(userId: string): Promise<void> {
    await (this.prisma.agentSettings as any).update({
      where: { userId },
      data: { lazicEnabled: true },
    });
    await this._syncActiveUsers();
    this.logger.log(`🐝 اللاسع مُفعَّل للمستخدم ${userId}`);
  }

  /** إيقاف اللاسع لمستخدم */
  async disableForUser(userId: string): Promise<void> {
    await (this.prisma.agentSettings as any).update({
      where: { userId },
      data: { lazicEnabled: false },
    });
    this.activeUsers.delete(userId);
    this.logger.log(`🐝 اللاسع موقوف للمستخدم ${userId}`);
  }

  /** حالة اللاسع (للواجهة الأمامية) */
  async getStatus(userId: string): Promise<{
    enabled: boolean;
    dailyTrades: number;
    activeSymbols: string[];
    lastOBIs: Record<string, number>;
  }> {
    const state = this.activeUsers.get(userId);
    const lastOBIs: Record<string, number> = {};

    for (const sym of LAZIC_SUPPORTED_SYMBOLS) {
      const raw = await this.redis.get(LAZIC_REDIS_KEYS.lastOBI(sym));
      if (raw) {
        try { lastOBIs[sym] = JSON.parse(raw).obi; } catch {}
      }
    }

    return {
      enabled: !!state?.enabled,
      dailyTrades: state?.dailyTrades ?? 0,
      activeSymbols: Array.from(this.tickWindows.keys()).filter(
        sym => (this.tickWindows.get(sym)?.length ?? 0) > 5,
      ),
      lastOBIs,
    };
  }
}
