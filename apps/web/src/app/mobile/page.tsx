'use client'

import { useRouter } from 'next/navigation'
import { useMarketStore } from '@/hooks/useMarketStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useDashboardStore, type TradingMode } from '@/lib/dashboard-store'
import { useEffect, useMemo } from 'react'
import { TrendingUp, TrendingDown, Zap, Brain, Activity, Wallet } from 'lucide-react'

const MODE: Record<TradingMode, { color: string; label: string }> = {
  trader: { color: '#00D4FF', label: 'تاجر' },
  investor: { color: '#32D74B', label: 'مستثمر' },
  ai: { color: '#A78BFA', label: 'ذكاء' },
}

export default function MobileHome() {
  const router = useRouter()
  const quotes = useMarketStore(s => s.quotes)
  const mode = useDashboardStore(s => s.mode)
  const account = usePositionsStore(s => s.account)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)

  useEffect(() => { fetchAccount() }, [fetchAccount])

  const balance = useMemo(() => account?.buying_power ? Number(account.buying_power) : 0, [account?.buying_power])
  const modeColor = MODE[mode]?.color || '#00D4FF'
  const modeLabel = MODE[mode]?.label || 'تاجر'

  const pairs = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XAU/USD']

  return (
    <div className="m-page">
      {/* الرأس */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#FFF', fontFamily: 'var(--cairo)' }}>رؤى</div>
          <div style={{ fontSize: 11, color: modeColor, fontFamily: 'var(--cairo)', fontWeight: 700 }}>منصة ربط الحسابات</div>
        </div>
        <div style={{ padding: '4px 10px', borderRadius: 8, background: `${modeColor}15`, border: `0.5px solid ${modeColor}30` }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: modeColor, fontFamily: 'var(--cairo)' }}>{modeLabel}</span>
        </div>
      </div>

      {/* أزرار سريعة */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'الشارت', icon: TrendingUp, href: '/mobile/chart', color: '#00D4FF' },
          { label: 'الوكيل', icon: Zap, href: '/mobile/trade', color: '#FF9F43' },
          { label: 'الذكاء', icon: Brain, href: '/mobile/ai', color: '#B388FF' },
          { label: 'المراكز', icon: Activity, href: '/mobile/positions', color: '#00FFA3' },
        ].map(item => {
          const Icon = item.icon
          return (
            <button key={item.href} onClick={() => router.push(item.href)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              padding: '10px 4px', borderRadius: 14,
              background: `${item.color}08`, border: `0.5px solid ${item.color}18`,
              cursor: 'pointer',
            }}>
              <div style={{ width: 30, height: 30, borderRadius: 10, background: `${item.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={15} color={item.color} />
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--cairo)' }}>{item.label}</span>
            </button>
          )
        })}
      </div>

      {/* قوة الشراء */}
      {balance > 0 && (
        <div className="m-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Wallet size={16} color="#00D4FF" />
            <span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: 'var(--cairo)' }}>قوة الشراء</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#FFF', fontFamily: 'var(--mono)' }}>
            ${balance.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      )}

      {/* قائمة المراقبة */}
      <div className="m-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--cairo)' }}>قائمة المراقبة</span>
          <button onClick={() => router.push('/mobile/markets')} style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 800, fontFamily: 'var(--cairo)', background: 'none', border: 'none', cursor: 'pointer' }}>المزيد</button>
        </div>
        {pairs.map(sym => {
          const q = quotes[sym]
          const price = q?.price ?? 0
          const change = q?.changePercent ?? 0
          const up = change >= 0
          return (
            <div key={sym} onClick={() => router.push(`/mobile/chart?symbol=${sym}`)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 4px', cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: 'rgba(255,255,255,0.04)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--mono)',
                }}>
                  {sym.split('/')[0].slice(0, 2)}
                </div>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: 'var(--mono)' }}>{sym}</span>
              </div>
              <div style={{ textAlign: 'left' }}>
                {price > 0 ? (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 900, color: '#FFF', fontFamily: 'var(--mono)' }}>
                      ${price > 100 ? price.toLocaleString('en', { maximumFractionDigits: 2 }) : price.toFixed(price < 10 ? 4 : 2)}
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 800, color: up ? '#32D74B' : '#FF453A', fontFamily: 'var(--mono)' }}>
                      {up ? '+' : ''}{change.toFixed(2)}%
                    </div>
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>—</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
