'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { closePositionUnified, ensureAuth } from '@/lib/api-fetch'
import { Header, Card } from '@/components/mobile/FluxComponents'
import {
  TrendingUp, TrendingDown, ArrowUpDown, X,
  Activity, Shield, AlertTriangle, Check,
} from 'lucide-react'

/* ═══ أنواع الفلتر والترتيب ═══ */
type FilterTab = 'all' | 'long' | 'short'
type SortKey = 'pnl' | 'size' | 'time'

/* ═══ تنسيق الأرقام ═══ */
function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (Math.abs(n) >= 1) return n.toFixed(2)
  return n.toFixed(4)
}

function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (p >= 1) return p.toFixed(4)
  return p.toFixed(5)
}

/* ═══ صفحة المراكز ═══ */
export default function PositionsPage() {
  const router = useRouter()
  const { positions, account, loading, fetchPositions, fetchAccount, refreshAfterTrade } = usePositionsStore()
  const addNotification = useNotificationStore(s => s.addNotification)

  // ── State ──
  const [filter, setFilter] = useState<FilterTab>('all')
  const [sortKey, setSortKey] = useState<SortKey>('pnl')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null)

  // جلب البيانات
  useEffect(() => {
    fetchPositions()
    fetchAccount()
    const interval = setInterval(() => { fetchPositions(); fetchAccount() }, 15000)
    return () => clearInterval(interval)
  }, [fetchPositions, fetchAccount])

  // ── إحصائيات الملف ──
  const totalUnrealizedPnl = useMemo(() => positions.reduce((s, p) => s + (p.unrealizedPnl || 0), 0), [positions])
  const totalValue = useMemo(() => positions.reduce((s, p) => s + Math.abs(p.marketValue || p.qty * p.currentPrice || 0), 0), [positions])
  const pnlPct = useMemo(() => {
    const equity = Number(account?.equity ?? 0)
    if (equity <= 0) return 0
    return (totalUnrealizedPnl / equity) * 100
  }, [totalUnrealizedPnl, account?.equity])
  const isPnlPositive = totalUnrealizedPnl >= 0

  const longCount = positions.filter(p => (p.side || '').toLowerCase() === 'long' || (p.side || '').toUpperCase() === 'BUY').length
  const shortCount = positions.filter(p => (p.side || '').toLowerCase() === 'short' || (p.side || '').toUpperCase() === 'SELL').length

  // ── فلترة وترتيب المراكز ──
  const filteredPositions = useMemo(() => {
    let list = [...positions]

    // فلترة
    if (filter === 'long') {
      list = list.filter(p => (p.side || '').toLowerCase() === 'long' || (p.side || '').toUpperCase() === 'BUY')
    } else if (filter === 'short') {
      list = list.filter(p => (p.side || '').toLowerCase() === 'short' || (p.side || '').toUpperCase() === 'SELL')
    }

    // ترتيب
    if (sortKey === 'pnl') {
      list.sort((a, b) => Math.abs(b.unrealizedPnl || 0) - Math.abs(a.unrealizedPnl || 0))
    } else if (sortKey === 'size') {
      list.sort((a, b) => Math.abs(b.marketValue || 0) - Math.abs(a.marketValue || 0))
    } else if (sortKey === 'time') {
      list.sort((a, b) => {
        const aTime = a.openedAt ? new Date(a.openedAt).getTime() : 0
        const bTime = b.openedAt ? new Date(b.openedAt).getTime() : 0
        return bTime - aTime
      })
    }

    return list
  }, [positions, filter, sortKey])

  // ── إغلاق المركز ──
  const handleClosePosition = useCallback(async (positionId: string, symbol: string, dbId?: string) => {
    if (closingId) return
    setClosingId(positionId)
    try {
      await ensureAuth()
      const result = await closePositionUnified(positionId, undefined, {
        dbId,
        onClosed: () => {
          addNotification({
            source: 'trade',
            priority: 'high',
            action: 'CLOSE',
            title: `تم إغلاق مركز ${symbol}`,
            body: `تم إغلاق المركز بنجاح`,
            pair: symbol,
          })
        },
      })

      if (!result.success) {
        addNotification({
          source: 'trade',
          priority: 'urgent',
          action: 'WARN',
          title: 'فشل الإغلاق',
          body: result.error || 'لم يتم إغلاق المركز',
          pair: symbol,
        })
      }

      refreshAfterTrade()
      setConfirmCloseId(null)
    } catch (err: any) {
      addNotification({
        source: 'trade',
        priority: 'urgent',
        action: 'WARN',
        title: 'خطأ في الإغلاق',
        body: err.message || 'خطأ غير معروف',
        pair: symbol,
      })
    } finally {
      setClosingId(null)
    }
  }, [closingId, addNotification, refreshAfterTrade])

  // ── تسميات الترتيب ──
  const sortLabels: Record<SortKey, string> = { pnl: 'الربح/الخسارة', size: 'الحجم', time: 'الوقت' }

  return (
    <div style={{ direction: 'rtl' }}>
      <Header title="المراكز" subtitle={`${positions.length} مركز مفتوح`} />

      <div className="f-page f-stagger">
        {/* ═══ بطاقة ملخص الملف ═══ */}
        <Card highlight>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: isPnlPositive ? 'rgba(0,255,163,0.1)' : 'rgba(255,71,87,0.1)',
              border: `0.5px solid ${isPnlPositive ? 'rgba(0,255,163,0.2)' : 'rgba(255,71,87,0.2)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {isPnlPositive ? <TrendingUp size={20} color="#00FFA3" /> : <TrendingDown size={20} color="#FF4757" />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: 'var(--c-text2)', fontFamily: 'var(--f-cairo)', fontWeight: 700 }}>إجمالي P&L غير المحقق</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 22, fontWeight: 900, color: isPnlPositive ? '#00FFA3' : '#FF4757', fontFamily: 'var(--f-mono)' }}>
                  {isPnlPositive ? '+' : ''}{fmtUsd(totalUnrealizedPnl)}
                </span>
                <span style={{ fontSize: 11, fontWeight: 800, color: isPnlPositive ? '#00FFA3' : '#FF4757', fontFamily: 'var(--f-mono)' }}>
                  ({isPnlPositive ? '+' : ''}{pnlPct.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '6px 10px', borderRadius: 10,
            background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)',
          }}>
            <Activity size={11} color="var(--c-accent)" />
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-text2)', fontFamily: 'var(--f-cairo)' }}>حقوق الملكية:</span>
            <span style={{ fontSize: 11, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-mono)' }}>
              ${fmtUsd(Number(account?.equity ?? 0))}
            </span>
          </div>
        </Card>

        {/* ═══ صف الإحصائيات ═══ */}
        <div style={{
          display: 'flex', gap: 8, margin: '0 var(--s4) var(--s2)',
        }}>
          <div style={{
            flex: 1, padding: '8px 10px', borderRadius: 10, textAlign: 'center',
            background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-mono)' }}>{positions.length}</div>
            <div style={{ fontSize: 8, color: 'var(--c-text3)', fontFamily: 'var(--f-cairo)', fontWeight: 700 }}>الإجمالي</div>
          </div>
          <div style={{
            flex: 1, padding: '8px 10px', borderRadius: 10, textAlign: 'center',
            background: 'rgba(0,255,163,0.04)', border: '0.5px solid rgba(0,255,163,0.1)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#00FFA3', fontFamily: 'var(--f-mono)' }}>{longCount}</div>
            <div style={{ fontSize: 8, color: '#00FFA3', fontFamily: 'var(--f-cairo)', fontWeight: 700 }}>شراء</div>
          </div>
          <div style={{
            flex: 1, padding: '8px 10px', borderRadius: 10, textAlign: 'center',
            background: 'rgba(255,71,87,0.04)', border: '0.5px solid rgba(255,71,87,0.1)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#FF4757', fontFamily: 'var(--f-mono)' }}>{shortCount}</div>
            <div style={{ fontSize: 8, color: '#FF4757', fontFamily: 'var(--f-cairo)', fontWeight: 700 }}>بيع</div>
          </div>
        </div>

        {/* ═══ فلاتر + ترتيب ═══ */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 var(--s4) var(--s2)' }}>
          <div className="f-tabs" style={{ margin: 0, flex: 1 }}>
            <button
              onClick={() => setFilter('all')}
              className={`f-tabs__item ${filter === 'all' ? 'f-tabs__item--active' : ''}`}
            >
              الكل ({positions.length})
            </button>
            <button
              onClick={() => setFilter('long')}
              className={`f-tabs__item ${filter === 'long' ? 'f-tabs__item--active' : ''}`}
            >
              شراء ({longCount})
            </button>
            <button
              onClick={() => setFilter('short')}
              className={`f-tabs__item ${filter === 'short' ? 'f-tabs__item--active' : ''}`}
            >
              بيع ({shortCount})
            </button>
          </div>
          <div style={{ position: 'relative', marginRight: 6 }}>
            <button
              onClick={() => setShowSortMenu(s => !s)}
              style={{
                padding: '6px 8px', borderRadius: 8, border: '0.5px solid var(--c-border)',
                background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', gap: 4,
                cursor: 'pointer',
              }}
            >
              <ArrowUpDown size={12} color="var(--c-text2)" />
              <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--c-text2)', fontFamily: 'var(--f-cairo)' }}>{sortLabels[sortKey]}</span>
            </button>
            {showSortMenu && (
              <>
                <div onClick={() => setShowSortMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 23 }} />
                <div style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 24, marginTop: 4,
                  background: 'var(--c-card)', borderRadius: 10, padding: 4,
                  border: '0.5px solid var(--c-border-act)', boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                  minWidth: 120,
                }}>
                  {(['pnl', 'size', 'time'] as SortKey[]).map(key => (
                    <button
                      key={key}
                      onClick={() => { setSortKey(key); setShowSortMenu(false) }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        width: '100%', padding: '8px 10px', borderRadius: 6, border: 'none',
                        background: sortKey === key ? 'rgba(0,212,255,0.08)' : 'transparent',
                        color: sortKey === key ? 'var(--c-accent)' : 'var(--c-text2)',
                        fontSize: 11, fontWeight: 800, fontFamily: 'var(--f-cairo)', cursor: 'pointer',
                      }}
                    >
                      {sortLabels[key]}
                      {sortKey === key && <Check size={12} color="#00D4FF" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ═══ قائمة المراكز ═══ */}
        {filteredPositions.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredPositions.map(pos => {
              const isLong = (pos.side || '').toLowerCase() === 'long' || (pos.side || '').toUpperCase() === 'BUY'
              const pnl = pos.unrealizedPnl || 0
              const pnlPct = pos.unrealizedPnlPct ?? (pos.avgEntryPrice > 0 ? ((pos.currentPrice - pos.avgEntryPrice) / pos.avgEntryPrice) * 100 * (isLong ? 1 : -1) : 0)
              const sideLabel = isLong ? 'شراء' : 'بيع'
              const sideColor = isLong ? '#00FFA3' : '#FF4757'
              const pnlPositive = pnl >= 0
              const positionValue = Math.abs(pos.marketValue || pos.qty * pos.currentPrice || 0)

              // حساب شريط P&L (نسبة من القيمة القصوى)
              const maxPnlForBar = positionValue * 0.1 // 10% من القيمة
              const barWidth = maxPnlForBar > 0 ? Math.min(100, Math.abs(pnl) / maxPnlForBar * 100) : 0

              // مصدر الصفقة
              const tradeSource = pos.tradeSource || pos.source
              let sourceBadge = ''
              let sourceColor = '#8B92A8'
              if (tradeSource === 'smart_executor' || tradeSource === 'executor') { sourceBadge = 'المنفذ'; sourceColor = '#059669' }
              else if (tradeSource === 'agent') { sourceBadge = 'الوكيل'; sourceColor = '#B388FF' }
              else if (tradeSource === 'auto_paper') { sourceBadge = 'ورقي'; sourceColor = '#00D4FF' }
              else if (tradeSource === 'nestjs') { sourceBadge = ''; sourceColor = '#8B92A8' }

              const posId = pos.id || pos.dbId || `${pos.symbol}-${pos.side}`

              return (
                <Card key={posId}>
                  {/* رأس البطاقة: رمز + شارة الجانب + زر الإغلاق */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-mono)' }}>{pos.symbol}</span>
                      <span style={{
                        fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 5,
                        background: `${sideColor}12`, color: sideColor,
                        border: `0.5px solid ${sideColor}30`, fontFamily: 'var(--f-cairo)',
                      }}>
                        {sideLabel}
                      </span>
                      {sourceBadge && (
                        <span style={{
                          fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 5,
                          background: `${sourceColor}12`, color: sourceColor,
                          border: `0.5px solid ${sourceColor}25`, fontFamily: 'var(--f-cairo)',
                        }}>
                          {sourceBadge}
                        </span>
                      )}
                    </div>

                    {/* زر الإغلاق */}
                    {confirmCloseId === posId ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          onClick={() => handleClosePosition(pos.id || pos.symbol, pos.symbol, pos.dbId)}
                          disabled={closingId === posId}
                          style={{
                            padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                            background: 'rgba(255,71,87,0.15)', color: '#FF4757',
                            fontSize: 9, fontWeight: 800, fontFamily: 'var(--f-cairo)',
                          }}
                        >
                          {closingId === posId ? '...' : 'تأكيد'}
                        </button>
                        <button
                          onClick={() => setConfirmCloseId(null)}
                          style={{
                            padding: '4px 6px', borderRadius: 6, border: '0.5px solid var(--c-border)',
                            background: 'transparent', color: 'var(--c-text3)', cursor: 'pointer',
                            fontSize: 9, fontFamily: 'var(--f-cairo)',
                          }}
                        >
                          إلغاء
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmCloseId(posId)}
                        style={{
                          padding: '4px 10px', borderRadius: 6, border: '0.5px solid rgba(255,71,87,0.2)',
                          background: 'rgba(255,71,87,0.06)', color: '#FF4757',
                          fontSize: 9, fontWeight: 800, fontFamily: 'var(--f-cairo)', cursor: 'pointer',
                        }}
                      >
                        إغلاق
                      </button>
                    )}
                  </div>

                  {/* تفاصيل المركز */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 8, color: 'var(--c-text3)', fontFamily: 'var(--f-cairo)', fontWeight: 700 }}>الكمية</div>
                      <div style={{ fontSize: 11, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-mono)' }}>{pos.qty}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 8, color: 'var(--c-text3)', fontFamily: 'var(--f-cairo)', fontWeight: 700 }}>سعر الدخول</div>
                      <div style={{ fontSize: 11, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-mono)' }}>${fmtPrice(pos.avgEntryPrice || pos.entryPrice || 0)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 8, color: 'var(--c-text3)', fontFamily: 'var(--f-cairo)', fontWeight: 700 }}>السعر الحالي</div>
                      <div style={{ fontSize: 11, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-mono)' }}>${fmtPrice(pos.currentPrice || 0)}</div>
                    </div>
                  </div>

                  {/* القيمة + P&L */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontSize: 9, color: 'var(--c-text3)', fontFamily: 'var(--f-cairo)' }}>
                      القيمة: <span style={{ color: '#FFF', fontWeight: 800 }}>${fmtUsd(positionValue)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 900, color: pnlPositive ? '#00FFA3' : '#FF4757', fontFamily: 'var(--f-mono)' }}>
                        {pnlPositive ? '+' : ''}{fmtUsd(pnl)}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: pnlPositive ? '#00FFA3' : '#FF4757', fontFamily: 'var(--f-mono)' }}>
                        ({pnlPositive ? '+' : ''}{pnlPct.toFixed(2)}%)
                      </span>
                    </div>
                  </div>

                  {/* شريط P&L المرئي */}
                  <div style={{
                    width: '100%', height: 4, borderRadius: 2,
                    background: 'rgba(255,255,255,0.05)', overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${barWidth}%`, height: '100%', borderRadius: 2,
                      background: pnlPositive
                        ? 'linear-gradient(90deg, #00FFA3, #00D4FF)'
                        : 'linear-gradient(90deg, #FF4757, #FF6B6B)',
                      transition: 'width 300ms ease',
                      marginLeft: isLong ? 0 : 'auto',
                    }} />
                  </div>
                </Card>
              )
            })}
          </div>
        ) : (
          /* ═══ حالة فارغة ═══ */
          <Card>
            <div className="f-empty" style={{ padding: '24px 16px' }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: 'rgba(0,212,255,0.06)', border: '0.5px solid rgba(0,212,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px',
              }}>
                <Activity size={24} color="#00D4FF" />
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text2)', fontFamily: 'var(--f-cairo)', marginBottom: 6 }}>
                لا توجد مراكز مفتوحة
              </div>
              <div style={{ fontSize: 11, color: 'var(--c-text3)', fontFamily: 'var(--f-cairo)', marginBottom: 14, lineHeight: 1.5 }}>
                ابدأ التداول لرؤية مراكزك هنا
              </div>
              <button
                onClick={() => router.push('/mobile/chart')}
                style={{
                  padding: '10px 24px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #00D4FF, #5B21B6)',
                  color: '#FFF', fontSize: 12, fontWeight: 800, fontFamily: 'var(--f-cairo)',
                }}
              >
                فتح الشارت
              </button>
            </div>
          </Card>
        )}

        {/* مسافة أسفل شريط التنقل */}
        <div style={{ height: 80 }} />
      </div>
    </div>
  )
}
