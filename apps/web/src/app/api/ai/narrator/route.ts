import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { buildScannerResult, fetchMarketContext } from '@/lib/trading-intelligence'

type KeywordColor = 'success' | 'accent' | 'danger' | 'amber'

type NarratorPayload = {
  narrative: string
  summary: string
  bullCase: string
  bearCase: string
  keyRisk: string
  nextTrigger: string
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'volatile'
  keywords: Array<{ word: string; color: KeywordColor }>
  confidence: number
  risk: 'Low' | 'Medium' | 'High'
  symbol: string
  source: string
  timestamp: string
  degraded?: boolean
}

// ── Multilingual text templates ──
type LangTemplates = {
  summaryBuy: (symbol: string, tf: string) => string
  summarySell: (symbol: string, tf: string) => string
  summaryNeutral: (symbol: string, tf: string) => string
  summaryNoData: (symbol: string) => string
  bullCaseSupported: (reasons: string) => string
  bullCaseNeedsRecovery: string
  bearCaseSupported: (reasons: string) => string
  bearCaseMomentumLoss: string
  riskDegraded: string
  riskStaleFeed: string
  riskHighVolatility: string
  riskMedium: string
  triggerBuy: (price: string) => string
  triggerSell: (price: string) => string
  triggerNeutral: string
  narrativeReason: (reason: string) => string
  narrativeNewsConsidered: string
  narrativeNoNews: string
  keywordPartialData: string
  keywordLiveContext: string
}

