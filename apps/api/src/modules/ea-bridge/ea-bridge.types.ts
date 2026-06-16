// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — EA Bridge Types
// جسر الاتصال بين Expert Advisor (MT5) والكلاود
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * EA Token — مفتاح المصادقة الفريد لكل مستخدم
 * كل مستخدم يملك EA Token فريد يربط EA بحسابه في الكلاود
 * هذا يضمن العزل التام: EA لا يمكنه الوصول لبيانات مستخدم آخر
 */
export interface EAToken {
  id: string;
  userId: string;
  token: string;           // رمز فريد عشوائي (مثل: ea_sk_live_xxxx)
  label: string;           // اسم تعريفي (مثل: "حساب MT5 الديمو")
  mt5AccountNumber?: string;
  mt5Server?: string;
  isActive: boolean;
  lastHeartbeatAt?: Date;
  createdAt: Date;
  expiresAt?: Date;
}

/**
 * TradingBrief as sent to the EA
 * نسخة مبسطة من TradingBriefDTO للإرسال إلى EA
 */
export interface EABrief {
  id: string;
  pair: string;              // زوج التداول (EUR/USD, XAU/USD, BTC/USDT)
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;        // 0-100
  timeframe: string;         // M1, M5, M15, H1, H4, D1
  analysisSummary?: string;
  issuedAt: string;
  expiresAt: string;
  lotSize: number;           // حجم اللوت المحسوب من إدارة المخاطر
  strictRules: {
    maxSlippage: number;     // أقصى انزلاق سعري مسموح
    maxEntryPrice?: number;
    minEntryPrice?: number;
  };
}

/**
 * EA Heartbeat — نبضة حياة من EA
 * يرسلها EA كل 30 ثانية لإعلام الكلاود أنه لا يزال يعمل
 */
export interface EAHeartbeat {
  eaToken: string;
  mt5AccountNumber: string;
  mt5Server: string;
  mt5Build: number;
  symbol: string;            // الرمز الحالي المعروض على الشارت
  timeframe: string;
  balance: number;
  equity: number;
  openPositions: number;
  freeMargin: number;
  serverTime: string;
  uptime: number;            // ثوانٍ منذ بدء EA
}

/**
 * EA Execution Report — تقرير تنفيذ من EA
 * يرسله EA بعد كل تنفيذ (نجاح أو فشل)
 */
export interface EAExecutionReport {
  eaToken: string;
  briefId: string;
  pair: string;
  direction: 'BUY' | 'SELL';
  executed: boolean;
  entryPrice?: number;       // السعر الفعلي للدخول
  actualSlippage?: number;   // الانزلاق السعري الفعلي
  ticket?: number;           // رقم التذكرة في MT5
  lotSize?: number;
  error?: string;
  executedAt: string;
  serverTime: string;
}

/**
 * EA Position Update — تحديث مراكز مفتوحة من EA
 * يرسله EA بشكل دوري لمزامنة المراكز مع الكلاود
 */
export interface EAPositionUpdate {
  eaToken: string;
  positions: EAPosition[];
  timestamp: string;
}

export interface EAPosition {
  ticket: number;
  symbol: string;
  type: 'BUY' | 'SELL';
  volume: number;
  openPrice: number;
  currentPrice: number;
  sl: number;
  tp: number;
  profit: number;
  openTime: string;
  comment?: string;
  magicNumber?: number;
}

/**
 * EA Config — إعدادات يرسلها الكلاود إلى EA
 */
export interface EAConfig {
  pollIntervalMs: number;         // فترة الاستطلاع (30000 = 30 ثانية)
  maxSlippagePercent: number;     // أقصى انزلاق سعري
  riskPerTradePercent: number;    // نسبة المخاطرة لكل صفقة
  maxOpenPositions: number;       // أقصى عدد مراكز مفتوحة
  maxDailyLossPercent: number;    // أقصى خسارة يومية
  allowedPairs: string[];         // أزواج مسموح بتداولها
  magicNumber: number;            // الرقم السحري لتمييز صفقات EA
  enabled: boolean;               // هل التداول التلقائي مفعل
}

/**
 * EA Bridge Response — استجابة موحدة من الكلاود لـ EA
 */
export interface EABridgeResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  serverTime: string;
  nextPollMs?: number;        // متى يجب على EA أن يستطلع مرة أخرى
}
