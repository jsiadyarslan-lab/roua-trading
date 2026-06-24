// ─── Position Size Calculator ──────────────────────────────────────
// ACCURATE position sizing for all asset types.
// CRITICAL: This fixes the previous bug where the AI simply divided
// risk by SL distance ($3 / $159 = 0.019 lot), which was DEAD WRONG
// for XAUUSD where 1 lot = 100 ounces and each $1 move = $100/lot.
//
// CORRECT FORMULA:
//   Lot Size = Risk Amount / (SL Distance in Price × Pip Value per Lot)
//
// For XAUUSD: Pip Value per Lot = Contract Size = 100 (ounces per lot)
//   So: Lot = Risk / (SL Distance × 100)
//   Example: $3 / ($159 × 100) = 0.000188 lot ≈ 0.01 micro lot (min)
//
// For EURUSD: Pip Value per Lot = 100,000 × 0.0001 = $10 per pip
//   So: Lot = Risk / (SL Pips × $10)
//   Example: $3 / (20 pips × $10) = 0.015 lot

import type { Locale } from './tools';
import type { DataBundle } from './data-fetcher';

// ─── Contract Specifications ──────────────────────────────────────

interface ContractSpec {
  name: string;
  nameAr: string;
  contractSize: number;     // Units per standard lot (e.g., 100 for gold = 100 oz/lot)
  pipSize: number;          // Minimum price increment (0.01 for gold, 0.0001 for forex)
  pipValuePerLot: number;   // Dollar value of 1 pip per standard lot
  minLot: number;           // Minimum lot size (usually 0.01)
  lotStep: number;          // Lot increment step (usually 0.01)
  assetClass: 'commodity' | 'forex' | 'crypto' | 'stock' | 'index';
}