const T: Record<string, LangTemplates> = {
  ar: {
    summaryBuy: (symbol: string, tf: string) => `${symbol} في حالة زخم صاعد على ${tf}.`,
    summarySell: (symbol: string, tf: string) => `${symbol} في حالة ضغط بيعي على ${tf}.`,
    summaryNeutral: (symbol: string, tf: string) => `${symbol} في حالة ترقب على ${tf}.`,
    summaryNoData: (symbol: string) => `لا توجد قراءة مكتملة لـ ${symbol} الآن.`,
    bullCaseSupported: (reasons: string) => `السيناريو الإيجابي مدعوم عبر ${reasons}.`,
    bullCaseNeedsRecovery: 'السيناريو الإيجابي يحتاج عودة السعر فوق مناطق التراجع الحالية وتأكيد من الإطار الأعلى.',
    bearCaseSupported: (reasons: string) => `السيناريو السلبي مدعوم عبر ${reasons}.`,
    bearCaseMomentumLoss: 'السيناريو السلبي يظهر إذا فشل السعر في الحفاظ على الزخم الحالي أو تدهورت جودة البيانات.',
    riskDegraded: 'المخاطرة الأساسية هنا هي العمل على بيانات جزئية أو متأخرة.',
    riskStaleFeed: 'جودة التغذية ليست مثالية، وقد تتأخر الإشارة عن السوق الحقيقي.',
    riskHighVolatility: 'التذبذب مرتفع، لذلك أي دخول يحتاج حجمًا محافظًا.',
    riskMedium: 'الخطر الحالي متوسط ويعتمد على ثبات الزخم.',
    triggerBuy: (price: string) => `المحفز التالي هو استمرار السعر فوق ${price} مع بقاء الثقة فوق 60.`,
    triggerSell: (price: string) => `المحفز التالي هو استمرار الضغط دون ${price} مع ضعف محاولات الارتداد.`,
    triggerNeutral: 'المحفز التالي هو ظهور انحياز أوضح من السكانر أو خبر مؤثر يغير النظام.',
    narrativeReason: (reason: string) => `السبب الأقوى الآن: ${reason}.`,
    narrativeNewsConsidered: 'الأخبار الأخيرة أُخذت في الحسبان ضمن السرد.',
    narrativeNoNews: 'لا توجد أخبار حديثة كافية، لذا يركّز السرد على السعر والبنية الفنية.',
    keywordPartialData: 'بيانات جزئية',
    keywordLiveContext: 'سياق مباشر',
  },
  en: {
    summaryBuy: (symbol: string, tf: string) => `${symbol} is in bullish momentum on ${tf}.`,
    summarySell: (symbol: string, tf: string) => `${symbol} is under selling pressure on ${tf}.`,
    summaryNeutral: (symbol: string, tf: string) => `${symbol} is in a wait-and-see mode on ${tf}.`,
    summaryNoData: (symbol: string) => `No complete reading available for ${symbol} at the moment.`,
    bullCaseSupported: (reasons: string) => `The bull case is supported by ${reasons}.`,
    bullCaseNeedsRecovery: 'The bull case requires price recovery above current pullback zones with confirmation from the higher timeframe.',
    bearCaseSupported: (reasons: string) => `The bear case is supported by ${reasons}.`,
    bearCaseMomentumLoss: 'The bear case emerges if price fails to maintain current momentum or data quality deteriorates.',
    riskDegraded: 'The key risk here is acting on partial or delayed data.',
    riskStaleFeed: 'Feed quality is not optimal, and signals may lag behind the live market.',
    riskHighVolatility: 'Volatility is high, so any entry requires a conservative position size.',
    riskMedium: 'Current risk is moderate and depends on sustained momentum.',
    triggerBuy: (price: string) => `The next trigger is price holding above ${price} with confidence staying above 60.`,
    triggerSell: (price: string) => `The next trigger is continued pressure below ${price} with weak rebound attempts.`,
    triggerNeutral: 'The next trigger is a clearer directional bias from the scanner or a catalyst that shifts the regime.',
    narrativeReason: (reason: string) => `The strongest reason now: ${reason}.`,
    narrativeNewsConsidered: 'Recent news has been factored into the narrative.',
    narrativeNoNews: 'Insufficient recent news, so the narrative focuses on price and technical structure.',
    keywordPartialData: 'Partial Data',
    keywordLiveContext: 'Live Context',
  },
  fr: {
    summaryBuy: (symbol: string, tf: string) => `${symbol} est en momentum haussier sur ${tf}.`,
    summarySell: (symbol: string, tf: string) => `${symbol} est sous pression vendeuse sur ${tf}.`,
    summaryNeutral: (symbol: string, tf: string) => `${symbol} est en mode attentiste sur ${tf}.`,
    summaryNoData: (symbol: string) => `Aucune lecture complète disponible pour ${symbol} pour le moment.`,
    bullCaseSupported: (reasons: string) => `Le scénario haussier est soutenu par ${reasons}.`,
    bullCaseNeedsRecovery: 'Le scénario haussier nécessite une récupération du prix au-dessus des zones de repli actuelles avec confirmation du timeframe supérieur.',
    bearCaseSupported: (reasons: string) => `Le scénario baissier est soutenu par ${reasons}.`,
    bearCaseMomentumLoss: 'Le scénario baissier émerge si le prix ne parvient pas à maintenir le momentum actuel ou si la qualité des données se détériore.',
    riskDegraded: 'Le risque principal ici est de se baser sur des données partielles ou retardées.',
    riskStaleFeed: 'La qualité du flux n\'est pas optimale, et les signaux peuvent être en retard sur le marché réel.',
    riskHighVolatility: 'La volatilité est élevée, donc toute entrée nécessite une taille de position conservatrice.',
    riskMedium: 'Le risque actuel est modéré et dépend du momentum soutenu.',
    triggerBuy: (price: string) => `Le prochain déclencheur est le maintien du prix au-dessus de ${price} avec une confiance supérieure à 60.`,
    triggerSell: (price: string) => `Le prochain déclencheur est la pression continue sous ${price} avec de faibles tentatives de rebond.`,
    triggerNeutral: 'Le prochain déclencheur est un biais directionnel plus clair du scanner ou un catalyseur qui change le régime.',
    narrativeReason: (reason: string) => `La raison la plus forte maintenant : ${reason}.`,
    narrativeNewsConsidered: 'Les actualités récentes ont été prises en compte dans le récit.',
    narrativeNoNews: 'Actualités récentes insuffisantes, le récit se concentre donc sur le prix et la structure technique.',
    keywordPartialData: 'Données partielles',
    keywordLiveContext: 'Contexte en direct',
  },
  tr: {
    summaryBuy: (symbol: string, tf: string) => `${symbol} ${tf} üzerinde yükseliş momentumunda.`,
    summarySell: (symbol: string, tf: string) => `${symbol} ${tf} üzerinde satış baskısı altında.`,
    summaryNeutral: (symbol: string, tf: string) => `${symbol} ${tf} üzerinde bekleme modunda.`,
    summaryNoData: (symbol: string) => `${symbol} için şu anda tam bir okuma mevcut değil.`,
    bullCaseSupported: (reasons: string) => `Yükseliş senaryosu ${reasons} tarafından destekleniyor.`,
    bullCaseNeedsRecovery: 'Yükseliş senaryosu, fiyatın mevcut geri çekilme bölgelerinin üzerine dönmesi ve daha yüksek zaman diliminden onay almasını gerektiriyor.',
    bearCaseSupported: (reasons: string) => `Düşüş senaryosu ${reasons} tarafından destekleniyor.`,
    bearCaseMomentumLoss: 'Düşüş senaryosu, fiyat mevcut momentumu koruyamazsa veya veri kalitesi bozulursa ortaya çıkar.',
    riskDegraded: 'Buradaki temel risk, kısmi veya gecikmeli verilere dayanarak işlem yapmaktır.',
    riskStaleFeed: 'Veri akışı kalitesi optimum değil ve sinyaller canlı piyasadan gecikmeli olabilir.',
    riskHighVolatility: 'Volatilite yüksek, bu nedenle her giriş için muhafazakar bir pozisyon boyutu gereklidir.',
    riskMedium: 'Mevcut risk orta düzeyde ve sürekli momentuma bağlıdır.',
    triggerBuy: (price: string) => `Sonraki tetikleyici, fiyatın ${price} üzerinde kalması ve güvenin 60 üzerinde kalmasıdır.`,
    triggerSell: (price: string) => `Sonraki tetikleyici, ${price} altında devam eden baskı ve zayıf geri dönüş denemeleridir.`,
    triggerNeutral: 'Sonraki tetikleyici, tarayıcıdan daha net bir yönsel önyargı veya rejimi değiştirecek bir katalizördür.',
    narrativeReason: (reason: string) => `Şu anki en güçlü neden: ${reason}.`,
    narrativeNewsConsidered: 'Son haberler anlatıma dahil edilmiştir.',
    narrativeNoNews: 'Yeterli son haber yok, bu nedenle anlatım fiyat ve teknik yapıya odaklanıyor.',
    keywordPartialData: 'Kısmi Veri',
    keywordLiveContext: 'Canlı Bağlam',
  },
  es: {
    summaryBuy: (symbol: string, tf: string) => `${symbol} está en momentum alcista en ${tf}.`,
    summarySell: (symbol: string, tf: string) => `${symbol} está bajo presión vendedora en ${tf}.`,
    summaryNeutral: (symbol: string, tf: string) => `${symbol} está en modo de espera en ${tf}.`,
    summaryNoData: (symbol: string) => `No hay lectura completa disponible para ${symbol} en este momento.`,
    bullCaseSupported: (reasons: string) => `El caso alcista está respaldado por ${reasons}.`,
    bullCaseNeedsRecovery: 'El caso alcista requiere una recuperación del precio por encima de las zonas de retroceso actuales con confirmación del marco temporal superior.',
    bearCaseSupported: (reasons: string) => `El caso bajista está respaldado por ${reasons}.`,
    bearCaseMomentumLoss: 'El caso bajista emerge si el precio no mantiene el momentum actual o la calidad de los datos se deteriora.',
    riskDegraded: 'El riesgo principal aquí es operar con datos parciales o retrasados.',
    riskStaleFeed: 'La calidad del flujo de datos no es óptima, y las señales pueden retrasarse respecto al mercado en vivo.',
    riskHighVolatility: 'La volatilidad es alta, por lo que cualquier entrada requiere un tamaño de posición conservador.',
    riskMedium: 'El riesgo actual es moderado y depende de un momentum sostenido.',
    triggerBuy: (price: string) => `El próximo desencadenante es que el precio se mantenga por encima de ${price} con la confianza por encima de 60.`,
    triggerSell: (price: string) => `El próximo desencadenante es la presión continuada por debajo de ${price} con débiles intentos de rebote.`,
    triggerNeutral: 'El próximo desencadenante es un sesgo direccional más claro del escáner o un catalizador que cambie el régimen.',
    narrativeReason: (reason: string) => `La razón más fuerte ahora: ${reason}.`,
    narrativeNewsConsidered: 'Las noticias recientes se han incorporado a la narrativa.',
    narrativeNoNews: 'No hay noticias recientes suficientes, por lo que la narrativa se centra en el precio y la estructura técnica.',
    keywordPartialData: 'Datos parciales',
    keywordLiveContext: 'Contexto en vivo',
  },
}

