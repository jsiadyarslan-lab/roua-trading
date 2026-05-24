'use client'

import { useState, useEffect, useRef } from 'react'
import { X as XIcon, TrendingUp, TrendingDown, Sparkles } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { useScannerContext } from '../ScannerProvider'
import { DirectionTag } from '../shared/DirectionTag'
import { SmartScoreBar } from '../shared/SmartScoreBar'
import { IndicatorBadge } from '../shared/IndicatorBadge'
import type { ScannerItem } from '../hooks/useScannerData'
import { ScopedStyle } from '@/components/ScopedStyle'
import { sanitizeDeepAnalysis } from '@/lib/utils'

const T = {
  bg: '#0B0E14', bg2: '#1A1D29', card: '#1A1D29', surface: '#1A1D29',
  green: '#00FFA3', greenDim: '#00CC82', red: '#FF4757', redDim: '#FF3344',
  amber: '#FFB800', purple: '#B388FF', cyan: '#00D4FF', blue: '#0A84FF',
  text: '#F0F2F5', text2: '#8B92A8', text3: '#8B92A8',
  border: 'rgba(255,255,255,0.06)', border2: 'rgba(0,212,255,0.16)',
}

interface DeepData {
  symbol: string; name: string; category: string; price: number; changePercent: number
  direction: string; signalClass: string; confidence: number; marketOpen: boolean
  smartScore: { trendScore: number; momentumScore: number; volatilityScore: number; volumeScore: number; compositeScore: number; signalType: string; action: string; tradeTimeframe: string } | null
  indicators: Record<string, any>
  ichimoku: { tenkanSen: number; kijunSen: number; senkouSpanA: number; senkouSpanB: number; cloudColor: string; priceVsCloud: string; tkCross: string } | null
  cci: { value: number; interpretation: string } | null
  sar: { value: number; trend: string; accelerationFactor: number } | null
  obv: { trend: string; divergence: string } | null
  vwap: { value: number; position: string } | null
  fibonacci: { level: number; label: string; labelAr: string; price: number }[]
  support: { price: number; strength: string }[]
  resistance: { price: number; strength: string }[]
  patterns: { name: string; nameAr: string; type: string; confidence: number; description: string; descriptionAr: string }[]
  candlePatterns: { name: string; nameAr: string; type: string; confidence: number; description: string; descriptionAr: string }[]
  aiAnalysis: { model: string; sentiment: string; riskLevel: string; analysisAr: string }
  signal: { direction: string; entry: number; tp: number; sl: number; reasons: string[]; reasonsAr: string[]; timeframe: string }
  volumeProfile: { poc: number; valueAreaHigh: number; valueAreaLow: number } | null
}

function IndCard({ label, value, interp, color, bar }: { label: string; value: string; interp?: string; color: string; bar?: number }) {
  return (
    <div style={{ padding: 10, borderRadius: 6, background: T.bg, border: `0.5px solid ${T.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
      </div>
      {interp && <div style={{ fontSize: 8, color: T.text3, fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>{interp}</div>}
      {bar !== undefined && (
        <div style={{ height: 4, borderRadius: 2, background: T.surface, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(Math.max(bar, 2), 100)}%`, height: '100%', borderRadius: 2, background: color, transition: 'width 0.4s' }} />
        </div>
      )}
    </div>
  )
}

function LevelPill({ price, type, strength }: { price: number; type: 'support' | 'resistance'; strength: string }) {
  const color = type === 'support' ? T.green : T.red
  const sColor = strength === 'STRONG' ? T.green : strength === 'MODERATE' ? T.amber : T.text3
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 4, background: `${color}10`, border: `0.5px solid ${color}30`, fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color }}>
      {price.toLocaleString()}
      <span style={{ fontSize: 7, color: sColor, fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>({strength})</span>
    </span>
  )
}

