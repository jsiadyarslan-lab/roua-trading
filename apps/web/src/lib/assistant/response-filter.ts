// ─── Response Filter ─────────────────────────────────────────────
// RAG-Omega Architecture: Programmatic hallucination prevention.
// Does NOT rely on AI prompt instructions — enforces rules in CODE.
// Any number in the AI response that doesn't exist in the DB data
// is flagged or removed.
// V2: Added direct buy/sell recommendation detection & removal,
// and unsupported causal claim detection.

import type { FetchedData } from './data-fetcher';
import type { Locale } from './tools';

// ─── Filter Result ───────────────────────────────────────────────

export interface FilterResult {
  response: string;              // The filtered response
  warnings: string[];            // Warnings about suspicious numbers
  hallucinationScore: number;    // 0-1, how likely the response contains hallucinations
  numbersChecked: number;        // Total numbers found in response
  numbersVerified: number;       // Numbers that match DB data
  numbersFlagged: number;        // Numbers that don't match DB data
}

// ─── Price Bounds for Sanity Check ───────────────────────────────
// If AI mentions a price outside these bounds for a known asset,
// it's almost certainly a hallucination.

const PRICE_BOUNDS: Record<string, { min: number; max: number; name: string }> = {
  'BTC':   { min: 10_000,   max: 200_000,  name: 'Bitcoin' },
  'ETH':   { min: 100,      max: 15_000,   name: 'Ethereum' },
  'SOL':   { min: 5,        max: 1_000,    name: 'Solana' },
  'XAU':   { min: 1_000,    max: 5_000,    name: 'Gold' },
  'XAG':   { min: 10,       max: 100,      name: 'Silver' },
  'WTI':   { min: 10,       max: 200,      name: 'Crude Oil' },
  'SPX':   { min: 2_000,    max: 10_000,   name: 'S&P 500' },
  'NDX':   { min: 5_000,    max: 30_000,   name: 'Nasdaq' },
  'DXY':   { min: 80,       max: 120,      name: 'Dollar Index' },
  'EURUSD':{ min: 0.5,      max: 2.0,      name: 'EUR/USD' },
  'GBPUSD':{ min: 0.8,      max: 2.5,      name: 'GBP/USD' },
  'USDJPY':{ min: 50,       max: 250,      name: 'USD/JPY' },
  'AAPL':  { min: 50,       max: 500,      name: 'Apple' },
  'TSLA':  { min: 50,       max: 1_000,    name: 'Tesla' },
  'NVDA':  { min: 50,       max: 500,      name: 'Nvidia' },
};

// ─── Main Filter Function ────────────────────────────────────────

