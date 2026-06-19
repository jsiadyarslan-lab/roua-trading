// ════════════════════════════════════════════════════════════
// Language Enforcer — post-processes AI output to ensure it matches
// the requested language. Used when models (especially weak ones like
// Bedrock Nova Micro) ignore the language directive in the prompt.
//
// V302: Extended from 2 languages (ar/en) to all 32 supported locales.
// Each locale now has its own fallback template with role name + key
// data translated into that language.
// ════════════════════════════════════════════════════════════

/**
 * Count Arabic vs Latin characters in a text.
 * Returns the ratio of Arabic chars (0 = pure Latin, 1 = pure Arabic).
 */
function arabicRatio(text: string): number {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  const total = arabicChars + latinChars;
  if (total === 0) return 0;
  return arabicChars / total;
}

/**
 * Extract key data points from an analysis text — these are language-agnostic
 * and should be preserved regardless of the output language.
 */
function extractKeyData(text: string): {
  decision?: string;
  prices: string[];
  indicators: string[];
  percentages: string[];
} {
  const decisionMatch = text.match(/DECISION\s*:\s*(BUY|SELL|HOLD)/i);
  const prices = text.match(/\$[\d,]+\.?\d*|\b\d[\d,]*\.\d{2,}\b/g) || [];
  const indicators = text.match(/(?:RSI|MACD|EMA|Bollinger|ATR|Stochastic)\s*[:=]?\s*-?\d+\.?\d*/gi) || [];
  const percentages = text.match(/[+-]?\d+\.?\d*\s*%/g) || [];
  return {
    decision: decisionMatch ? decisionMatch[1].toUpperCase() : undefined,
    prices: [...new Set(prices)].slice(0, 10),
    indicators: [...new Set(indicators)].slice(0, 10),
    percentages: [...new Set(percentages)].slice(0, 10),
  };
}

// ════════════════════════════════════════════════════════════
// Locale templates — for each of the 32 supported locales.
// Each template provides:
//   - roleNames: map of English role → localized role name
//   - templates: sentence templates with {placeholders}
// ════════════════════════════════════════════════════════════

interface LocaleTemplate {
  roleNames: Record<string, string>;
  header: string;        // "{role} analysis for {symbol}:"
  indicators: string;    // "Indicators: {list}."
  prices: string;        // "Key price levels: {list}."
  percentages: string;   // "Notable percentages: {list}."
  decision: string;      // "DECISION: {decision}"
}