const CONTRACT_SPECS: Record<string, ContractSpec> = {
  // ─── Commodities ───
  'XAUUSD': {
    name: 'Gold (XAU/USD)',
    nameAr: 'الذهب (XAU/USD)',
    contractSize: 100,         // 100 ounces per standard lot
    pipSize: 0.01,             // $0.01 minimum increment
    pipValuePerLot: 1,         // $1 per $0.01 move per lot (100 oz × $0.01)
    minLot: 0.01,
    lotStep: 0.01,
    assetClass: 'commodity',
  },
  'XAGUSD': {
    name: 'Silver (XAG/USD)',
    nameAr: 'الفضة (XAG/USD)',
    contractSize: 5000,        // 5000 ounces per standard lot
    pipSize: 0.001,            // $0.001 minimum increment
    pipValuePerLot: 5,         // $5 per $0.001 move per lot (5000 oz × $0.001)
    minLot: 0.01,
    lotStep: 0.01,
    assetClass: 'commodity',
  },
  'CL': {
    name: 'Crude Oil (WTI)',
    nameAr: 'النفط الخام (WTI)',
    contractSize: 1000,        // 1000 barrels per standard lot
    pipSize: 0.01,             // $0.01 minimum increment
    pipValuePerLot: 10,        // $10 per $0.01 move per lot (1000 bbl × $0.01)
    minLot: 0.01,
    lotStep: 0.01,
    assetClass: 'commodity',
  },
  'BZ': {
    name: 'Brent Crude',
    nameAr: 'خام برنت',
    contractSize: 1000,
    pipSize: 0.01,
    pipValuePerLot: 10,
    minLot: 0.01,
    lotStep: 0.01,
    assetClass: 'commodity',
  },

  // ─── Forex Pairs ───
  'EURUSD': {
    name: 'EUR/USD',
    nameAr: 'اليورو مقابل الدولار',
    contractSize: 100000,      // 100,000 units per standard lot
    pipSize: 0.0001,           // 4th decimal = 1 pip
    pipValuePerLot: 10,        // $10 per pip per standard lot
    minLot: 0.01,
    lotStep: 0.01,
    assetClass: 'forex',
  },
  'GBPUSD': {
    name: 'GBP/USD',
    nameAr: 'الجنيه مقابل الدولار',
    contractSize: 100000,
    pipSize: 0.0001,
    pipValuePerLot: 10,
    minLot: 0.01,
    lotStep: 0.01,
    assetClass: 'forex',
  },
  'USDJPY': {
    name: 'USD/JPY',
    nameAr: 'الدولار مقابل الين',
    contractSize: 100000,
    pipSize: 0.01,             // 2nd decimal = 1 pip for JPY pairs
    pipValuePerLot: 1000,      // ¥1000 per pip (needs conversion to USD)
    minLot: 0.01,
    lotStep: 0.01,
    assetClass: 'forex',
    // Note: For JPY pairs, pip value in USD = pipValuePerLot / current rate
    // e.g., at USDJPY=155, $1000/155 ≈ $6.45 per pip
    isJPYPair: true,
  } as ContractSpec & { isJPYPair: boolean },
  'USDCHF': {
    name: 'USD/CHF',
    nameAr: 'الدولار مقابل الفرنك',
    contractSize: 100000,
    pipSize: 0.0001,
    pipValuePerLot: 10,        // Approximate (varies with rate)
    minLot: 0.01,
    lotStep: 0.01,
    assetClass: 'forex',
  },
  'AUDUSD': {
    name: 'AUD/USD',
    nameAr: 'الدولار الأسترالي',
    contractSize: 100000,
    pipSize: 0.0001,
    pipValuePerLot: 10,
    minLot: 0.01,
    lotStep: 0.01,
    assetClass: 'forex',
  },
  'NZDUSD': {
    name: 'NZD/USD',
    nameAr: 'الدولار النيوزيلندي',
    contractSize: 100000,
    pipSize: 0.0001,
    pipValuePerLot: 10,
    minLot: 0.01,
    lotStep: 0.01,
    assetClass: 'forex',
  },
  'USDCAD': {
    name: 'USD/CAD',
    nameAr: 'الدولار الكندي',
    contractSize: 100000,
    pipSize: 0.0001,
    pipValuePerLot: 10,        // Approximate
    minLot: 0.01,
    lotStep: 0.01,
    assetClass: 'forex',
  },
  'EURGBP': {
    name: 'EUR/GBP',
    nameAr: 'اليورو مقابل الجنيه',
    contractSize: 100000,
    pipSize: 0.0001,
    pipValuePerLot: 10,        // In GBP, needs conversion
    minLot: 0.01,
    lotStep: 0.01,
    assetClass: 'forex',
  },
  'EURJPY': {
    name: 'EUR/JPY',
    nameAr: 'اليورو مقابل الين',
    contractSize: 100000,
    pipSize: 0.01,
    pipValuePerLot: 1000,      // In JPY, needs conversion
    minLot: 0.01,
    lotStep: 0.01,
    assetClass: 'forex',
    isJPYPair: true,
  } as ContractSpec & { isJPYPair: boolean },
  'GBPJPY': {
    name: 'GBP/JPY',
    nameAr: 'الجنيه مقابل الين',
    contractSize: 100000,
    pipSize: 0.01,
    pipValuePerLot: 1000,      // In JPY
    minLot: 0.01,
    lotStep: 0.01,
    assetClass: 'forex',
    isJPYPair: true,
  } as ContractSpec & { isJPYPair: boolean },

  // ─── Crypto ───
  'BTCUSD': {
    name: 'Bitcoin (BTC/USD)',
    nameAr: 'البتكوين (BTC/USD)',
    contractSize: 1,           // 1 BTC per standard lot
    pipSize: 0.01,
    pipValuePerLot: 0.01,      // $0.01 per $0.01 move
    minLot: 0.01,
    lotStep: 0.01,
    assetClass: 'crypto',
  },
  'ETHUSD': {
    name: 'Ethereum (ETH/USD)',
    nameAr: 'الإيثريوم (ETH/USD)',
    contractSize: 1,           // 1 ETH per standard lot
    pipSize: 0.01,
    pipValuePerLot: 0.01,
    minLot: 0.01,
    lotStep: 0.01,
    assetClass: 'crypto',
  },
  'SOLUSD': {
    name: 'Solana (SOL/USD)',
    nameAr: 'سولانا (SOL/USD)',
    contractSize: 1,
    pipSize: 0.01,
    pipValuePerLot: 0.01,
    minLot: 0.01,
    lotStep: 0.01,
    assetClass: 'crypto',
  },

  // ─── Indices ───
  'SPX': {
    name: 'S&P 500',
    nameAr: 'مؤشر S&P 500',
    contractSize: 50,          // $50 per point per lot (E-mini)
    pipSize: 0.01,
    pipValuePerLot: 0.50,      // $0.50 per $0.01 move
    minLot: 0.01,
    lotStep: 0.01,
    assetClass: 'index',
  },
  'NDX': {
    name: 'Nasdaq 100',
    nameAr: 'مؤشر ناسداك 100',
    contractSize: 20,          // $20 per point per lot (E-mini)
    pipSize: 0.01,
    pipValuePerLot: 0.20,
    minLot: 0.01,
    lotStep: 0.01,
    assetClass: 'index',
  },
};

// ─── Position Sizing Question Detection ────────────────────────────

const POSITION_SIZING_PATTERNS: Record<Locale, string[]> = {
  ar: [
    'حجم العقد', 'حجم عقد', 'كم لوت', 'كم العقد', 'حجم اللوت',
    'حساب حجم', 'حساب العقد', 'كم حجم', 'عدد العقود', 'عدد اللوتات',
    'نسبة الخسارة', 'خسارة', 'وقف الخسارة', 'وقف خسارة',
    'رأس مال', 'رأسالمال', 'راس مال', 'راسمال',
    'ادخل صفقة', 'دخول صفقة', 'صفقة',
    'بالمائة', 'بالمئة', 'نسبة',
    'كم اقدر اشتري', 'كم اقدر ابيع', 'كم استطيع',
    'حجم الصفقة', 'قيمة الصفقة',
    'مخاطرة', 'ادارة المخاطر', 'ريسك',
  ],
  en: [
    'lot size', 'position size', 'how many lots', 'how much lot',
    'contract size', 'calculate lot', 'calculate position',
    'risk per trade', 'risk percentage', 'percent risk',
    'account size', 'capital', 'stop loss distance',
    'how much can i trade', 'how much should i risk',
    'money management', 'risk management', 'risk amount',
    'position sizing', 'lot calculation',
  ],
  fr: [
    'taille du lot', 'taille de position', 'combien de lots',
    'calcul lot', 'risque par trade', 'pourcentage de risque',
    'capital', 'gestion du risque',
  ],
  tr: [
    'lot büyüklüğü', 'pozisyon büyüklüğü', 'kaç lot',
    'lot hesaplama', 'risk yüzdesi', 'sermaye',
    'risk yönetimi', 'pozisyon boyutu',
  ],
  es: [
    'tamaño del lote', 'tamaño de posición', 'cuántos lotes',
    'calcular lote', 'riesgo por operación', 'porcentaje de riesgo',
    'capital', 'gestión del riesgo',
  ],
};

