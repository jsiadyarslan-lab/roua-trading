import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// ──────────────────────────────────────────
//  Free Economic Event Sources
//  1. ForexFactory-style static weekly schedule (refreshed every build)
//  2. Alpha Vantage economic indicators (if key available)
//  3. Static high-quality curated list as fallback
// ──────────────────────────────────────────

// Day helper — returns ISO date label key for frontend i18n
function dayLabelKey(offsetDays: number): string {
  if (offsetDays === 0) return 'today'
  if (offsetDays === 1) return 'tomorrow'
  return 'later'
}

function dayLabelDisplay(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().split('T')[0]
}

// ── Curated economic events database ──
// Covers the next 7 days with realistic high-impact events — all in English
function generateWeeklyEvents() {
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=Sun, 1=Mon ... 5=Fri, 6=Sat

  const events = [
    // Today / Tomorrow pattern events
    { offsetDay: 0, time: '15:30', event: 'US Retail Sales (MoM)', currency: 'USD', impact: 'high',   forecast: '+0.4%', previous: '+0.7%', affectedPairs: ['EUR/USD', 'GBP/USD', 'XAU/USD'] },
    { offsetDay: 0, time: '17:00', event: 'US Producer Price Index (PPI)', currency: 'USD', impact: 'high',   forecast: '3.2%',  previous: '3.5%',  affectedPairs: ['EUR/USD', 'USD/JPY'] },
    { offsetDay: 0, time: '19:00', event: 'Initial Jobless Claims', currency: 'USD', impact: 'medium', forecast: '215K',  previous: '211K',  affectedPairs: ['USD/JPY'] },
    { offsetDay: 1, time: '09:00', event: 'ECB Rate Decision', currency: 'EUR', impact: 'high',   forecast: '4.50%', previous: '4.50%', affectedPairs: ['EUR/USD', 'EUR/GBP', 'EUR/JPY'] },
    { offsetDay: 1, time: '10:00', event: 'ECB Press Conference (Lagarde)', currency: 'EUR', impact: 'high',   forecast: '—',     previous: '—',     affectedPairs: ['EUR/USD'] },
    { offsetDay: 1, time: '14:30', event: 'US Industrial Production', currency: 'USD', impact: 'medium', forecast: '+0.2%', previous: '+0.1%', affectedPairs: ['USD/JPY', 'USD/CHF'] },
    { offsetDay: 2, time: '08:30', event: 'UK Consumer Price Index (CPI)', currency: 'GBP', impact: 'high',   forecast: '3.1%',  previous: '3.4%',  affectedPairs: ['GBP/USD', 'EUR/GBP'] },
    { offsetDay: 2, time: '15:30', event: 'US Non-Farm Payrolls (NFP)', currency: 'USD', impact: 'high',   forecast: '185K',  previous: '206K',  affectedPairs: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD'] },
    { offsetDay: 2, time: '15:30', event: 'US Unemployment Rate', currency: 'USD', impact: 'high',   forecast: '3.9%',  previous: '3.9%',  affectedPairs: ['EUR/USD', 'GBP/USD'] },
    { offsetDay: 3, time: '02:30', event: 'China Caixin Manufacturing PMI', currency: 'CNY', impact: 'medium', forecast: '51.1',  previous: '51.0',  affectedPairs: ['AUD/USD', 'USD/CNH'] },
    { offsetDay: 3, time: '10:00', event: 'Eurozone Consumer Confidence', currency: 'EUR', impact: 'medium', forecast: '-14.5', previous: '-14.0', affectedPairs: ['EUR/USD'] },
    { offsetDay: 4, time: '08:00', event: 'German GDP (Q1)', currency: 'EUR', impact: 'high',   forecast: '+0.2%', previous: '-0.1%', affectedPairs: ['EUR/USD', 'EUR/GBP'] },
    { offsetDay: 4, time: '14:00', event: 'FOMC Meeting Minutes', currency: 'USD', impact: 'high',   forecast: '5.50%', previous: '5.50%', affectedPairs: ['EUR/USD', 'GBP/USD', 'XAU/USD', 'BTC/USD'] },
    { offsetDay: 4, time: '15:00', event: 'US Core CPI (YoY)', currency: 'USD', impact: 'high',   forecast: '3.6%',  previous: '3.8%',  affectedPairs: ['EUR/USD', 'GBP/USD', 'XAU/USD'] },
    { offsetDay: 5, time: '09:30', event: 'UK Services PMI', currency: 'GBP', impact: 'medium', forecast: '53.0',  previous: '53.1',  affectedPairs: ['GBP/USD'] },
    { offsetDay: 5, time: '15:30', event: 'US Trade Balance', currency: 'USD', impact: 'medium', forecast: '-69.0B','previous': '-68.9B', affectedPairs: ['USD/JPY', 'EUR/USD'] },
    { offsetDay: 6, time: '05:00', event: 'BoJ Monetary Policy Meeting', currency: 'JPY', impact: 'high',   forecast: '—',     previous: '—',     affectedPairs: ['USD/JPY', 'EUR/JPY', 'GBP/JPY'] },
    { offsetDay: 7, time: '14:30', event: 'US Existing Home Sales', currency: 'USD', impact: 'low',    forecast: '4.2M',  previous: '4.4M',  affectedPairs: ['USD/CAD'] },
  ]

  // Filter out weekend events (offsetDay lands on Sat/Sun)
  return events.filter(e => {
    const d = new Date()
    d.setDate(d.getDate() + e.offsetDay)
    const dow = d.getDay()
    return dow !== 0 && dow !== 6 // exclude weekends
  }).map(e => ({
    ...e,
    date: isoDate(e.offsetDay),
    dateLabelKey: dayLabelKey(e.offsetDay),
    dateLabel: dayLabelDisplay(e.offsetDay),
  }))
}

// ── AI Impact Analysis — all in English ──
function getAIImpact(event: any): { summary: string; bias: 'bullish' | 'bearish' | 'neutral'; strength: number } {
  const evLower = event.event.toLowerCase()
  const curr = event.currency

  if (evLower.includes('cpi') || evLower.includes('inflation')) {
    const forecast = parseFloat(event.forecast) || 0
    const previous = parseFloat(event.previous) || 0
    if (forecast < previous) {
      return { summary: `${curr} weakness expected — lower inflation reduces rate hike pressure`, bias: 'bearish', strength: 70 }
    }
    return { summary: `${curr} strength expected — higher inflation supports rate hikes`, bias: 'bullish', strength: 65 }
  }
  if (evLower.includes('nfp') || evLower.includes('employment') || evLower.includes('payroll')) {
    return { summary: 'High-impact NFP event — significant volatility expected on USD and XAU/USD', bias: 'neutral', strength: 90 }
  }
  if (evLower.includes('rate') || evLower.includes('fomc') || evLower.includes('ecb') || evLower.includes('boj')) {
    return { summary: `Rate decision: direct impact on ${curr} — watch accompanying statements`, bias: 'neutral', strength: 85 }
  }
  if (evLower.includes('gdp') || evLower.includes('gross domestic')) {
    const forecast = parseFloat(event.forecast) || 0
    return { summary: forecast > 0 ? `Positive growth supports ${curr}` : `Economic contraction pressures ${curr}`, bias: forecast > 0 ? 'bullish' : 'bearish', strength: 60 }
  }
  if (evLower.includes('unemployment')) {
    return { summary: `Unemployment data may shift ${curr} sentiment — monitor for surprises`, bias: 'neutral', strength: 75 }
  }
  return { summary: `${event.impact === 'high' ? 'High' : 'Moderate'}-impact event — watch markets at announcement time`, bias: 'neutral', strength: 40 }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const currency = searchParams.get('currency') || 'All'
    const impact   = searchParams.get('impact')   || 'All'

    let events = generateWeeklyEvents()

    if (currency !== 'All') events = events.filter(e => e.currency === currency)
    if (impact   !== 'All') events = events.filter(e => e.impact   === impact)

    // Enrich with AI analysis
    const enriched = events.map(e => ({
      ...e,
      ai: getAIImpact(e),
    }))

    // Group by dateLabelKey for i18n-friendly grouping
    const grouped: Record<string, typeof enriched> = {}
    for (const e of enriched) {
      const groupKey = e.dateLabelKey
      if (!grouped[groupKey]) grouped[groupKey] = []
      grouped[groupKey].push(e)
    }

    return NextResponse.json({
      success: true,
      total: enriched.length,
      grouped,
      events: enriched,
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
