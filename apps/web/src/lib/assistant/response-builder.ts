// ─── Response Builder Engine ──────────────────────────────────────
// Takes the DataBundle (real data from 8 DB tables + APIs) and builds:
// 1. A rich DATA CONTEXT string for the AI (so it never invents numbers)
// 2. A professional FORMAT PROMPT (so it outputs beautiful structured content)
// 3. A markdown fallback response (when AI fails, we still show real data)
//
// KEY PRINCIPLE: Every number in the AI response must come from real data.

import type { DataBundle, PriceData, TechnicalData, SignalData } from './data-fetcher';
import type { Locale } from './tools';

// ─── Labels for all 5 languages ────────────────────────────────────

interface LabelSet {
  price: string;
  currentPrice: string;
  change: string;
  dayRange: string;
  noPriceData: string;
  technical: string;
  trend: string;
  direction: string;
  strength: string;
  indicators: string;
  support: string;
  resistance: string;
  tradeSetup: string;
  direction_buy: string;
  direction_sell: string;
  direction_wait: string;
  entry: string;
  stopLoss: string;
  target: string;
  riskReward: string;
  confidence: string;
  fundamental: string;
  signal: string;
  activeSignal: string;
  noActiveSignal: string;
  marketAnalysis: string;
  reports: string;
  events: string;
  upcomingEvents: string;
  noUpcomingEvents: string;
  news: string;
  latestNews: string;
  sentiment: string;
  bullish: string;
  bearish: string;
  mixed: string;
  positive: string;
  negative: string;
  neutral: string;
  articlesAnalyzed: string;
  recommendation: string;
  risk: string;
  riskDisclaimer: string;
  lastUpdated: string;
  source: string;
  noData: string;
  overview: string;
}

const LABELS: Record<Locale, LabelSet> = {
  ar: {
    price: 'السعر الحالي',
    currentPrice: 'السعر الحالي',
    change: 'التغير',
    dayRange: 'المدى اليومي',
    noPriceData: 'بيانات السعر غير متوفرة',
    technical: 'التحليل الفني',
    trend: 'الاتجاه',
    direction: 'الاتجاه',
    strength: 'القوة',
    indicators: 'المؤشرات',
    support: 'الدعم',
    resistance: 'المقاومة',
    tradeSetup: 'إعداد الصفقة',
    direction_buy: 'شراء',
    direction_sell: 'بيع',
    direction_wait: 'انتظار',
    entry: 'سعر الدخول',
    stopLoss: 'وقف الخسارة',
    target: 'الهدف',
    riskReward: 'المخاطرة/العائد',
    confidence: 'مستوى الثقة',
    fundamental: 'التحليل الأساسي',
    signal: 'الإشارة النشطة',
    activeSignal: 'يوجد إشارة تداول نشطة',
    noActiveSignal: 'لا توجد إشارة نشطة حالياً',
    marketAnalysis: 'التحليل السوقي',
    reports: 'التقارير ذات الصلة',
    events: 'الأحداث القادمة',
    upcomingEvents: 'أحداث اقتصادية قادمة',
    noUpcomingEvents: 'لا أحداث قادمة',
    news: 'الأخبار المؤثرة',
    latestNews: 'أحدث الأخبار المؤثرة',
    sentiment: 'المشاعر',
    bullish: 'صاعد',
    bearish: 'هابط',
    mixed: 'مختلط',
    positive: 'إيجابي',
    negative: 'سلبي',
    neutral: 'محايد',
    articlesAnalyzed: 'أخبار تم تحليلها',
    recommendation: 'التوصية',
    risk: 'إدارة المخاطر',
    riskDisclaimer: 'تنبيه المخاطر: المعلومات لأغراض تعليمية ومعلوماتية فقط ولا تعتبر نصيحة استثمارية ملزمة. الأداء السابق لا يضمن النتائج المستقبلية.',
    lastUpdated: 'آخر تحديث',
    source: 'المصدر',
    noData: 'سيتم تحديث البيانات قريباً — يمكنك الاطلاع على الأخبار والتقارير أدناه',
    overview: 'نظرة عامة',
  },
  en: {
    price: 'Current Price',
    currentPrice: 'Current Price',
    change: 'Change',
    dayRange: 'Day Range',
    noPriceData: 'Price data not available',
    technical: 'Technical Analysis',
    trend: 'Trend',
    direction: 'Direction',
    strength: 'Strength',
    indicators: 'Indicators',
    support: 'Support',
    resistance: 'Resistance',
    tradeSetup: 'Trade Setup',
    direction_buy: 'Buy',
    direction_sell: 'Sell',
    direction_wait: 'Wait',
    entry: 'Entry',
    stopLoss: 'Stop Loss',
    target: 'Target',
    riskReward: 'Risk/Reward',
    confidence: 'Confidence',
    fundamental: 'Fundamental Analysis',
    signal: 'Active Signal',
    activeSignal: 'Active trading signal exists',
    noActiveSignal: 'No active signal currently',
    marketAnalysis: 'Market Analysis',
    reports: 'Related Reports',
    events: 'Upcoming Events',
    upcomingEvents: 'Upcoming economic events',
    noUpcomingEvents: 'No upcoming events',
    news: 'Impact News',
    latestNews: 'Latest Impact News',
    sentiment: 'Sentiment',
    bullish: 'Bullish',
    bearish: 'Bearish',
    mixed: 'Mixed',
    positive: 'positive',
    negative: 'negative',
    neutral: 'neutral',
    articlesAnalyzed: 'articles analyzed',
    recommendation: 'Recommendation',
    risk: 'Risk Management',
    riskDisclaimer: 'Risk Disclaimer: Information is for educational and informational purposes only and does not constitute investment advice. Past performance does not guarantee future results.',
    lastUpdated: 'Last updated',
    source: 'Source',
    noData: 'Data will be updated soon — check the news and reports below',
    overview: 'Overview',
  },
  fr: {
    price: 'Prix actuel',
    currentPrice: 'Prix actuel',
    change: 'Variation',
    dayRange: 'Plage du jour',
    noPriceData: 'Données de prix non disponibles',
    technical: 'Analyse technique',
    trend: 'Tendance',
    direction: 'Direction',
    strength: 'Force',
    indicators: 'Indicateurs',
    support: 'Support',
    resistance: 'Résistance',
    tradeSetup: 'Configuration de trade',
    direction_buy: 'Achat',
    direction_sell: 'Vente',
    direction_wait: 'Attente',
    entry: 'Entrée',
    stopLoss: 'Stop-loss',
    target: 'Objectif',
    riskReward: 'Risque/Rendement',
    confidence: 'Confiance',
    fundamental: 'Analyse fondamentale',
    signal: 'Signal actif',
    activeSignal: 'Signal de trading actif existant',
    noActiveSignal: 'Aucun signal actif actuellement',
    marketAnalysis: 'Analyse de marché',
    reports: 'Rapports associés',
    events: 'Événements à venir',
    upcomingEvents: 'Événements économiques à venir',
    noUpcomingEvents: 'Aucun événement à venir',
    news: 'Nouvelles impactantes',
    latestNews: 'Dernières nouvelles impactantes',
    sentiment: 'Sentiment',
    bullish: 'Haussier',
    bearish: 'Baissier',
    mixed: 'Mixte',
    positive: 'positif',
    negative: 'négatif',
    neutral: 'neutre',
    articlesAnalyzed: 'articles analysés',
    recommendation: 'Recommandation',
    risk: 'Gestion des risques',
    riskDisclaimer: "Avertissement : Les informations sont à des fins éducatives uniquement et ne constituent pas un conseil en investissement. Les performances passées ne garantissent pas les résultats futurs.",
    lastUpdated: 'Dernière mise à jour',
    source: 'Source',
    noData: 'Les données seront mises à jour prochainement — consultez les actualités ci-dessous',
    overview: 'Aperçu',
  },
  tr: {
    price: 'Mevcut Fiyat',
    currentPrice: 'Mevcut Fiyat',
    change: 'Değişim',
    dayRange: 'Günlük Aralık',
    noPriceData: 'Fiyat verileri mevcut değil',
    technical: 'Teknik Analiz',
    trend: 'Trend',
    direction: 'Yön',
    strength: 'Güç',
    indicators: 'Göstergeler',
    support: 'Destek',
    resistance: 'Direnç',
    tradeSetup: 'İşlem Kurulumu',
    direction_buy: 'Alış',
    direction_sell: 'Satış',
    direction_wait: 'Bekleme',
    entry: 'Giriş',
    stopLoss: 'Zarar Durdurma',
    target: 'Hedef',
    riskReward: 'Risk/Ödül',
    confidence: 'Güven',
    fundamental: 'Temel Analiz',
    signal: 'Aktif Sinyal',
    activeSignal: 'Aktif işlem sinyali mevcut',
    noActiveSignal: 'Şu anda aktif sinyal yok',
    marketAnalysis: 'Piyasa Analizi',
    reports: 'İlgili Raporlar',
    events: 'Yaklaşan Etkinlikler',
    upcomingEvents: 'Yaklaşan ekonomik etkinlikler',
    noUpcomingEvents: 'Yaklaşan etkinlik yok',
    news: 'Etkili Haberler',
    latestNews: 'Son Etkili Haberler',
    sentiment: 'Duygu',
    bullish: 'Yükseliş',
    bearish: 'Düşüş',
    mixed: 'Karma',
    positive: 'olumlu',
    negative: 'olumsuz',
    neutral: 'nötr',
    articlesAnalyzed: 'haber analiz edildi',
    recommendation: 'Tavsiye',
    risk: 'Risk Yönetimi',
    riskDisclaimer: 'Uyarı: Bilgiler yalnızca eğitim amaçlıdır ve yatırım tavsiyesi niteliğinde değildir. Geçmiş performans gelecekteki sonuçları garanti etmez.',
    lastUpdated: 'Son güncelleme',
    source: 'Kaynak',
    noData: 'Veriler yakında güncellenecek — aşağıdaki haberleri kontrol edin',
    overview: 'Genel Bakış',
  },
  es: {
    price: 'Precio actual',
    currentPrice: 'Precio actual',
    change: 'Cambio',
    dayRange: 'Rango del día',
    noPriceData: 'Datos de precio no disponibles',
    technical: 'Análisis técnico',
    trend: 'Tendencia',
    direction: 'Dirección',
    strength: 'Fuerza',
    indicators: 'Indicadores',
    support: 'Soporte',
    resistance: 'Resistencia',
    tradeSetup: 'Configuración de operación',
    direction_buy: 'Compra',
    direction_sell: 'Venta',
    direction_wait: 'Espera',
    entry: 'Entrada',
    stopLoss: 'Stop-loss',
    target: 'Objetivo',
    riskReward: 'Riesgo/Beneficio',
    confidence: 'Confianza',
    fundamental: 'Análisis fundamental',
    signal: 'Señal activa',
    activeSignal: 'Existe una señal de trading activa',
    noActiveSignal: 'No hay señal activa actualmente',
    marketAnalysis: 'Análisis de mercado',
    reports: 'Informes relacionados',
    events: 'Eventos próximos',
    upcomingEvents: 'Eventos económicos próximos',
    noUpcomingEvents: 'No hay eventos próximos',
    news: 'Noticias impactantes',
    latestNews: 'Últimas noticias impactantes',
    sentiment: 'Sentimiento',
    bullish: 'Alcista',
    bearish: 'Bajista',
    mixed: 'Mixto',
    positive: 'positivo',
    negative: 'negativo',
    neutral: 'neutral',
    articlesAnalyzed: 'artículos analizados',
    recommendation: 'Recomendación',
    risk: 'Gestión de riesgos',
    riskDisclaimer: 'Aviso: La información es solo con fines educativos e informativos y no constituye asesoramiento de inversión. El rendimiento pasado no garantiza resultados futuros.',
    lastUpdated: 'Última actualización',
    source: 'Fuente',
    noData: 'Los datos se actualizarán pronto — consulta las noticias a continuación',
    overview: 'Resumen',
  },
};

// ─── Build Data Context (injected into AI prompt) ────────────────

