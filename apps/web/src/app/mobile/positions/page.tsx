'use client'

import { useEffect, useState } from 'react'
import { PageHeader, Card } from '@/components/mobile/Card'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useRouter } from 'next/navigation'
import {
  Activity, TrendingUp, TrendingDown, X, Loader2, ShieldAlert,
  DollarSign, Percent, Clock, ExternalLink, AlertTriangle
} from 'lucide-react'

export default function MobilePositionsPage() {
  const router = useRouter()
  const { positions, fetchPositions, refreshAfterTrade, account } = usePositionsStore()
  const quotes = useMarketStore(s => s.quotes)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'long' | 'short'>('all')

  useEffect(() => { fetchPositions() }, [fetchPositions])

  const handleClose = async (posId: string) => {
    setClosingId(posId)
    try {
      const res = await fetch('/api/smart-executor/close', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId: posId }),
      })
      if (res.ok) refreshAfterTrade()
    } catch { /* */ }
    finally { setClosingId(null); setConfirmClose(null) }
  }

  const equity = Number(account?.equity ?? 0) || 0
  const unrealizedPnl = Number(account?.unrealizedPnl ?? 0) || 0
  const totalPnlPct = equity > 0 ? (unrealizedPnl / equity) * 100 : 0
  const isUp = unrealizedPnl >= 0

  const filtered = filter === 'all' ? positions : positions.filter(p => filter === 'long' ? p.side === 'long' : p.side === 'short')
  const longCount = positions.filter(p => p.side === 'long').length
  const shortCount = positions.filter(p => p.side === 'short').length

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
              <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>نسبة</div>
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

      {/* Filter Tabs */}
      {positions.length > 0 && (
        <div className="r-tabs" style={{ margin: '0 var(--space-lg) var(--space-sm)' }}>
          {([['all', 'الكل'], ['long', 'شراء'], ['short', 'بيع']] as const).map(([key, label]) => (
            <button key={key} className={`r-tabs__item ${filter === key ? 'r-tabs__item--active' : ''}`} onClick={() => setFilter(key)}>
              {label} {key === 'all' ? positions.length : key === 'long' ? longCount : shortCount}
            </button>
          ))}
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

        return (
          <Card key={pos.id} style={{ padding: 'var(--space-lg)' }}>
            {/* Header Row — Symbol + Side Badge + PnL */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Side icon */}
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: isLong ? 'rgba(0,255,163,0.1)' : 'rgba(255,69,58,0.1)',
                  border: `1px solid ${isLong ? 'rgba(0,255,163,0.2)' : 'rgba(255,69,58,0.2)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isLong ? <TrendingUp size={22} color="#00FFA3" /> : <TrendingDown size={22} color="#FF4757" />}
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-mono)' }}>{pos.symbol}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 5,
                      background: isLong ? 'rgba(0,255,163,0.1)' : 'rgba(255,69,58,0.1)',
                      color: isLong ? '#00FFA3' : '#FF4757',
                      border: `0.5px solid ${isLong ? 'rgba(0,255,163,0.2)' : 'rgba(255,69,58,0.2)'}`,
                      fontFamily: 'var(--font-cairo)',
                    }}>
                      {isLong ? 'LONG' : 'SHORT'}
                    </span>
                    <span style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--font-mono)' }}>× {qty}</span>
                  </div>
                </div>
              </div>

              {/* PnL Block */}
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: posUp ? '#00FFA3' : '#FF4757', fontFamily: 'var(--font-mono)' }}>
                  {posUp ? '+' : ''}{pnl.toFixed(2)}
                </div>
                <div style={{
                  display: 'inline-block', padding: '1px 8px', borderRadius: 5,
                  background: posUp ? 'rgba(0,255,163,0.08)' : 'rgba(255,69,58,0.08)',
                  border: `0.5px solid ${posUp ? 'rgba(0,255,163,0.15)' : 'rgba(255,69,58,0.15)'}`,
                }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: posUp ? '#00FFA3' : '#FF4757', fontFamily: 'var(--font-mono)' }}>
                    {posUp ? '+' : ''}{pnlPct.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Price Details Grid */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6,
              padding: '10px', borderRadius: 12,
              background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)',
              marginBottom: 10,
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginBottom: 2 }}>سعر الدخول</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-mono)' }}>
                  ${entryPrice > 0 ? entryPrice.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginBottom: 2 }}>السعر الحالي</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: posUp ? '#00FFA3' : '#FF4757', fontFamily: 'var(--font-mono)' }}>
                  ${livePrice > 0 ? livePrice.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: 'var(--font-cairo)', marginBottom: 2 }}>القيمة السوقية</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-mono)' }}>
                  ${marketValue > 0 ? marketValue.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                </div>
              </div>
            </div>

            {/* PnL Progress Bar */}
            <div style={{ marginBottom: 10 }}>
              <div style={{
                height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)',
                overflow: 'hidden', direction: 'ltr',
              }}>
                <div style={{
                  width: `${Math.min(Math.abs(pnlPct) * 5, 100)}%`,
                  height: '100%', borderRadius: 2,
                  background: posUp ? 'linear-gradient(90deg, #00FFA3, #10B981)' : 'linear-gradient(90deg, #FF4757, #EF4444)',
                }} />
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => router.push(`/mobile/chart?symbol=${pos.symbol}`)}
                style={{
                  flex: 1, height: 40, borderRadius: 10,
                  background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)',
                  color: '#00D4FF', fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-cairo)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  touchAction: 'manipulation',
                }}
              >
                <ExternalLink size={14} />
                عرض الشارت
              </button>

              {confirmClose === pos.id ? (
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px',
                  borderRadius: 10, background: 'rgba(255,69,58,0.08)',
                  border: '1px solid rgba(255,69,58,0.2)',
                }}>
                  <AlertTriangle size={12} color="#FF4757" />
                  <button
                    onClick={() => handleClose(pos.dbId || pos.id)}
                    disabled={closingId === (pos.dbId || pos.id)}
                    style={{
                      flex: 1, height: 36, borderRadius: 8,
                      background: '#FF4757', border: 'none',
                      color: '#FFF', fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-cairo)',
                      cursor: 'pointer', touchAction: 'manipulation',
                    }}
                  >
                    {closingId === (pos.dbId || pos.id) ? <Loader2 size={12} className="r-anim-spin" /> : 'تأكيد الإغلاق'}
                  </button>
                  <button
                    onClick={() => setConfirmClose(null)}
                    style={{
                      padding: '0 8px', height: 36, borderRadius: 8,
                      background: 'rgba(255,255,255,0.06)', border: 'none',
                      color: '#8B92A8', fontSize: 9, fontWeight: 700,
                      cursor: 'pointer', touchAction: 'manipulation',
                    }}
                  >
                    إلغاء
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClose(pos.dbId || pos.id)}
                  style={{
                    flex: 1, height: 40, borderRadius: 10,
                    background: 'rgba(255,69,58,0.06)', border: '1px solid rgba(255,69,58,0.15)',
                    color: '#FF4757', fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-cairo)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    touchAction: 'manipulation',
                  }}
                >
                  <X size={14} />
                  إغلاق المركز
                </button>
              )}
            </div>
          </Card>
        )
      })}

      <div style={{ height: 80 }} />
    </div>
  )
}