function buildNarrativeFromContext(
  symbol: string,
  scan: any,
  recentNews: any[] = [],
  degraded = false,
  lang: 'ar' | 'en' | 'fr' | 'tr' | 'es' = 'ar',
): NarratorPayload {
  const l = T[lang] || T.ar
  const newsSentiment =
    recentNews.reduce((acc, item) => acc + (typeof item?.sentiment === 'number' ? item.sentiment : 0), 0) /
    (recentNews.length || 1)

  const sentiment =
    scan?.dir === 'buy' && newsSentiment >= -0.1 ? 'bullish'
      : scan?.dir === 'sell' && newsSentiment <= 0.1 ? 'bearish'
        : Math.abs(scan?.change || 0) > 2.5 ? 'volatile'
          : 'neutral'

  const confidence = Math.min(95, Math.max(55, Number(scan?.strength || 62) + (degraded ? -10 : 0)))
  const risk = degraded || scan?.freshness !== 'fresh'
    ? 'High'
    : Math.abs(scan?.change || 0) > 2
      ? 'Medium'
      : 'Low'

  const summary = scan
    ? scan?.dir === 'buy'
      ? l.summaryBuy(symbol, scan?.timeframe || '1h')
      : scan?.dir === 'sell'
        ? l.summarySell(symbol, scan?.timeframe || '1h')
        : l.summaryNeutral(symbol, scan?.timeframe || '1h')
    : l.summaryNoData(symbol)

  const reasonsJoined = scan?.reasons?.slice(0, 2).join(lang === 'ar' ? '، ' : ', ')

  const bullCase = scan?.dir === 'buy'
    ? l.bullCaseSupported(reasonsJoined)
    : l.bullCaseNeedsRecovery

  const bearCase = scan?.dir === 'sell'
    ? l.bearCaseSupported(reasonsJoined)
    : l.bearCaseMomentumLoss

  const keyRisk = degraded
    ? l.riskDegraded
    : scan?.freshness !== 'fresh'
      ? l.riskStaleFeed
      : Math.abs(scan?.change || 0) > 2.5
        ? l.riskHighVolatility
        : l.riskMedium

  const priceStr = Number(scan?.price || 0).toFixed(2)
  const nextTrigger = scan?.dir === 'buy'
    ? l.triggerBuy(priceStr)
    : scan?.dir === 'sell'
      ? l.triggerSell(priceStr)
      : l.triggerNeutral

  const narrative = `${summary} ${scan?.reasons?.[0] ? l.narrativeReason(scan.reasons[0]) : ''} ${recentNews.length > 0 ? l.narrativeNewsConsidered : l.narrativeNoNews} ${keyRisk}`

  const keywords: Array<{ word: string; color: KeywordColor }> = [
    { word: scan?.signalClass || 'watch', color: 'accent' },
    { word: scan?.entryBias || 'wait', color: sentiment === 'bullish' ? 'success' : sentiment === 'bearish' ? 'danger' : 'amber' },
    { word: degraded ? l.keywordPartialData : l.keywordLiveContext, color: degraded ? 'amber' : 'success' },
  ]

  return {
    narrative,
    summary,
    bullCase,
    bearCase,
    keyRisk,
    nextTrigger,
    sentiment,
    keywords,
    confidence,
    risk,
    symbol,
    source: scan?.source || 'Unknown',
    timestamp: new Date().toISOString(),
    ...(degraded ? { degraded: true } : {}),
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const symbol = searchParams.get('symbol') || 'BTC/USD'
  const langParam = searchParams.get('lang') || 'ar'
  const lang = ['ar', 'en', 'fr', 'tr', 'es'].includes(langParam) ? langParam as 'ar' | 'en' | 'fr' | 'tr' | 'es' : 'ar'
  const origin = req.nextUrl.origin
  let dbReady = false
  let recentNews: any[] = []

  try {
    await ensureDbReady()
    dbReady = true
  } catch (dbError: any) {
    console.error('[ai/narrator] DB unavailable:', dbError?.message || dbError)
  }

  if (dbReady) {
    try {
      recentNews = await db.newsArticle.findMany({
        orderBy: { publishedAt: 'desc' },
        take: 3,
      })
    } catch (newsError: any) {
      console.error('[ai/narrator] News query failed:', newsError?.message || newsError)
    }
  }

  try {
    const context = await fetchMarketContext(origin, symbol, '1h')
    const scan = buildScannerResult(context)

    return NextResponse.json({
      success: true,
      data: buildNarrativeFromContext(symbol, scan, recentNews, !dbReady || context.freshness !== 'fresh', lang),
    })
  } catch (error: any) {
    console.error('[ai/narrator] Error:', error?.message || error)
    // Return success: false for degraded data — prevents phantom notifications
    return NextResponse.json({
      success: false,
      error: 'Market data unavailable',
      data: null,
    })
  }
}