export function buildDataContext(bundle: any, locale: Locale): string {
  const L = LABELS[locale];
  const lines: string[] = [];

  lines.push(`═══ ${L.overview} — ${bundle.assetName} (${bundle.symbol}) ═══`);
  lines.push('');

  // ── Price Section ──
  if (bundle.price) {
    const p = bundle.price;
    const arrow = p.changePercent >= 0 ? '▲' : '▼';
    lines.push(`${L.currentPrice}: ${p.current} ${arrow} ${p.changePercent >= 0 ? '+' : ''}${p.changePercent.toFixed(2)}%`);
    if (p.dayHigh && p.dayLow) {
      lines.push(`${L.dayRange}: ${p.dayLow} — ${p.dayHigh}`);
    }
    lines.push(`${L.lastUpdated}: ${p.lastUpdated}`);
  } else {
    lines.push(`${L.currentPrice}: ${L.noPriceData}`);
  }
  lines.push('');

  // ── Technical Section ──
  if (bundle.technical) {
    const t = bundle.technical;
    lines.push(`── ${L.technical} ──`);
    lines.push(`${L.trend}: ${t.trend.direction === 'bullish' ? L.bullish : t.trend.direction === 'bearish' ? L.bearish : L.mixed} (${L.strength}: ${t.trend.strength}%)`);

    if (t.rsi !== null) lines.push(`RSI(14): ${t.rsi.toFixed(1)}`);
    if (t.macd) lines.push(`MACD: ${t.macd.value.toFixed(4)} | Signal: ${t.macd.signal.toFixed(4)} | Histogram: ${t.macd.histogram.toFixed(4)}`);
    if (t.bollingerBands) lines.push(`Bollinger: Upper ${t.bollingerBands.upper} | Mid ${t.bollingerBands.middle} | Lower ${t.bollingerBands.lower}`);
    if (t.sma20) lines.push(`SMA 20: ${t.sma20}`);
    if (t.sma50) lines.push(`SMA 50: ${t.sma50}`);
    if (t.atr) lines.push(`ATR: ${t.atr}`);
    if (t.stochastic) lines.push(`Stochastic: %K=${t.stochastic.k.toFixed(1)} %D=${t.stochastic.d.toFixed(1)}`);
    if (t.ichimoku && t.ichimoku.tenkan > 0) lines.push(`Ichimoku: Tenkan=${t.ichimoku.tenkan.toFixed(2)} Kijun=${t.ichimoku.kijun.toFixed(2)} Cloud=${t.ichimoku.cloudColor}`);

    if (t.support.length > 0) {
      lines.push(`${L.support}: ${t.support.join(' → ')}`);
    }
    if (t.resistance.length > 0) {
      lines.push(`${L.resistance}: ${t.resistance.join(' → ')}`);
    }

    if (t.tradeSetup) {
      const ts = t.tradeSetup;
      const dirLabel = ts.direction === 'long' ? L.direction_buy : ts.direction === 'short' ? L.direction_sell : L.direction_wait;
      lines.push(`${L.tradeSetup}: ${dirLabel}`);
      lines.push(`  ${L.entry}: ${ts.entry} | ${L.stopLoss}: ${ts.stopLoss} | ${L.target}: ${ts.target}`);
      lines.push(`  ${L.riskReward}: 1:${ts.riskReward.toFixed(1)} | ${L.confidence}: ${ts.confidence}%`);
    }

    lines.push(`${L.overview} Signal: ${t.overallSignal} (Score: ${t.overallScore})`);
    lines.push(`(${L.source}: ${t.source})`);
    lines.push('');
  }

  // ── Signal Section ──
  if (bundle.signal && bundle.signal.action) {
    const s = bundle.signal;
    lines.push(`── ${L.signal} ──`);
    lines.push(`Action: ${s.action} | ${L.entry}: ${s.entry} | ${L.stopLoss}: ${s.stopLoss} | ${L.target}: ${s.target} | ${L.confidence}: ${s.confidence}%`);
    lines.push('');
  }

  // ── Market Analysis ──
  if (bundle.marketAnalysis) {
    const ma = bundle.marketAnalysis;
    lines.push(`── ${L.marketAnalysis} ──`);
    if (ma.priceTarget) lines.push(`Price Target: ${ma.priceTarget}`);
    if (ma.sentiment) lines.push(`${L.sentiment}: ${ma.sentiment}`);
    if (ma.confidenceScore) lines.push(`${L.confidence}: ${ma.confidenceScore}%`);
    lines.push('');
  }

  // ── Events ──
  if (bundle.events.length > 0) {
    lines.push(`── ${L.upcomingEvents} ──`);
    for (const e of bundle.events.slice(0, 5)) {
      const impactEmoji = e.impact === 'high' || e.impact === 'critical' ? '🔴' : e.impact === 'medium' ? '🟡' : '🟢';
      lines.push(`${impactEmoji} ${e.eventName} (${e.eventDate?.split('T')[0] || ''}) | Forecast: ${e.forecast || '-'} | Previous: ${e.previous || '-'}`);
    }
    lines.push('');
  }

  // ── News ──
  if (bundle.news.length > 0) {
    lines.push(`── ${L.latestNews} ──`);
    for (const n of bundle.news.slice(0, 5)) {
      const icon = n.sentiment === 'positive' ? '🟢' : n.sentiment === 'negative' ? '🔴' : '🟡';
      lines.push(`${icon} ${n.title}`);
      if (n.summary) lines.push(`   ${n.summary.slice(0, 150)}`);
    }

    if (bundle.newsSentiment) {
      const ns = bundle.newsSentiment;
      lines.push(`${L.sentiment}: ${ns.momentum === 'bullish' ? L.bullish : ns.momentum === 'bearish' ? L.bearish : L.mixed} (${ns.positivePercent}% ${L.positive}, ${ns.negativePercent}% ${L.negative}, ${ns.totalAnalyzed} ${L.articlesAnalyzed})`);
    }
    lines.push('');
  }

  // ── Reports ──
  if (bundle.reports.length > 0) {
    lines.push(`── ${L.reports} ──`);
    for (const r of bundle.reports) {
      lines.push(`📄 ${r.title} → /reports/${r.slug}`);
    }
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════');

  // V13: Add INTELLIGENT DATA INSIGHTS — pre-analysis hints for the AI
  // These help the AI understand the data faster and give better analysis
  if (bundle.price && bundle.technical) {
    lines.push('');
    lines.push('── V13: Quick Insights (pre-analyzed for you) ──');
    const p = bundle.price;
    const t = bundle.technical;

    // Price vs SMA analysis
    if (t.sma20 && t.sma50) {
      const aboveSMA20 = p.current > t.sma20;
      const aboveSMA50 = p.current > t.sma50;
      lines.push(`Price ${aboveSMA20 ? 'ABOVE' : 'BELOW'} SMA20 (${t.sma20}) — ${aboveSMA20 ? 'bullish short-term' : 'bearish short-term'}`);
      lines.push(`Price ${aboveSMA50 ? 'ABOVE' : 'BELOW'} SMA50 (${t.sma50}) — ${aboveSMA50 ? 'bullish medium-term' : 'bearish medium-term'}`);
      if (aboveSMA20 && aboveSMA50) lines.push('→ Both SMAs support uptrend');
      else if (!aboveSMA20 && !aboveSMA50) lines.push('→ Both SMAs confirm downtrend');
      else lines.push('→ SMA crossover zone — potential trend change');
    }

    // RSI analysis
    if (t.rsi !== null) {
      if (t.rsi > 70) lines.push(`RSI ${t.rsi.toFixed(1)} → OVERBOUGHT — potential pullback`);
      else if (t.rsi < 30) lines.push(`RSI ${t.rsi.toFixed(1)} → OVERSOLD — potential bounce`);
      else if (t.rsi < 40) lines.push(`RSI ${t.rsi.toFixed(1)} → approaching oversold — watch for support test`);
      else if (t.rsi > 60) lines.push(`RSI ${t.rsi.toFixed(1)} → approaching overbought — watch for resistance test`);
      else lines.push(`RSI ${t.rsi.toFixed(1)} → neutral zone`);
    }

    // Price vs support/resistance
    if (t.support.length > 0 || t.resistance.length > 0) {
      const nearestSupport = t.support.length > 0 ? t.support[t.support.length - 1] : null;
      const nearestResistance = t.resistance.length > 0 ? t.resistance[0] : null;
      if (nearestSupport) {
        const distToSupport = ((nearestSupport - p.current) / p.current * 100).toFixed(2);
        lines.push(`Nearest support: ${nearestSupport} (${distToSupport}% away)`);
      }
      if (nearestResistance) {
        const distToResistance = ((nearestResistance - p.current) / p.current * 100).toFixed(2);
        lines.push(`Nearest resistance: ${nearestResistance} (${distToResistance}% away)`);
      }
    }

    // News-Technical divergence
    if (bundle.newsSentiment && t.overallSignal) {
      const newsBullish = bundle.newsSentiment.momentum === 'bullish';
      const techBullish = t.overallSignal === 'bullish';
      const newsBearish = bundle.newsSentiment.momentum === 'bearish';
      const techBearish = t.overallSignal === 'bearish';
      if (newsBullish && techBearish) {
        lines.push('⚠️ DIVERGENCE: News is bullish but technicals are bearish — caution needed');
      } else if (newsBearish && techBullish) {
        lines.push('⚠️ DIVERGENCE: News is bearish but technicals are bullish — watch for reversal');
      } else if (newsBullish && techBullish) {
        lines.push('✅ ALIGNED: Both news and technicals are bullish — strong signal');
      } else if (newsBearish && techBearish) {
        lines.push('✅ ALIGNED: Both news and technicals are bearish — strong signal');
      }
    }

    // Change magnitude analysis
    if (Math.abs(p.changePercent) > 3) {
      lines.push(`⚠️ BIG MOVE: ${p.changePercent.toFixed(2)}% — unusual volatility, check for catalyst`);
    } else if (Math.abs(p.changePercent) < 0.5) {
      lines.push(`📊 LOW VOLATILITY: ${p.changePercent.toFixed(2)}% — consolidation phase`);
    }
  }

  return lines.join('\n');
}

// ─── Build Format Prompt (tells AI exactly how to format output) ──

export function buildFormatPrompt(bundle: any, locale: Locale): string {
  const L = LABELS[locale];
  const hasPrice = !!bundle.price;
  const hasTechnical = !!bundle.technical;
  const hasSignal = !!bundle.signal?.action;
  const hasNews = bundle.news.length > 0;
  const hasEvents = bundle.events.length > 0;

  // Language-specific rules
  const langRule = locale === 'ar'
    ? '- أجب بالعربية فقط — لا تستخدم أبداً كلمات أو حروفاً من لغات أخرى (لا تايلندية، لا صينية، لا يابانية، لا كورية، لا سيريلية)'
    : locale === 'fr'
      ? '- Répondez en français UNIQUEMENT — pas de caractères étrangers'
      : locale === 'tr'
        ? '- SADECE Türkçe yanıt verin — yabancı karakter yok'
        : locale === 'es'
          ? '- Responde SOLO en español — sin caracteres extranjeros'
          : '- Answer in English ONLY — no foreign characters';

  const rules = [
    langRule,
    '- اتبع الهيكل أدناه بالضبط — لا تغيّر الإيموجي أو ترتيب العناوين',
    '- لا تخترع أرقام — كل رقم يجب أن يأتي من البيانات المقدمة فقط',
    '- إذا لم تجد بيانات لقسم، قل ذلك بوضوح بدلاً من اختراع أرقام',
    '- استخدم الجداول (|) لعرض المستويات والأسعار',
    '- استخدم [████░░░░] لعرض المقاييس البصرية',
    `- أضف في النهاية: ⚠️ ${L.riskDisclaimer}`,
  ];

  // Build sections based on available data
  const sections: string[] = [];

  // Section 1: Price Overview
  if (hasPrice) {
    sections.push(`## 📊 ${L.currentPrice} — ${bundle.assetName}
> ${bundle.price!.current} ${bundle.price!.changePercent >= 0 ? '▲' : '▼'} ${bundle.price!.changePercent >= 0 ? '+' : ''}${bundle.price!.changePercent.toFixed(2)}%

---

`);
  }

  // Section 2: Technical Analysis
  if (hasTechnical) {
    const t = bundle.technical!;
    sections.push(`## 📈 ${L.technical}
| ${L.indicators} | ${L.direction} |
|---|---|
${t.rsi !== null ? `| RSI(14): ${t.rsi.toFixed(1)} | ${t.rsi > 70 ? L.bearish : t.rsi < 30 ? L.bullish : L.mixed} |\n` : ''}${t.macd ? `| MACD | ${t.macd.histogram > 0 ? L.bullish : L.bearish} |\n` : ''}${t.sma20 ? `| SMA 20: ${t.sma20} | ${bundle.price && bundle.price.current > t.sma20 ? L.bullish : L.bearish} |\n` : ''}

${L.trend}: **${t.trend.direction === 'bullish' ? L.bullish : t.trend.direction === 'bearish' ? L.bearish : L.mixed}** ${`[${'█'.repeat(Math.round(t.trend.strength / 10))}${'░'.repeat(10 - Math.round(t.trend.strength / 10))}]`} ${t.trend.strength}%

| ${L.support} | ${L.resistance} |
|---|---|
${t.support.length > 0 || t.resistance.length > 0 ? `| ${t.support.join(' → ') || '—'} | ${t.resistance.join(' → ') || '—'} |` : '| — | — |'}

---

`);
  }

  // Section 3: Recommendation
  sections.push(`## 🎯 ${L.recommendation}
${hasTechnical && bundle.technical!.tradeSetup ? `> **${bundle.technical!.tradeSetup.direction === 'long' ? L.direction_buy : bundle.technical!.tradeSetup.direction === 'short' ? L.direction_sell : L.direction_wait}:** ${L.entry}: ${bundle.technical!.tradeSetup.entry} | ${L.target}: ${bundle.technical!.tradeSetup.target} | ${L.stopLoss}: ${bundle.technical!.tradeSetup.stopLoss}
> ${L.riskReward}: 1:${bundle.technical!.tradeSetup.riskReward.toFixed(1)} | ${L.confidence}: ${`[${'█'.repeat(Math.round(bundle.technical!.tradeSetup.confidence / 10))}${'░'.repeat(10 - Math.round(bundle.technical!.tradeSetup.confidence / 10))}]`} ${bundle.technical!.tradeSetup.confidence}%` : `> ${L.noData}`}

---

`);

  // Section 4: Signal
  if (hasSignal) {
    const s = bundle.signal!;
    sections.push(`## 📡 ${L.signal}: **${s.action}**
> ${L.entry}: ${s.entry} | ${L.target}: ${s.target} | ${L.stopLoss}: ${s.stopLoss} | ${L.confidence}: ${s.confidence}%

---

`);
  }

  // Section 5: News
  if (hasNews) {
    sections.push(`## 📰 ${L.latestNews}
${bundle.news.slice(0, 5).map(n => {
      const icon = n.sentiment === 'positive' ? '🟢' : n.sentiment === 'negative' ? '🔴' : '🟡';
      return `### ${icon} ${n.title}\n> ${n.summary.slice(0, 200)}`;
    }).join('\n\n')}

${bundle.newsSentiment ? `> ${L.sentiment}: [${'█'.repeat(Math.round(bundle.newsSentiment.positivePercent / 10))}${'░'.repeat(10 - Math.round(bundle.newsSentiment.positivePercent / 10))}] ${bundle.newsSentiment.momentum === 'bullish' ? L.bullish : bundle.newsSentiment.momentum === 'bearish' ? L.bearish : L.mixed} (${bundle.newsSentiment.positivePercent}% ${L.positive})` : ''}

---

`);
  }

  // Section 6: Events
  if (hasEvents) {
    sections.push(`## 📅 ${L.upcomingEvents}
${bundle.events.slice(0, 5).map(e => `- ${e.impact === 'high' || e.impact === 'critical' ? '🔴' : '🟡'} **${e.eventName}** (${e.eventDate?.split('T')[0] || ''}) — ${L.source}: ${e.forecast || '-'} / ${e.previous || '-'}`).join('\n')}

---

`);
  }

  // Risk disclaimer
  sections.push(`⚠️ ${L.riskDisclaimer}`);

  const fullPrompt = `أنت مساعد "رؤى" الذكي للتحليل المالي. لديك بيانات حقيقية ومحدّثة عن أصل مالي. حللها واحترف عرضها.

قواعد صارمة:
${rules.join('\n')}

تنسيق المخرجات المطلوب:

${sections.join('')}`;

  return fullPrompt;
}

// ─── Build Markdown Fallback (when AI fails entirely) ─────────────

export function buildMarkdownFallback(bundle: any, locale: Locale): string {
  const L = LABELS[locale];
  const lines: string[] = [];

  // Header
  lines.push(`## 📊 ${bundle.assetName} (${bundle.symbol})`);
  lines.push('');

  // Price
  if (bundle.price) {
    const p = bundle.price;
    const arrow = p.changePercent >= 0 ? '▲' : '▼';
    lines.push(`> **${L.currentPrice}:** ${p.current} ${arrow} ${p.changePercent >= 0 ? '+' : ''}${p.changePercent.toFixed(2)}%`);
    if (p.dayHigh && p.dayLow) {
      lines.push(`> **${L.dayRange}:** ${p.dayLow} — ${p.dayHigh}`);
    }
    lines.push('');
  }

  // Technical
  if (bundle.technical) {
    const t = bundle.technical;
    lines.push(`### 📈 ${L.technical}`);
    lines.push('');

    const trendLabel = t.trend.direction === 'bullish' ? L.bullish : t.trend.direction === 'bearish' ? L.bearish : L.mixed;
    const bars = '█'.repeat(Math.round(t.trend.strength / 10)) + '░'.repeat(10 - Math.round(t.trend.strength / 10));
    lines.push(`> **${L.trend}:** ${trendLabel} [${bars}] ${t.trend.strength}%`);
    lines.push('');

    // Indicators table
    lines.push(`| ${L.indicators} | Value | ${L.direction} |`);
    lines.push('|---|---|---|');
    if (t.rsi !== null) {
      const sig = t.rsi > 70 ? L.bearish : t.rsi < 30 ? L.bullish : L.neutral;
      lines.push(`| RSI(14) | ${t.rsi.toFixed(1)} | ${sig} |`);
    }
    if (t.macd) {
      const sig = t.macd.histogram > 0 ? L.bullish : L.bearish;
      lines.push(`| MACD | ${t.macd.histogram.toFixed(4)} | ${sig} |`);
    }
    if (t.sma20) {
      const sig = bundle.price && bundle.price.current > t.sma20 ? L.bullish : L.bearish;
      lines.push(`| SMA 20 | ${t.sma20} | ${sig} |`);
    }
    if (t.sma50) {
      const sig = bundle.price && bundle.price.current > t.sma50 ? L.bullish : L.bearish;
      lines.push(`| SMA 50 | ${t.sma50} | ${sig} |`);
    }
    lines.push('');

    // Support/Resistance
    lines.push(`| ${L.support} | ${L.resistance} |`);
    lines.push('|---|---|');
    const maxRows = Math.max(t.support.length, t.resistance.length, 1);
    for (let i = 0; i < maxRows; i++) {
      const sup = t.support[i]?.toFixed(2) || '—';
      const res = t.resistance[i]?.toFixed(2) || '—';
      lines.push(`| ${sup} | ${res} |`);
    }
    lines.push('');

    // Trade Setup
    if (t.tradeSetup) {
      const ts = t.tradeSetup;
      const dirLabel = ts.direction === 'long' ? L.direction_buy : ts.direction === 'short' ? L.direction_sell : L.direction_wait;
      lines.push(`### 🎯 ${L.tradeSetup}: **${dirLabel}**`);
      lines.push(`> ${L.entry}: **${ts.entry}** | ${L.target}: **${ts.target}** | ${L.stopLoss}: **${ts.stopLoss}**`);
      lines.push(`> ${L.riskReward}: 1:${ts.riskReward.toFixed(1)} | ${L.confidence}: ${ts.confidence}%`);
      lines.push('');
    }
  }

  // Active Signal
  if (bundle.signal?.action) {
    const s = bundle.signal;
    lines.push(`### 📡 ${L.signal}: **${s.action}**`);
    lines.push(`> ${L.entry}: ${s.entry} | ${L.target}: ${s.target} | ${L.stopLoss}: ${s.stopLoss} | ${L.confidence}: ${s.confidence}%`);
    lines.push('');
  }

  // News
  if (bundle.news.length > 0) {
    lines.push(`### 📰 ${L.latestNews}`);
    lines.push('');
    for (const n of bundle.news.slice(0, 5)) {
      const icon = n.sentiment === 'positive' ? '🟢' : n.sentiment === 'negative' ? '🔴' : '🟡';
      lines.push(`${icon} **${n.title}**`);
      if (n.summary) lines.push(`> ${n.summary.slice(0, 200)}`);
      lines.push('');
    }

    if (bundle.newsSentiment) {
      const ns = bundle.newsSentiment;
      const momentumLabel = ns.momentum === 'bullish' ? L.bullish : ns.momentum === 'bearish' ? L.bearish : L.mixed;
      lines.push(`> **${L.sentiment}:** ${momentumLabel} (${ns.positivePercent}% ${L.positive}, ${ns.negativePercent}% ${L.negative}) — ${ns.totalAnalyzed} ${L.articlesAnalyzed}`);
      lines.push('');
    }
  }

  // Events
  if (bundle.events.length > 0) {
    lines.push(`### 📅 ${L.upcomingEvents}`);
    lines.push('');
    for (const e of bundle.events.slice(0, 5)) {
      const icon = e.impact === 'high' || e.impact === 'critical' ? '🔴' : '🟡';
      lines.push(`${icon} **${e.eventName}** — ${e.eventDate?.split('T')[0] || ''}`);
    }
    lines.push('');
  }

  // Disclaimer
  lines.push(`⚠️ ${L.riskDisclaimer}`);

  return lines.join('\n');
}