// Numbers pattern for extracting account size and risk percentage
const NUMBER_PATTERN = /\d+([.,]\d+)?/g;

/**
 * Detect if a message is asking about position sizing.
 * Returns extracted parameters if detected, null otherwise.
 */
export interface PositionSizingParams {
  accountSize: number | null;
  riskPercent: number | null;
  isPositionSizingQuestion: boolean;
}

export function detectPositionSizingQuestion(message: string, locale: Locale): PositionSizingParams | null {
  const msgLower = message.toLowerCase();
  const patterns = POSITION_SIZING_PATTERNS[locale] || POSITION_SIZING_PATTERNS.en;

  // Check if the message contains any position sizing keywords
  const hasKeyword = patterns.some(p => msgLower.includes(p.toLowerCase()));
  if (!hasKeyword) return null;

  // Extract account size (look for dollar amounts or numbers before "دولار" or "$")
  let accountSize: number | null = null;
  let riskPercent: number | null = null;

  // Arabic: "معي 100 دولار" or "رأس مال 100" or "100$"
  const arabicDollarMatch = message.match(/(\d+(?:[.,]\d+)?)\s*(?:دولار|\$|دولارس)/i);
  if (arabicDollarMatch) {
    accountSize = parseFloat(arabicDollarMatch[1].replace(',', '.'));
  }

  // English: "$100" or "100 dollars" or "account of 100"
  if (!accountSize) {
    const dollarMatch = message.match(/\$?\s*(\d+(?:[.,]\d+)?)\s*(?:dollars?|\$|usd)/i);
    if (dollarMatch) {
      accountSize = parseFloat(dollarMatch[1].replace(',', '.'));
    }
  }

  // Generic: look for a number that seems like an account size (usually > 10)
  if (!accountSize) {
    const numbers = message.match(NUMBER_PATTERN);
    if (numbers && numbers.length >= 1) {
      const parsed = parseFloat(numbers[0].replace(',', '.'));
      if (parsed >= 10 && parsed <= 10000000) {
        accountSize = parsed;
      }
    }
  }

  // Extract risk percentage
  // Arabic: "3 بالمائة" or "3 بالمئة" or "نسبة 3" or "خسارة 3"
  const arabicPctMatch = message.match(/(\d+(?:[.,]\d+)?)\s*(?:بالمائة|بالمئة|%|نسبة|خسارة)/i);
  if (arabicPctMatch) {
    riskPercent = parseFloat(arabicPctMatch[1].replace(',', '.'));
    // Sanity check: risk percent should be 0.1-100
    if (riskPercent > 100) riskPercent = null;
  }

  // English: "3%" or "3 percent" or "risk 3%"
  if (riskPercent === null) {
    const pctMatch = message.match(/(\d+(?:[.,]\d+)?)\s*(?:%|percent|pct)/i);
    if (pctMatch) {
      riskPercent = parseFloat(pctMatch[1].replace(',', '.'));
      if (riskPercent > 100) riskPercent = null;
    }
  }

  // Default risk percentage if not specified
  if (riskPercent === null) {
    riskPercent = 2; // Default 2% risk
  }

  return {
    accountSize,
    riskPercent,
    isPositionSizingQuestion: true,
  };
}

// ─── Position Size Calculation ────────────────────────────────────

export interface PositionSizeResult {
  symbol: string;
  assetName: string;
  assetNameAr: string;
  accountSize: number;
  riskPercent: number;
  riskAmount: number;
  currentPrice: number;
  entryPrice: number;
  stopLossPrice: number;
  slDistance: number;
  slDistancePips: number;
  pipValuePerLot: number;
  contractSize: number;
  exactLotSize: number;
  adjustedLotSize: number;    // Rounded to lot step
  actualRisk: number;         // Actual risk with adjusted lot size
  actualRiskPercent: number;
  direction: 'long' | 'short';
  isValid: boolean;           // Whether the position size is > minimum lot
  warning: string | null;     // Warning message if position is too small
  minLotRequired: number;     // Minimum lot for this trade to work
  profitTarget: number | null; // If trade setup has a target
  potentialProfit: number | null;
  riskRewardRatio: number | null;
}

/**
 * Calculate the correct position size for a trade.
 *
 * FORMULA:
 *   For USD-denominated assets (XAUUSD, EURUSD, etc.):
 *     Lot Size = Risk Amount / (SL Distance × Contract Size × Pip Size)
 *     Simplified: Lot Size = Risk Amount / (SL Distance in Price × Pip Value per Standard Lot)
 *
 *   For JPY pairs:
 *     Pip Value in USD = 1000 / Current Price (for USDJPY)
 *     Lot Size = Risk Amount / (SL Pips × Pip Value in USD)
 */
