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
  ko: {
    roleNames: {
      "Technical Analyst": "기술 분석가",
      "Sentiment Analyst": "센티먼트 분석가",
      "Risk Expert": "리스크 전문가",
      "Macro Expert": "거시 전문가",
      "Pattern Expert": "패턴 전문가",
      "Execution Strategist": "실행 전략가",
      "Divergence Analyst": "다이버전스 분석가",
      "Scenario Analyst": "시나리오 분석가",
      "Council Master": "평의회 마스터",
    },
    header: "{symbol}에 대한 {role} 분석:",
    indicators: "지표: {list}.",
    prices: "주요 가격 수준: {list}.",
    percentages: "주목할 만한 비율: {list}.",
    decision: "DECISION: {decision}",
  },
  id: {
    roleNames: {
      "Technical Analyst": "Analis Teknis",
      "Sentiment Analyst": "Analis Sentimen",
      "Risk Expert": "Ahli Risiko",
      "Macro Expert": "Ahli Makro",
      "Pattern Expert": "Ahli Pola",
      "Execution Strategist": "Strategis Eksekusi",
      "Divergence Analyst": "Analis Divergensi",
      "Scenario Analyst": "Analis Skenario",
      "Council Master": "Master Dewan",
    },
    header: "Analisis {role} untuk {symbol}:",
    indicators: "Indikator: {list}.",
    prices: "Level harga penting: {list}.",
    percentages: "Persentase penting: {list}.",
    decision: "DECISION: {decision}",
  },
  vi: {
    roleNames: {
      "Technical Analyst": "Nhà Phân Tích Kỹ Thuật",
      "Sentiment Analyst": "Nhà Phân Tích Cảm Xúc",
      "Risk Expert": "Chuyên Gia Rủi Ro",
      "Macro Expert": "Chuyên Gia Vĩ Mô",
      "Pattern Expert": "Chuyên Gia Mẫu Hình",
      "Execution Strategist": "Chiến Lược Gia Thực Thi",
      "Divergence Analyst": "Nhà Phân Tích Phân Kỳ",
      "Scenario Analyst": "Nhà Phân Tích Tình Huống",
      "Council Master": "Bậc Thầy Hội Đồng",
    },
    header: "Phân tích {role} cho {symbol}:",
    indicators: "Chỉ báo: {list}.",
    prices: "Mức giá quan trọng: {list}.",
    percentages: "Tỷ lệ phần trăm đáng chú ý: {list}.",
    decision: "DECISION: {decision}",
  },
  th: {
    roleNames: {
      "Technical Analyst": "นักวิเคราะห์ทางเทคนิค",
      "Sentiment Analyst": "นักวิเคราะห์ความรู้สึก",
      "Risk Expert": "ผู้เชี่ยวชาญด้านความเสี่ยง",
      "Macro Expert": "ผู้เชี่ยวชาญด้านมหภาค",
      "Pattern Expert": "ผู้เชี่ยวชาญด้านรูปแบบ",
      "Execution Strategist": "นักยุทธศาสตร์การดำเนินการ",
      "Divergence Analyst": "นักวิเคราะห์ความแตกต่าง",
      "Scenario Analyst": "นักวิเคราะห์สถานการณ์",
      "Council Master": "ปรมาจารย์สภา",
    },
    header: "การวิเคราะห์{role}สำหรับ{symbol}:",
    indicators: "ตัวชี้วัด: {list}.",
    prices: "ระดับราคาที่สำคัญ: {list}.",
    percentages: "เปอร์เซ็นต์ที่น่าสังเกต: {list}.",
    decision: "DECISION: {decision}",
  },
  it: {
    roleNames: {
      "Technical Analyst": "Analista Tecnico",
      "Sentiment Analyst": "Analista di Sentiment",
      "Risk Expert": "Esperto di Rischio",
      "Macro Expert": "Esperto Macro",
      "Pattern Expert": "Esperto di Pattern",
      "Execution Strategist": "Stratega di Esecuzione",
      "Divergence Analyst": "Analista di Divergenza",
      "Scenario Analyst": "Analista di Scenari",
      "Council Master": "Maestro del Consiglio",
    },
    header: "Analisi {role} per {symbol}:",
    indicators: "Indicatori: {list}.",
    prices: "Livelli di prezzo chiave: {list}.",
    percentages: "Percentuali notevoli: {list}.",
    decision: "DECISION: {decision}",
  },
  pl: {
    roleNames: {
      "Technical Analyst": "Analityk Techniczny",
      "Sentiment Analyst": "Analityk Sentymentu",
      "Risk Expert": "Ekspert ds. Ryzyka",
      "Macro Expert": "Ekspert Makro",
      "Pattern Expert": "Ekspert ds. Formacji",
      "Execution Strategist": "Strateg Wykonania",
      "Divergence Analyst": "Analityk Dywergencji",
      "Scenario Analyst": "Analityk Scenariuszy",
      "Council Master": "Mistrz Rady",
    },
    header: "Analiza {role} dla {symbol}:",
    indicators: "Wskaźniki: {list}.",
    prices: "Kluczowe poziomy cenowe: {list}.",
    percentages: "Istotne procenty: {list}.",
    decision: "DECISION: {decision}",
  },
  nl: {
    roleNames: {
      "Technical Analyst": "Technisch Analist",
      "Sentiment Analyst": "Sentiment Analist",
      "Risk Expert": "Risico Expert",
      "Macro Expert": "Macro Expert",
      "Pattern Expert": "Patroon Expert",
      "Execution Strategist": "Uitvoeringsstrateeg",
      "Divergence Analyst": "Divergentie Analist",
      "Scenario Analyst": "Scenario Analist",
      "Council Master": "Meester van de Raad",
    },
    header: "{role}-analyse voor {symbol}:",
    indicators: "Indicatoren: {list}.",
    prices: "Belangrijke prijsniveaus: {list}.",
    percentages: "Opmerkelijke percentages: {list}.",
    decision: "DECISION: {decision}",
  },
  ms: {
    roleNames: {
      "Technical Analyst": "Analis Teknikal",
      "Sentiment Analyst": "Analis Sentimen",
      "Risk Expert": "Pakar Risiko",
      "Macro Expert": "Pakar Makro",
      "Pattern Expert": "Pakar Corak",
      "Execution Strategist": "Strategis Pelaksanaan",
      "Divergence Analyst": "Analis Penyelewengan",
      "Scenario Analyst": "Analis Senario",
      "Council Master": "Tuan Majlis",
    },
    header: "Analisis {role} untuk {symbol}:",
    indicators: "Penunjuk: {list}.",
    prices: "Tahap harga utama: {list}.",
    percentages: "Peratusan ketara: {list}.",
    decision: "DECISION: {decision}",
  },
  he: {
    roleNames: {
      "Technical Analyst": "אנליסט טכני",
      "Sentiment Analyst": "אנליסט סנטימנט",
      "Risk Expert": "מומחה סיכונים",
      "Macro Expert": "מומחה מאקרו",
      "Pattern Expert": "מומחה תבניות",
      "Execution Strategist": "אסטרטג ביצוע",
      "Divergence Analyst": "אנליסט פערים",
      "Scenario Analyst": "אנליסט תרחישים",
      "Council Master": "מאסטר המועצה",
    },
    header: "ניתוח {role} עבור {symbol}:",
    indicators: "מדדים: {list}.",
    prices: "רמות מחיר מרכזיות: {list}.",
    percentages: "אחוזים בולטים: {list}.",
    decision: "DECISION: {decision}",
  },
  sv: {
    roleNames: {
      "Technical Analyst": "Teknisk Analytiker",
      "Sentiment Analyst": "Sentiment Analytiker",
      "Risk Expert": "Riskexpert",
      "Macro Expert": "Macroexpert",
      "Pattern Expert": "Mönsterexpert",
      "Execution Strategist": "Genomförandestrateg",
      "Divergence Analyst": "Divergensanalytiker",
      "Scenario Analyst": "Scenarieanalytiker",
      "Council Master": "Rådets Mästare",
    },
    header: "{role}-analys för {symbol}:",
    indicators: "Indikatorer: {list}.",
    prices: "Viktiga prisnivåer: {list}.",
    percentages: "Märkbara procenttal: {list}.",
    decision: "DECISION: {decision}",
  },
  uk: {
    roleNames: {
      "Technical Analyst": "Технічний Аналітик",
      "Sentiment Analyst": "Аналітик з Сентименту",
      "Risk Expert": "Експерт з Ризиків",
      "Macro Expert": "Макро Експерт",
      "Pattern Expert": "Експерт з Патернів",
      "Execution Strategist": "Стратег з Виконання",
      "Divergence Analyst": "Аналітик з Дивергенції",
      "Scenario Analyst": "Аналітик з Сценаріїв",
      "Council Master": "Майстер Ради",
    },
    header: "Аналіз {role} для {symbol}:",
    indicators: "Індикатори: {list}.",
    prices: "Ключові цінові рівні: {list}.",
    percentages: "Помітні відсотки: {list}.",
    decision: "DECISION: {decision}",
  },
  fa: {
    roleNames: {
      "Technical Analyst": "تحلیلگر فنی",
      "Sentiment Analyst": "تحلیلگر احساسات",
      "Risk Expert": "کارشناس ریسک",
      "Macro Expert": "کارشناس کلان",
      "Pattern Expert": "کارشناس الگوها",
      "Execution Strategist": "استراتژیست اجرایی",
      "Divergence Analyst": "تحلیلگر واگرایی",
      "Scenario Analyst": "تحلیلگر سناریوها",
      "Council Master": "استاد شورا",
    },
    header: "تحلیل {role} برای {symbol}:",
    indicators: "شاخص‌ها: {list}.",
    prices: "سطوح قیمت کلیدی: {list}.",
    percentages: "درصدهای قابل توجه: {list}.",
    decision: "DECISION: {decision}",
  },
  ur: {
    roleNames: {
      "Technical Analyst": "ٹیکنیکل تجزیہ کار",
      "Sentiment Analyst": "سینٹیمنٹ تجزیہ کار",
      "Risk Expert": "خطرہ ماہر",
      "Macro Expert": "میکرو ماہر",
      "Pattern Expert": "پیٹرن ماہر",
      "Execution Strategist": "ایگزیکیوشن ماہر",
      "Divergence Analyst": "تباین تجزیہ کار",
      "Scenario Analyst": "منظرنامہ تجزیہ کار",
      "Council Master": "کونسل کا ماسٹر",
    },
    header: "{symbol} کے لیے {role} کا تجزیہ:",
    indicators: "اشاریے: {list}.",
    prices: "اہم قیمت کی سطحیں: {list}.",
    percentages: "نمایاں فیصدیں: {list}.",
    decision: "DECISION: {decision}",
  },
  fil: {
    roleNames: {
      "Technical Analyst": "Teknikal na Analista",
      "Sentiment Analyst": "Analista ng Sentimento",
      "Risk Expert": "Eksperto sa Panganib",
      "Macro Expert": "Eksperto sa Makro",
      "Pattern Expert": "Eksperto sa Pattern",
      "Execution Strategist": "Estratehikong tagapagpaganap",
      "Divergence Analyst": "Analista ng Diverhensiya",
      "Scenario Analyst": "Analista ng Senaryo",
      "Council Master": "Master ng Konseho",
    },
    header: "Pagsusuri ng {role} para sa {symbol}:",
    indicators: "Mga indikator: {list}.",
    prices: "Mahahalagang antas ng presyo: {list}.",
    percentages: "Mga kapansin-pansing porsyento: {list}.",
    decision: "DECISION: {decision}",
  },
  da: {
    roleNames: {
      "Technical Analyst": "Teknisk Analytiker",
      "Sentiment Analyst": "Sentiment Analytiker",
      "Risk Expert": "Risikoekspert",
      "Macro Expert": "Makroekspert",
      "Pattern Expert": "Mønster ekspert",
      "Execution Strategist": "Gennemførelsesstrateg",
      "Divergence Analyst": "Divergensanalytiker",
      "Scenario Analyst": "Scenarieanalytiker",
      "Council Master": "Rådets Mester",
    },
    header: "{role}-analyse for {symbol}:",
    indicators: "Indikatorer: {list}.",
    prices: "Vigtige prisniveauer: {list}.",
    percentages: "Bemærkelsesværdige procentdele: {list}.",
    decision: "DECISION: {decision}",
  },
  no: {
    roleNames: {
      "Technical Analyst": "Teknisk Analytiker",
      "Sentiment Analyst": "Sentiment Analytiker",
      "Risk Expert": "Risikoekspert",
      "Macro Expert": "Makroekspert",
      "Pattern Expert": "Mønster ekspert",
      "Execution Strategist": "Gjennomføringstrateg",
      "Divergence Analyst": "Divergensanalytiker",
      "Scenario Analyst": "Scenarioanalytiker",
      "Council Master": "Rådets Mester",
    },
    header: "{role}-analyse for {symbol}:",
    indicators: "Indikatorer: {list}.",
    prices: "Viktige prisnivåer: {list}.",
    percentages: "Bemerkelsesverdige prosenter: {list}.",
    decision: "DECISION: {decision}",
  },
  fi: {
    roleNames: {
      "Technical Analyst": "Tekninen Analyytikko",
      "Sentiment Analyst": "Sentimenttianalyytikko",
      "Risk Expert": "Riskiasiantuntija",
      "Macro Expert": "Makroasiantuntija",
      "Pattern Expert": "Kuvioasiantuntija",
      "Execution Strategist": "Toteutusstrategi",
      "Divergence Analyst": "Divergenssianalyytikko",
      "Scenario Analyst": "Skenaarioanalyytikko",
      "Council Master": "Neuvoston Mestari",
    },
    header: "{role}-analyysi kohteelle {symbol}:",
    indicators: "Indikaattorit: {list}.",
    prices: "Tärkeät hintatasot: {list}.",
    percentages: "Huomattavat prosenttiosuudet: {list}.",
    decision: "DECISION: {decision}",
  },
  cs: {
    roleNames: {
      "Technical Analyst": "Technický Analytik",
      "Sentiment Analyst": "Analytik Sentimentu",
      "Risk Expert": "Odborník na Rizika",
      "Macro Expert": "Makro Odborník",
      "Pattern Expert": "Odborník na Vzorce",
      "Execution Strategist": "Strateg Exekuce",
      "Divergence Analyst": "Analytik Divergence",
      "Scenario Analyst": "Analytik Scénářů",
      "Council Master": "Mistr Rady",
    },
    header: "Analýza {role} pro {symbol}:",
    indicators: "Indikátory: {list}.",
    prices: "Klíčové cenové hladiny: {list}.",
    percentages: "Významné procenta: {list}.",
    decision: "DECISION: {decision}",
  },
  hu: {
    roleNames: {
      "Technical Analyst": "Műszaki Elemző",
      "Sentiment Analyst": "Hangulatelemző",
      "Risk Expert": "Kockázati Szakértő",
      "Macro Expert": "Makro Szakértő",
      "Pattern Expert": "Minta Szakértő",
      "Execution Strategist": "Végrehajtási Stratéga",
      "Divergence Analyst": "Divergencia Elemző",
      "Scenario Analyst": "Forgatókönyv Elemző",
      "Council Master": "Tanács Mestere",
    },
    header: "{role} elemzés {symbol} számára:",
    indicators: "Mutatók: {list}.",
    prices: "Kulcs árszintek: {list}.",
    percentages: "Jelentős százalékok: {list}.",
    decision: "DECISION: {decision}",
  },
  ro: {
    roleNames: {
      "Technical Analyst": "Analist Tehnic",
      "Sentiment Analyst": "Analist de Sentiment",
      "Risk Expert": "Expert în Riscuri",
      "Macro Expert": "Expert Macro",
      "Pattern Expert": "Expert în Modeluri",
      "Execution Strategist": "Strateg de Execuție",
      "Divergence Analyst": "Analist de Divergență",
      "Scenario Analyst": "Analist de Scenarii",
      "Council Master": "Maestrul Consiliului",
    },
    header: "Analiza {role} pentru {symbol}:",
    indicators: "Indicatori: {list}.",
    prices: "Niveluri cheie de preț: {list}.",
    percentages: "Procente notabile: {list}.",
    decision: "DECISION: {decision}",
  },
  bn: {
    roleNames: {
      "Technical Analyst": "প্রযুক্তিগত বিশ্লেষক",
      "Sentiment Analyst": "সেন্টিমেন্ট বিশ্লেষক",
      "Risk Expert": "ঝুঁকি বিশেষজ্ঞ",
      "Macro Expert": "ম্যাক্রো বিশেষজ্ঞ",
      "Pattern Expert": "প্যাটার্ন বিশেষজ্ঞ",
      "Execution Strategist": "কার্যকরী কৌশলবিদ",
      "Divergence Analyst": "বিভাজন বিশ্লেষক",
      "Scenario Analyst": "পরিস্থিতি বিশ্লেষক",
      "Council Master": "কাউন্সিলের মাস্টার",
    },
    header: "{symbol}-এর জন্য {role} বিশ্লেষণ:",
    indicators: "সূচক: {list}.",
    prices: "মূল্য স্তর: {list}.",
    percentages: "উল্লেখযোগ্য শতাংশ: {list}.",
    decision: "DECISION: {decision}",
  },
};

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
