'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, X, TrendingUp, TrendingDown, Loader2,
  Activity, Target, ShieldAlert, ChevronDown
} from 'lucide-react'
import { usePaperTradesStore, type PaperTrade } from '@/hooks/usePaperTradesStore'
import { useMarketStore, binanceWS } from '@/hooks/useMarketStore'

/* ─── Design Tokens ─── */
const C = {
  accent:  '#00D4FF',
  success: '#32D74B',
  danger:  '#FF453A',
  amber:   '#FFB800',
  text:    '#F0F2F5',
  text2:   'rgba(235,235,245,0.5)',
  bg:      '#1C1C1E',
  border:  'rgba(255,255,255,0.08)',
}
const FONT_AR   = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

/* ─── Helpers ─── */
const fmt  = (n: number, d = 2) => Math.abs(n).toFixed(d)
const sign = (n: number) => (n >= 0 ? '+' : '-')
const pnlColor = (n: number) => (n >= 0 ? C.success : C.danger)

function calcTpSlProgress(trade: PaperTrade): number {
  // Returns 0..1 representing where current price is between SL and TP
  if (!trade.tp && !trade.sl) return 0.5
  const tp = trade.tp ?? (trade.side === 'long' ? trade.entryPrice * 1.05 : trade.entryPrice * 0.95)
  const sl = trade.sl ?? (trade.side === 'long' ? trade.entryPrice * 0.95 : trade.entryPrice * 1.05)
  const current = trade.currentPrice || trade.entryPrice

  if (trade.side === 'long') {
    const range = tp - sl
    if (range <= 0) return 0.5
    return Math.max(0, Math.min(1, (current - sl) / range))
  } else {
    const range = sl - tp
    if (range <= 0) return 0.5
    return Math.max(0, Math.min(1, (sl - current) / range))
  }
}

/* ─── Filter Tabs ─── */
type FilterTab = 'ALL' | 'PROFIT' | 'LOSS'
const TABS: { key: FilterTab; label: string }[] = [
  { key: 'ALL', label: 'الكل' },
  { key: 'PROFIT', label: 'أرباح' },
  { key: 'LOSS', label: 'خسائر' },
]