export function calculatePositionSize(
  symbol: string,
  accountSize: number,
  riskPercent: number,
  entryPrice: number,
  stopLossPrice: number,
  direction: 'long' | 'short' = 'long',
  targetPrice?: number,
): PositionSizeResult | null {
  const specs = CONTRACT_SPECS[symbol];
  if (!specs) {
    console.warn(`[PositionCalc] No contract specs for ${symbol}`);
    return null;
  }

  // Calculate SL distance in price
  const slDistance = Math.abs(stopLossPrice - entryPrice);
  if (slDistance <= 0) {
    return null;
  }

  // Calculate SL distance in pips
  const slDistancePips = slDistance / specs.pipSize;

  // Calculate pip value per standard lot in USD
  let pipValueUSD = specs.pipValuePerLot;

  // For JPY pairs, convert pip value to USD
  const isJPYPair = (specs as any).isJPYPair;
  if (isJPYPair) {
    // For USDJPY: pip value in USD = ¥1000 / rate
    // For cross pairs (EURJPY, GBPJPY): needs base currency rate conversion
    // Simplified: use current rate for conversion
    if (symbol === 'USDJPY') {
      pipValueUSD = 1000 / entryPrice; // ¥1000 converted to USD
    } else if (symbol === 'EURJPY') {
      // EURJPY pip value = ¥1000 / USDJPY rate (approximate)
      pipValueUSD = 1000 / (entryPrice * 0.0065); // Rough approximation
    } else if (symbol === 'GBPJPY') {
      pipValueUSD = 1000 / (entryPrice * 0.005); // Rough approximation
    }
  }

  // Risk amount in dollars
  const riskAmount = accountSize * (riskPercent / 100);

  // EXACT LOT SIZE CALCULATION
  // For USD-quote pairs (EURUSD, GBPUSD, XAUUSD):
  //   Loss per lot = SL Distance × Contract Size
  //   Lot Size = Risk Amount / Loss per lot
  //
  // Example for XAUUSD:
  //   Entry: 4238, SL: 4397, SL Distance: $159
  //   Loss per standard lot = $159 × 100 oz = $15,900
  //   Lot Size = $3 / $15,900 = 0.000188 lot
  //
  // Example for EURUSD:
  //   Entry: 1.0850, SL: 1.0800, SL Distance: 50 pips
  //   Loss per standard lot = 50 × $10 = $500
  //   Lot Size = $3 / $500 = 0.006 lot

  let exactLotSize: number;

  if (specs.assetClass === 'commodity') {
    // Commodities: Loss per lot = SL distance × contract size
    const lossPerLot = slDistance * specs.contractSize;
    exactLotSize = riskAmount / lossPerLot;
  } else if (specs.assetClass === 'forex') {
    // Forex: use pip-based calculation
    const lossPerLot = slDistancePips * pipValueUSD;
    exactLotSize = riskAmount / lossPerLot;
  } else if (specs.assetClass === 'crypto') {
    // Crypto: similar to commodity
    const lossPerLot = slDistance * specs.contractSize;
    exactLotSize = riskAmount / lossPerLot;
  } else if (specs.assetClass === 'index') {
    // Indices: similar to commodity
    const lossPerLot = slDistance * specs.contractSize;
    exactLotSize = riskAmount / lossPerLot;
  } else {
    // Stocks: 1 lot = 100 shares typically
    const lossPerLot = slDistance * 100; // 100 shares per lot
    exactLotSize = riskAmount / lossPerLot;
  }

  // Adjust lot size to broker's lot step (usually 0.01)
  const adjustedLotSize = Math.floor(exactLotSize / specs.lotStep) * specs.lotStep;

  // If adjusted lot is 0, use minimum lot
  const finalLotSize = adjustedLotSize < specs.minLot ? specs.minLot : adjustedLotSize;

  // Calculate actual risk with adjusted lot
  let actualRisk: number;
  if (specs.assetClass === 'commodity' || specs.assetClass === 'crypto' || specs.assetClass === 'index') {
    actualRisk = finalLotSize * slDistance * specs.contractSize;
  } else {
    actualRisk = finalLotSize * slDistancePips * pipValueUSD;
  }

  const actualRiskPercent = (actualRisk / accountSize) * 100;

  // Determine if the position is valid
  const isValid = exactLotSize >= specs.minLot;
  const minLotRequired = specs.minLot;

  // Generate warning if position is too risky
  let warning: string | null = null;
  if (!isValid) {
    warning = actualRiskPercent > 50
      ? 'POSITION_TOO_LARGE'
      : 'POSITION_BELOW_MIN';
  } else if (actualRiskPercent > riskPercent * 1.5) {
    warning = 'RISK_EXCEEDS_TARGET';
  }

  // Calculate profit if target is provided
  let profitTarget: number | null = null;
  let potentialProfit: number | null = null;
  let riskRewardRatio: number | null = null;

  if (targetPrice && targetPrice > 0) {
    profitTarget = targetPrice;
    const profitDistance = Math.abs(targetPrice - entryPrice);

    if (specs.assetClass === 'commodity' || specs.assetClass === 'crypto' || specs.assetClass === 'index') {
      potentialProfit = finalLotSize * profitDistance * specs.contractSize;
    } else {
      const profitPips = profitDistance / specs.pipSize;
      potentialProfit = finalLotSize * profitPips * pipValueUSD;
    }

    if (actualRisk > 0) {
      riskRewardRatio = potentialProfit / actualRisk;
    }
  }

  const assetName = specs.name;
  const assetNameAr = specs.nameAr;

  return {
    symbol,
    assetName,
    assetNameAr,
    accountSize,
    riskPercent,
    riskAmount,
    currentPrice: entryPrice,
    entryPrice,
    stopLossPrice,
    slDistance,
    slDistancePips,
    pipValuePerLot: pipValueUSD,
    contractSize: specs.contractSize,
    exactLotSize,
    adjustedLotSize: finalLotSize,
    actualRisk,
    actualRiskPercent,
    direction,
    isValid,
    warning,
    minLotRequired,
    profitTarget,
    potentialProfit,
    riskRewardRatio,
  };
}

