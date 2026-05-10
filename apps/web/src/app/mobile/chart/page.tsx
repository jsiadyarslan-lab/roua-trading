'use client'

import dynamic from 'next/dynamic'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { ensureAuth } from '@/lib/api-fetch'
import {
  X, Target, ShieldAlert, Loader2, CheckCircle, AlertCircle,
  Minus, Plus, ArrowUpRight, ArrowDownRight
} from 'lucide-react'

const RouaChart = dynamic(() => import('@/components/charts/RouaChart'), {
  ssr: false,
  loading: () => (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0B0E14' }}>
      <div className="animate-spin" style={{ width: 24, height: 24, border: '2px solid rgba(0,212,255,0.1)', borderTopColor: '#00D4FF', borderRadius: '50%' }} />
    </div>
  )
})

const C = {
  accent: '#00D4FF',
  success: '#32D74B',
  danger: '#FF453A',
  text: '#F0F2F5',
  bg: 'rgba(28, 28, 30, 0.98)',
}

function ChartPageContent() {
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()
  const quotes = useMarketStore(s => s.quotes)
  const addPaperTrade = usePaperTradesStore(s => s.addTrade)
  const addNotification = useNotificationStore(s => s.addNotification)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)
  const fetchPositions = usePositionsStore(s => s.fetchPositions)
  const account = usePositionsStore(s => s.account)

  const [showOrderSheet, setShowOrderSheet] = useState(false)
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy')
  const [quantity, setQuantity] = useState('0.01')
  const [execStatus, setExecStatus] = useState<'idle' | 'submitting' | 'filled' | 'error'>('idle')
  const [execMessage, setExecMessage] = useState('')

  const quoteKey = (quotes && selectedSymbol) ? Object.keys(quotes).find(k =>
    k.toUpperCase().replace('/', '') === selectedSymbol.toUpperCase().replace('/', '')
  ) : null
  const quote = quoteKey ? quotes[quoteKey] : null
  const livePrice = quote ? Number(quote.price) : null
  const changePercent = quote?.changePercent ?? 0

  const executeOrder = async (side: 'buy' | 'sell') => {
    const qty = parseFloat(quantity)
    if (!qty || qty <= 0 || !livePrice) {
      setExecStatus('error')
      setExecMessage('يرجى إدخال كمية صالحة')
      setTimeout(() => setExecStatus('idle'), 3000)
      return
    }

    setExecStatus('submitting')
    setExecMessage('جارٍ إرسال الأمر...')

    try {
      await ensureAuth()
      const credRes = await fetch('/api/portfolio/credentials')
      const credData = await credRes.json()
      const credentials = credData.data || credData.credentials || []
      const credentialId = credentials[0]?.id || credentials[0]?.credentialId

      if (credentialId) {
        const nestBody = {
          credentialId,
          symbol: selectedSymbol,
          side: side.toUpperCase(),
          type: 'MARKET',
          quantity: parseFloat(quantity),
        }

        const res = await fetch('/api/trading/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nestBody),
        })
        const j = await res.json()

        if (res.ok && j.id) {
          addPaperTrade({
            symbol: selectedSymbol,
            side: side === 'buy' ? 'long' : 'short',
            qty: parseFloat(quantity),
            entryPrice: livePrice,
            currentPrice: livePrice,
            source: 'manual',
            entryTime: Date.now()
          })

          setExecStatus('filled')
          setExecMessage(`تم ${side === 'buy' ? 'شراء' : 'بيع'} ${quantity} ${selectedSymbol} بسعر $${livePrice.toFixed(2)}`)

          addNotification({
            source: 'trade',
            priority: 'high',
            action: side === 'buy' ? 'BUY' : 'SELL',
            title: `تم ${side === 'buy' ? 'شراء' : 'بيع'} ${selectedSymbol}`,
            body: `${quantity} ${selectedSymbol} @ $${livePrice.toFixed(2)}`,
            pair: selectedSymbol,
            price: livePrice,
          })

          fetchAccount()
          fetchPositions()

          setTimeout(() => {
            setShowOrderSheet(false)
            setExecStatus('idle')
            setQuantity('0.01')
          }, 2000)
        } else {
          setExecStatus('error')
          setExecMessage(j.message || 'فشل تنفيذ الأمر')
          setTimeout(() => setExecStatus('idle'), 3000)
        }
      }
    } catch {
      setExecStatus('error')
      setExecMessage('خطأ في الشبكة')
      setTimeout(() => setExecStatus('idle'), 3000)
    }
  }

  const fmtPrice = (p: number | null) => {
    if (!p) return '—'
    if (p > 100) return p.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return p.toFixed(4)
  }

  return (
    <div style={{
      height: '100%',
      background: '#0B0E14',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Top Bar */}
      <div style={{
        flexShrink: 0,
        height: 48,
        marginTop: 'calc(env(safe-area-inset-top) + 2px)',
        marginLeft: 12,
        marginRight: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        direction: 'rtl',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, direction: 'ltr' }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: '#00D4FF', fontFamily: 'JetBrains Mono, monospace' }}>
            {selectedSymbol}
          </span>
          <span style={{
            fontSize: 14, fontWeight: 900,
            color: livePrice ? (changePercent >= 0 ? C.success : C.danger) : '#666',
            fontFamily: 'JetBrains Mono, monospace',
          }}>
            {fmtPrice(livePrice)}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: changePercent >= 0 ? C.success : C.danger,
            fontFamily: 'JetBrains Mono, monospace',
            padding: '2px 6px', borderRadius: 4,
            background: changePercent >= 0 ? 'rgba(50,215,75,0.1)' : 'rgba(255,69,58,0.1)',
          }}>
            {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
          </span>
        </div>

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => { setOrderSide('buy'); setShowOrderSheet(true) }}
          style={{
            height: 32,
            padding: '0 12px',
            borderRadius: 8,
            background: 'linear-gradient(135deg, #00D4FF 0%, #00A8CC 100%)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 800, color: '#000', fontFamily: 'Cairo, sans-serif' }}>تداول</span>
        </motion.button>
      </div>

      {/* Chart Area - Full Height */}
      <div style={{
        position: 'absolute',
        top: 60, // Top bar height
        left: 12,
        right: 12,
        bottom: 12, // Bottom margin
        borderRadius: 12,
        overflow: 'hidden',
        background: '#0B0E14',
        border: '1px solid rgba(0,212,255,0.15)',
        direction: 'ltr',
      }}>
        <RouaChart
          currentPrice={livePrice}
          isChartFullscreen={false}
          onToggleChartFullscreen={() => {}}
        />
        
        {/* Floating Buy/Sell Buttons */}
        <div style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          right: 12,
          display: 'flex',
          gap: 8,
          zIndex: 10,
        }}>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => { setOrderSide('buy'); setShowOrderSheet(true) }}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 12,
              background: 'rgba(50,215,75,0.9)',
              border: '1px solid rgba(50,215,75,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              cursor: 'pointer',
              backdropFilter: 'blur(10px)',
            }}
          >
            <ArrowUpRight size={16} color="#FFF" />
            <span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: 'Cairo, sans-serif' }}>شراء</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => { setOrderSide('sell'); setShowOrderSheet(true) }}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 12,
              background: 'rgba(255,69,58,0.9)',
              border: '1px solid rgba(255,69,58,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              cursor: 'pointer',
              backdropFilter: 'blur(10px)',
            }}
          >
            <ArrowDownRight size={16} color="#FFF" />
            <span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: 'Cairo, sans-serif' }}>بيع</span>
          </motion.button>
        </div>
      </div>

      {/* Order Sheet */}
      <AnimatePresence>
        {showOrderSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { if (execStatus !== 'submitting') setShowOrderSheet(false) }}
              style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)' }}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              style={{
                position: 'fixed', bottom: '56px', left: 0, right: 0, zIndex: 45,
                background: C.bg,
                backdropFilter: 'blur(50px) saturate(200%)',
                borderRadius: '24px 24px 0 0',
                borderTop: '0.5px solid rgba(255,255,255,0.15)',
                direction: 'rtl',
                boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <div className="flex justify-center pt-3 pb-2" style={{ flexShrink: 0 }}>
                <div style={{ width: 36, height: 5, borderRadius: 2.5, background: 'rgba(255,255,255,0.2)' }} />
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px', WebkitOverflowScrolling: 'touch' }}>
                <div className="flex items-center justify-between mb-4">
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF', fontFamily: 'Cairo, sans-serif' }}>تنفيذ صفقة</h2>
                  <button
                    onClick={() => { if (execStatus !== 'submitting') setShowOrderSheet(false) }}
                    style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}
                  >
                    <X size={18} color="#FFFFFF" />
                  </button>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 16, padding: 4, display: 'flex', marginBottom: 14, position: 'relative' }}>
                  <motion.div
                    animate={{ x: orderSide === 'buy' ? 0 : '100%' }}
                    style={{ position: 'absolute', top: 4, left: 4, width: 'calc(50% - 4px)', bottom: 4, background: orderSide === 'buy' ? C.success : C.danger, borderRadius: 12, zIndex: 0 }}
                  />
                  <button onClick={() => setOrderSide('buy')} style={{ flex: 1, height: 40, borderRadius: 12, border: 'none', background: 'transparent', fontSize: 15, fontWeight: 800, color: orderSide === 'buy' ? '#000' : '#FFF', fontFamily: 'Cairo, sans-serif', zIndex: 1, position: 'relative' }}>شراء</button>
                  <button onClick={() => setOrderSide('sell')} style={{ flex: 1, height: 40, borderRadius: 12, border: 'none', background: 'transparent', fontSize: 15, fontWeight: 800, color: orderSide === 'sell' ? '#000' : '#FFF', fontFamily: 'Cairo, sans-serif', zIndex: 1, position: 'relative' }}>بيع</button>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: '#999', fontFamily: 'Cairo, sans-serif', fontWeight: 700, display: 'block', marginBottom: 4 }}>الكمية</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => setQuantity(String(Math.max(0.01, parseFloat(quantity) - 0.01)))}
                      style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                      <Minus size={14} color="#999" />
                    </motion.button>
                    <input
                      value={quantity} onChange={e => setQuantity(e.target.value)}
                      type="number"
                      style={{
                        flex: 1, height: 40, borderRadius: 8, background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)', padding: '0 12px',
                        color: '#FFF', fontSize: 14, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace',
                        outline: 'none', direction: 'ltr', textAlign: 'center',
                      }}
                    />
                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => setQuantity(String(parseFloat(quantity) + 0.01))}
                      style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                      <Plus size={14} color="#999" />
                    </motion.button>
                  </div>
                </div>

                <div style={{ flexShrink: 0, padding: '8px 20px 20px', borderTop: '0.5px solid rgba(255,255,255,0.08)', background: 'rgba(20,20,22,0.95)' }}>
                  {execStatus === 'idle' && (
                    <button
                      onClick={() => executeOrder(orderSide)}
                      style={{
                        width: '100%',
                        padding: '14px 0',
                        borderRadius: 12,
                        border: 'none',
                        background: orderSide === 'buy'
                          ? 'linear-gradient(135deg, #32D74B 0%, #28A745 100%)'
                          : 'linear-gradient(135deg, #FF453A 0%, #DC2626 100%)',
                        color: '#FFFFFF',
                        fontSize: 14,
                        fontWeight: 800,
                        fontFamily: 'Cairo, sans-serif',
                        cursor: 'pointer',
                      }}
                    >
                      {orderSide === 'buy' ? 'شراء' : 'بيع'} {selectedSymbol}
                    </button>
                  )}

                  {execStatus === 'submitting' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0' }}>
                      <Loader2 size={20} className="animate-spin" color="#00D4FF" />
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#F0F2F5', fontFamily: 'Cairo, sans-serif' }}>
                        جارٍ التنفيذ...
                      </span>
                    </div>
                  )}

                  {execStatus === 'filled' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', background: 'rgba(50,215,75,0.1)', borderRadius: 12 }}>
                      <CheckCircle size={20} color="#32D74B" />
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#32D74B', fontFamily: 'Cairo, sans-serif' }}>
                        {execMessage}
                      </span>
                    </div>
                  )}

                  {execStatus === 'error' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', background: 'rgba(255,69,58,0.1)', borderRadius: 12 }}>
                      <AlertCircle size={20} color="#FF453A" />
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#FF453A', fontFamily: 'Cairo, sans-serif' }}>
                        {execMessage}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function MobileChartPage() {
  return (
    <Suspense fallback={
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0B0E14' }}>
        <div className="animate-spin" style={{ width: 24, height: 24, border: '2px solid rgba(0,212,255,0.1)', borderTopColor: '#00D4FF', borderRadius: '50%' }} />
      </div>
    }>
      <ChartPageContent />
    </Suspense>
  )
}