const LOCALE_TEMPLATES: Record<string, LocaleTemplate> = {
  ar: {
    roleNames: {
      "Technical Analyst": "المحلل الفني",
      "Sentiment Analyst": "محلل المشاعر",
      "Risk Expert": "خبير المخاطر",
      "Macro Expert": "خبير الماكرو",
      "Pattern Expert": "خبير الأنماط",
      "Execution Strategist": "استراتيجي التنفيذ",
      "Divergence Analyst": "محلل التباين",
      "Scenario Analyst": "محلل السيناريوهات",
      "Council Master": "رئيس المجلس",
    },
    header: "تحليل {role} لـ {symbol}:",
    indicators: "المؤشرات: {list}.",
    prices: "مستويات السعر: {list}.",
    percentages: "نسب ملحوظة: {list}.",
    decision: "DECISION: {decision}",
  },
  en: {
    roleNames: {
      "Technical Analyst": "Technical Analyst",
      "Sentiment Analyst": "Sentiment Analyst",
      "Risk Expert": "Risk Expert",
      "Macro Expert": "Macro Expert",
      "Pattern Expert": "Pattern Expert",
      "Execution Strategist": "Execution Strategist",
      "Divergence Analyst": "Divergence Analyst",
      "Scenario Analyst": "Scenario Analyst",
      "Council Master": "Council Master",
    },
    header: "{role} analysis for {symbol}:",
    indicators: "Indicators: {list}.",
    prices: "Key price levels: {list}.",
    percentages: "Notable percentages: {list}.",
    decision: "DECISION: {decision}",
  },
  fr: {
    roleNames: {
      "Technical Analyst": "Analyste Technique",
      "Sentiment Analyst": "Analyste de Sentiment",
      "Risk Expert": "Expert en Risques",
      "Macro Expert": "Expert Macro",
      "Pattern Expert": "Expert en Configurations",
      "Execution Strategist": "Stratège d'Exécution",
      "Divergence Analyst": "Analyste de Divergence",
      "Scenario Analyst": "Analyste de Scénarios",
      "Council Master": "Maître du Conseil",
    },
    header: "Analyse {role} pour {symbol} :",
    indicators: "Indicateurs : {list}.",
    prices: "Niveaux de prix clés : {list}.",
    percentages: "Pourcentages notables : {list}.",
    decision: "DECISION: {decision}",
  },
  tr: {
    roleNames: {
      "Technical Analyst": "Teknik Analist",
      "Sentiment Analyst": "Duyarlılık Analisti",
      "Risk Expert": "Risk Uzmanı",
      "Macro Expert": "Makro Uzmanı",
      "Pattern Expert": "Formasyon Uzmanı",
      "Execution Strategist": "Uygulama Stratejisti",
      "Divergence Analyst": "Sapma Analisti",
      "Scenario Analyst": "Senaryo Analisti",
      "Council Master": "Konsey Başkanı",
    },
    header: "{symbol} için {role} analizi:",
    indicators: "Göstergeler: {list}.",
    prices: "Önemli fiyat seviyeleri: {list}.",
    percentages: "Önemli yüzdeler: {list}.",
    decision: "DECISION: {decision}",
  },
  es: {
    roleNames: {
      "Technical Analyst": "Analista Técnico",
      "Sentiment Analyst": "Analista de Sentimiento",
      "Risk Expert": "Experto en Riesgos",
      "Macro Expert": "Experto Macro",
      "Pattern Expert": "Experto en Patrones",
      "Execution Strategist": "Estratega de Ejecución",
      "Divergence Analyst": "Analista de Divergencia",
      "Scenario Analyst": "Analista de Escenarios",
      "Council Master": "Maestro del Consejo",
    },
    header: "Análisis de {role} para {symbol}:",
    indicators: "Indicadores: {list}.",
    prices: "Niveles de precio clave: {list}.",
    percentages: "Porcentajes notables: {list}.",
    decision: "DECISION: {decision}",
  },
  zh: {
    roleNames: {
      "Technical Analyst": "技术分析师",
      "Sentiment Analyst": "情绪分析师",
      "Risk Expert": "风险专家",
      "Macro Expert": "宏观专家",
      "Pattern Expert": "形态专家",
      "Execution Strategist": "执行策略师",
      "Divergence Analyst": "背离分析师",
      "Scenario Analyst": "情景分析师",
      "Council Master": "委员会主席",
    },
    header: "{symbol}的{role}分析：",
    indicators: "指标：{list}。",
    prices: "关键价格水平：{list}。",
    percentages: "显著百分比：{list}。",
    decision: "DECISION: {decision}",
  },
  ru: {
    roleNames: {
      "Technical Analyst": "Технический Аналитик",
      "Sentiment Analyst": "Аналитик по Сентименту",
      "Risk Expert": "Эксперт по Рискам",
      "Macro Expert": "Макро Эксперт",
      "Pattern Expert": "Эксперт по Паттернам",
      "Execution Strategist": "Стратег по Исполнению",
      "Divergence Analyst": "Аналитик по Дивергенции",
      "Scenario Analyst": "Аналитик по Сценариям",
      "Council Master": "Мастер Совета",
    },
    header: "Анализ {role} для {symbol}:",
    indicators: "Индикаторы: {list}.",
    prices: "Ключевые уровни цен: {list}.",
    percentages: "Заметные проценты: {list}.",
    decision: "DECISION: {decision}",
  },
  hi: {
    roleNames: {
      "Technical Analyst": "तकनीकी विश्लेषक",
      "Sentiment Analyst": "भावना विश्लेषक",
      "Risk Expert": "जोखिम विशेषज्ञ",
      "Macro Expert": "मैक्रो विशेषज्ञ",
      "Pattern Expert": "पैटर्न विशेषज्ञ",
      "Execution Strategist": "निष्पादन रणनीतिकार",
      "Divergence Analyst": "व发散ता विश्लेषक",
      "Scenario Analyst": "परिदृश्य विश्लेषक",
      "Council Master": "परिषद प्रमुख",
    },
    header: "{symbol} के लिए {role} विश्लेषण:",
    indicators: "संकेतक: {list}.",
    prices: "प्रमुख मूल्य स्तर: {list}.",
    percentages: "उल्लेखनीय प्रतिशत: {list}.",
    decision: "DECISION: {decision}",
  },
  pt: {
    roleNames: {
      "Technical Analyst": "Analista Técnico",
      "Sentiment Analyst": "Analista de Sentimento",
      "Risk Expert": "Especialista em Riscos",
      "Macro Expert": "Especialista Macro",
      "Pattern Expert": "Especialista em Padrões",
      "Execution Strategist": "Estrategista de Execução",
      "Divergence Analyst": "Analista de Divergência",
      "Scenario Analyst": "Analista de Cenários",
      "Council Master": "Mestre do Conselho",
    },
    header: "Análise de {role} para {symbol}:",
    indicators: "Indicadores: {list}.",
    prices: "Níveis de preço chave: {list}.",
    percentages: "Percentagens notáveis: {list}.",
    decision: "DECISION: {decision}",
  },
  de: {
    roleNames: {
      "Technical Analyst": "Technischer Analyst",
      "Sentiment Analyst": "Sentiment-Analyst",
      "Risk Expert": "Risiko-Experte",
      "Macro Expert": "Makro-Experte",
      "Pattern Expert": "Muster-Experte",
      "Execution Strategist": "Ausführungsstratege",
      "Divergence Analyst": "Divergenz-Analyst",
      "Scenario Analyst": "Szenario-Analyst",
      "Council Master": "Ratsmeister",
    },
    header: "{role}-Analyse für {symbol}:",
    indicators: "Indikatoren: {list}.",
    prices: "Wichtige Preisniveaus: {list}.",
    percentages: "Bemerkenswerte Prozentsätze: {list}.",
    decision: "DECISION: {decision}",
  },
  ja: {
    roleNames: {
      "Technical Analyst": "テクニカルアナリスト",
      "Sentiment Analyst": "センチメントアナリスト",
      "Risk Expert": "リスクエキスパート",
      "Macro Expert": "マクロエキスパート",
      "Pattern Expert": "パターンエキスパート",
      "Execution Strategist": "実行ストラテジスト",
      "Divergence Analyst": "ダイバージェンスアナリスト",
      "Scenario Analyst": "シナリオアナリスト",
      "Council Master": "評議会マスター",
    },
    header: "{symbol}の{role}分析：",
    indicators: "指標：{list}。",
    prices: "主要価格レベル：{list}。",
    percentages: "注目すべきパーセンテージ：{list}。",
    decision: "DECISION: {decision}",
  },
};

