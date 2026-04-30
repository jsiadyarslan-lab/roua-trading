'use client'

import { useMemo, useState } from 'react'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useBotStore } from '@/hooks/useBotStore'
import {
  ShieldAlert, AlertTriangle, XCircle, Activity,
  TrendingUp, TrendingDown, Zap, Info, AlertOctagon
} from 'lucide-react'

const T = {
  bg:     '#0B0E14',
  card:   '#1A1D29',
  border: 'rgba(255,255,255,0.06)',
  cyan:   '#00D4FF',
  green:  '#00FFA3',
  red:    '#FF4757',
  amber:  '#FFB800',
  purple: '#B388FF',
  text:   '#F0F2F5',
  text2:  '#8B92A8',
  mono:   "'JetBrains Mono', monospace",
  ar:     "'Cairo', sans-serif",
}

const MAX_RISK_PCT = 10   // >10% exposure on one symbol = red
const WARN_RISK_PCT = 5   // >5% = amber

function RiskMeter({ pct }: { pct: number }) {
  const color = pct >= MAX_RISK_PCT ? T.red : pct >= WARN_RISK_PCT ? T.amber : T.green
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: T.text2, fontFamily: T.ar }}>التعرض</span>
        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: T.mono, color }}>{pct.toFixed(1)}%</span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${Math.min(pct * 5, 100)}%`, // scale: 20% max = full bar
          background: color, borderRadius: 3, transition: 'width 0.5s ease',
          boxShadow: `0 0 6px ${color}60`,
        }} />
      </div>
    </div>
  )
}

export default function RiskPage() {
  const trades = usePaperTradesStore(s => s.trades)
  const closePaperTrade = usePaperTradesStore(s => s.closeTrade)
  const account = usePositionsStore(s => s.account)
  const positions = usePositionsStore(s => s.positions)
  const botStats = useBotStore(s => s.stats)
  const isOn = useBotStore(s => s.isOn)
  const [closing, setClosing] = useState(false)

  const botTrades = trades.filter(t => t.source === 'bot')
  const manualTrades = trades.filter(t => t.source === 'manual')

  const equity = Number(account?.equity) || 0

  // Exposure by symbol
  const exposureMap = useMemo(() => {
    const map: Record<string, { size: number; pnl: number; count: number; side: string }> = {}
    for (const t of trades) {
      const value = t.qty * t.currentPrice
      if (!map[t.symbol]) map[t.symbol] = { size: 0, pnl: 0, count: 0, side: t.side }
      map[t.symbol].size += value
      map[t.symbol].pnl += t.unrealizedPnl
      map[t.symbol].count++
    }
    return map
  }, [trades])

  const totalExposure = Object.values(exposureMap).reduce((s, x) => s + x.size, 0)
  const totalPnl = trades.reduce((s, t) => s + t.unrealizedPnl, 0)
  const totalExposurePct = equity > 0 ? (totalExposure / equity) * 100 : 0

  // Risk alerts
  const alerts: { msg: string; level: 'red' | 'amber' | 'info' }[] = []
  if (totalExposurePct > 80) alerts.push({ msg: 'التعرض الكلي تجاوز 80% من رأس المال — خطر مرتفع جداً', level: 'red' })
  if (botStats.sessionLoss < -200) alerts.push({ msg: `خسارة الجلسة تجاوزت -$200 (حالياً: $${botStats.sessionLoss.toFixed(2)})`, level: 'red' })
  if (botTrades.length >= 3) alerts.push({ msg: 'وصلت إلى الحد الأقصى للمراكز المفتوحة للبوت (3)', level: 'amber' })
  Object.entries(exposureMap).forEach(([sym, { size }]) => {
    const pct = equity > 0 ? (size / equity) * 100 : 0
    if (pct >= MAX_RISK_PCT) alerts.push({ msg: `${sym}: تعرض مرتفع (${pct.toFixed(1)}% من رأس المال)`, level: 'amber' })
  })
  if (alerts.length === 0) alerts.push({ msg: 'جميع مؤشرات المخاطر ضمن الحدود الآمنة ✅', level: 'info' })

  const handleCloseAll = async () => {
    if (!confirm('هل تريد إغلاق جميع المراكز المفتوحة الآن؟\nهذا الإجراء لا يمكن التراجع عنه.')) return
    setClosing(true)
    const ids = trades.map(t => t.id)
    for (const id of ids) {
      closePaperTrade(id)
      await new Promise(r => setTimeout(r, 50)) // small delay to avoid state race
    }
    setClosing(false)
  }

  return (
    <div style={{
      minHeight: 'calc(100dvh - 108px)',
      background: T.bg,
      padding: '20px 24px',
      direction: 'rtl',
      fontFamily: T.ar,
      color: T.text,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldAlert size={24} color={T.amber} />
            إدارة المخاطر
          </h1>
          <p style={{ fontSize: 12, color: T.text2, marginTop: 4 }}>
            مراقبة التعرض والمراكز في الوقت الفعلي
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Bot Status */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
            borderRadius: 10, border: `1px solid ${isOn ? T.green + '30' : T.border}`,
            background: isOn ? `${T.green}08` : 'rgba(255,255,255,0.03)',
          }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: isOn ? T.green : T.text2, boxShadow: isOn ? `0 0 6px ${T.green}` : 'none' }} />
            <span style={{ fontSize: 12, color: isOn ? T.green : T.text2, fontWeight: 700 }}>
              البوت: {isOn ? 'مُشغَّل' : 'متوقف'}
            </span>
          </div>
          {/* Emergency Close All */}
          {trades.length > 0 && (
            <button onClick={handleCloseAll} disabled={closing} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px',
              borderRadius: 10, border: `1px solid ${T.red}40`,
              background: `${T.red}14`, color: T.red,
              fontFamily: T.ar, fontWeight: 800, fontSize: 12, cursor: 'pointer',
              boxShadow: `0 0 12px ${T.red}20`,
              animation: 'pulse-warn 2s ease-in-out infinite',
            }}>
              <AlertOctagon size={14} />
              {closing ? 'جارٍ الإغلاق...' : '🚨 إغلاق الكل فوراً'}
            </button>
          )}
        </div>
      </div>

      <style>{`@keyframes pulse-warn { 0%,100%{box-shadow:0 0 12px ${T.red}20} 50%{box-shadow:0 0 20px ${T.red}45} }`}</style>

      {/* Alerts */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {alerts.map((a, i) => {
          const color = a.level === 'red' ? T.red : a.level === 'amber' ? T.amber : T.cyan
          const Icon = a.level === 'red' ? XCircle : a.level === 'amber' ? AlertTriangle : Info
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              borderRadius: 10, border: `1px solid ${color}25`,
              background: `${color}08`, fontSize: 12, color,
            }}>
              <Icon size={14} /> {a.msg}
            </div>
          )
        })}
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'إجمالي المراكز', value: String(trades.length), color: T.cyan, icon: Activity },
          { label: 'مراكز البوت', value: String(botTrades.length), color: T.purple, icon: Zap },
          { label: 'المراكز اليدوية', value: String(manualTrades.length), color: T.amber, icon: TrendingUp },
          { label: 'إجمالي التعرض', value: `$${totalExposure.toFixed(0)}`, color: T.text, icon: ShieldAlert },
          { label: 'P&L غير المحقق', value: `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}$`, color: totalPnl >= 0 ? T.green : T.red, icon: totalPnl >= 0 ? TrendingUp : TrendingDown },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} style={{
            padding: '14px 16px', borderRadius: 12,
            background: 'rgba(26,29,41,0.6)', border: `1px solid ${T.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Icon size={14} color={color} />
              <span style={{ fontSize: 10, color: T.text2 }}>{label}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: T.mono, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Exposure by Symbol */}
      {Object.keys(exposureMap).length > 0 ? (
        <div style={{
          background: 'rgba(26,29,41,0.6)', borderRadius: 14, border: `1px solid ${T.border}`,
          padding: '16px 20px', marginBottom: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text2, marginBottom: 16 }}>
            📊 التعرض حسب الزوج
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Object.entries(exposureMap).map(([sym, { size, pnl, count, side }]) => {
              const pct = equity > 0 ? (size / equity) * 100 : 0
              const isProfit = pnl >= 0
              return (
                <div key={sym}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontWeight: 800, fontFamily: T.mono, fontSize: 13, color: T.text }}>{sym}</span>
                      <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: side === 'long' ? `${T.green}18` : `${T.red}18`, color: side === 'long' ? T.green : T.red, fontWeight: 700 }}>
                        {side === 'long' ? '↑ شراء' : '↓ بيع'}
                      </span>
                      <span style={{ fontSize: 9, color: T.text2 }}>{count} مركز</span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontFamily: T.mono, color: T.text2 }}>${size.toFixed(0)}</span>
                      <span style={{ fontSize: 12, fontFamily: T.mono, fontWeight: 700, color: isProfit ? T.green : T.red }}>
                        {isProfit ? '+' : ''}{pnl.toFixed(2)}$
                      </span>
                    </div>
                  </div>
                  <RiskMeter pct={pct} />
                </div>
              )
            })}
          </div>
          {/* Total exposure bar */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
            <RiskMeter pct={totalExposurePct} />
            <div style={{ fontSize: 10, color: T.text2, marginTop: 4 }}>
              التعرض الكلي كنسبة من رأس المال ({totalExposurePct.toFixed(1)}% من ${equity.toFixed(0)})
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: 240, gap: 12, color: T.text2,
          background: 'rgba(26,29,41,0.4)', borderRadius: 14, border: `1px solid ${T.border}`,
        }}>
          <ShieldAlert size={40} style={{ opacity: 0.3 }} />
          <div style={{ fontSize: 15, fontWeight: 700 }}>لا توجد مراكز مفتوحة</div>
          <div style={{ fontSize: 11 }}>جميع المراكز مغلقة — وضع آمن ✅</div>
        </div>
      )}

      {/* Open Positions Table */}
      {trades.length > 0 && (
        <div style={{
          background: 'rgba(26,29,41,0.6)', borderRadius: 14, border: `1px solid ${T.border}`,
          overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 700, color: T.text2 }}>
            📋 المراكز المفتوحة
          </div>
          {trades.map((t, i) => {
            const pnlColor = t.unrealizedPnl >= 0 ? T.green : T.red
            return (
              <div key={t.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 70px 80px 80px 80px 80px auto',
                padding: '10px 16px', borderBottom: `1px solid ${T.border}`,
                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontWeight: 700, fontSize: 12, fontFamily: T.mono }}>{t.symbol}</span>
                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: t.side === 'long' ? `${T.green}18` : `${T.red}18`, color: t.side === 'long' ? T.green : T.red, fontWeight: 700, textAlign: 'center' }}>
                  {t.side === 'long' ? '↑' : '↓'}
                </span>
                <span style={{ fontSize: 11, fontFamily: T.mono, color: T.text2 }}>{t.qty.toFixed(4)}</span>
                <span style={{ fontSize: 11, fontFamily: T.mono }}>${t.entryPrice.toFixed(2)}</span>
                <span style={{ fontSize: 11, fontFamily: T.mono }}>${t.currentPrice.toFixed(2)}</span>
                <span style={{ fontSize: 12, fontFamily: T.mono, fontWeight: 700, color: pnlColor }}>
                  {t.unrealizedPnl >= 0 ? '+' : ''}{t.unrealizedPnl.toFixed(2)}$
                </span>
                <button onClick={() => closePaperTrade(t.id)} style={{
                  fontSize: 10, padding: '4px 10px', borderRadius: 6,
                  border: `1px solid ${T.red}30`, background: `${T.red}08`,
                  color: T.red, cursor: 'pointer', fontFamily: T.ar, whiteSpace: 'nowrap',
                }}>
                  إغلاق
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