// ─── Build Position Size HTML Card ────────────────────────────────

export function buildPositionSizeHTML(
  result: PositionSizeResult,
  locale: Locale,
  dataBundle?: DataBundle | null,
): string {
  const isRtl = locale === 'ar';
  const dir = isRtl ? 'rtl' : 'ltr';
  const fontFamily = locale === 'ar'
    ? "'Readex Pro', 'Noto Sans Arabic', 'Segoe UI', sans-serif"
    : "'Inter', 'Segoe UI', 'Noto Sans', sans-serif";

  const C = {
    bg: '#0F172A',
    cardBg: '#1E293B',
    textPrimary: '#E2E8F0',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    accentGreen: '#4ADE80',
    accentRed: '#F87171',
    accentYellow: '#FBBF24',
    accentBlue: '#60A5FA',
    accentPurple: '#C084FC',
    accentCyan: '#38BDF8',
  };

  // Labels by locale
  const L = locale === 'ar' ? {
    title: 'حساب حجم العقد',
    accountSize: 'رأس المال',
    riskPercent: 'نسبة المخاطرة',
    riskAmount: 'مبلغ المخاطرة',
    entry: 'سعر الدخول',
    stopLoss: 'وقف الخسارة',
    slDistance: 'مسافة وقف الخسارة',
    slPips: 'نقاط',
    contractSize: 'حجم العقد القياسي',
    pipValue: 'قيمة النقطة/لوت',
    exactLot: 'حجم العقد الدقيق',
    adjustedLot: 'حجم العقد الموصى به',
    actualRisk: 'المخاطرة الفعلية',
    direction: 'الاتجاه',
    long: 'شراء (Long)',
    short: 'بيع (Short)',
    valid: 'حجم العقد صالح',
    invalid: 'تنبيه: حجم العقد صغير جداً!',
    warningLarge: 'تحذير: المخاطرة الفعلية أكبر من المستهدف!',
    warningMin: 'حجم العقد أقل من الحد الأدنى. حتى مع أصغر عقد، المخاطرة ستكون أعلى من المستهدف.',
    warningTooLarge: 'خطر جداً! حتى أصغر عقد ستخسرك أكثر من نصف رأس مالك. لا تدخل هذه الصفقة!',
    potentialProfit: 'الربح المحتمل',
    riskReward: 'نسبة العائد/المخاطرة',
    assetName: 'الأصل',
    disclaimer: 'تنبيه: هذا حساب تقريبي بناءً على مواصفات العقود القياسية. قد تختلف مواصفات العقود حسب الوسيط. تأكد من مواصفات وسيطك قبل الدخول.',
    formula: 'المعادلة',
    formulaText: 'حجم العقد = مبلغ المخاطرة ÷ (مسافة وقف الخسارة × حجم العقد القياسي)',
    example: 'مثال',
    ozPerLot: 'أونصة/لوت',
    unitsPerLot: 'وحدة/لوت',
    steps: 'خطوات الدخول',
    step1: 'اختر الأصل في منصة التداول',
    step2: 'اختر الاتجاه',
    step3: 'ضع حجم العقد',
    step4: 'ضع الأسعار',
    step5: 'نفذ الصفقة',
    riskWarning: 'تحذير: إذا وصل السعر لوقف الخسارة، ستخسر',
    profitIf: 'إذا وصل السعر للهدف، ستربح',
    scenarioAnalysis: 'تحليل السيناريوهات',
    worstCase: 'أسوأ سيناريو (وقف خسارة)',
    bestCase: 'أفضل سيناريو (الهدف)',
    result: 'النتيجة',
    accountAfter: 'رأس المال بعد',
    notRecommended: 'غير موصى به',
    recommended: 'موصى به',
    brokerNote: 'ملاحظة: تأكد من مواصفات وسيطك',
    minLotNote: 'مع أصغر عقد ممكن',
    yourRiskWouldBe: 'ستكون مخاطرتك',
    ofAccount: 'من رأس مالك',
  } : {
    title: 'Position Size Calculator',
    accountSize: 'Account Size',
    riskPercent: 'Risk %',
    riskAmount: 'Risk Amount',
    entry: 'Entry Price',
    stopLoss: 'Stop Loss',
    slDistance: 'SL Distance',
    slPips: 'pips',
    contractSize: 'Contract Size',
    pipValue: 'Pip Value/Lot',
    exactLot: 'Exact Lot Size',
    adjustedLot: 'Recommended Lot Size',
    actualRisk: 'Actual Risk',
    direction: 'Direction',
    long: 'Buy (Long)',
    short: 'Sell (Short)',
    valid: 'Position size is valid',
    invalid: 'Alert: Position size too small!',
    warningLarge: 'Warning: Actual risk exceeds target!',
    warningMin: 'Lot size is below minimum. Even with the smallest lot, risk will be higher than target.',
    warningTooLarge: 'DANGER! Even the smallest lot would lose more than half your account. Do NOT enter this trade!',
    potentialProfit: 'Potential Profit',
    riskReward: 'Risk/Reward Ratio',
    assetName: 'Asset',
    disclaimer: 'Disclaimer: This is an approximate calculation based on standard contract specifications. Contract specs may vary by broker. Verify with your broker before trading.',
    formula: 'Formula',
    formulaText: 'Lot Size = Risk Amount / (SL Distance × Contract Size)',
    example: 'Example',
    ozPerLot: 'oz/lot',
    unitsPerLot: 'units/lot',
    steps: 'Entry Steps',
    step1: 'Select the asset in your trading platform',
    step2: 'Choose direction',
    step3: 'Set lot size',
    step4: 'Set prices',
    step5: 'Execute the trade',
    riskWarning: 'Warning: If price hits stop loss, you will lose',
    profitIf: 'If price hits target, you will profit',
    scenarioAnalysis: 'Scenario Analysis',
    worstCase: 'Worst Case (Stop Loss)',
    bestCase: 'Best Case (Target)',
    result: 'Result',
    accountAfter: 'Account After',
    notRecommended: 'Not Recommended',
    recommended: 'Recommended',
    brokerNote: 'Note: Verify with your broker',
    minLotNote: 'With minimum lot size',
    yourRiskWouldBe: 'Your risk would be',
    ofAccount: 'of your account',
  };

  const dirLabel = result.direction === 'long' ? L.long : L.short;
  const dirColor = result.direction === 'long' ? C.accentGreen : C.accentRed;
  const dirIcon = result.direction === 'long' ? '🟢' : '🔴';

  // Determine overall status color
  let statusColor = C.accentGreen;
  let statusIcon = '✅';
  let statusText = L.valid;

  if (result.warning === 'POSITION_TOO_LARGE') {
    statusColor = C.accentRed;
    statusIcon = '🚫';
    statusText = L.warningTooLarge;
  } else if (result.warning === 'POSITION_BELOW_MIN') {
    statusColor = C.accentYellow;
    statusIcon = '⚠️';
    statusText = L.warningMin;
  } else if (result.warning === 'RISK_EXCEEDS_TARGET') {
    statusColor = C.accentYellow;
    statusIcon = '⚠️';
    statusText = L.warningLarge;
  }

  // Format lot size display
  const formatLot = (lot: number) => {
    if (lot < 0.001) return lot.toFixed(5);
    if (lot < 0.01) return lot.toFixed(4);
    if (lot < 0.1) return lot.toFixed(3);
    return lot.toFixed(2);
  };

  // Format price display
  const formatPrice = (price: number) => {
    if (price < 1) return price.toFixed(5);
    if (price < 100) return price.toFixed(3);
    return price.toFixed(2);
  };

  // Contract size display
  const contractDisplay = result.symbol === 'XAUUSD' || result.symbol === 'XAGUSD'
    ? `${result.contractSize} ${L.ozPerLot}`
    : result.contractSize >= 100000
      ? `${(result.contractSize / 1000).toFixed(0)}K ${L.unitsPerLot}`
      : `${result.contractSize} ${L.unitsPerLot}`;

  let html = `<div style="direction: ${dir}; font-family: ${fontFamily}; max-width: 100%;">`;

  // ─── Header ───
  html += `<div style="
    background: linear-gradient(135deg, rgba(34,197,94,0.1), rgba(59,130,246,0.1));
    border: 2px solid rgba(34,197,94,0.3);
    border-radius: 14px;
    padding: 16px;
    margin-bottom: 14px;
    box-shadow: 0 8px 32px rgba(99,102,241,0.12);
  ">
    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
      <span style="font-size: 24px;">🧮</span>
      <span style="font-size: 14px; font-weight: 800; color: #34D399; letter-spacing: 0.5px;">${L.title}</span>
    </div>
    <div style="font-size: 12px; color: ${C.textSecondary};">
      ${locale === 'ar' ? result.assetNameAr : result.assetName} (${result.symbol})
    </div>
  </div>`;

  // ─── Status Banner ───
  html += `<div style="
    background: ${statusColor}15;
    border: 1px solid ${statusColor}44;
    border-radius: 10px;
    padding: 10px 14px;
    margin-bottom: 12px;
    text-align: center;
  ">
    <div style="font-size: 20px;">${statusIcon}</div>
    <div style="font-size: 12px; font-weight: 700; color: ${statusColor}; margin-top: 4px;">${statusText}</div>
  </div>`;

  // ─── Input Parameters ───
  html += `<div style="background: ${C.cardBg}; border: 1px solid rgba(59,130,246,0.2); border-radius: 12px; padding: 14px; margin-bottom: 12px;">
    <div style="color: ${C.textPrimary}; font-size: 12px; line-height: 2;">
      <div style="display: flex; justify-content: space-between;">
        <span style="color: ${C.textSecondary};">${L.accountSize}</span>
        <span style="font-weight: 700; color: ${C.accentBlue};">$${result.accountSize.toLocaleString()}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: ${C.textSecondary};">${L.riskPercent}</span>
        <span style="font-weight: 700; color: ${C.accentYellow};">${result.riskPercent}%</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: ${C.textSecondary};">${L.riskAmount}</span>
        <span style="font-weight: 700; color: ${C.accentRed};">$${result.riskAmount.toFixed(2)}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: ${C.textSecondary};">${L.direction}</span>
        <span style="font-weight: 700; color: ${dirColor};">${dirIcon} ${dirLabel}</span>
      </div>
    </div>
  </div>`;

  // ─── Price Levels ───
  html += `<div style="background: ${C.cardBg}; border: 1px solid rgba(168,85,247,0.2); border-radius: 12px; padding: 14px; margin-bottom: 12px;">
    <div style="color: ${C.textPrimary}; font-size: 12px; line-height: 2;">
      <div style="display: flex; justify-content: space-between;">
        <span style="color: ${C.textSecondary};">${L.entry}</span>
        <span style="font-weight: 700;">${formatPrice(result.entryPrice)}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: ${C.textSecondary};">${L.stopLoss}</span>
        <span style="font-weight: 700; color: ${C.accentRed};">${formatPrice(result.stopLossPrice)}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: ${C.textSecondary};">${L.slDistance}</span>
        <span style="font-weight: 700;">${formatPrice(result.slDistance)} (${result.slDistancePips.toFixed(1)} ${L.slPips})</span>
      </div>
      ${result.profitTarget ? `
      <div style="display: flex; justify-content: space-between;">
        <span style="color: ${C.textSecondary};">${locale === 'ar' ? 'الهدف' : 'Target'}</span>
        <span style="font-weight: 700; color: ${C.accentGreen};">${formatPrice(result.profitTarget)}</span>
      </div>` : ''}
    </div>
  </div>`;

  // ─── Formula & Calculation ───
  html += `<div style="background: ${C.cardBg}; border: 1px solid rgba(34,197,94,0.2); border-radius: 12px; padding: 14px; margin-bottom: 12px;">
    <div style="font-size: 11px; font-weight: 700; color: ${C.accentGreen}; margin-bottom: 8px;">📐 ${L.formula}</div>
    <div style="background: rgba(15,23,42,0.5); border-radius: 8px; padding: 10px; margin-bottom: 8px;">
      <div style="color: ${C.textSecondary}; font-size: 11px; line-height: 1.8;">
        ${L.formulaText}
      </div>
      <div style="color: ${C.textPrimary}; font-size: 11px; line-height: 1.8; margin-top: 6px;">
        = $${result.riskAmount.toFixed(2)} ÷ (${formatPrice(result.slDistance)} × ${result.contractSize.toLocaleString()})
      </div>
      <div style="color: ${C.accentBlue}; font-size: 13px; font-weight: 800; margin-top: 6px;">
        = ${formatLot(result.exactLotSize)} ${locale === 'ar' ? 'لوت' : 'lot'}
      </div>
    </div>
    <div style="display: flex; justify-content: space-between; font-size: 11px; color: ${C.textSecondary}; margin-top: 6px;">
      <span>${L.contractSize}: ${contractDisplay}</span>
    </div>
  </div>`;

  // ─── RESULT: Recommended Lot Size ───
  html += `<div style="
    background: linear-gradient(135deg, rgba(59,130,246,0.15), rgba(168,85,247,0.15));
    border: 2px solid rgba(59,130,246,0.3);
    border-radius: 12px;
    padding: 14px;
    margin-bottom: 12px;
    text-align: center;
  ">
    <div style="font-size: 11px; color: ${C.textSecondary}; margin-bottom: 4px;">${L.adjustedLot}</div>
    <div style="font-size: 28px; font-weight: 800; color: ${statusColor}; font-family: 'JetBrains Mono', monospace;">
      ${formatLot(result.adjustedLotSize)}
    </div>
    <div style="font-size: 14px; color: ${C.textSecondary}; margin-top: 2px;">
      ${locale === 'ar' ? 'لوت' : 'lot'}
    </div>
  </div>`;

  // ─── Actual Risk Table ───
  html += `<div style="background: ${C.cardBg}; border: 1px solid rgba(251,191,36,0.2); border-radius: 12px; padding: 14px; margin-bottom: 12px;">
    <div style="color: ${C.textPrimary}; font-size: 12px; line-height: 2;">
      <div style="display: flex; justify-content: space-between;">
        <span style="color: ${C.textSecondary};">${L.actualRisk}</span>
        <span style="font-weight: 700; color: ${result.actualRiskPercent > result.riskPercent * 1.5 ? C.accentRed : C.accentYellow};">$${result.actualRisk.toFixed(2)} (${result.actualRiskPercent.toFixed(1)}%)</span>
      </div>
      ${result.potentialProfit !== null ? `
      <div style="display: flex; justify-content: space-between;">
        <span style="color: ${C.textSecondary};">${L.potentialProfit}</span>
        <span style="font-weight: 700; color: ${C.accentGreen};">$${result.potentialProfit.toFixed(2)}</span>
      </div>
      ` : ''}
      ${result.riskRewardRatio !== null ? `
      <div style="display: flex; justify-content: space-between;">
        <span style="color: ${C.textSecondary};">${L.riskReward}</span>
        <span style="font-weight: 700; color: ${C.accentCyan};">1:${result.riskRewardRatio.toFixed(1)}</span>
      </div>
      ` : ''}
    </div>
  </div>`;

  // ─── Scenario Analysis ───
  const worstCaseAccount = result.accountSize - result.actualRisk;
  const bestCaseAccount = result.potentialProfit !== null ? result.accountSize + result.potentialProfit : null;

  html += `<div style="background: ${C.cardBg}; border: 1px solid rgba(99,102,241,0.15); border-radius: 12px; padding: 14px; margin-bottom: 12px;">
    <div style="font-size: 11px; font-weight: 700; color: ${C.accentPurple}; margin-bottom: 8px;">📊 ${L.scenarioAnalysis}</div>
    <div style="display: flex; gap: 8px;">
      <div style="flex: 1; background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.2); border-radius: 8px; padding: 10px; text-align: center;">
        <div style="font-size: 10px; color: ${C.accentRed}; font-weight: 700;">🔴 ${L.worstCase}</div>
        <div style="font-size: 14px; font-weight: 700; color: ${C.accentRed}; margin-top: 4px;">-$${result.actualRisk.toFixed(2)}</div>
        <div style="font-size: 10px; color: ${C.textMuted}; margin-top: 2px;">$${worstCaseAccount.toFixed(2)}</div>
      </div>
      ${bestCaseAccount !== null ? `
      <div style="flex: 1; background: rgba(74,222,128,0.08); border: 1px solid rgba(74,222,128,0.2); border-radius: 8px; padding: 10px; text-align: center;">
        <div style="font-size: 10px; color: ${C.accentGreen}; font-weight: 700;">🟢 ${L.bestCase}</div>
        <div style="font-size: 14px; font-weight: 700; color: ${C.accentGreen}; margin-top: 4px;">+$${result.potentialProfit!.toFixed(2)}</div>
        <div style="font-size: 10px; color: ${C.textMuted}; margin-top: 2px;">$${bestCaseAccount.toFixed(2)}</div>
      </div>` : ''}
    </div>
  </div>`;

  // ─── Entry Steps ───
  html += `<div style="background: ${C.cardBg}; border: 1px solid rgba(99,102,241,0.15); border-radius: 12px; padding: 14px; margin-bottom: 12px;">
    <div style="font-size: 11px; font-weight: 700; color: ${C.accentCyan}; margin-bottom: 8px;">🔧 ${L.steps}</div>
    <div style="color: ${C.textPrimary}; font-size: 11px; line-height: 2;">
      <div>1️⃣ ${L.step1}: <strong>${result.symbol}</strong></div>
      <div>2️⃣ ${L.step2}: <strong style="color: ${dirColor};">${dirLabel}</strong></div>
      <div>3️⃣ ${L.step3}: <strong style="color: ${C.accentBlue};">${formatLot(result.adjustedLotSize)} ${locale === 'ar' ? 'لوت' : 'lot'}</strong></div>
      <div>4️⃣ ${L.step4}:</div>
      <div style="padding-right: 20px; padding-left: 20px;">
        <div style="display: flex; justify-content: space-between;"><span>${L.entry}</span><strong>${formatPrice(result.entryPrice)}</strong></div>
        <div style="display: flex; justify-content: space-between;"><span>${L.stopLoss}</span><strong style="color: ${C.accentRed};">${formatPrice(result.stopLossPrice)}</strong></div>
        ${result.profitTarget ? `<div style="display: flex; justify-content: space-between;"><span>${locale === 'ar' ? 'الهدف' : 'Target'}</span><strong style="color: ${C.accentGreen};">${formatPrice(result.profitTarget)}</strong></div>` : ''}
      </div>
      <div>5️⃣ ${L.step5}</div>
    </div>
  </div>`;

  // ─── Disclaimer ───
  html += `<div style="
    background: rgba(251,191,36,0.08);
    border: 1px solid rgba(251,191,36,0.2);
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 8px;
    font-size: 10px;
    color: ${C.accentYellow};
    line-height: 1.6;
  ">⚠️ ${L.disclaimer}</div>`;

  html += `</div>`;

  return html;
}

// ─── Get contract specs for a symbol ──────────────────────────────

export function getContractSpecs(symbol: string): ContractSpec | null {
  return CONTRACT_SPECS[symbol] || null;
}