export function DeepAnalysisModal() {
  const t = useTranslations('scannerAdvanced')
  const locale = useLocale()
  const ctx = useScannerContext()
  const [data, setData] = useState<DeepData | null>(null)
  const [loading, setLoading] = useState(false)
  const symbol = ctx.selectedSymbol

  const item: ScannerItem | undefined = ctx.scanData.find(d => d.symbol === symbol)

  const prevSymbolRef = useRef(symbol)

  useEffect(() => {
    if (!symbol) return
    if (prevSymbolRef.current !== symbol) {
      setLoading(true)
      prevSymbolRef.current = symbol
    }
    let stale = false
    ;(async () => {
      try {
        const res = await fetch(`/api/scanner/deep?symbol=${symbol}`)
        if (stale) return
        if (!res.ok) throw new Error('Failed')
        const j = await res.json()
        if (!stale && j.success && j.data) setData(sanitizeDeepAnalysis(j.data))
        else if (!stale) setData(null)
      } catch { if (!stale) setData(null) }
      if (!stale) setLoading(false)
    })()
    return () => { stale = true }
  }, [symbol])

  if (!symbol) return null
  const dirColor = item?.direction?.includes('BUY') ? T.green : item?.direction?.includes('SELL') ? T.red : T.amber
  const chgColor = (item?.changePercent ?? 0) >= 0 ? T.green : T.red

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 16, overflow: 'auto', direction: 'inherit' }}
      onClick={() => ctx.setSelectedSymbol(null)}>
      <ScopedStyle>{`
        @keyframes slideInDA { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
        .da-scroll::-webkit-scrollbar { width:5px; }
        .da-scroll::-webkit-scrollbar-track { background:${T.bg2}; }
        .da-scroll::-webkit-scrollbar-thumb { background:${T.surface}; border-radius:3px; }
      `}</ScopedStyle>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 800, background: T.bg2, borderRadius: 12, border: `0.5px solid ${T.border}`, overflow: 'hidden', animation: 'slideInDA 0.35s ease' }}>
        {/* Close */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 14px 0' }}>
          <button onClick={() => ctx.setSelectedSymbol(null)} style={{ padding: 6, borderRadius: 6, background: T.surface, border: `0.5px solid ${T.border}`, color: T.text3, cursor: 'pointer', display: 'flex' }}>
            <XIcon size={14} />
          </button>
        </div>

        <div className="da-scroll" style={{ padding: '0 16px 16px', maxHeight: '85vh', overflowY: 'auto' }}>
          {loading && !data ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}>
              {[0,1,2,3,4].map(i => <div key={i} style={{ height: 60, borderRadius: 8, background: T.surface, opacity: 0.2 + i*0.08 }} />)}
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 22, fontWeight: 900, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{symbol}</span>
                    <DirectionTag direction={item?.direction || 'NEUTRAL'} signalClass={item?.signalClass} size="lg" />
                    <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: `${T.purple}15`, color: T.purple, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>
                      {item?.category || data?.category || ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                    <span style={{ fontSize: 16, fontWeight: 900, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
                      ${(item?.price ?? data?.price ?? 0).toLocaleString()}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: chgColor, fontFamily: "'JetBrains Mono', monospace" }}>
                      {(item?.changePercent ?? 0) >= 0 ? '+' : ''}{(item?.changePercent ?? 0).toFixed(2)}%
                    </span>
                    {item?.marketOpen && <span style={{ fontSize: 8, padding: '1px 6px', borderRadius: 3, background: `${T.green}15`, color: T.green, fontWeight: 700 }}>{t('deep.marketOpen')}</span>}
                  </div>
                </div>
              </div>

              {/* SmartScore */}
              <div style={{ marginBottom: 14 }}>
                <SmartScoreBar smartScore={data?.smartScore || null} />
              </div>

              {/* Technical Indicators Grid */}
              <div style={{ fontSize: 11, fontWeight: 800, color: T.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>{t('deep.technicalIndicators')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
                <IndCard label="RSI" value={item?.rsi?.toFixed(1) ?? '—'} interp={item?.rsi !== null ? (item!.rsi! <= 30 ? t('deep.oversold') : item!.rsi! >= 70 ? t('deep.overbought') : t('neutral')) : ''} color={item?.rsi !== null ? (item!.rsi! <= 30 ? T.cyan : item!.rsi! >= 70 ? T.purple : T.amber) : T.text3} bar={item?.rsi ?? 0} />
                <IndCard label="MACD" value={item?.macdSignal ?? '—'} interp={item?.macdHistogram !== null ? `Histogram: ${item?.macdHistogram?.toFixed(2)}` : ''} color={item?.macdSignal?.includes('BUY') ? T.green : item?.macdSignal?.includes('SELL') ? T.red : T.text3} />
                <IndCard label="Bollinger" value={item?.bollingerPosition ?? '—'} color={T.cyan} />
                <IndCard label="Stochastic" value={item?.stochK != null ? `${item.stochK.toFixed(0)}/${item.stochD?.toFixed(0)}` : '—'} color={T.amber} bar={item?.stochK ?? 0} />
                <IndCard label="ADX" value={item?.adx?.toFixed(1) ?? '—'} interp={(item?.adx ?? 0) > 25 ? t('deep.strongTrend') : t('deep.weakTrend')} color={(item?.adx ?? 0) > 25 ? T.green : T.text3} bar={item?.adx ?? 0} />
                <IndCard label="ATR" value={item?.atr?.toFixed(2) ?? '—'} interp={item?.atrVolatility ?? ''} color={T.purple} />
                {/* New Advanced Indicators */}
                <IndCard label="CCI" value={data?.cci?.value?.toFixed(1) ?? '—'} interp={data?.cci?.interpretation === 'OVERBOUGHT' ? t('deep.overbought') : data?.cci?.interpretation === 'OVERSOLD' ? t('deep.oversold') : t('neutral')} color={data?.cci?.interpretation === 'OVERBOUGHT' ? T.purple : data?.cci?.interpretation === 'OVERSOLD' ? T.cyan : T.text3} bar={data?.cci ? Math.min(Math.abs(data.cci.value), 200) / 2 : 0} />
                <IndCard label="VWAP" value={data?.vwap?.value?.toFixed(2) ?? '—'} interp={data?.vwap?.position === 'ABOVE' ? t('deep.aboveVwap') : data?.vwap?.position === 'BELOW' ? t('deep.belowVwap') : t('deep.atVwap')} color={data?.vwap?.position === 'ABOVE' ? T.green : data?.vwap?.position === 'BELOW' ? T.red : T.text3} />
              </div>

              {/* Ichimoku Cloud Section */}
              {data?.ichimoku && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 800, color: T.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>{t('deep.ichimokuCloud')}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 14 }}>
                    <IndCard label="Tenkan" value={data.ichimoku.tenkanSen.toFixed(2)} color={T.cyan} />
                    <IndCard label="Kijun" value={data.ichimoku.kijunSen.toFixed(2)} color={T.amber} />
                    <IndCard label="TK Cross" value={data.ichimoku.tkCross === 'BULLISH' ? t('deep.bullish') : data.ichimoku.tkCross === 'BEARISH' ? t('deep.bearish') : t('neutral')} color={data.ichimoku.tkCross === 'BULLISH' ? T.green : data.ichimoku.tkCross === 'BEARISH' ? T.red : T.text3} />
                    <IndCard label="Cloud" value={data.ichimoku.cloudColor === 'BULLISH' ? t('deep.bullish') : data.ichimoku.cloudColor === 'BEARISH' ? t('deep.bearish') : t('neutral')} color={data.ichimoku.cloudColor === 'BULLISH' ? T.green : data.ichimoku.cloudColor === 'BEARISH' ? T.red : T.amber} />
                    <IndCard label="Price vs Cloud" value={data.ichimoku.priceVsCloud === 'ABOVE' ? t('deep.above') : data.ichimoku.priceVsCloud === 'BELOW' ? t('deep.below') : t('deep.inside')} color={data.ichimoku.priceVsCloud === 'ABOVE' ? T.green : data.ichimoku.priceVsCloud === 'BELOW' ? T.red : T.amber} />
                    <IndCard label="SAR" value={data.sar?.value?.toFixed(2) ?? '—'} interp={data.sar?.trend === 'RISING' ? t('deep.bullish') : t('deep.bearish')} color={data.sar?.trend === 'RISING' ? T.green : T.red} />
                  </div>
                </>
              )}

              {/* OBV & Volume Profile */}
              {(data?.obv || data?.volumeProfile) && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 800, color: T.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>{t('deep.volumeAnalysis')}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
                    {data.obv && (
                      <IndCard label="OBV" value={data.obv.trend === 'RISING' ? t('deep.rising') : data.obv.trend === 'FALLING' ? t('deep.falling') : t('deep.flat')} interp={data.obv.divergence === 'BULLISH_DIVERGENCE' ? t('deep.bullishDivergence') : data.obv.divergence === 'BEARISH_DIVERGENCE' ? t('deep.bearishDivergence') : t('deep.noDivergence')} color={data.obv.trend === 'RISING' ? T.green : data.obv.trend === 'FALLING' ? T.red : T.text3} />
                    )}
                    {data.volumeProfile && (
                      <IndCard label="Volume Profile" value={`POC: ${data.volumeProfile.poc.toFixed(2)}`} interp={`VA: ${data.volumeProfile.valueAreaLow.toFixed(2)} - ${data.volumeProfile.valueAreaHigh.toFixed(2)}`} color={T.blue} />
                    )}
                  </div>
                </>
              )}

              {/* Support / Resistance */}
              <div style={{ fontSize: 11, fontWeight: 800, color: T.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>{t('deep.supportResistance')}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                {(data?.support || []).map((s, i) => <LevelPill key={`s-${s.price}-${i}`} price={s.price} type="support" strength={s.strength} />)}
                {(data?.resistance || []).map((r, i) => <LevelPill key={`r-${r.price}-${i}`} price={r.price} type="resistance" strength={r.strength} />)}
                {!data?.support?.length && !data?.resistance?.length && <span style={{ fontSize: 9, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>{t('deep.noLevelData')}</span>}
              </div>

              {/* Patterns */}
              {data?.patterns?.length ? (
                <>
                  <div style={{ fontSize: 11, fontWeight: 800, color: T.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>{t('deep.detectedPatterns')}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                    {data.patterns.map((p, i) => {
                      const pColor = p.type === 'bullish' ? T.green : p.type === 'bearish' ? T.red : T.amber
                      return (
                        <div key={p.nameAr + '-' + i} style={{ padding: 8, borderRadius: 6, background: T.bg, border: `0.5px solid ${T.border}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif" }}>{locale === 'ar' ? p.nameAr : (p.name || p.nameAr)}</span>
                            <span style={{ fontSize: 8, padding: '1px 6px', borderRadius: 3, background: `${pColor}15`, color: pColor, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>{p.type === 'bullish' ? t('deep.bullish') : p.type === 'bearish' ? t('deep.bearish') : t('neutral')}</span>
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: T.surface, overflow: 'hidden', marginBottom: 4 }}>
                            <div style={{ width: `${p.confidence}%`, height: '100%', borderRadius: 2, background: pColor, transition: 'width 0.4s' }} />
                          </div>
                          <span style={{ fontSize: 8, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>{locale === 'ar' ? (p.descriptionAr || p.description) : (p.description || p.descriptionAr)}</span>
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : null}

              {/* Candle Patterns */}
              {data?.candlePatterns?.length ? (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: T.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>{t('deep.candlePatterns')}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {data.candlePatterns.map((cp, i) => {
                      const cpColor = cp.type === 'BULLISH' ? T.green : cp.type === 'BEARISH' ? T.red : T.amber
                      return (
                        <div key={cp.nameAr + '-' + i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, background: T.bg, border: `0.5px solid ${T.border}` }}>
                          <span style={{ fontSize: 9, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif" }}>{locale === 'ar' ? cp.nameAr : (cp.name || cp.nameAr)}</span>
                          <span style={{ fontSize: 7, padding: '1px 5px', borderRadius: 3, background: `${cpColor}15`, color: cpColor, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>
                            {cp.type === 'BULLISH' ? t('deep.bullish') : cp.type === 'BEARISH' ? t('deep.bearish') : t('neutral')}
                          </span>
                          <div style={{ flex: 1, height: 3, borderRadius: 2, background: T.surface, overflow: 'hidden' }}>
                            <div style={{ width: `${cp.confidence}%`, height: '100%', borderRadius: 2, background: cpColor }} />
                          </div>
                          <span style={{ fontSize: 7, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>{locale === 'ar' ? (cp.descriptionAr || cp.description) : (cp.description || cp.descriptionAr)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              {/* AI Analysis */}
              {data?.aiAnalysis && (
                <div style={{ borderRadius: 8, background: `${T.purple}06`, border: `0.5px solid ${T.purple}20`, padding: 12, marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Sparkles size={14} color={T.purple} />
                    <span style={{ fontSize: 11, fontWeight: 800, color: T.purple, fontFamily: "'Cairo', sans-serif" }}>{t('deep.aiAnalysis')}</span>
                    <span style={{ fontSize: 8, padding: '1px 6px', borderRadius: 3, background: `${T.cyan}12`, color: T.cyan, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{data.aiAnalysis.model}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <IndicatorBadge label={t('deep.sentiment')} value={data.aiAnalysis.sentiment === 'POSITIVE' ? t('deep.positive') : data.aiAnalysis.sentiment === 'NEGATIVE' ? t('deep.negative') : t('neutral')} status={data.aiAnalysis.sentiment === 'POSITIVE' ? 'bullish' : data.aiAnalysis.sentiment === 'NEGATIVE' ? 'bearish' : 'neutral'} />
                    <IndicatorBadge label={t('deep.risk')} value={data.aiAnalysis.riskLevel === 'LOW' ? t('deep.low') : data.aiAnalysis.riskLevel === 'HIGH' ? t('deep.high') : t('deep.medium')} status={data.aiAnalysis.riskLevel === 'LOW' ? 'bullish' : data.aiAnalysis.riskLevel === 'HIGH' ? 'bearish' : 'warning'} />
                  </div>
                  <p style={{ fontSize: 10, color: T.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.7, margin: 0 }}>{data.aiAnalysis.analysisAr}</p>
                  {/* Note: AI analysis text is generated in Arabic by the backend. 
                      For full bilingual support, the backend would need a language parameter. */}
                </div>
              )}

              {/* Signal Summary */}
              {data?.signal && (
                <div style={{ borderRadius: 8, background: `${dirColor}06`, border: `0.5px solid ${dirColor}20`, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    {data.signal.direction.includes('BUY') ? <TrendingUp size={16} color={T.green} /> : <TrendingDown size={16} color={T.red} />}
                    <span style={{ fontSize: 16, fontWeight: 900, color: dirColor, fontFamily: "'Cairo', sans-serif" }}>
                      {data.signal.direction.includes('BUY') ? t('buy') : data.signal.direction.includes('SELL') ? t('sell') : t('neutral')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                    <div><span style={{ fontSize: 8, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>{t('deep.entry')}</span><div style={{ fontSize: 12, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>${data.signal.entry.toLocaleString()}</div></div>
                    <div><span style={{ fontSize: 8, color: T.green, fontFamily: "'Cairo', sans-serif" }}>{t('deep.target')}</span><div style={{ fontSize: 12, fontWeight: 800, color: T.green, fontFamily: "'JetBrains Mono', monospace" }}>${data.signal.tp.toLocaleString()}</div></div>
                    <div><span style={{ fontSize: 8, color: T.red, fontFamily: "'Cairo', sans-serif" }}>{t('deep.stopLoss')}</span><div style={{ fontSize: 12, fontWeight: 800, color: T.red, fontFamily: "'JetBrains Mono', monospace" }}>${data.signal.sl.toLocaleString()}</div></div>
                    <div><span style={{ fontSize: 8, color: T.amber, fontFamily: "'Cairo', sans-serif" }}>R:R</span><div style={{ fontSize: 12, fontWeight: 800, color: T.amber, fontFamily: "'JetBrains Mono', monospace" }}>{(Math.abs(data.signal.tp - data.signal.entry) / Math.abs(data.signal.entry - data.signal.sl)).toFixed(1)}</div></div>
                  </div>
                  {data.signal.reasons?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 }}>
                      {(locale === 'ar' && data.signal.reasonsAr?.length ? data.signal.reasonsAr : data.signal.reasons).map((r, i) => (
                        <span key={`reason-${i}`} style={{ fontSize: 9, color: T.text2, fontFamily: "'Cairo', sans-serif" }}>• {r}</span>
                      ))}
                    </div>
                  )}
                  <span style={{ fontSize: 8, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>{t('deep.timeframe')} {data.signal.timeframe}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
