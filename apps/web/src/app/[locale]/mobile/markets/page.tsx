'use client'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useMemo } from 'react'
import { ChevronLeft } from 'lucide-react'

export default function MarketsPage() {
  const router = useRouter()
  const tm = useTranslations('mobile.more')
  const quotes = useMarketStore(s => s.quotes)
  const pairs = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'BNB/USD', 'XAU/USD', 'EUR/USD', 'GBP/USD']

  return (
    <div className="m-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={() => router.back()} style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronLeft size={18} color="rgba(255,255,255,0.6)" /></button>
        <span style={{ fontSize: 20, fontWeight: 900, color: '#FFF', fontFamily: 'var(--cairo)' }}>{tm('markets')}</span>
      </div>
      {pairs.map(sym => {
        const q = quotes[sym]
        const price = q?.price ?? 0
        const change = q?.changePercent ?? 0
        const up = change >= 0
        return (
          <div key={sym} onClick={() => router.push(`/mobile/chart?symbol=${sym}`)} className="m-card" style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: 'var(--mono)' }}>{sym}</span>
            {price > 0 ? (
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: '#FFF', fontFamily: 'var(--mono)' }}>${price > 100 ? price.toLocaleString('en', { maximumFractionDigits: 2 }) : price.toFixed(price < 10 ? 4 : 2)}</div>
                <div style={{ fontSize: 9, fontWeight: 800, color: up ? '#32D74B' : '#FF453A', fontFamily: 'var(--mono)' }}>{up ? '+' : ''}{change.toFixed(2)}%</div>
              </div>
            ) : <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>—</span>}
          </div>
        )
      })}
    </div>
  )
}
