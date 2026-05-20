'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { PageHeader, Card } from '@/components/mobile/Card'
import { SkeletonCard } from '@/components/mobile/Skeleton'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useRouter } from 'next/navigation'
import {
  Activity, TrendingUp, TrendingDown, X, Loader2, ShieldAlert,
  DollarSign, Percent, Clock, ExternalLink, AlertTriangle,
  Target, Crosshair, Edit3, Check, XCircle, Zap
} from 'lucide-react'

/** Format duration from openedAt ISO string to Arabic readable format */
function formatDuration(openedAt?: string): string {
  if (!openedAt) return '—'
  const start = new Date(openedAt).getTime()
  const now = Date.now()
  const diffMs = now - start
  if (diffMs < 0) return 'الآن'

  const minutes = Math.floor(diffMs / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}ي ${hours % 60}س`
  if (hours > 0) return `${hours}س ${minutes % 60}د`
  if (minutes > 0) return `${minutes}د`
  return 'الآن'
}

export default function MobilePositionsPage() {
  const router = useRouter()
  const { positions, fetchPositions, refreshAfterTrade, account, loading } = usePositionsStore()
  const quotes = useMarketStore(s => s.quotes)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState<string | null>(null)
  const [closePercent, setClosePercent] = useState(100)
  const [filter, setFilter] = useState<'all' | 'long' | 'short'>('all')
  const [confirmCloseAll, setConfirmCloseAll] = useState(false)
  const [closingAll, setClosingAll] = useState(false)

  // TP/SL inline edit state
  const [editingTPSL, setEditingTPSL] = useState<string | null>(null)
  const [editTP, setEditTP] = useState('')
  const [editSL, setEditSL] = useState('')
  const [savingTPSL, setSavingTPSL] = useState(false)

  useEffect(() => { fetchPositions() }, [fetchPositions])

  const handleClose = async (posId: string, percent: number = 100) => {
    setClosingId(posId)
    try {
      const res = await fetch('/api/smart-executor/close', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId: posId, percent }),
      })
      if (res.ok) refreshAfterTrade()
    } catch { /* */ }
    finally { setClosingId(null); setConfirmClose(null); setClosePercent(100) }
  }

  const handleCloseAll = async () => {
    setClosingAll(true)
    try {
      // Close all positions sequentially
      for (const pos of positions) {
        await fetch('/api/smart-executor/close', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ positionId: pos.dbId || pos.id }),
        })
      }
      refreshAfterTrade()
    } catch { /* */ }
    finally { setClosingAll(false); setConfirmCloseAll(false) }
  }

  const handleSaveTPSL = async (posId: string) => {
    setSavingTPSL(true)
    try {
      const body: any = { positionId: posId }
      if (editTP) body.takeProfit = parseFloat(editTP)
      if (editSL) body.stopLoss = parseFloat(editSL)
      await fetch('/api/smart-executor/update-position', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      refreshAfterTrade()
    } catch { /* */ }
    finally { setSavingTPSL(false); setEditingTPSL(null) }
  }

  const openTPSLEditor = useCallback((pos: any) => {
    setEditingTPSL(pos.dbId || pos.id)
    setEditTP(pos.tp || pos.takeProfit ? String(pos.tp || pos.takeProfit) : '')
    setEditSL(pos.sl || pos.stopLoss ? String(pos.sl || pos.stopLoss) : '')
  }, [])

  const equity = Number(account?.equity ?? 0) || 0
  const unrealizedPnl = Number(account?.unrealizedPnl ?? 0) || 0
  const totalPnlPct = equity > 0 ? (unrealizedPnl / equity) * 100 : 0
  const isUp = unrealizedPnl >= 0

  const filtered = useMemo(() => filter === 'all' ? positions : positions.filter(p => filter === 'long' ? p.side === 'long' : p.side === 'short'), [filter, positions])
  const longCount = useMemo(() => positions.filter(p => p.side === 'long').length, [positions])
  const shortCount = useMemo(() => positions.filter(p => p.side === 'short').length, [positions])

  // Show skeleton cards while positions are loading
  if (loading && positions.length === 0) {
    return (
      <div className="r-page">
        <PageHeader title="المراكز المفتوحة" subtitle="جارٍ التحميل..." />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={3} />
        <div style={{ height: 80 }} />
      </div>
    )
  }

  return (
    <div className="r-page">
      <PageHeader title="المراكز المفتوحة" subtitle={`${positions.length} مركز نشط`} />

      {/* Account Summary */}
      {positions.length > 0 && (
        <Card highlight>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700, marginBottom: 2 }}>إجمالي P&L غير المحقق</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: isUp ? '#00FFA3' : '#FF4757', fontFamily: 'var(--font-mono)' }}>
                {isUp ? '+' : ''}${unrealizedPnl.toFixed(2)}
              </div>
            </div>
            <div style={{
              padding: '8px 14px', borderRadius: 12,
              background: isUp ? 'rgba(0,255,163,0.08)' : 'rgba(255,69,58,0.08)',
              border: `1px solid ${isUp ? 'rgba(0,255,163,0.2)' : 'rgba(255,69,58,0.2)'}`,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: isUp ? '#00FFA3' : '#FF4757', fontFamily: 'var(--font-mono)' }}>
                {isUp ? '+' : ''}{totalPnlPct.toFixed(2)}%
              </div>
              <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>نسبة</div>
            </div>
          </div>

          {/* Distribution bar */}
          <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', direction: 'ltr' }}>
            <div style={{ width: `${(longCount / positions.length) * 100}%`, background: '#00FFA3', borderRadius: 3 }} />
            <div style={{ width: `${(shortCount / positions.length) * 100}%`, background: '#FF4757', borderRadius: 3 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#00FFA3', fontFamily: 'var(--font-cairo)' }}>{longCount} شراء</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#FF4757', fontFamily: 'var(--font-cairo)' }}>{shortCount} بيع</span>
          </div>
        </Card>
      )}

      {/* Filter Tabs + Close All */}
      {positions.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 var(--space-lg) var(--space-sm)' }}>
          <div className="r-tabs" style={{ margin: 0, flex: 1 }}>
            {([['all', 'الكل'], ['long', 'شراء'], ['short', 'بيع']] as const).map(([key, label]) => (
              <button key={key} className={`r-tabs__item ${filter === key ? 'r-tabs__item--active' : ''}`} onClick={() => setFilter(key)}>
                {label} {key === 'all' ? positions.length : key === 'long' ? longCount : shortCount}
              </button>
            ))}
          </div>

          {/* Close All Button */}
          {confirmCloseAll ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
              borderRadius: 8, background: 'rgba(255,69,58,0.1)',
              border: '1px solid rgba(255,69,58,0.25)',
            }}>
              <button
                onClick={handleCloseAll}
                disabled={closingAll}
                style={{
                  padding: '4px 10px', borderRadius: 6,
                  background: '#FF4757', border: 'none',
                  color: '#FFF', fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-cairo)',
                  cursor: 'pointer', touchAction: 'manipulation',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {closingAll ? <Loader2 size={12} className="r-anim-spin" /> : <AlertTriangle size={12} />}
                تأكيد
              </button>
              <button
                onClick={() => setConfirmCloseAll(false)}
                style={{
                  padding: '4px 8px', borderRadius: 6,
                  background: 'rgba(255,255,255,0.06)', border: 'none',
                  color: '#8B92A8', fontSize: 10, fontWeight: 700,
                  cursor: 'pointer', touchAction: 'manipulation',
                }}
              >
                إلغاء
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmCloseAll(true)}
              style={{
                padding: '6px 12px', borderRadius: 8,
                background: 'rgba(255,69,58,0.06)', border: '1px solid rgba(255,69,58,0.15)',
                color: '#FF4757', fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-cairo)',
                cursor: 'pointer', touchAction: 'manipulation',
                display: 'flex', alignItems: 'center', gap: 4,
                whiteSpace: 'nowrap',
              }}
            >
              <X size={12} />
              إغلاق الكل
            </button>
          )}
        </div>
      )}

      {positions.length === 0 ? (
        <Card>
          <div className="r-empty">
            <Activity size={40} color="#8B92A8" />
            <div className="r-empty__title">لا توجد مراكز مفتوحة</div>
            <button
              onClick={() => router.push('/mobile/markets')}
              style={{
                marginTop: 12, padding: '10px 28px', borderRadius: 12,
                background: 'linear-gradient(135deg, #00D4FF, #5B21B6)', border: 'none',
                color: '#FFF', fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-cairo)',
                cursor: 'pointer', touchAction: 'manipulation',
              }}
            >
              استكشف الأسواق
            </button>
          </div>
        </Card>
      ) : filtered.map(pos => {
        const isLong = pos.side === 'long'
        const pnl = Number(pos.unrealizedPnl ?? 0)
        const posUp = pnl >= 0
        const entryPrice = Number(pos.entryPrice ?? pos.avgEntryPrice ?? 0)
        const currentPrice = Number(pos.currentPrice ?? 0)
        const qty = Number(pos.qty ?? 0)
        const marketValue = currentPrice * qty
        const pnlPct = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 * (isLong ? 1 : -1) : 0

        const quote = quotes[pos.symbol]
        const livePrice = quote ? Number(quote.price) : currentPrice

        const posKey = pos.dbId || pos.id
        const isEditingTPSL = editingTPSL === posKey
        const tpValue = pos.tp || pos.takeProfit
        const slValue = pos.sl || pos.stopLoss

        return (
          <Card key={pos.id} style={{ padding: 'var(--space-xl)' }}>
            {/* Subtle background tint overlay based on profit/loss */}
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 'var(--radius-lg)',
              background: posUp
                ? 'linear-gradient(135deg, rgba(0,255,163,0.03) 0%, transparent 60%)'
                : 'linear-gradient(135deg, rgba(255,69,58,0.03) 0%, transparent 60%)',
              pointerEvents: 'none', zIndex: 0,
            }} />

            <div style={{ position: 'relative', zIndex: 1 }}>
              {/* Header Row — Symbol + Side Badge + Duration + PnL */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Side icon — ENLARGED to 52x52 */}
                  <div style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: isLong ? 'rgba(0,255,163,0.1)' : 'rgba(255,69,58,0.1)',
                    border: `1px solid ${isLong ? 'rgba(0,255,163,0.2)' : 'rgba(255,69,58,0.2)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isLong ? <TrendingUp size={26} color="#00FFA3" /> : <TrendingDown size={26} color="#FF4757" />}
                  </div>
                  <div>
                    {/* Symbol — fontSize 20 */}
                    <div style={{ fontSize: 20, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-mono)' }}>{pos.symbol}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      {/* Side badge — ENLARGED */}
                      <span style={{
                        fontSize: 11, fontWeight: 800, padding: '3px 12px', borderRadius: 6,
                        background: isLong ? 'rgba(0,255,163,0.12)' : 'rgba(255,69,58,0.12)',
                        color: isLong ? '#00FFA3' : '#FF4757',
                        border: `1px solid ${isLong ? 'rgba(0,255,163,0.25)' : 'rgba(255,69,58,0.25)'}`,
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '0.5px',
                      }}>
                        {isLong ? 'LONG' : 'SHORT'}
                      </span>
                      {/* Quantity */}
                      <span style={{ fontSize: 12, color: '#8B92A8', fontFamily: 'var(--font-mono)' }}>× {qty}</span>
                    </div>
                  </div>
                </div>

                {/* PnL Block — ENLARGED */}
                <div style={{ textAlign: 'left' }}>
                  {/* PnL amount — fontSize 26 */}
                  <div style={{ fontSize: 26, fontWeight: 900, color: posUp ? '#00FFA3' : '#FF4757', fontFamily: 'var(--font-mono)', lineHeight: 1.1 }}>
                    {posUp ? '+' : ''}{pnl.toFixed(2)}
                  </div>
                  {/* PnL percentage — fontSize 14 */}
                  <div style={{
                    display: 'inline-block', padding: '2px 10px', borderRadius: 6,
                    background: posUp ? 'rgba(0,255,163,0.08)' : 'rgba(255,69,58,0.08)',
                    border: `1px solid ${posUp ? 'rgba(0,255,163,0.15)' : 'rgba(255,69,58,0.15)'}`,
                    marginTop: 2,
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: posUp ? '#00FFA3' : '#FF4757', fontFamily: 'var(--font-mono)' }}>
                      {posUp ? '+' : ''}{pnlPct.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Duration + TP/SL row */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 12, padding: '6px 10px', borderRadius: 8,
                background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.04)',
              }}>
                {/* Duration */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Clock size={12} color="#8B92A8" />
                  <span style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700 }}>
                    {formatDuration(pos.openedAt)}
                  </span>
                </div>

                {/* TP/SL quick view + edit */}
                {isEditingTPSL ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Target size={10} color="#00FFA3" />
                      <input
                        type="number"
                        value={editTP}
                        onChange={e => setEditTP(e.target.value)}
                        placeholder="TP"
                        style={{
                          width: 56, height: 24, borderRadius: 4,
                          background: 'rgba(0,255,163,0.06)', border: '1px solid rgba(0,255,163,0.15)',
                          color: '#00FFA3', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                          textAlign: 'center', outline: 'none',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Crosshair size={10} color="#FF4757" />
                      <input
                        type="number"
                        value={editSL}
                        onChange={e => setEditSL(e.target.value)}
                        placeholder="SL"
                        style={{
                          width: 56, height: 24, borderRadius: 4,
                          background: 'rgba(255,69,58,0.06)', border: '1px solid rgba(255,69,58,0.15)',
                          color: '#FF4757', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                          textAlign: 'center', outline: 'none',
                        }}
                      />
                    </div>
                    <button
                      onClick={() => handleSaveTPSL(posKey)}
                      disabled={savingTPSL}
                      style={{
                        width: 24, height: 24, borderRadius: 4,
                        background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)',
                        color: '#00D4FF', cursor: 'pointer', touchAction: 'manipulation',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {savingTPSL ? <Loader2 size={10} className="r-anim-spin" /> : <Check size={10} />}
                    </button>
                    <button
                      onClick={() => setEditingTPSL(null)}
                      style={{
                        width: 24, height: 24, borderRadius: 4,
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                        color: '#8B92A8', cursor: 'pointer', touchAction: 'manipulation',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <XCircle size={10} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => openTPSLEditor(pos)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '2px 8px', borderRadius: 6,
                      background: 'transparent', border: '1px solid rgba(255,255,255,0.06)',
                      cursor: 'pointer', touchAction: 'manipulation',
                    }}
                  >
                    {/* TP indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Target size={10} color="#00FFA3" />
                      <span style={{ fontSize: 10, fontWeight: 700, color: tpValue ? '#00FFA3' : '#555', fontFamily: 'var(--font-mono)' }}>
                        {tpValue ? Number(tpValue).toFixed(2) : '—'}
                      </span>
                    </div>
                    {/* SL indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Crosshair size={10} color="#FF4757" />
                      <span style={{ fontSize: 10, fontWeight: 700, color: slValue ? '#FF4757' : '#555', fontFamily: 'var(--font-mono)' }}>
                        {slValue ? Number(slValue).toFixed(2) : '—'}
                      </span>
                    </div>
                    <Edit3 size={9} color="#8B92A8" />
                  </button>
                )}
              </div>

              {/* Price Details Grid — fontSize 14 for values, 10 for labels */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
                padding: '12px', borderRadius: 12,
                background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)',
                marginBottom: 12,
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700, marginBottom: 3 }}>سعر الدخول</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-mono)' }}>
                    ${entryPrice > 0 ? entryPrice.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700, marginBottom: 3 }}>السعر الحالي</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: posUp ? '#00FFA3' : '#FF4757', fontFamily: 'var(--font-mono)' }}>
                    ${livePrice > 0 ? livePrice.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700, marginBottom: 3 }}>القيمة السوقية</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-mono)' }}>
                    ${marketValue > 0 ? marketValue.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                  </div>
                </div>
              </div>

              {/* PnL Progress Bar */}
              <div style={{ marginBottom: 12 }}>
                <div style={{
                  height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)',
                  overflow: 'hidden', direction: 'ltr',
                }}>
                  <div style={{
                    width: `${Math.min(Math.abs(pnlPct) * 5, 100)}%`,
                    height: '100%', borderRadius: 3,
                    background: posUp ? 'linear-gradient(90deg, #00FFA3, #10B981)' : 'linear-gradient(90deg, #FF4757, #EF4444)',
                  }} />
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 8 }}>
                {/* View Chart button — fontSize 13 */}
                <button
                  onClick={() => router.push(`/mobile/chart?symbol=${pos.symbol}`)}
                  style={{
                    flex: 1, height: 44, borderRadius: 10,
                    background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)',
                    color: '#00D4FF', fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-cairo)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    touchAction: 'manipulation',
                  }}
                >
                  <ExternalLink size={15} />
                  عرض الشارت
                </button>

                {confirmClose === posKey ? (
                  <div style={{
                    flex: 1.5, display: 'flex', flexDirection: 'column', gap: 6,
                    padding: '8px 10px', borderRadius: 10,
                    background: 'rgba(255,69,58,0.06)',
                    border: '1px solid rgba(255,69,58,0.15)',
                  }}>
                    {/* Percentage selector */}
                    <div style={{ display: 'flex', gap: 4 }}>
                      {([25, 50, 75, 100] as const).map(pct => (
                        <button
                          key={pct}
                          onClick={() => setClosePercent(pct)}
                          style={{
                            flex: 1, height: 30, borderRadius: 6,
                            background: closePercent === pct
                              ? 'rgba(255,69,58,0.2)'
                              : 'rgba(255,255,255,0.04)',
                            border: closePercent === pct
                              ? '1px solid rgba(255,69,58,0.4)'
                              : '1px solid rgba(255,255,255,0.06)',
                            color: closePercent === pct ? '#FF4757' : '#8B92A8',
                            fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-mono)',
                            cursor: 'pointer', touchAction: 'manipulation',
                            transition: 'all 150ms ease',
                          }}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                    {/* Confirm / Cancel */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <AlertTriangle size={12} color="#FF4757" />
                      <button
                        onClick={() => handleClose(posKey, closePercent)}
                        disabled={closingId === posKey}
                        style={{
                          flex: 1, height: 34, borderRadius: 8,
                          background: '#FF4757', border: 'none',
                          color: '#FFF', fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-cairo)',
                          cursor: 'pointer', touchAction: 'manipulation',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        }}
                      >
                        {closingId === posKey ? <Loader2 size={12} className="r-anim-spin" /> : <Zap size={12} />}
                        تأكيد إغلاق {closePercent}%
                      </button>
                      <button
                        onClick={() => { setConfirmClose(null); setClosePercent(100) }}
                        style={{
                          padding: '0 10px', height: 34, borderRadius: 8,
                          background: 'rgba(255,255,255,0.06)', border: 'none',
                          color: '#8B92A8', fontSize: 10, fontWeight: 700,
                          cursor: 'pointer', touchAction: 'manipulation',
                        }}
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Close Position button — fontSize 13 */
                  <button
                    onClick={() => setConfirmClose(posKey ?? null)}
                    style={{
                      flex: 1, height: 44, borderRadius: 10,
                      background: 'rgba(255,69,58,0.06)', border: '1px solid rgba(255,69,58,0.15)',
                      color: '#FF4757', fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-cairo)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      touchAction: 'manipulation',
                    }}
                  >
                    <X size={15} />
                    إغلاق المركز
                  </button>
                )}
              </div>
            </div>
          </Card>
        )
      })}

      <div style={{ height: 80 }} />
    </div>
  )
}