// ─── Build Professional HTML/CSS Cards ─────────────────────────────
// Each data section becomes an independent card with consistent design.
// Uses inline CSS for maximum compatibility (no external styles needed).
// Supports RTL (Arabic) and LTR equally.

export function buildHTMLCards(bundle: any, locale: Locale): string {
  const L = LABELS[locale];
  const isRtl = locale === 'ar';
  const dir = isRtl ? 'rtl' : 'ltr';
  const align = isRtl ? 'right' : 'left';
  const fontFamily = locale === 'ar'
    ? "'Readex Pro', 'Noto Sans Arabic', 'Segoe UI', sans-serif"
    : locale === 'tr'
      ? "'Segoe UI', 'Noto Sans', sans-serif"
      : "'Inter', 'Segoe UI', 'Noto Sans', sans-serif";

  // Color palette
  const C = {
    bg: '#0F172A',
    cardBg: '#1E293B',
    cardBorder: 'rgba(99,102,241,0.15)',
    cardGlow: '0 4px 24px rgba(99,102,241,0.08)',
    textPrimary: '#E2E8F0',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    accentBlue: '#60A5FA',
    accentPurple: '#C084FC',
    accentGreen: '#4ADE80',
    accentRed: '#F87171',
    accentYellow: '#FBBF24',
    accentCyan: '#38BDF8',
    accentIndigo: '#818CF8',
    divider: 'rgba(99,102,241,0.1)',
  };

  // Section theme config
  interface SectionTheme {
    icon: string;
    color: string;
    gradient: string;
    bgTint: string;
    borderColor: string;
  }

  const themes: Record<string, SectionTheme> = {
    price: { icon: '💰', color: C.accentBlue, gradient: 'linear-gradient(135deg, #3B82F6, #60A5FA)', bgTint: 'rgba(59,130,246,0.06)', borderColor: 'rgba(59,130,246,0.2)' },
    technical: { icon: '📊', color: C.accentPurple, gradient: 'linear-gradient(135deg, #A855F7, #C084FC)', bgTint: 'rgba(168,85,247,0.06)', borderColor: 'rgba(168,85,247,0.2)' },
    signal: { icon: '📡', color: C.accentGreen, gradient: 'linear-gradient(135deg, #22C55E, #4ADE80)', bgTint: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.2)' },
    recommendation: { icon: '🎯', color: '#34D399', gradient: 'linear-gradient(135deg, #059669, #34D399)', bgTint: 'rgba(5,150,105,0.06)', borderColor: 'rgba(5,150,105,0.2)' },
    fundamentals: { icon: '🏢', color: C.accentCyan, gradient: 'linear-gradient(135deg, #0EA5E9, #38BDF8)', bgTint: 'rgba(14,165,233,0.06)', borderColor: 'rgba(14,165,233,0.2)' },
    news: { icon: '📰', color: C.accentCyan, gradient: 'linear-gradient(135deg, #0EA5E9, #38BDF8)', bgTint: 'rgba(14,165,233,0.06)', borderColor: 'rgba(14,165,233,0.2)' },
    analysis: { icon: '🔬', color: C.accentIndigo, gradient: 'linear-gradient(135deg, #6366F1, #818CF8)', bgTint: 'rgba(99,102,241,0.06)', borderColor: 'rgba(99,102,241,0.2)' },
    events: { icon: '📅', color: C.accentIndigo, gradient: 'linear-gradient(135deg, #6366F1, #818CF8)', bgTint: 'rgba(99,102,241,0.06)', borderColor: 'rgba(99,102,241,0.2)' },
    risk: { icon: '⚠️', color: C.accentYellow, gradient: 'linear-gradient(135deg, #D97706, #FBBF24)', bgTint: 'rgba(251,191,36,0.06)', borderColor: 'rgba(251,191,36,0.2)' },
  };

  const cards: string[] = [];

  // ─── Helper: Build a single card ───
  function card(theme: SectionTheme, title: string, content: string): string {
    return `<div style="
      background: ${C.cardBg};
      border: 1px solid ${theme.borderColor};
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 10px;
      box-shadow: ${C.cardGlow};
      direction: ${dir};
      font-family: ${fontFamily};
    ">
      <div style="
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        background: ${theme.bgTint};
        border-bottom: 1px solid ${theme.borderColor};
      ">
        <span style="font-size: 16px;">${theme.icon}</span>
        <span style="
          font-size: 12px;
          font-weight: 700;
          color: ${theme.color};
          letter-spacing: 0.3px;
          text-transform: uppercase;
        ">${title}</span>
      </div>
      <div style="padding: 12px 14px; color: ${C.textPrimary}; font-size: 13px; line-height: 1.8;">
        ${content}
      </div>
    </div>`;
  }

  // ─── Helper: Gauge bar ───
  function gaugeBar(percent: number, color: string): string {
    return `<div style="
      display: flex;
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
      background: rgba(30,41,59,0.8);
      margin: 6px 0;
    ">
      <div style="width: ${percent}%; background: ${color}; border-radius: 4px; box-shadow: 0 0 8px ${color}44; transition: width 0.3s;"></div>
    </div>`;
  }

  // ─── Helper: Key-value row ───
  function kvRow(key: string, value: string, valueColor?: string): string {
    return `<div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid ${C.divider};">
      <span style="color: ${C.textSecondary}; font-size: 12px;">${key}</span>
      <span style="color: ${valueColor || C.textPrimary}; font-weight: 600; font-size: 13px; font-family: 'JetBrains Mono', monospace;">${value}</span>
    </div>`;
  }

  // ─── Helper: Mini badge ───
  function badge(text: string, color: string): string {
    return `<span style="
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 700;
      color: ${color};
      background: ${color}18;
      border: 1px solid ${color}33;
    ">${text}</span>`;
  }

  // ─── 1. Price Card ───
  if (bundle.price) {
    const p = bundle.price;
    const isUp = p.changePercent >= 0;
    const arrow = isUp ? '▲' : '▼';
    const priceColor = isUp ? C.accentGreen : C.accentRed;
    const changeSign = isUp ? '+' : '';

    // ── Detect stale price ──
    // db-stale source = price between 2h-24h old
    // 0% change with no day range = likely stale data
    const isStaleSource = p.source === 'db-stale';
    const isStalePrice = isStaleSource || (p.changePercent === 0 && p.change === 0 && !p.dayHigh && !p.dayLow);
    const staleIndicator = isStalePrice
      ? `<div style="font-size: 9px; color: ${C.accentYellow}; margin-top: 4px; text-align: center;">
          ${locale === 'ar' ? '⚠️ السعر قد لا يكون محدثاً بالوقت الفعلي' : '⚠️ Price may not be real-time'}
        </div>`
      : '';

    let content = `
      <div style="text-align: center; padding: 8px 0;">
        <div style="font-size: 28px; font-weight: 800; color: ${priceColor}; font-family: 'JetBrains Mono', monospace; letter-spacing: -0.5px;">
          ${p.current.toFixed(p.current < 10 ? 4 : 2)}
        </div>
        <div style="display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 4px;">
          <span style="color: ${priceColor}; font-size: 14px; font-weight: 700;">${arrow}</span>
          <span style="color: ${priceColor}; font-size: 14px; font-weight: 700; font-family: 'JetBrains Mono', monospace;">${changeSign}${p.changePercent.toFixed(2)}%</span>
          ${badge(isUp ? L.bullish : L.bearish, priceColor)}
        </div>
        ${staleIndicator}
      </div>`;

    if (p.dayHigh && p.dayLow) {
      content += `
      <div style="margin-top: 8px;">
        ${kvRow(L.dayRange, `${p.dayLow.toFixed(2)} — ${p.dayHigh.toFixed(2)}`, C.textSecondary)}
      </div>`;
    }
    if (p.volume) {
      content += kvRow('Volume', p.volume.toLocaleString(), C.textSecondary);
    }
    const sourceLabel = p.source === 'db-stale'
      ? (locale === 'ar' ? 'قاعدة بيانات (قد لا يكون محدثاً)' : 'Database (may be delayed)')
      : p.source === 'db'
        ? (locale === 'ar' ? 'قاعدة بيانات' : 'Database')
        : p.source === 'api'
          ? (locale === 'ar' ? 'مباشر' : 'Live API')
          : p.source;
    content += `
      <div style="margin-top: 6px; text-align: ${align};">
        <span style="font-size: 9px; color: ${C.textMuted};">${L.lastUpdated}: ${p.lastUpdated.split('T')[0]} · ${L.source}: ${sourceLabel}</span>
      </div>`;

    cards.push(card(themes.price, `${L.currentPrice} — ${bundle.assetName}`, content));
  }

  // ─── 2. Technical Analysis Card ───
  if (bundle.technical) {
    const t = bundle.technical;
    const trendColor = t.trend.direction === 'bullish' ? C.accentGreen : t.trend.direction === 'bearish' ? C.accentRed : C.accentYellow;
    const trendLabel = t.trend.direction === 'bullish' ? L.bullish : t.trend.direction === 'bearish' ? L.bearish : L.mixed;

    let content = `
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
        <div style="
          width: 42px; height: 42px; border-radius: 50%;
          background: ${trendColor}18; border: 2px solid ${trendColor}55;
          display: flex; align-items: center; justify-content: center;
          font-size: 18px;
        ">${t.trend.direction === 'bullish' ? '📈' : t.trend.direction === 'bearish' ? '📉' : '↔️'}</div>
        <div>
          <div style="font-weight: 700; font-size: 14px; color: ${trendColor};">${trendLabel}</div>
          <div style="font-size: 10px; color: ${C.textMuted};">${L.strength}: ${t.trend.strength}%</div>
        </div>
        ${gaugeBar(t.trend.strength, trendColor)}
      </div>`;

    // Indicators table
    const indicators: string[] = [];
    if (t.rsi !== null) {
      const rsiColor = t.rsi > 70 ? C.accentRed : t.rsi < 30 ? C.accentGreen : C.accentYellow;
      indicators.push(kvRow('RSI (14)', t.rsi.toFixed(1), rsiColor));
    }
    if (t.macd) {
      const macdColor = t.macd.histogram > 0 ? C.accentGreen : C.accentRed;
      indicators.push(kvRow('MACD', t.macd.histogram.toFixed(4), macdColor));
    }
    if (t.sma20) {
      const smaColor = bundle.price && bundle.price.current > t.sma20 ? C.accentGreen : C.accentRed;
      indicators.push(kvRow('SMA 20', t.sma20.toFixed(2), smaColor));
    }
    if (t.sma50) {
      const smaColor = bundle.price && bundle.price.current > t.sma50 ? C.accentGreen : C.accentRed;
      indicators.push(kvRow('SMA 50', t.sma50.toFixed(2), smaColor));
    }
    if (t.atr) {
      indicators.push(kvRow('ATR', t.atr.toFixed(2), C.accentYellow));
    }
    if (t.bollingerBands) {
      indicators.push(kvRow('BB Upper', t.bollingerBands.upper.toFixed(2), C.textSecondary));
      indicators.push(kvRow('BB Lower', t.bollingerBands.lower.toFixed(2), C.textSecondary));
    }
    if (t.stochastic) {
      const stochColor = t.stochastic.k > 80 ? C.accentRed : t.stochastic.k < 20 ? C.accentGreen : C.accentYellow;
      indicators.push(kvRow('Stochastic %K', t.stochastic.k.toFixed(1), stochColor));
    }
    if (t.ichimoku && t.ichimoku.tenkan > 0) {
      const ichColor = t.ichimoku.cloudColor === 'bullish' ? C.accentGreen : t.ichimoku.cloudColor === 'bearish' ? C.accentRed : C.accentYellow;
      indicators.push(kvRow('Ichimoku', t.ichimoku.cloudColor === 'bullish' ? '☁️ صاعد' : t.ichimoku.cloudColor === 'bearish' ? '☁️ هابط' : '☁️ محايد', ichColor));
    }

    if (indicators.length > 0) {
      content += `<div style="
        background: rgba(15,23,42,0.5);
        border-radius: 8px;
        padding: 8px 10px;
        margin: 8px 0;
      ">${indicators.join('')}</div>`;
    }

    // Support / Resistance
    if (t.support.length > 0 || t.resistance.length > 0) {
      content += `<div style="display: flex; gap: 8px; margin-top: 8px;">`;
      if (t.support.length > 0) {
        content += `<div style="flex: 1; background: rgba(34,197,94,0.06); border: 1px solid rgba(34,197,94,0.15); border-radius: 8px; padding: 8px 10px;">
          <div style="font-size: 10px; font-weight: 700; color: ${C.accentGreen}; margin-bottom: 4px;">🟢 ${L.support}</div>
          ${t.support.map(s => `<div style="font-size: 11px; color: ${C.accentGreen}; font-family: 'JetBrains Mono', monospace; font-weight: 600;">${s.toFixed(2)}</div>`).join('')}
        </div>`;
      }
      if (t.resistance.length > 0) {
        content += `<div style="flex: 1; background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.15); border-radius: 8px; padding: 8px 10px;">
          <div style="font-size: 10px; font-weight: 700; color: ${C.accentRed}; margin-bottom: 4px;">🔴 ${L.resistance}</div>
          ${t.resistance.map(r => `<div style="font-size: 11px; color: ${C.accentRed}; font-family: 'JetBrains Mono', monospace; font-weight: 600;">${r.toFixed(2)}</div>`).join('')}
        </div>`;
      }
      content += `</div>`;
    }

    content += `<div style="margin-top: 6px; text-align: ${align};"><span style="font-size: 9px; color: ${C.textMuted};">${L.source}: ${t.source}</span></div>`;

    cards.push(card(themes.technical, L.technical, content));
  }

  // ─── 3. Recommendation / Trade Setup Card ───
  {
    const ts = bundle.technical?.tradeSetup;
    const hasSignal = bundle.signal?.action;
    const hasPrice = !!bundle.price;
    const hasSentiment = !!bundle.newsSentiment;

    // ── SMART RECOMMENDATION: Generate from available data ──
    // Even without tradeSetup, we can derive a recommendation from:
    // 1. Active signal (BUY/SELL/WAIT)
    // 2. Technical trend direction + strength
    // 3. News sentiment momentum
    // 4. Price momentum (changePercent)
    const theme = ts || hasSignal ? themes.recommendation : themes.risk;
    let content = '';

    if (ts) {
      // We have a trade setup — show it
      const dirLabel = ts.direction === 'long' ? L.direction_buy : ts.direction === 'short' ? L.direction_sell : L.direction_wait;
      const dirColor = ts.direction === 'long' ? C.accentGreen : ts.direction === 'short' ? C.accentRed : C.accentYellow;
      const dirIcon = ts.direction === 'long' ? '🟢' : ts.direction === 'short' ? '🔴' : '🟡';

      // ── VALIDATION: Check for contradictory trade setup ──
      // A long setup should have target > entry; a short setup should have target < entry
      let validatedDirection = ts.direction;
      if (ts.direction === 'long' && ts.target < ts.entry && ts.target > 0) {
        console.warn(`[ResponseBuilder] ⚠️ Contradictory setup: long direction but target ${ts.target} < entry ${ts.entry} → switching to short`);
        validatedDirection = 'short';
      } else if (ts.direction === 'short' && ts.target > ts.entry && ts.target > 0) {
        console.warn(`[ResponseBuilder] ⚠️ Contradictory setup: short direction but target ${ts.target} > entry ${ts.entry} → switching to long`);
        validatedDirection = 'long';
      }

      const finalDirLabel = validatedDirection === 'long' ? L.direction_buy : validatedDirection === 'short' ? L.direction_sell : L.direction_wait;
      const finalDirColor = validatedDirection === 'long' ? C.accentGreen : validatedDirection === 'short' ? C.accentRed : C.accentYellow;
      const finalDirIcon = validatedDirection === 'long' ? '🟢' : validatedDirection === 'short' ? '🔴' : '🟡';

      content += `
        <div style="text-align: center; margin-bottom: 10px;">
          <div style="font-size: 24px; font-weight: 800; color: ${finalDirColor};">${finalDirIcon} ${finalDirLabel}</div>
        </div>
        <div style="background: rgba(15,23,42,0.5); border-radius: 8px; padding: 8px 10px;">
          ${kvRow(L.entry, ts.entry.toFixed(ts.entry < 10 ? 4 : 2), C.accentCyan)}
          ${kvRow(L.target, ts.target.toFixed(ts.target < 10 ? 4 : 2), validatedDirection === 'long' ? C.accentGreen : C.accentRed)}
          ${kvRow(L.stopLoss, ts.stopLoss.toFixed(ts.stopLoss < 10 ? 4 : 2), C.accentRed)}
          ${kvRow(L.riskReward, `1:${ts.riskReward.toFixed(1)}`, C.accentYellow)}
        </div>
        <div style="margin-top: 8px;">
          <span style="font-size: 10px; color: ${C.textSecondary};">${L.confidence}:</span>
          ${gaugeBar(ts.confidence, finalDirColor)}
          <span style="font-size: 12px; font-weight: 700; color: ${finalDirColor}; font-family: 'JetBrains Mono', monospace;">${ts.confidence}%</span>
        </div>`;
    } else if (hasSignal) {
      // We have an active trading signal from DB
      const s = bundle.signal!;
      const sigColor = s.action === 'BUY' ? C.accentGreen : s.action === 'SELL' ? C.accentRed : C.accentYellow;
      const sigIcon = s.action === 'BUY' ? '🟢' : s.action === 'SELL' ? '🔴' : '🟡';
      const sigLabel = s.action === 'BUY' ? L.direction_buy : s.action === 'SELL' ? L.direction_sell : L.direction_wait;

      // ── VALIDATION: Check signal direction vs target/stop logic ──
      let displayAction = s.action;
      if (s.action === 'BUY' && s.target && s.entry && s.target < s.entry) {
        // BUY signal but target below entry → contradictory
        displayAction = 'SELL';
      } else if (s.action === 'SELL' && s.target && s.entry && s.target > s.entry) {
        displayAction = 'BUY';
      }

      const finalSigColor = displayAction === 'BUY' ? C.accentGreen : displayAction === 'SELL' ? C.accentRed : C.accentYellow;
      const finalSigIcon = displayAction === 'BUY' ? '🟢' : displayAction === 'SELL' ? '🔴' : '🟡';
      const finalSigLabel = displayAction === 'BUY' ? L.direction_buy : displayAction === 'SELL' ? L.direction_sell : L.direction_wait;

      content += `
        <div style="text-align: center; margin-bottom: 10px;">
          <div style="font-size: 24px; font-weight: 800; color: ${finalSigColor};">${finalSigIcon} ${finalSigLabel}</div>
        </div>
        <div style="background: rgba(15,23,42,0.5); border-radius: 8px; padding: 8px 10px;">
          ${s.entry ? kvRow(L.entry, s.entry.toFixed(s.entry < 10 ? 4 : 2), C.accentCyan) : ''}
          ${s.target ? kvRow(L.target, s.target.toFixed(s.target < 10 ? 4 : 2), displayAction === 'BUY' ? C.accentGreen : C.accentRed) : ''}
          ${s.stopLoss ? kvRow(L.stopLoss, s.stopLoss.toFixed(s.stopLoss < 10 ? 4 : 2), C.accentRed) : ''}
          ${s.confidence ? kvRow(L.confidence, `${s.confidence}%`, finalSigColor) : ''}
        </div>`;
    } else {
      // ── DERIVE recommendation from available signals ──
      // V10: Enhanced multi-source recommendation engine
      // Uses: technical trend + news sentiment + price momentum + market analysis + trading signal
      // Confidence scales with the NUMBER and STRENGTH of agreeing signals
      let derivedDirection: 'long' | 'short' | 'wait' = 'wait';
      let derivedConfidence = 30;
      let derivedReason = '';

      const techDirection = bundle.technical?.trend.direction;
      const techStrength = bundle.technical?.trend.strength || 0;
      const techOverallSignal = bundle.technical?.overallSignal;
      const techOverallScore = bundle.technical?.overallScore || 0;
      const newsMomentum = bundle.newsSentiment?.momentum;
      const newsPositive = bundle.newsSentiment?.positivePercent || 0;
      const newsNegative = bundle.newsSentiment?.negativePercent || 0;
      const newsTotal = bundle.newsSentiment?.totalAnalyzed || 0;
      const priceChange = bundle.price?.changePercent || 0;
      const marketAnalysisSentiment = bundle.marketAnalysis?.sentiment;
      const marketAnalysisConfidence = bundle.marketAnalysis?.confidenceScore || 0;
      const activeSignalAction = bundle.signal?.action;

      // Score: weighted by signal strength — V10 adds more signals
      let score = 0;
      const reasons: string[] = [];

      if (techDirection === 'bullish') {
        score += 1.5;
        reasons.push(locale === 'ar' ? 'الاتجاه الفني صاعد' : 'Technical trend is bullish');
      } else if (techDirection === 'bearish') {
        score -= 1.5;
        reasons.push(locale === 'ar' ? 'الاتجاه الفني هابط' : 'Technical trend is bearish');
      }

      if (newsMomentum === 'bullish') {
        const newsWeight = Math.min(2, newsPositive / 50); // Stronger sentiment = more weight
        score += newsWeight;
        reasons.push(locale === 'ar' ? `مشاعر الأخبار إيجابية (${newsPositive}%)` : `News sentiment is positive (${newsPositive}%)`);
      } else if (newsMomentum === 'bearish') {
        const newsWeight = Math.min(2, newsNegative / 50); // e.g., 100% bearish = weight 2
        score -= newsWeight;
        reasons.push(locale === 'ar' ? `مشاعر الأخبار سلبية (${newsNegative}%)` : `News sentiment is negative (${newsNegative}%)`);
      }

      if (priceChange > 0.5) {
        score += 0.5;
        reasons.push(locale === 'ar' ? `السعر يرتفع (+${priceChange.toFixed(2)}%)` : `Price rising (+${priceChange.toFixed(2)}%)`);
      } else if (priceChange < -0.5) {
        score -= 0.5;
        reasons.push(locale === 'ar' ? `السعر ينخفض (${priceChange.toFixed(2)}%)` : `Price falling (${priceChange.toFixed(2)}%)`);
      }

      // Market analysis from DB
      if (bundle.marketAnalysis?.sentiment === 'bullish' || bundle.marketAnalysis?.sentiment === 'positive') {
        score += 1;
        reasons.push(locale === 'ar' ? 'التحليل السوقي صاعد' : 'Market analysis is bullish');
      } else if (bundle.marketAnalysis?.sentiment === 'bearish' || bundle.marketAnalysis?.sentiment === 'negative') {
        score -= 1;
        reasons.push(locale === 'ar' ? 'التحليل السوقي هابط' : 'Market analysis is bearish');
      }

      // V10: Active trading signal from DB (strong signal)
      if (activeSignalAction === 'BUY') {
        score += 2;
        reasons.push(locale === 'ar' ? 'إشارة تداول نشطة: شراء' : 'Active trading signal: BUY');
      } else if (activeSignalAction === 'SELL') {
        score -= 2;
        reasons.push(locale === 'ar' ? 'إشارة تداول نشطة: بيع' : 'Active trading signal: SELL');
      }

      // V10: Technical overall signal (stronger than just trend direction)
      if (techOverallSignal === 'bullish' && techOverallScore > 30) {
        score += 1;
        reasons.push(locale === 'ar' ? `مؤشر فني إيجابي (${techOverallScore})` : `Technical indicator bullish (${techOverallScore})`);
      } else if (techOverallSignal === 'bearish' && techOverallScore < -30) {
        score -= 1;
        reasons.push(locale === 'ar' ? `مؤشر فني سلبي (${techOverallScore})` : `Technical indicator bearish (${techOverallScore})`);
      }

      // V10: Market analysis confidence boost
      if (marketAnalysisConfidence >= 70 && marketAnalysisSentiment) {
        if (marketAnalysisSentiment === 'bullish' || marketAnalysisSentiment === 'positive') {
          score += 0.5;
          reasons.push(locale === 'ar' ? `تحليل سوقي عالي الثقة (${marketAnalysisConfidence}%)` : `High-confidence market analysis (${marketAnalysisConfidence}%)`);
        } else if (marketAnalysisSentiment === 'bearish' || marketAnalysisSentiment === 'negative') {
          score -= 0.5;
          reasons.push(locale === 'ar' ? `تحليل سوقي عالي الثقة (${marketAnalysisConfidence}%)` : `High-confidence market analysis (${marketAnalysisConfidence}%)`);
        }
      }

      // Determine direction and confidence — V10: Higher caps for multi-source consensus
      const absScore = Math.abs(score);
      const signalCount = reasons.length; // More agreeing signals = higher confidence
      
      if (score >= 2) {
        derivedDirection = 'long';
        // Strong consensus: 65-90% (V10: raised cap from 85 to 90)
        derivedConfidence = Math.min(90, 55 + absScore * 8 + (techStrength > 0 ? techStrength / 5 : 0) + signalCount * 2);
      } else if (score <= -2) {
        derivedDirection = 'short';
        derivedConfidence = Math.min(90, 55 + absScore * 8 + (techStrength > 0 ? techStrength / 5 : 0) + signalCount * 2);
      } else if (score > 0) {
        derivedDirection = 'long';
        // Moderate: 50-65%
        derivedConfidence = 50 + Math.round(absScore * 5) + signalCount;
      } else if (score < 0) {
        derivedDirection = 'short';
        derivedConfidence = 50 + Math.round(absScore * 5) + signalCount;
      } else {
        derivedDirection = 'wait';
        derivedConfidence = 30;
      }

      // V10: Boost confidence if news sentiment is very strong (80%+ one direction)
      if (newsMomentum === 'bearish' && newsNegative >= 80) {
        derivedConfidence = Math.max(derivedConfidence, 60);
      } else if (newsMomentum === 'bullish' && newsPositive >= 80) {
        derivedConfidence = Math.max(derivedConfidence, 60);
      }

      // V11: Boost confidence if we have a MarketAnalysis priceTarget (stronger signal)
      if (marketAnalysisConfidence >= 60 && marketAnalysisSentiment) {
        const maDirection = (marketAnalysisSentiment === 'bullish' || marketAnalysisSentiment === 'positive') ? 'long'
          : (marketAnalysisSentiment === 'bearish' || marketAnalysisSentiment === 'negative') ? 'short' : 'wait';
        if (maDirection === derivedDirection) {
          derivedConfidence = Math.min(95, derivedConfidence + 10);
          reasons.push(locale === 'ar' ? `تحليل سوقي يؤكد الاتجاه (${marketAnalysisConfidence}%)` : `Market analysis confirms direction (${marketAnalysisConfidence}%)`);
        }
      }

      // V11: If MarketAnalysis has priceTarget, add it as a reason
      if (bundle.marketAnalysis?.priceTarget && bundle.price?.current) {
        const targetDiff = ((bundle.marketAnalysis.priceTarget - bundle.price.current) / bundle.price.current * 100);
        if (Math.abs(targetDiff) > 1) {
          reasons.push(locale === 'ar'
            ? `الهدف السعري: ${bundle.marketAnalysis.priceTarget.toFixed(2)} (${targetDiff >= 0 ? '+' : ''}${targetDiff.toFixed(1)}%)`
            : `Price target: ${bundle.marketAnalysis.priceTarget.toFixed(2)} (${targetDiff >= 0 ? '+' : ''}${targetDiff.toFixed(1)}%)`);
        }
      }

      // V11: Raise max confidence to 95% when multiple sources agree
      derivedConfidence = Math.min(95, Math.max(20, Math.round(derivedConfidence)));
      const dirLabel = derivedDirection === 'long' ? L.direction_buy : derivedDirection === 'short' ? L.direction_sell : L.direction_wait;
      const dirColor = derivedDirection === 'long' ? C.accentGreen : derivedDirection === 'short' ? C.accentRed : C.accentYellow;
      const dirIcon = derivedDirection === 'long' ? '🟢' : derivedDirection === 'short' ? '🔴' : '🟡';

      // Calculate approximate entry/target/stop from price
      const price = bundle.price?.current;
      const entry = price || 0;
      const atr = bundle.technical?.atr || (price ? price * 0.005 : 0);

      // V11: Use MarketAnalysis priceTarget if available (more accurate than ATR-based)
      const marketPriceTarget = bundle.marketAnalysis?.priceTarget;

      content += `
        <div style="text-align: center; margin-bottom: 10px;">
          <div style="font-size: 20px; font-weight: 800; color: ${dirColor};">${dirIcon} ${dirLabel}</div>
        </div>`;

      // ── FIX: For WAIT direction, don't show contradictory entry/target/stop ──
      // Only show trade setup for long/short directions with meaningful ATR
      if (derivedDirection !== 'wait' && price && price > 0) {
        // V11: Use MarketAnalysis priceTarget if available and consistent with direction
        let target: number;
        let stopLoss: number;

        if (marketPriceTarget && marketPriceTarget > 0) {
          // Use the price target from MarketAnalysis (more accurate)
          target = marketPriceTarget;
          // Calculate stop loss based on risk/reward ratio
          const riskRewardRatio = 1.5; // Default R:R
          const distanceToTarget = Math.abs(target - entry);
          stopLoss = derivedDirection === 'long'
            ? entry - distanceToTarget / riskRewardRatio
            : entry + distanceToTarget / riskRewardRatio;
        } else if (atr > 0) {
          // Fall back to ATR-based calculation
          target = derivedDirection === 'long' ? entry + atr * 2 : entry - atr * 2;
          stopLoss = derivedDirection === 'long' ? entry - atr * 1.5 : entry + atr * 1.5;
        } else {
          // No ATR, no priceTarget — skip trade setup numbers
          target = 0;
          stopLoss = 0;
        }

        if (target > 0 && stopLoss > 0) {
          const rr = ((Math.abs(target - entry)) / (Math.abs(entry - stopLoss))).toFixed(1);
          content += `
          <div style="background: rgba(15,23,42,0.5); border-radius: 8px; padding: 8px 10px;">
            ${kvRow(L.entry, entry.toFixed(entry < 10 ? 4 : 2), C.accentCyan)}
            ${kvRow(L.target, target.toFixed(entry < 10 ? 4 : 2), derivedDirection === 'long' ? C.accentGreen : C.accentRed)}
            ${kvRow(L.stopLoss, stopLoss.toFixed(entry < 10 ? 4 : 2), C.accentRed)}
            ${kvRow(L.riskReward, `1:${rr}`, C.accentYellow)}
          </div>`;
        }
      } else if (derivedDirection === 'wait') {
        // For WAIT: show a clear message instead of contradictory numbers
        const waitMsg = locale === 'ar'
          ? 'لا يوجد اتجاه واضح حالياً. يُنصح بالانتظار حتى يتضح الاتجاه.'
          : locale === 'fr'
            ? 'Aucune tendance claire pour le moment. Il est conseillé d\'attendre.'
            : locale === 'tr'
              ? 'Şu anda net bir yön yok. Yön netleşene kadar beklemeniz önerilir.'
              : locale === 'es'
                ? 'Sin tendencia clara por el momento. Se aconseja esperar.'
                : 'No clear direction at the moment. Advisable to wait for direction confirmation.';
        content += `
          <div style="background: rgba(251,191,36,0.06); border: 1px solid rgba(251,191,36,0.15); border-radius: 8px; padding: 10px; text-align: center;">
            <span style="font-size: 12px; color: ${C.accentYellow}; line-height: 1.6;">${waitMsg}</span>
          </div>`;
      }

      // Show reasoning
      if (reasons.length > 0) {
        content += `
          <div style="margin-top: 8px; padding: 6px 10px; background: rgba(15,23,42,0.3); border-radius: 6px;">
            <div style="font-size: 9px; color: ${C.textMuted}; margin-bottom: 4px;">${locale === 'ar' ? 'أسباب التوصية:' : 'Reasoning:'}</div>
            ${reasons.map(r => `<div style="font-size: 10px; color: ${C.textSecondary};">• ${r}</div>`).join('')}
          </div>`;
      }

      content += `
        <div style="margin-top: 8px;">
          <span style="font-size: 10px; color: ${C.textSecondary};">${L.confidence}:</span>
          ${gaugeBar(derivedConfidence, dirColor)}
          <span style="font-size: 12px; font-weight: 700; color: ${dirColor}; font-family: 'JetBrains Mono', monospace;">${derivedConfidence}%</span>
        </div>`;

      // V14: Dynamic Position Management — risk calculator with adjustable ratios
      if (derivedDirection !== 'wait' && price && price > 0 && (atr > 0 || (bundle.technical?.tradeSetup && bundle.technical.tradeSetup.stopLoss > 0))) {
        const entryPrice = price;
        const slPrice = bundle.technical?.tradeSetup?.stopLoss || (derivedDirection === 'long' ? entryPrice - atr * 1.5 : entryPrice + atr * 1.5);
        const slDistance = Math.abs(entryPrice - slPrice);
        
        if (slDistance > 0) {
          // Position sizing examples for different account sizes and risk levels
          const riskLevels = [
            { label: locale === 'ar' ? 'محافظ (1%)' : 'Conservative (1%)', risk: 1, color: C.accentGreen },
            { label: locale === 'ar' ? 'معتدل (2%)' : 'Moderate (2%)', risk: 2, color: C.accentYellow },
            { label: locale === 'ar' ? 'جريء (3%)' : 'Aggressive (3%)', risk: 3, color: C.accentRed },
          ];
          const accountSize = 1000; // Default account size for example
          
          const positionRows = riskLevels.map(rl => {
            const riskAmount = accountSize * (rl.risk / 100);
            // Simplified position size (for stocks/forex without contract specs)
            const positionSize = (riskAmount / slDistance).toFixed(0);
            return `<tr>
              <td style="padding:5px 10px; border-bottom:1px solid ${C.divider}; color:${rl.color}; font-weight:600; font-size:11px;">${rl.label}</td>
              <td style="padding:5px 10px; border-bottom:1px solid ${C.divider}; color:#E2E8F0; font-size:11px; font-family:'JetBrains Mono',monospace;">$${riskAmount.toFixed(0)}</td>
              <td style="padding:5px 10px; border-bottom:1px solid ${C.divider}; color:#E2E8F0; font-size:11px; font-family:'JetBrains Mono',monospace;">${positionSize}</td>
            </tr>`;
          }).join('');

          content += `
          <div style="margin-top:10px; background:rgba(14,165,233,0.06); border:1px solid rgba(14,165,233,0.15); border-radius:8px; padding:8px 10px;">
            <div style="font-size:10px; font-weight:700; color:${C.accentCyan}; margin-bottom:6px;">
              💼 ${locale === 'ar' ? 'إدارة المركز (حساب $1,000)' : 'Position Management ($1,000 account)'}
            </div>
            <table style="width:100%; border-collapse:collapse; font-size:11px;">
              <tr>
                <th style="padding:4px 10px; color:${C.accentCyan}; text-align:${align}; font-size:10px; border-bottom:1px solid rgba(14,165,233,0.2);">${locale === 'ar' ? 'مستوى المخاطرة' : 'Risk Level'}</th>
                <th style="padding:4px 10px; color:${C.accentCyan}; text-align:${align}; font-size:10px; border-bottom:1px solid rgba(14,165,233,0.2);">${locale === 'ar' ? 'مبلغ المخاطرة' : 'Risk Amount'}</th>
                <th style="padding:4px 10px; color:${C.accentCyan}; text-align:${align}; font-size:10px; border-bottom:1px solid rgba(14,165,233,0.2);">${locale === 'ar' ? 'حجم المركز' : 'Position Size'}</th>
              </tr>
              ${positionRows}
            </table>
            <div style="font-size:9px; color:${C.textMuted}; margin-top:4px;">
              ${locale === 'ar' ? `وقف خسارة: ${slPrice.toFixed(2)} (مسافة: ${slDistance.toFixed(2)})` : `Stop Loss: ${slPrice.toFixed(2)} (Distance: ${slDistance.toFixed(2)})`}
              · ${locale === 'ar' ? 'اسأل عن حساب حجم العقد المحدد' : 'Ask for specific lot size calculation'}
            </div>
          </div>`;
        }
      }
    }

    cards.push(card(theme, L.recommendation, content));
  }

  // ─── 4. Active Signal Card ───
  if (bundle.signal && bundle.signal.action) {
    const s = bundle.signal;
    const sigColor = s.action === 'BUY' ? C.accentGreen : s.action === 'SELL' ? C.accentRed : C.accentYellow;
    const sigIcon = s.action === 'BUY' ? '🟢' : s.action === 'SELL' ? '🔴' : '🟡';

    let content = `
      <div style="text-align: center; margin-bottom: 10px;">
        <span style="font-size: 24px;">${sigIcon}</span>
        <span style="font-size: 20px; font-weight: 800; color: ${sigColor}; margin-${isRtl ? 'right' : 'left'}: 8px;">${s.action}</span>
      </div>
      <div style="background: rgba(15,23,42,0.5); border-radius: 8px; padding: 8px 10px;">
        ${s.entry ? kvRow(L.entry, s.entry.toFixed(2), C.accentCyan) : ''}
        ${s.target ? kvRow(L.target, s.target.toFixed(2), C.accentGreen) : ''}
        ${s.stopLoss ? kvRow(L.stopLoss, s.stopLoss.toFixed(2), C.accentRed) : ''}
        ${s.confidence ? kvRow(L.confidence, `${s.confidence}%`, sigColor) : ''}
      </div>`;

    if (s.createdAt) {
      content += `<div style="margin-top: 6px; text-align: ${align};"><span style="font-size: 9px; color: ${C.textMuted};">${L.lastUpdated}: ${s.createdAt.split('T')[0]}</span></div>`;
    }

    cards.push(card(themes.signal, L.signal, content));
  }

  // ─── 5. Fundamentals Card ───
  if (bundle.fundamentals) {
    const f = bundle.fundamentals;
    let content = `<div style="background: rgba(15,23,42,0.5); border-radius: 8px; padding: 8px 10px;">`;
    if (f.peRatio) content += kvRow('P/E', f.peRatio.toFixed(2), C.accentCyan);
    if (f.eps) content += kvRow('EPS', f.eps.toFixed(2), C.accentGreen);
    if (f.revenueGrowth !== null) content += kvRow('Revenue Growth', `${f.revenueGrowth.toFixed(1)}%`, f.revenueGrowth > 0 ? C.accentGreen : C.accentRed);
    if (f.profitMargin !== null) content += kvRow('Profit Margin', `${f.profitMargin.toFixed(1)}%`, f.profitMargin > 0 ? C.accentGreen : C.accentRed);
    if (f.roe !== null) content += kvRow('ROE', `${f.roe.toFixed(1)}%`, f.roe > 0 ? C.accentGreen : C.accentRed);
    if (f.rating) content += kvRow('Rating', f.rating, C.accentYellow);
    content += `</div>`;
    cards.push(card(themes.fundamentals, L.fundamental, content));
  }

  // ─── 6. Market Analysis Card (V10: Enhanced with price target range) ───
  if (bundle.marketAnalysis) {
    const ma = bundle.marketAnalysis;
    let content = '';
    if (ma.sentiment) {
      const sentColor = ma.sentiment === 'bullish' || ma.sentiment === 'positive' ? C.accentGreen
        : ma.sentiment === 'bearish' || ma.sentiment === 'negative' ? C.accentRed : C.accentYellow;
      const sentIcon = ma.sentiment === 'bullish' || ma.sentiment === 'positive' ? '📈'
        : ma.sentiment === 'bearish' || ma.sentiment === 'negative' ? '📉' : '↔️';
      const sentLabel = ma.sentiment === 'bullish' || ma.sentiment === 'positive'
        ? (locale === 'ar' ? 'صاعد' : locale === 'fr' ? 'Haussier' : locale === 'tr' ? 'Yükseliş' : locale === 'es' ? 'Alcista' : 'Bullish')
        : ma.sentiment === 'bearish' || ma.sentiment === 'negative'
        ? (locale === 'ar' ? 'هابط' : locale === 'fr' ? 'Baissier' : locale === 'tr' ? 'Düşüş' : locale === 'es' ? 'Bajista' : 'Bearish')
        : (locale === 'ar' ? 'محايد' : locale === 'fr' ? 'Neutre' : locale === 'tr' ? 'Nötr' : locale === 'es' ? 'Neutral' : 'Neutral');
      content += `<div style="text-align: center; margin-bottom: 8px;">
        <span style="font-size: 18px;">${sentIcon}</span>
        <span style="font-size: 14px; font-weight: 700; color: ${sentColor}; margin-left: 6px;">${sentLabel}</span>
      </div>`;
    }
    content += `<div style="background: rgba(15,23,42,0.5); border-radius: 8px; padding: 8px 10px;">`;
    if (ma.priceTarget) {
      const priceTargetLabel = locale === 'ar' ? 'الهدف السعري' : locale === 'fr' ? 'Objectif de prix' : locale === 'tr' ? 'Fiyat hedefi' : locale === 'es' ? 'Objetivo de precio' : 'Price Target';
      const currentPrice = bundle.price?.current;
      const targetDiff = currentPrice ? ((ma.priceTarget - currentPrice) / currentPrice * 100) : null;
      const targetDiffStr = targetDiff !== null ? (targetDiff >= 0 ? '+' : '') + targetDiff.toFixed(1) + '%' : '';
      const targetColor = targetDiff !== null ? (targetDiff >= 0 ? C.accentGreen : C.accentRed) : C.accentCyan;
      content += kvRow(priceTargetLabel, `${ma.priceTarget.toFixed(2)} ${targetDiffStr ? `(${targetDiffStr})` : ''}`, targetColor);
      // V10: Show price target range if we have both current price and target
      if (currentPrice && ma.priceTarget > 0) {
        const rangeLabel = locale === 'ar' ? 'المسافة للهدف' : locale === 'fr' ? 'Distance à l\'objectif' : locale === 'tr' ? 'Hedefe mesafe' : locale === 'es' ? 'Distancia al objetivo' : 'Distance to Target';
        const distance = Math.abs(ma.priceTarget - currentPrice);
        const distancePercent = Math.abs(targetDiff || 0).toFixed(1);
        content += kvRow(rangeLabel, `${distance.toFixed(2)} (${distancePercent}%)`, C.accentYellow);
      }
    }
    if (ma.confidenceScore) {
      const confLabel = locale === 'ar' ? 'ثقة التحليل' : locale === 'fr' ? 'Confiance de l\'analyse' : locale === 'tr' ? 'Analiz güveni' : locale === 'es' ? 'Confianza del análisis' : 'Analysis Confidence';
      content += `<div style="margin-top: 4px;">
        <span style="font-size: 10px; color: ${C.textSecondary};">${confLabel}:</span>
        ${gaugeBar(ma.confidenceScore, C.accentIndigo)}
        <span style="font-size: 12px; font-weight: 700; color: ${C.accentIndigo}; font-family: 'JetBrains Mono', monospace;">${ma.confidenceScore}%</span>
      </div>`;
    }
    content += `</div>`;
    cards.push(card(themes.analysis, L.marketAnalysis, content));
  }

  // ─── 7. News Card ───
  if (bundle.news.length > 0) {
    let content = '';
    for (const n of bundle.news.slice(0, 5)) {
      const sentIcon = n.sentiment === 'positive' ? '🟢' : n.sentiment === 'negative' ? '🔴' : '🟡';
      const sentColor = n.sentiment === 'positive' ? C.accentGreen : n.sentiment === 'negative' ? C.accentRed : C.accentYellow;
      content += `
        <div style="
          padding: 8px 10px;
          margin-bottom: 6px;
          background: rgba(15,23,42,0.4);
          border-radius: 8px;
          border-left: 3px solid ${sentColor};
          ${isRtl ? 'border-left: none; border-right: 3px solid ' + sentColor + ';' : ''}
        ">
          <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
            <span style="font-size: 10px;">${sentIcon}</span>
            <span style="font-size: 11px; font-weight: 700; color: ${C.textPrimary};">${n.title}</span>
          </div>
          ${n.summary ? `<div style="font-size: 10px; color: ${C.textMuted}; margin-top: 2px; line-height: 1.5;">${n.summary.slice(0, 150)}${n.summary.length > 150 ? '...' : ''}</div>` : ''}
        </div>`;
    }

    // Sentiment summary
    if (bundle.newsSentiment) {
      const ns = bundle.newsSentiment;
      const momColor = ns.momentum === 'bullish' ? C.accentGreen : ns.momentum === 'bearish' ? C.accentRed : C.accentYellow;
      const momLabel = ns.momentum === 'bullish' ? L.bullish : ns.momentum === 'bearish' ? L.bearish : L.mixed;
      const neutralPct = ns.neutralPercent ?? Math.max(0, 100 - ns.positivePercent - ns.negativePercent);
      content += `
        <div style="
          margin-top: 8px;
          padding: 8px 10px;
          background: rgba(15,23,42,0.5);
          border-radius: 8px;
          text-align: center;
        ">
          <div style="font-size: 11px; color: ${C.textSecondary}; margin-bottom: 4px;">${L.sentiment}: <strong style="color: ${momColor};">${momLabel}</strong></div>
          <div style="display: flex; gap: 12px; justify-content: center; font-size: 10px;">
            <span style="color: ${C.accentGreen};">🟢 ${ns.positivePercent}%</span>
            <span style="color: ${C.accentYellow};">🟡 ${neutralPct}%</span>
            <span style="color: ${C.accentRed};">🔴 ${ns.negativePercent}%</span>
          </div>
          ${gaugeBar(ns.positivePercent, C.accentGreen)}
          <div style="font-size: 9px; color: ${C.textMuted};">${ns.totalAnalyzed} ${L.articlesAnalyzed}</div>
        </div>`;
    }

    cards.push(card(themes.news, L.latestNews, content));
  }

  // ─── 8. Events Card (V14: Enhanced with impact classification) ───
  if (bundle.events.length > 0) {
    let content = '';
    
    // V14: Group events by impact level for better visual hierarchy
    const highImpact = bundle.events.filter(e => e.impact === 'high' || e.impact === 'critical');
    const medImpact = bundle.events.filter(e => e.impact === 'medium');
    const lowImpact = bundle.events.filter(e => e.impact === 'low' || (!e.impact));
    
    const renderEventGroup = (events: typeof bundle.events, groupLabel: string, groupIcon: string, impColor: string) => {
      if (events.length === 0) return '';
      let groupHtml = `<div style="margin-bottom:8px;">
        <div style="font-size:10px; font-weight:700; color:${impColor}; margin-bottom:4px; padding:2px 8px; background:${impColor}18; border-radius:4px; display:inline-block;">
          ${groupIcon} ${groupLabel}
        </div>`;
      for (const e of events.slice(0, 3)) {
        // V14: Add country flag if available
        const flag = e.country ? `${e.country} ` : '';
        groupHtml += `
        <div style="
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          margin-bottom: 4px;
          background: rgba(15,23,42,0.4);
          border-radius: 6px;
          border-${isRtl ? 'right' : 'left'}: 2px solid ${impColor}44;
        ">
          <div style="flex: 1;">
            <div style="font-size: 11px; font-weight: 600; color: ${C.textPrimary};">${flag}${e.eventName}</div>
            <div style="font-size: 9px; color: ${C.textMuted};">${e.eventDate?.split('T')[0] || ''}</div>
          </div>
          <div style="text-align: ${isRtl ? 'left' : 'right'}; font-size: 9px;">
            <div style="color: ${C.textSecondary};">${locale === 'ar' ? 'توقع' : 'Fcst'}: <span style="color:${C.accentCyan}; font-weight:600;">${e.forecast || '—'}</span></div>
            <div style="color: ${C.textMuted};">${locale === 'ar' ? 'سابق' : 'Prev'}: ${e.previous || '—'}</div>
          </div>
        </div>`;
      }
      groupHtml += '</div>';
      return groupHtml;
    };
    
    const highLabel = locale === 'ar' ? 'تأثير عالي' : locale === 'fr' ? 'Impact élevé' : locale === 'tr' ? 'Yüksek etki' : locale === 'es' ? 'Alto impacto' : 'High Impact';
    const medLabel = locale === 'ar' ? 'تأثير متوسط' : locale === 'fr' ? 'Impact moyen' : locale === 'tr' ? 'Orta etki' : locale === 'es' ? 'Impacto medio' : 'Medium Impact';
    const lowLabel = locale === 'ar' ? 'تأثير منخفض' : locale === 'fr' ? 'Faible impact' : locale === 'tr' ? 'Düşük etki' : locale === 'es' ? 'Bajo impacto' : 'Low Impact';
    
    content += renderEventGroup(highImpact, highLabel, '🔴', C.accentRed);
    content += renderEventGroup(medImpact, medLabel, '🟡', C.accentYellow);
    content += renderEventGroup(lowImpact, lowLabel, '🟢', C.accentGreen);
    
    cards.push(card(themes.events, L.upcomingEvents, content));
  }

  // ─── 9. Reports Card ───
  if (bundle.reports.length > 0) {
    let content = '';
    for (const r of bundle.reports) {
      content += `
        <div style="
          padding: 6px 10px;
          margin-bottom: 4px;
          background: rgba(15,23,42,0.4);
          border-radius: 6px;
          border-left: 3px solid ${C.accentIndigo};
          ${isRtl ? 'border-left: none; border-right: 3px solid ' + C.accentIndigo + ';' : ''}
        ">
          <div style="font-size: 11px; font-weight: 600; color: ${C.textPrimary};">${r.title}</div>
          <a href="/reports/${r.slug}" style="font-size: 9px; color: ${C.accentCyan}; text-decoration: none;">→ /reports/${r.slug}</a>
        </div>`;
    }
    cards.push(card(themes.analysis, L.reports, content));
  }

  // ─── 10. Risk Disclaimer Card ───
  cards.push(`
    <div style="
      padding: 8px 14px;
      background: rgba(251,191,36,0.06);
      border: 1px solid rgba(251,191,36,0.15);
      border-radius: 8px;
      direction: ${dir};
      font-family: ${fontFamily};
      margin-top: 4px;
    ">
      <div style="display: flex; align-items: flex-start; gap: 6px;">
        <span style="font-size: 12px;">⚠️</span>
        <span style="font-size: 10px; color: ${C.textMuted}; line-height: 1.6;">${L.riskDisclaimer}</span>
      </div>
    </div>
  `);

  // ─── 11. Data Sources Footer ───
  const dataSources: string[] = [];
  if (bundle.price) dataSources.push(locale === 'ar' ? 'السعر' : 'price');
  if (bundle.technical) dataSources.push(locale === 'ar' ? 'الفني' : 'technical');
  if (bundle.signal?.action) dataSources.push(locale === 'ar' ? 'الإشارة' : 'signal');
  if (bundle.news.length > 0) dataSources.push(locale === 'ar' ? 'الأخبار' : 'news');
  if (bundle.events.length > 0) dataSources.push(locale === 'ar' ? 'الأحداث' : 'events');
  if (bundle.marketAnalysis) dataSources.push(locale === 'ar' ? 'التحليل' : 'analysis');
  if (bundle.fundamentals) dataSources.push(locale === 'ar' ? 'الأساسيات' : 'fundamentals');
  if (bundle.reports.length > 0) dataSources.push(locale === 'ar' ? 'التقارير' : 'reports');

  if (dataSources.length > 0) {
    const sourcesLabel = locale === 'ar' ? 'المصادر' : 'Sources';
    const liveDataLabel = locale === 'ar' ? 'بيانات السوق المباشرة' : 'Live market data';
    cards.push(`
      <div style="
        padding: 4px 10px;
        direction: ${dir};
        font-family: ${fontFamily};
        margin-top: 2px;
      ">
        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          <span style="font-size: 9px; color: ${C.textMuted};">${sourcesLabel}:</span>
          ${dataSources.map(s => `<span style="
            display: inline-block;
            padding: 1px 6px;
            border-radius: 4px;
            font-size: 8px;
            font-weight: 600;
            color: ${C.accentCyan};
            background: rgba(56,189,248,0.1);
            border: 1px solid rgba(56,189,248,0.2);
          ">${s}</span>`).join('')}
        </div>
      </div>
    `);
  }

  // ─── Wrap all cards ───
  return `<div style="
    direction: ${dir};
    font-family: ${fontFamily};
    max-width: 100%;
  ">
    ${cards.join('')}
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// AGENTIC AI ANALYSIS — The assistant THINKS and UNDERSTANDS the data
// ═══════════════════════════════════════════════════════════════════════
// This is what makes the assistant a TRUE AGENT, not a template machine.
// It receives the real data + the user's question, THINKS about them,
// and generates an understanding-based, professional analysis.
//
// KEY PRINCIPLE: The AI never invents numbers — every number comes from
// the real data context. But the ANALYSIS and REASONING are genuine AI.
// ═══════════════════════════════════════════════════════════════════════

import { chatCompletion } from '@/lib/ai-provider';

// ── Robust markdown-to-HTML cleanup for AI content ──
// Handles all common markdown formats that AI might still emit despite prompts.
function cleanupAIContent(raw: string, isRtl: boolean): string {
  let html = raw;
  const align = isRtl ? 'right' : 'left';

  // 1. Convert markdown tables to HTML tables (MUST be done first before other replacements)
  // Handle tables with alignment colons like |:---|:---:|
  html = html.replace(/\|(.+)\|\n\|[:\-\s|]+\|\n((?:\|.+,\n?)+)/g, (_match, headerRow: string, bodyRows: string) => {
    const headers = headerRow.split('|').map((h: string) => h.trim()).filter(Boolean);
    const rows = bodyRows.trim().split('\n').map((row: string) =>
      row.split('|').map((c: string) => c.trim()).filter(Boolean)
    ).filter((r: string[]) => r.length > 0);

    let table = `<table style="width:100%; border-collapse:collapse; margin:10px 0; font-size:12px;">`;
    table += '<tr>' + headers.map((h: string) =>
      `<th style="padding:8px 12px; background:rgba(168,85,247,0.1); color:#C084FC; text-align:${align}; border-bottom:2px solid rgba(168,85,247,0.3);">${h}</th>`
    ).join('') + '</tr>';
    for (const row of rows) {
      table += '<tr>' + row.map((c: string) =>
        `<td style="padding:6px 12px; border-bottom:1px solid rgba(99,102,241,0.1); color:#E2E8F0;">${c}</td>`
      ).join('') + '</tr>';
    }
    table += '</table>';
    return table;
  });

  // 2. Convert ### and ## headers to h3
  html = html.replace(/^#{1,3}\s+(.+)$/gm, '<h3 style="color: #C084FC; font-size: 14px; font-weight: 700; margin: 14px 0 8px 0; padding-bottom: 4px; border-bottom: 1px solid rgba(168,85,247,0.2);">$1</h3>');

  // 3. Convert bold **text** → <strong>
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="color: #F1F5F9;">$1</strong>');

  // 4. Convert italic *text* → <em> (but not inside already converted strong)
  html = html.replace(/(?<!<)\*(.+?)\*(?!>)/g, '<em>$1</em>');

  // 5. Convert --- or *** or ___ separators to styled hr
  html = html.replace(/^(---+|\*\*\*+|___+)$/gm, '<hr style="border: none; border-top: 1px solid rgba(168,85,247,0.15); margin: 12px 0;">');

  // 6. Convert numbered lists: "1. text" → <ol><li>
  html = html.replace(/((?:^\d+\.\s+.+$\n?)+)/gm, (match) => {
    const items = match.trim().split('\n').map((line: string) => {
      const text = line.replace(/^\d+\.\s+/, '');
      return `<li style="margin:4px 0; line-height:1.8; color:#E2E8F0;">${text}</li>`;
    }).join('');
    return `<ol style="margin:8px 0; padding-${isRtl ? 'right' : 'left'}:20px; color:#E2E8F0;">${items}</ol>`;
  });

  // 7. Convert bullet lists: "- text" or "* text" → <ul><li>
  html = html.replace(/((?:^[-*]\s+.+$\n?)+)/gm, (match) => {
    const items = match.trim().split('\n').map((line: string) => {
      const text = line.replace(/^[-*]\s+/, '');
      return `<li style="margin:4px 0; line-height:1.8; color:#E2E8F0;">${text}</li>`;
    }).join('');
    return `<ul style="margin:8px 0; padding-${isRtl ? 'right' : 'left'}:20px; color:#E2E8F0;">${items}</ul>`;
  });

  // 8. Convert double newlines to paragraph breaks
  html = html.replace(/\n{2,}/g, '</p><p style="margin: 8px 0; line-height: 1.9; color: #E2E8F0; font-size: 13px;">');

  // 9. Convert single newlines to <br>
  html = html.replace(/\n/g, '<br>');

  // 10. Clean up any empty paragraph tags
  html = html.replace(/<p[^>]*>\s*<\/p>/g, '');
  html = html.replace(/<p[^>]*><br><\/p>/g, '');

  // 11. Remove any remaining bare markdown artifacts
  html = html.replace(/^\|/gm, ''); // Remove pipe characters at start of lines
  html = html.replace(/\|$/gm, ''); // Remove pipe characters at end of lines

  return html;
}

export async function buildAgenticAnalysis(
  userQuestion: string,
  dataContext: string,
  locale: Locale,
  bundle: DataBundle,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string> {
  const isRtl = locale === 'ar';
  const dir = isRtl ? 'rtl' : 'ltr';
  const fontFamily = locale === 'ar'
    ? "'Readex Pro', 'Noto Sans Arabic', 'Segoe UI', sans-serif"
    : "'Inter', 'Segoe UI', 'Noto Sans', sans-serif";

  // ── Build intelligent system prompt based on the question type ──
  const questionType = detectQuestionType(userQuestion, locale);

  const SYSTEM_PROMPTS: Record<Locale, string> = {
    ar: `أنت مساعد "رؤى" الذكي للتداول — وكيل ذكاء اصطناعي حقيقي يبحث ويفكر ويحلل.

لديك بيانات حقيقية ومباشرة عن الأصل المالي. مهمتك:
1. فهم سؤال المستخدم بدقة
2. تحليل البيانات المتاحة بعمق
3. إعطاء إجابة احترافية مبنية على الفهم الحقيقي للبيانات

⚠️ قواعد صارمة:
- لا تخترع أي أرقام — كل رقم يجب أن يأتي من البيانات المقدمة فقط
- أجب بالعربية فقط — لا حروف أجنبية
- لا تستخدم قوالب جاهزة — اكتب بفهم حقيقي كمحلل محترف
- كن محدداً: اذكر الأرقام والمستويات من البيانات الحقيقية

🔴 تنسيق HTML المطلوب (إلزامي جداً — لا تستخدم Markdown أبداً):

للعناوين الفرعية:
<h3 style="color: #C084FC; font-size: 14px; font-weight: 700; margin: 14px 0 8px 0; padding-bottom: 4px; border-bottom: 1px solid rgba(168,85,247,0.2);">عنوان فرعي</h3>

للفقرات:
<p style="margin: 8px 0; line-height: 1.9; color: #E2E8F0; font-size: 13px;">نص الفقرة هنا</p>

للجداول:
<table style="width:100%; border-collapse:collapse; margin:10px 0; font-size:12px;">
  <tr>
    <th style="padding:8px 12px; background:rgba(168,85,247,0.1); color:#C084FC; text-align:right; border-bottom:2px solid rgba(168,85,247,0.3);">العنوان</th>
    <th style="padding:8px 12px; background:rgba(168,85,247,0.1); color:#C084FC; text-align:right; border-bottom:2px solid rgba(168,85,247,0.3);">القيمة</th>
  </tr>
  <tr>
    <td style="padding:6px 12px; border-bottom:1px solid rgba(99,102,241,0.1); color:#94A3B8;">المفتاح</td>
    <td style="padding:6px 12px; border-bottom:1px solid rgba(99,102,241,0.1); color:#E2E8F0; font-weight:600;">القيمة</td>
  </tr>
</table>

للنقاط المهمة (مميزة بلون):
<div style="background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.2); border-radius:8px; padding:10px 12px; margin:8px 0;">
  <span style="color:#4ADE80; font-weight:700;">✅ نقطة إيجابية:</span> <span style="color:#E2E8F0;">النص هنا</span>
</div>

<div style="background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 12px; margin:8px 0;">
  <span style="color:#F87171; font-weight:700;">🔴 نقطة سلبية:</span> <span style="color:#E2E8F0;">النص هنا</span>
</div>

<div style="background:rgba(251,191,36,0.08); border:1px solid rgba(251,191,36,0.2); border-radius:8px; padding:10px 12px; margin:8px 0;">
  <span style="color:#FBBF24; font-weight:700;">⚠️ تنبيه:</span> <span style="color:#E2E8F0;">النص هنا</span>
</div>

للقوائم:
<ul style="margin:8px 0; padding-right:20px; color:#E2E8F0;">
  <li style="margin:4px 0; line-height:1.8;">عنصر القائمة</li>
</ul>

🔴 ممنوع تماماً:
- لا تستخدم ### أو ## أو # (استخدم h3 فقط)
- لا تستخدم | جدول | (استخدم table فقط)
- لا تستخدم --- أو *** (استخدم hr فقط)
- لا تستخدم **نص** (استخدم strong فقط)
- لا تستخدم - أو * للقوائم (استخدم ul/li فقط)
- لا تستخدم 1. 2. 3. (استخدم ol/li فقط)`,
    en: `You are the Rouaa AI Trading Assistant — a true AI agent that searches, thinks, and analyzes.

You have REAL, LIVE data about a financial asset. Your mission:
1. Understand the user's question precisely
2. Analyze the available data in depth
3. Give a professional answer based on genuine understanding of the data

⚠️ Strict rules:
- NEVER invent numbers — every number must come from the provided data only
- Answer in English only
- Do NOT use templates — write with genuine understanding as a professional analyst
- Be specific: mention actual numbers and levels from the real data

🔴 Required HTML format (MANDATORY — NEVER use Markdown):

For subheadings:
<h3 style="color: #C084FC; font-size: 14px; font-weight: 700; margin: 14px 0 8px 0; padding-bottom: 4px; border-bottom: 1px solid rgba(168,85,247,0.2);">Subheading</h3>

For paragraphs:
<p style="margin: 8px 0; line-height: 1.9; color: #E2E8F0; font-size: 13px;">Paragraph text here</p>

For tables:
<table style="width:100%; border-collapse:collapse; margin:10px 0; font-size:12px;">
  <tr>
    <th style="padding:8px 12px; background:rgba(168,85,247,0.1); color:#C084FC; text-align:left; border-bottom:2px solid rgba(168,85,247,0.3);">Label</th>
    <th style="padding:8px 12px; background:rgba(168,85,247,0.1); color:#C084FC; text-align:left; border-bottom:2px solid rgba(168,85,247,0.3);">Value</th>
  </tr>
  <tr>
    <td style="padding:6px 12px; border-bottom:1px solid rgba(99,102,241,0.1); color:#94A3B8;">Key</td>
    <td style="padding:6px 12px; border-bottom:1px solid rgba(99,102,241,0.1); color:#E2E8F0; font-weight:600;">Value</td>
  </tr>
</table>

For key points (color-coded):
<div style="background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.2); border-radius:8px; padding:10px 12px; margin:8px 0;">
  <span style="color:#4ADE80; font-weight:700;">✅ Positive:</span> <span style="color:#E2E8F0;">Text here</span>
</div>

<div style="background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 12px; margin:8px 0;">
  <span style="color:#F87171; font-weight:700;">🔴 Negative:</span> <span style="color:#E2E8F0;">Text here</span>
</div>

<div style="background:rgba(251,191,36,0.08); border:1px solid rgba(251,191,36,0.2); border-radius:8px; padding:10px 12px; margin:8px 0;">
  <span style="color:#FBBF24; font-weight:700;">⚠️ Warning:</span> <span style="color:#E2E8F0;">Text here</span>
</div>

For lists:
<ul style="margin:8px 0; padding-left:20px; color:#E2E8F0;">
  <li style="margin:4px 0; line-height:1.8;">List item</li>
</ul>

🔴 Absolutely forbidden:
- Do NOT use ### or ## or # (use h3 only)
- Do NOT use | table | (use table only)
- Do NOT use --- or *** (use hr only)
- Do NOT use **text** (use strong only)
- Do NOT use - or * for lists (use ul/li only)
- Do NOT use 1. 2. 3. (use ol/li only)`,
    fr: `Vous êtes l'assistant IA Rouaa — un véritable agent IA qui recherche, réfléchit et analyse.

Vous disposez de données RÉELLES sur un actif financier. Votre mission :
1. Comprendre précisément la question de l'utilisateur
2. Analyser les données disponibles en profondeur
3. Donner une réponse professionnelle basée sur la compréhension réelle des données

⚠️ Règles strictes :
- N'inventez JAMAIS de chiffres — chaque nombre doit venir des données fournies uniquement
- Répondez en français uniquement
- N'utilisez PAS de modèles — écrivez avec une compréhension authentique
- Soyez précis : mentionnez les chiffres et niveaux réels des données

🔴 Format HTML requis (OBLIGATOIRE — JAMAIS de Markdown) :

Pour les sous-titres :
<h3 style="color: #C084FC; font-size: 14px; font-weight: 700; margin: 14px 0 8px 0; padding-bottom: 4px; border-bottom: 1px solid rgba(168,85,247,0.2);">Sous-titre</h3>

Pour les paragraphes :
<p style="margin: 8px 0; line-height: 1.9; color: #E2E8F0; font-size: 13px;">Texte du paragraphe</p>

Pour les tableaux :
<table style="width:100%; border-collapse:collapse; margin:10px 0; font-size:12px;">
  <tr>
    <th style="padding:8px 12px; background:rgba(168,85,247,0.1); color:#C084FC; text-align:left; border-bottom:2px solid rgba(168,85,247,0.3);">Libellé</th>
    <th style="padding:8px 12px; background:rgba(168,85,247,0.1); color:#C084FC; text-align:left; border-bottom:2px solid rgba(168,85,247,0.3);">Valeur</th>
  </tr>
  <tr>
    <td style="padding:6px 12px; border-bottom:1px solid rgba(99,102,241,0.1); color:#94A3B8;">Clé</td>
    <td style="padding:6px 12px; border-bottom:1px solid rgba(99,102,241,0.1); color:#E2E8F0; font-weight:600;">Valeur</td>
  </tr>
</table>

🔴 Interdit absolument :
- PAS de ### ou ## ou # (utilisez h3 uniquement)
- PAS de | tableau | (utilisez table uniquement)
- PAS de --- ou *** (utilisez hr uniquement)
- PAS de **texte** (utilisez strong uniquement)`,
    tr: `Siz Rouaa AI Ticaret Asistanısınız — arayan, düşünen ve analiz eden gerçek bir AI ajanı.

Bir finansal varlık hakkında GERÇEK, CANLI verileriniz var. Göreviniz:
1. Kullanıcının sorusunu tam olarak anlamak
2. Mevcut verileri derinlemesine analiz etmek
3. Verilerin gerçek anlaşılmasına dayalı profesyonel bir yanıt vermek

⚠️ Katı kurallar:
- Asla sayı uydurmayın — her sayı sadece sağlanan verilerden gelmelidir
- SADECE Türkçe yanıt verin
- Şablon KULLANMAYIN — gerçek bir analist olarak gerçek anlayışla yazın

🔴 Gerekli HTML formatı (ZORUNLU — ASLA Markdown kullanmayın):

Alt başlıklar için:
<h3 style="color: #C084FC; font-size: 14px; font-weight: 700; margin: 14px 0 8px 0; padding-bottom: 4px; border-bottom: 1px solid rgba(168,85,247,0.2);">Alt başlık</h3>

Paragraflar için:
<p style="margin: 8px 0; line-height: 1.9; color: #E2E8F0; font-size: 13px;">Paragraf metni</p>

🔴 Kesinlikle yasak:
- ### veya ## veya # kullanmayın (sadece h3 kullanın)
- | tablo | kullanmayın (sadece table kullanın)
- --- veya *** kullanmayın (sadece hr kullanın)`,
    es: `Usted es el asistente de IA de Rouaa — un verdadero agente de IA que busca, piensa y analiza.

Tiene datos REALES sobre un activo financiero. Su misión:
1. Comprender precisamente la pregunta del usuario
2. Analizar los datos disponibles en profundidad
3. Dar una respuesta profesional basada en la comprensión genuina de los datos

⚠️ Reglas estrictas:
- NUNCA invente números — cada número debe provenir solo de los datos proporcionados
- Responda SOLO en español
- NO use plantillas — escriba con comprensión genuina como analista profesional

🔴 Formato HTML requerido (OBLIGATORIO — NUNCA use Markdown):

Para subtítulos:
<h3 style="color: #C084FC; font-size: 14px; font-weight: 700; margin: 14px 0 8px 0; padding-bottom: 4px; border-bottom: 1px solid rgba(168,85,247,0.2);">Subtítulo</h3>

Para párrafos:
<p style="margin: 8px 0; line-height: 1.9; color: #E2E8F0; font-size: 13px;">Texto del párrafo</p>

🔴 Absolutamente prohibido:
- NO use ### o ## o # (use solo h3)
- NO use | tabla | (use solo table)
- NO use --- o *** (use solo hr)`,
  };

  // ── Build conversation context from history ──
  const recentHistory = history?.slice(-6) || [];
  const historyContext = recentHistory.length > 0
    ? recentHistory.map(h => `${h.role === 'user' ? 'المستخدم' : 'المساعد'}: ${h.content.slice(0, 200)}`).join('\n')
    : '';

  // ── Build the user message with data context ──
  const userPrompt = locale === 'ar'
    ? `سياق المحادثة السابقة:
${historyContext || 'لا يوجد سياق سابق'}

البيانات الحقيقية المتاحة:
${dataContext}

سؤال المستخدم: ${userQuestion}

أجب بفهم حقيقي واحترافية. استخدم HTML فقط (لا ماركداون). نظّم بفقرات واضحة وعناوين فرعية.`
    : `Previous conversation context:
${historyContext || 'No previous context'}

Available real data:
${dataContext}

User's question: ${userQuestion}

Answer with genuine understanding and professionalism. Use HTML only (no markdown). Organize with clear paragraphs and subheadings.`;

  // ── Call AI ──
  const result = await chatCompletion(
    [
      { role: 'system', content: SYSTEM_PROMPTS[locale] || SYSTEM_PROMPTS.en },
      { role: 'user', content: userPrompt },
    ],
    {
      temperature: 0.4,
      maxTokens: 2000,
      locale,
      priority: 'generation',
    }
  );

  let aiContent = result.content || '';
  if (!aiContent || aiContent.trim().length < 20) return '';

  // ── Wrap the AI analysis in a professional HTML card ──
  const themeColor = questionType === 'recommendation' ? '#34D399'
    : questionType === 'news_impact' ? '#38BDF8'
    : questionType === 'comparison' ? '#C084FC'
    : questionType === 'entry_timing' ? '#FB923C'
    : questionType === 'risk_assessment' ? '#F87171'
    : questionType === 'technical_deep' ? '#A78BFA'
    : '#818CF8';

  const analysisTitle: Record<Locale, string> = {
    ar: questionType === 'recommendation' ? 'تحليل التوصية' 
      : questionType === 'news_impact' ? 'تأثير الأخبار على السعر'
      : questionType === 'comparison' ? 'المقارنة التحليلية'
      : questionType === 'entry_timing' ? 'تحليل توقيت الدخول'
      : questionType === 'risk_assessment' ? 'تقييم المخاطر'
      : questionType === 'technical_deep' ? 'التحليل الفني المتعمق'
      : 'التحليل الذكي',
    en: questionType === 'recommendation' ? 'Recommendation Analysis'
      : questionType === 'news_impact' ? 'News Impact Analysis'
      : questionType === 'comparison' ? 'Comparative Analysis'
      : questionType === 'entry_timing' ? 'Entry Timing Analysis'
      : questionType === 'risk_assessment' ? 'Risk Assessment'
      : questionType === 'technical_deep' ? 'Deep Technical Analysis'
      : 'AI Analysis',
    fr: questionType === 'recommendation' ? 'Analyse de la recommandation'
      : questionType === 'news_impact' ? 'Analyse de l\'impact des nouvelles'
      : questionType === 'entry_timing' ? 'Analyse du timing d\'entrée'
      : questionType === 'risk_assessment' ? 'Évaluation des risques'
      : questionType === 'technical_deep' ? 'Analyse technique approfondie'
      : 'Analyse IA',
    tr: questionType === 'recommendation' ? 'Tavsiye Analizi'
      : questionType === 'news_impact' ? 'Haber Etki Analizi'
      : questionType === 'entry_timing' ? 'Giriş Zamanlaması Analizi'
      : questionType === 'risk_assessment' ? 'Risk Değerlendirmesi'
      : questionType === 'technical_deep' ? 'Derin Teknik Analiz'
      : 'AI Analizi',
    es: questionType === 'recommendation' ? 'Análisis de recomendación'
      : questionType === 'news_impact' ? 'Análisis de impacto de noticias'
      : questionType === 'entry_timing' ? 'Análisis de timing de entrada'
      : questionType === 'risk_assessment' ? 'Evaluación de riesgos'
      : questionType === 'technical_deep' ? 'Análisis técnico profundo'
      : 'Análisis IA',
  };

  // Clean up AI content: robust markdown-to-HTML conversion
  aiContent = cleanupAIContent(aiContent, isRtl);

  return `
<div style="
  background: #1E293B;
  border: 1px solid ${themeColor}33;
  border-radius: 12px;
  overflow: hidden;
  margin-top: 10px;
  box-shadow: 0 4px 24px ${themeColor}12;
  direction: ${dir};
  font-family: ${fontFamily};
">
  <div style="
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: ${themeColor}0F;
    border-bottom: 1px solid ${themeColor}33;
  ">
    <span style="font-size: 16px;">🧠</span>
    <span style="font-size: 12px; font-weight: 700; color: ${themeColor}; letter-spacing: 0.3px; text-transform: uppercase;">
      ${analysisTitle[locale] || analysisTitle.en}
    </span>
  </div>
  <div style="padding: 14px 16px; color: #E2E8F0; font-size: 13px; line-height: 1.9;">
    ${aiContent}
  </div>
</div>`;
}

// ── Detect what TYPE of question the user is asking ──
// V14: Enhanced with more question types for better agentic responses
function detectQuestionType(message: string, locale: Locale): 'recommendation' | 'news_impact' | 'comparison' | 'entry_timing' | 'risk_assessment' | 'technical_deep' | 'general' {
  const msgLower = message.toLowerCase();

  // Technical deep-dive questions
  const techKeywords = [
    'مؤشر', 'مؤشرات', 'فني', 'تحليل فني', 'ماذا يقول الفني', 'rsi', 'macd', 'بولينجر',
    'stochastic', 'ichimoku', 'إشكيموكو', 'ستوكاستك', 'متوسط متحرك', 'sma', 'ema',
    'indicator', 'technical', 'oscillator', 'moving average', 'overbought', 'oversold',
    'indicateur', 'technique', 'momentum', ' göstergeleri', 'indicador', 'técnico',
  ];
  if (techKeywords.some(k => msgLower.includes(k))) return 'technical_deep';

  // Entry timing questions
  const entryKeywords = [
    'متى أدخل', 'وقت الدخول', 'أفضل وقت', 'متى أشتري', 'متى أبيع', 'نقطة الدخول',
    'when to enter', 'when to buy', 'when to sell', 'best time', 'entry point', 'timing',
    'quand entrer', 'quand acheter', 'ne zaman girmeli', 'cuándo entrar', 'cuándo comprar',
    'دخول', 'أدخل', 'اشتري',
  ];
  if (entryKeywords.some(k => msgLower.includes(k))) return 'entry_timing';

  // Risk assessment questions
  const riskKeywords = [
    'مخاطرة', 'خطر', 'مخاطر', 'وقف خسارة', 'ستوب', 'حجم الصفقة', 'حجم العقد',
    'risk', 'stop loss', 'position size', 'lot size', 'how much', 'can I afford',
    'risque', 'perte', 'position', 'lot', 'risk', 'stop', 'pozisyon', 'riesgo', 'pérdida',
    'كم أخسر', 'كم أكسب', 'كم المبلغ',
  ];
  if (riskKeywords.some(k => msgLower.includes(k))) return 'risk_assessment';

  // Recommendation strength questions
  const recKeywords = [
    'قوية', 'قوي', 'توصية', 'هل تنصح', 'هل أوصي', 'مدى قوة', 'قوة التوصية',
    'strong', 'strength', 'recommendation', 'would you recommend', 'how strong',
    'forte', 'recommandation', 'tavsiye', 'güçlü', 'recomendación',
  ];
  if (recKeywords.some(k => msgLower.includes(k))) return 'recommendation';

  // News impact questions
  const newsKeywords = [
    'تأثير', 'أثر', 'الأخبار', 'خبر', 'كيف أثر', 'ما تأثير',
    'impact', 'effect', 'affect', 'news effect', 'how does news',
    'effet', 'etki', 'impacto', 'efecto',
  ];
  if (newsKeywords.some(k => msgLower.includes(k))) return 'news_impact';

  // Comparison questions
  const compKeywords = [
    'مقارنة', 'قارن', 'أفضل', 'أيهم', 'أيهما',
    'compare', 'versus', 'vs', 'better', 'which one',
    'comparer', 'karşılaştır', 'comparar',
  ];
  if (compKeywords.some(k => msgLower.includes(k))) return 'comparison';

  return 'general';
}