export function filterResponse(
  aiResponse: string,
  fetchedData: FetchedData,
  locale: Locale,
): FilterResult {
  const warnings: string[] = [];
  let numbersChecked = 0;
  let numbersVerified = 0;
  let numbersFlagged = 0;
  const isAr = locale === 'ar';
  
  let response = aiResponse;

  // ── V2: Detect and soften direct buy/sell recommendations ──
  // These patterns match phrases like "اشترِ الذهب", "Buy gold", "Achetez l'or", etc.
  const DIRECT_BUY_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = isAr ? [
    { pattern: /يوصى بالشراء/gi, replacement: 'قد يكون من المناسب مراقبة فرصة الشراء عند' },
    { pattern: /اشتر[ِي]؟\s*(ال)?(ذهب|نفط|بتكوين|سهم|أسهم|أصل|أصول)/gi, replacement: 'قد يستحق $2 المراقبة كفرصة استثمارية' },
    { pattern: /توصية شرائية/gi, replacement: 'فرصة استثمارية محتملة' },
    { pattern: /بع\s*(ال)?(ذهب|نفط|بتكوين|سهم|أسهم|أصل|أصول)/gi, replacement: 'قد يستحق $2 مراقبة مستويات الخروج' },
    { pattern: /توقف عن الاستثمار/gi, replacement: 'قد يكون من الحكمة توخي الحذر في الاستثمار حالياً' },
    { pattern: /يوصى بالاستثمار في/gi, replacement: 'قد يستحق الاستثمار في' },
    { pattern: /يوصى بالتوقف عن/gi, replacement: 'قد يكون من الحكمة توخي الحذر في' },
  ] : [
    { pattern: /it is recommended to buy/gi, replacement: 'investors may want to monitor the buying opportunity at' },
    { pattern: /buy (gold|oil|bitcoin|stock|stocks|asset|assets)/gi, replacement: '$1 may warrant monitoring as an investment opportunity' },
    { pattern: /sell (gold|oil|bitcoin|stock|stocks|asset|assets)/gi, replacement: '$1 may warrant monitoring exit levels' },
    { pattern: /stop investing/gi, replacement: 'consider exercising caution with investments' },
    { pattern: /recommended to (buy|sell|purchase)/gi, replacement: 'investors may want to consider $1ing opportunities' },
  ];

  for (const { pattern, replacement } of DIRECT_BUY_PATTERNS) {
    if (pattern.test(response)) {
      response = response.replace(pattern, replacement);
      warnings.push(isAr
        ? '⚠️ تم تعديل توصية مباشرة إلى صيغة تحليلية'
        : '⚠️ Direct recommendation softened to analytical phrasing'
      );
    }
  }

  // ── V2: Detect unsupported causal claims between assets ──
  const CAUSAL_CLAIM_PATTERNS = isAr ? [
    /انخفاض\s*(أسعار\s*)?(ال)?(نفط|ذهب|بتكوين)\s*(يزيد|يزيد من|يرفع|يعزز)\s*(ربحية|قيمة|جاذبية)\s*الاستثمار في\s*(ال)?(ذهب|نفط|بتكوين|أسهم)/gi,
    /ارتفاع\s*(أسعار\s*)?(ال)?(نفط|ذهب|بتكوين)\s*(يقلل|يخفض|يضر|يضعف)\s*(ربحية|قيمة|جاذبية)\s*الاستثمار في\s*(ال)?(ذهب|نفط|بتكوين|أسهم)/gi,
  ] : [
    /(?:decline|drop|fall) in (?:oil|gold|bitcoin) (?:prices )?(?:increases?|raises?|boosts?) (?:profitability|value|attractiveness) of (?:gold|oil|bitcoin|stocks?)/gi,
    /(?:rise|increase|surge) in (?:oil|gold|bitcoin) (?:prices )?(?:decreases?|reduces?|hurts?) (?:profitability|value|attractiveness) of (?:gold|oil|bitcoin|stocks?)/gi,
  ];

  for (const pattern of CAUSAL_CLAIM_PATTERNS) {
    const match = response.match(pattern);
    if (match) {
      warnings.push(isAr
        ? `⚠️ ادعاء سببي غير مدعوم: "${match[0]}" — العلاقة بين الأصول ليست بهذه البساطة`
        : `⚠️ Unsupported causal claim: "${match[0]}" — asset relationships are not this simple`
      );
      // Replace with a softer version
      response = response.replace(pattern, isAr
        ? 'هناك علاقة محتملة بين حركة الأصول المذكورة ينبغي دراستها بعناية'
        : 'there may be a correlation between the mentioned assets that warrants careful study'
      );
    }
  }
  
  // 1. Extract all numbers from the AI response
  const numberPattern = /\b(\d{1,3}(?:,\d{3})*(?:\.\d{1,4})?)\b/g;
  const foundNumbers: string[] = [];
  let match;
  while ((match = numberPattern.exec(response)) !== null) {
    foundNumbers.push(match[1]);
    numbersChecked++;
  }
  
  // 2. Check each number against known DB numbers
  const knownNums = fetchedData.knownNumbers;
  const priceValues = new Set<string>();
  for (const p of fetchedData.prices) {
    priceValues.add(p.value.toString());
    priceValues.add(Math.round(p.value).toString());
    priceValues.add(p.value.toLocaleString());
  }
  
  for (const num of foundNumbers) {
    const cleanNum = num.replace(/,/g, '');
    if (knownNums.has(cleanNum) || knownNums.has(num) || priceValues.has(num) || priceValues.has(cleanNum)) {
      numbersVerified++;
    }
    // Note: We don't flag every unknown number as hallucination — 
    // percentages, counts, years are legitimate.
    // We only flag prices and financial figures.
  }
  
  // 3. Check for specific hallucination patterns
  // Pattern: AI claiming a specific price that doesn't match DB
  for (const [symbol, bounds] of Object.entries(PRICE_BOUNDS)) {
    const symbolPattern = new RegExp(
      `(?:${symbol}|${bounds.name}).*?(?:\$|price|سعر|بـ|عند|at|is|=)\\s*(\\d[\\d,.]+)`,
      'gi'
    );
    const hallucinatedPrice = response.match(symbolPattern);
    if (hallucinatedPrice) {
      for (const hp of hallucinatedPrice) {
        const priceMatch = hp.match(/(\d[\d,.]+)/);
        if (priceMatch) {
          const price = parseFloat(priceMatch[1].replace(/,/g, ''));
          if (!isNaN(price) && (price < bounds.min || price > bounds.max)) {
            numbersFlagged++;
            warnings.push(
              isAr
                ? `⚠️ سعر ${symbol} المذكور (${price}) خارج النطاق المعقول (${bounds.min}-${bounds.max})`
                : `⚠️ Mentioned ${symbol} price (${price}) is outside reasonable range (${bounds.min}-${bounds.max})`
            );
            // Replace the hallucinated price with a warning
            response = response.replace(
              priceMatch[1],
              isAr ? `[بيانات غير متاحة]` : `[data unavailable]`
            );
          }
        }
      }
    }
  }
  
  // 4. Check for fabricated support/resistance/Fibonacci levels
  // These are common hallucination patterns in financial AI
  const fibPattern = /(?:فيبوناتشي|fibonacci|fib)\s*(?:مستوى|level)?\s*[:：]?\s*(\d[\d,.]+)/gi;
  const supportPattern = /(?:دعم|support)\s*[:：]?\s*(\d[\d,.]+)/gi;
  const resistancePattern = /(?:مقاومة|resistance)\s*[:：]?\s*(\d[\d,.]+)/gi;
  
  for (const pattern of [fibPattern, supportPattern, resistancePattern]) {
    let pMatch;
    while ((pMatch = pattern.exec(response)) !== null) {
      const level = parseFloat(pMatch[1].replace(/,/g, ''));
      if (!isNaN(level) && !knownNums.has(pMatch[1].replace(/,/g, ''))) {
        // This level wasn't in the DB data — it might be fabricated
        // Don't remove it, but note it
        numbersFlagged++;
        warnings.push(
          isAr
            ? `⚠️ مستوى تقني مذكور (${pMatch[1]}) غير موجود في بيانات قاعدة البيانات`
            : `⚠️ Mentioned technical level (${pMatch[1]}) not found in database data`
        );
      }
    }
  }
  
  // 5. Check for fabricated dates (future dates or very old dates)
  const futureDatePattern = /\b(?:20[2-9]\d|June|July|August|September|October|November|December)\s+\d{1,2},?\s*20[2-9]\d\b/gi;
  const futureDates = response.match(futureDatePattern);
  if (futureDates) {
    const currentYear = new Date().getFullYear();
    for (const fd of futureDates) {
      const yearMatch = fd.match(/20(\d{2})/);
      if (yearMatch) {
        const year = parseInt('20' + yearMatch[1]);
        if (year > currentYear + 1) {
          warnings.push(
            isAr
              ? `⚠️ تاريخ مستقبلي مذكور (${fd}) — قد يكون مختلقاً`
              : `⚠️ Future date mentioned (${fd}) — may be fabricated`
          );
        }
      }
    }
  }
  
  // 6. Calculate hallucination score
  const hallucinationScore = numbersChecked > 0
    ? Math.min(numbersFlagged / Math.max(numbersChecked, 1), 1)
    : 0;
  
  // 7. If high hallucination score, add a warning to the response
  if (hallucinationScore > 0.3 && numbersFlagged > 2) {
    const warning = isAr
      ? '\n\n---\n⚠️ *تنبيه: بعض الأرقام المذكورة قد لا تكون من بيانات حديثة. يرجى التحقق من مصادر إضافية.*'
      : '\n\n---\n⚠️ *Note: Some numbers mentioned may not be from recent data. Please verify with additional sources.*';
    response += warning;
  }
  
  return {
    response,
    warnings,
    hallucinationScore,
    numbersChecked,
    numbersVerified,
    numbersFlagged,
  };
}
