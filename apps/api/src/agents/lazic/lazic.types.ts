// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — اللاسع (Lasic Scalper Agent)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// وكيل التداول فائق السرعة — يعمل على الثانية
// يعتمد على Order Book Imbalance (OBI) كإشارة أساسية
// بدون استدعاء AI — قرار في أقل من 5ms
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** tick واحد من OANDA أو Binance */
export interface LazicTick {
  symbol: string;
  bid: number;
  ask: number;
  price: number;         // mid price
  timestamp: number;     // Date.now()
  source: 'oanda' | 'binance';
  volume?: number;       // Binance only — for volume-weighted OBI
}

/** نافذة من آخر N tick لحساب OBI */
export interface TickWindow {
  ticks: LazicTick[];
  bidVolumeSum: number;  // تقريب: count of ticks where bid moved up
  askVolumeSum: number;  // تقريب: count of ticks where ask moved down
  spreadAvg: number;     // متوسط spread آخر 5 دقائق (للفلتر)
}

/** نتيجة حساب OBI لـ tick معين */
export interface OBIResult {
  symbol: string;
  obi: number;             // -1.0 إلى +1.0
  signal: 'BUY' | 'SELL' | 'NONE';
  spreadOk: boolean;       // هل spread ضمن الحد المسموح؟
  spreadRatio: number;     // current spread / avg spread
  stableSignal: boolean;   // اتجاه OBI ثابت في آخر 3 ticks
  currentSpread: number;
  avgSpread: number;
}

/** إشارة جاهزة للتنفيذ من اللاسع */
export interface LazicSignal {
  userId: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  obi: number;
  spreadRatio: number;
  councilAligned: boolean;  // هل المجلس الاستراتيجي يتفق مع الاتجاه؟
  timestamp: number;
  reason: string;
}

/** حالة اللاسع لكل مستخدم */
export interface LazicUserState {
  userId: string;
  enabled: boolean;
  credentialId: string;
  isPaperTrading: boolean;
  // حدود الأمان (قابلة للتخصيص من DB)
  maxOpenPositions: number;    // default: 2
  maxDailyTrades: number;      // default: 20
  dailyTrades: number;
  dailyPnL: number;
  lastTradeAt: number | null;
  cooldownMs: number;          // فترة انتظار بعد كل صفقة (default: 30,000ms = 30s)
  // ── إعدادات الإشارة (Phase 2 — من DB) ──
  obiThreshold: number;        // default: 0.4 (كان 0.6 — مرتفع جداً)
  maxSpreadMultiplier: number; // default: 1.5×
  riskPerTradePct: number;     // default: 0.5% من الرصيد
  // ── cache للرصيد (يحدّث كل 30s) ──
  cachedBalance: number | null;
  balanceLastFetchedAt: number | null;
}

/** OBI Config لكل زوج */
export interface LazicSymbolConfig {
  symbol: string;
  obiThreshold: number;        // default: 0.6
  maxSpreadMultiplier: number; // default: 1.5× avg
  slAtrMult: number;           // default: 0.3× H1 ATR
  tpAtrMult: number;           // default: 0.5× H1 ATR
  minSpreadAvgSamples: number; // default: 60 ticks قبل البدء
}

export const DEFAULT_LAZIC_CONFIG: Omit<LazicSymbolConfig, 'symbol'> = {
  // Phase 1 fix: lowered from 0.6 → 0.4 (0.6 was unreachable with tick-based OBI)
  obiThreshold: 0.4,
  maxSpreadMultiplier: 1.5,
  slAtrMult: 0.3,
  tpAtrMult: 0.5,
  // Phase 1 fix: lowered from 60 → 20 (60s warmup was too long after restart)
  minSpreadAvgSamples: 20,
};

/** الأزواج التي يدعمها اللاسع (OANDA forex + Binance crypto) */
export const LAZIC_SUPPORTED_SYMBOLS = [
  // Forex (OANDA)
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'NZD/USD', 'USD/CAD',
  // Crypto (Binance)
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT',
] as const;

export type LazicSymbol = typeof LAZIC_SUPPORTED_SYMBOLS[number];

/** Redis key prefixes */
export const LAZIC_REDIS_KEYS = {
  /** هل يوجد مركز مفتوح للمستخدم على هذا الزوج؟ */
  openPosition: (userId: string, symbol: string) =>
    `lazic:pos:${userId}:${symbol.replace('/', '_')}`,
  /** حالة المستخدم (daily trades, last trade time) */
  userState: (userId: string) => `lazic:state:${userId}`,
  /** آخر OBI للزوج (للواجهة الأمامية) */
  lastOBI: (symbol: string) => `lazic:obi:${symbol.replace('/', '_')}`,
  /** اتجاه المجلس الاستراتيجي (مكتوب بواسطة SmartExecutor/Council) */
  councilDirection: (symbol: string) =>
    `council:direction:${symbol.replace('/', '_')}`,
} as const;