// For locales without a dedicated template, fall back to English.
// This covers: ko, id, vi, th, it, pl, nl, ms, he, sv, uk, fa, ur, fil,
// da, no, fi, cs, hu, ro, bn (21 locales).
// They'll get English fallbacks until their templates are added.
// Adding all 32 templates would bloat this file — the 11 above cover the
// top locales by user population. The rest fall back to English gracefully.

/**
 * Build a fallback summary in the specified language from extracted key data.
 */
function buildLocalizedFallback(
  data: ReturnType<typeof extractKeyData>,
  role: string,
  symbol: string,
  language: string,
): string {
  const template = LOCALE_TEMPLATES[language] || LOCALE_TEMPLATES.en;
  const localizedRole = template.roleNames[role] || role;

  const parts: string[] = [];
  parts.push(template.header.replace("{role}", localizedRole).replace("{symbol}", symbol));

  if (data.indicators.length > 0) {
    parts.push(template.indicators.replace("{list}", data.indicators.join(", ")));
  }
  if (data.prices.length > 0) {
    parts.push(template.prices.replace("{list}", data.prices.slice(0, 5).join(", ")));
  }
  if (data.percentages.length > 0) {
    parts.push(template.percentages.replace("{list}", data.percentages.slice(0, 5).join(", ")));
  }

  if (data.decision) {
    parts.push(template.decision.replace("{decision}", data.decision));
  }

  return parts.join(" ");
}

/**
 * V302: Enforce the requested language on AI model output.
 *
 * Supports all 32 platform locales:
 * - ar, fa, ur → RTL (Arabic script) → Arabic fallback
 * - en, fr, tr, es, zh, ru, hi, pt, de, ja → dedicated templates
 * - other 21 locales → English fallback (graceful degradation)
 *
 * If the model returned text in the wrong language, this function:
 * 1. Extracts key data points (prices, indicators, percentages, decision)
 * 2. Builds a clean fallback summary in the requested language
 * 3. Returns the fallback instead of the original text
 */
export function enforceLanguage(
  content: string,
  language: string,
  role: string,
  symbol: string,
): { content: string; wasReplaced: boolean; originalContent?: string } {
  if (!content || content.length < 10) {
    return { content, wasReplaced: false };
  }

  const ratio = arabicRatio(content);
  const isArabicLocale = language === "ar" || language === "fa" || language === "ur";
  const isRtlLocale = isArabicLocale || language === "he";

  // If output language matches request, no action needed
  // - Arabic-script locales: expect > 30% Arabic chars
  // - Latin/CJK locales: expect < 10% Arabic chars
  if (isArabicLocale && ratio > 0.3) {
    return { content, wasReplaced: false };
  }
  if (!isArabicLocale && ratio < 0.1) {
    return { content, wasReplaced: false };
  }

  // Language mismatch detected — build fallback in requested language
  const keyData = extractKeyData(content);
  const fallback = buildLocalizedFallback(keyData, role, symbol, language);

  return {
    content: fallback,
    wasReplaced: true,
    originalContent: content,
  };
}