/* ─── Close Confirmation Bottom Sheet ─── */
function CloseSheet({
  trade,
  onConfirm,
  onClose,
}: {
  trade: PaperTrade
  onConfirm: () => void
  onClose: () => void
}) {
  const isProfit = trade.unrealizedPnl >= 0

  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="close-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[60]"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      />

      {/* Sheet */}
      <motion.div
        key="close-sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="fixed bottom-0 left-0 right-0 z-[61]"
        style={{
          background: 'rgba(28, 28, 30, 0.92)',
          backdropFilter: 'blur(40px) saturate(200%)',
          WebkitBackdropFilter: 'blur(40px) saturate(200%)',
          borderRadius: '28px 28px 0 0',
          borderTop: '0.5px solid rgba(255,255,255,0.15)',
          paddingBottom: 'calc(48px + env(safe-area-inset-bottom))',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
        </div>

        <div style={{ padding: '8px 24px 24px' }} dir="rtl">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <span style={{ fontSize: 18, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>
              تأكيد إغلاق المركز
            </span>
            <button onClick={onClose} style={{ background: 'none', border: 'none' }}>
              <X size={22} color="rgba(255,255,255,0.4)" />
            </button>
          </div>

          {/* Trade Summary */}
          <div
            style={{
              padding: 16, borderRadius: 20,
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${isProfit ? 'rgba(50,215,75,0.15)' : 'rgba(255,69,58,0.15)'}`,
              marginBottom: 20,
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: FONT_MONO }}>
                  {trade.symbol}
                </span>
                <span
                  style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 6, fontWeight: 700,
                    background: trade.side === 'long' ? 'rgba(50,215,75,0.15)' : 'rgba(255,69,58,0.15)',
                    color: trade.side === 'long' ? C.success : C.danger,
                    fontFamily: FONT_AR,
                  }}
                >
                  {trade.side === 'long' ? 'شراء' : 'بيع'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR, marginBottom: 2 }}>الربح / الخسارة</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: pnlColor(trade.unrealizedPnl), fontFamily: FONT_MONO }}>
                  {sign(trade.unrealizedPnl)}${fmt(trade.unrealizedPnl)}
                </div>
                <div style={{ fontSize: 11, color: pnlColor(trade.unrealizedPnl), fontFamily: FONT_MONO, opacity: 0.7 }}>
                  {sign(trade.unrealizedPct)}{fmt(trade.unrealizedPct)}%
                </div>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR, marginBottom: 2 }}>سعر الإغلاق</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: FONT_MONO }}>
                  {trade.currentPrice?.toFixed(2) || trade.entryPrice.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '14px 0', borderRadius: 16,
                background: 'rgba(255,255,255,0.06)', border: 'none',
                color: C.text2, fontSize: 15, fontWeight: 700, fontFamily: FONT_AR,
              }}
            >
              إلغاء
            </button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={onConfirm}
              style={{
                flex: 1.5, padding: '14px 0', borderRadius: 16,
                background: C.danger, border: 'none',
                color: '#FFFFFF', fontSize: 15, fontWeight: 800, fontFamily: FONT_AR,
                boxShadow: `0 4px 20px ${C.danger}40`,
              }}
            >
              إغلاق المركز
            </motion.button>
          </div>
        </div>
      </motion.div>
    </>
  )
}

/* ─── Position Card ─── */
function PositionCard({
  trade,
  onCloseClick,
}: {
  trade: PaperTrade
  onCloseClick: () => void
}) {
  const progress = calcTpSlProgress(trade)
  const isProfit = trade.unrealizedPnl >= 0
  const progressColor = isProfit ? C.success : C.danger

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      style={{
        background: 'rgba(28,28,30,0.6)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 28,
        border: `0.5px solid ${isProfit ? 'rgba(50,215,75,0.12)' : 'rgba(255,69,58,0.12)'}`,
        padding: '18px 20px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle glow accent */}
      <div
        style={{
          position: 'absolute', top: -20, left: -20,
          width: 80, height: 80, borderRadius: '50%',
          background: isProfit ? `${C.success}08` : `${C.danger}08`,
          filter: 'blur(20px)', pointerEvents: 'none',
        }}
      />

      {/* Row 1: Symbol + Side Badge + Close Button */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 18, fontWeight: 800, color: C.text, fontFamily: FONT_MONO }}>
            {trade.symbol}
          </span>
          <span
            style={{
              fontSize: 10, padding: '3px 8px', borderRadius: 8, fontWeight: 700,
              background: trade.side === 'long' ? 'rgba(50,215,75,0.15)' : 'rgba(255,69,58,0.15)',
              color: trade.side === 'long' ? C.success : C.danger,
              fontFamily: FONT_AR,
            }}
          >
            {trade.side === 'long' ? 'شراء' : 'بيع'}
          </span>
          {trade.source === 'bot' && (
            <span
              style={{
                fontSize: 9, padding: '2px 6px', borderRadius: 6, fontWeight: 700,
                background: 'rgba(0,212,255,0.12)', color: C.accent,
                fontFamily: FONT_AR,
              }}
            >
              بوت
            </span>
          )}
        </div>
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={onCloseClick}
          style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'rgba(255,69,58,0.1)', border: '0.5px solid rgba(255,69,58,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X size={14} color={C.danger} />
        </motion.button>
      </div>

      {/* Row 2: Entry Price & Current Price */}
      <div className="flex items-center gap-4 mb-3">
        <div>
          <div style={{ fontSize: 9, color: C.text2, fontFamily: FONT_AR, marginBottom: 1 }}>سعر الدخول</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: FONT_MONO }}>
            {trade.entryPrice.toFixed(2)}
          </div>
        </div>
        <div style={{ width: 1, height: 24, background: C.border }} />
        <div>
          <div style={{ fontSize: 9, color: C.text2, fontFamily: FONT_AR, marginBottom: 1 }}>السعر الحالي</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.accent, fontFamily: FONT_MONO }}>
            {trade.currentPrice?.toFixed(2) || '—'}
          </div>
        </div>
      </div>

      {/* Row 3: P&L */}
      <div
        className="flex items-center justify-between mb-3"
        style={{
          padding: '10px 14px', borderRadius: 14,
          background: isProfit ? 'rgba(50,215,75,0.06)' : 'rgba(255,69,58,0.06)',
          border: `0.5px solid ${isProfit ? 'rgba(50,215,75,0.1)' : 'rgba(255,69,58,0.1)'}`,
        }}
      >
        <div className="flex items-center gap-2">
          {isProfit ? <TrendingUp size={14} color={C.success} /> : <TrendingDown size={14} color={C.danger} />}
          <span style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR }}>الربح / الخسارة</span>
        </div>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 16, fontWeight: 800, color: pnlColor(trade.unrealizedPnl), fontFamily: FONT_MONO }}>
            {sign(trade.unrealizedPnl)}${fmt(trade.unrealizedPnl)}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: pnlColor(trade.unrealizedPct), fontFamily: FONT_MONO, opacity: 0.7 }}>
            {sign(trade.unrealizedPct)}{fmt(trade.unrealizedPct)}%
          </span>
        </div>
      </div>

      {/* Row 4: TP & SL Levels */}
      {(trade.tp || trade.sl) && (
        <div className="flex gap-3 mb-3">
          {trade.tp && (
            <div
              className="flex items-center gap-2"
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 10,
                background: 'rgba(50,215,75,0.05)', border: '0.5px solid rgba(50,215,75,0.08)',
              }}
            >
              <Target size={12} color={C.success} />
              <div>
                <div style={{ fontSize: 8, color: 'rgba(50,215,75,0.6)', fontFamily: FONT_AR }}>الهدف</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.success, fontFamily: FONT_MONO }}>
                  {trade.tp.toFixed(2)}
                </div>
              </div>
            </div>
          )}
          {trade.sl && (
            <div
              className="flex items-center gap-2"
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 10,
                background: 'rgba(255,69,58,0.05)', border: '0.5px solid rgba(255,69,58,0.08)',
              }}
            >
              <ShieldAlert size={12} color={C.danger} />
              <div>
                <div style={{ fontSize: 8, color: 'rgba(255,69,58,0.6)', fontFamily: FONT_AR }}>الوقف</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.danger, fontFamily: FONT_MONO }}>
                  {trade.sl.toFixed(2)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Row 5: Progress Bar (distance to TP vs SL) */}
      {(trade.tp || trade.sl) && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span style={{ fontSize: 9, color: C.text2, fontFamily: FONT_AR }}>وقف</span>
            <span style={{ fontSize: 9, color: C.text2, fontFamily: FONT_AR }}>هدف</span>
          </div>
          <div
            style={{
              height: 4, borderRadius: 2,
              background: 'rgba(255,255,255,0.06)',
              position: 'relative', overflow: 'hidden',
            }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              style={{
                height: '100%', borderRadius: 2,
                background: `linear-gradient(90deg, ${C.danger}, ${C.amber}, ${C.success})`,
              }}
            />
          </div>
        </div>
      )}
    </motion.div>
  )
}

/* ─── Main Page ─── */
export default function MobilePositionsPage() {
  const router = useRouter()
  const { trades, closeTrade } = usePaperTradesStore()
  const { quotes } = useMarketStore()

  const [activeTab, setActiveTab] = useState<FilterTab>('ALL')
  const [closingTrade, setClosingTrade] = useState<PaperTrade | null>(null)
  const [isClosing, setIsClosing] = useState(false)

  // Subscribe to real-time price updates for open positions
  useEffect(() => {
    const symbols = trades.map(t => t.symbol)
    const unique = [...new Set(symbols)]
    unique.forEach(s => binanceWS.subscribe(s))
    return () => {
      unique.forEach(s => binanceWS.unsubscribe(s))
    }
  }, [trades.map(t => t.symbol).join(',')])

  // Sync market prices into paper trades store
  useEffect(() => {
    const { updatePrice } = usePaperTradesStore.getState()
    for (const trade of trades) {
      const q = quotes[trade.symbol]
      if (q && q.price && q.price !== trade.currentPrice) {
        updatePrice(trade.symbol, q.price)
      }
    }
  }, [quotes, trades.length])

  // Filtered positions
  const filteredTrades = useMemo(() => {
    if (activeTab === 'PROFIT') return trades.filter(t => t.unrealizedPnl >= 0)
    if (activeTab === 'LOSS') return trades.filter(t => t.unrealizedPnl < 0)
    return trades
  }, [trades, activeTab])

  // Summary stats
  const totalPnl = useMemo(() => trades.reduce((s, t) => s + t.unrealizedPnl, 0), [trades])
  const totalValue = useMemo(
    () => trades.reduce((s, t) => s + t.qty * (t.currentPrice || t.entryPrice), 0),
    [trades]
  )
  const positionCount = trades.length

  // Close handler
  const handleClose = useCallback(async () => {
    if (!closingTrade) return
    setIsClosing(true)
    try {
      closeTrade(closingTrade.id)
    } finally {
      setIsClosing(false)
      setClosingTrade(null)
    }
  }, [closingTrade, closeTrade])

  const isLoading = false // store is sync, no loading state needed for initial load

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#000000',
        direction: 'rtl',
        paddingBottom: 24,
      }}
    >
      {/* ── Sticky Header ── */}
      <div
        style={{
          padding: '24px 20px 16px',
          background: 'rgba(28, 28, 30, 0.8)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '0.5px solid rgba(255,255,255,0.1)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(255,255,255,0.07)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ArrowRight size={18} color="#FFFFFF" />
          </button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>
              المراكز المفتوحة
            </h1>
            <p style={{ fontSize: 11, color: C.text2, fontFamily: FONT_AR }}>
              تتبع المراكز الحالية والأرباح
            </p>
          </div>
        </div>
      </div>

      {/* ── Summary Stats ── */}
      <div style={{ padding: '20px 20px 0' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 10,
          }}
        >
          {/* Total P&L */}
          <div
            style={{
              padding: '14px 12px', borderRadius: 20,
              background: 'rgba(28,28,30,0.6)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: `0.5px solid ${totalPnl >= 0 ? 'rgba(50,215,75,0.12)' : 'rgba(255,69,58,0.12)'}`,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR, marginBottom: 4 }}>إجمالي الربح</div>
            <div
              style={{
                fontSize: 17, fontWeight: 800,
                color: pnlColor(totalPnl), fontFamily: FONT_MONO,
              }}
            >
              {sign(totalPnl)}${fmt(totalPnl)}
            </div>
          </div>

          {/* Position Count */}
          <div
            style={{
              padding: '14px 12px', borderRadius: 20,
              background: 'rgba(28,28,30,0.6)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '0.5px solid rgba(0,212,255,0.12)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR, marginBottom: 4 }}>عدد المراكز</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.accent, fontFamily: FONT_MONO }}>
              {positionCount}
            </div>
          </div>

          {/* Total Value */}
          <div
            style={{
              padding: '14px 12px', borderRadius: 20,
              background: 'rgba(28,28,30,0.6)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '0.5px solid rgba(255,184,0,0.12)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR, marginBottom: 4 }}>القيمة الإجمالية</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.amber, fontFamily: FONT_MONO }}>
              ${fmt(totalValue, 0)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Filter Tabs ── */}
      <div style={{ padding: '18px 20px 0' }}>
        <div
          className="flex gap-2"
          style={{
            padding: 4, borderRadius: 14,
            background: 'rgba(255,255,255,0.04)',
            border: `0.5px solid ${C.border}`,
          }}
        >
          {TABS.map(tab => {
            const isActive = activeTab === tab.key
            return (
              <motion.button
                key={tab.key}
                whileTap={{ scale: 0.96 }}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 10, border: 'none',
                  background: isActive
                    ? tab.key === 'PROFIT'
                      ? 'rgba(50,215,75,0.2)'
                      : tab.key === 'LOSS'
                        ? 'rgba(255,69,58,0.2)'
                        : 'rgba(0,212,255,0.2)'
                    : 'transparent',
                  color: isActive
                    ? tab.key === 'PROFIT'
                      ? C.success
                      : tab.key === 'LOSS'
                        ? C.danger
                        : C.accent
                    : C.text2,
                  fontSize: 12, fontWeight: isActive ? 800 : 500,
                  fontFamily: FONT_AR,
                  transition: 'all 0.2s',
                }}
              >
                {tab.label}
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* ── Positions List ── */}
      <div style={{ padding: '16px 20px' }}>
        {isLoading ? (
          /* Loading State */
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <Loader2 size={32} className="animate-spin" color={C.accent} style={{ margin: '0 auto 16px' }} />
            <p style={{ fontSize: 13, color: C.text2, fontFamily: FONT_AR }}>جاري تحميل المراكز...</p>
          </div>
        ) : filteredTrades.length === 0 ? (
          /* Empty State */
          <div
            style={{
              padding: '60px 20px', textAlign: 'center',
              background: 'rgba(255,255,255,0.02)', borderRadius: 28,
              border: '1px dashed rgba(255,255,255,0.1)',
            }}
          >
            <Activity size={40} color="rgba(255,255,255,0.08)" style={{ margin: '0 auto 16px' }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: C.text2, fontFamily: FONT_AR, marginBottom: 6 }}>
              لا توجد مراكز مفتوحة
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', fontFamily: FONT_AR, lineHeight: 1.6 }}>
              {activeTab === 'ALL'
                ? 'ابدأ بتداول ورقي من الشارت أو الإشارات لرؤية مراكزك هنا'
                : activeTab === 'PROFIT'
                  ? 'لا توجد مراكز رابحة حالياً'
                  : 'لا توجد مراكز خاسرة حالياً — ممتاز!'}
            </p>
          </div>
        ) : (
          /* Positions List */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <AnimatePresence mode="popLayout">
              {filteredTrades.map(trade => (
                <PositionCard
                  key={trade.id}
                  trade={trade}
                  onCloseClick={() => setClosingTrade(trade)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── Close Confirmation Bottom Sheet ── */}
      <AnimatePresence>
        {closingTrade && (
          <CloseSheet
            trade={closingTrade}
            onConfirm={handleClose}
            onClose={() => setClosingTrade(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Closing Overlay Spinner ── */}
      <AnimatePresence>
        {isClosing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          >
            <Loader2 size={32} className="animate-spin" color={C.accent} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
