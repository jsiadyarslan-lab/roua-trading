'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { useMarketStore } from '@/hooks/useMarketStore'
import { ScanSearch, TrendingUp, TrendingDown, Zap, Clock, BarChart3, RefreshCw } from 'lucide-react'

const MOCK_SIGNALS = [
  { symbol: 'BTC/USD', direction: 'buy' as const, strength: 'strong' as const, price: 105420, change: 3.24, reason: 'اختراق مقاومة 105,000 مع حجم تداول مرتفع' },
  { symbol: 'ETH/USD', direction: 'buy' as const, strength: 'medium' as const, price: 3845, change: 2.10, reason: 'ارتداد من دعم متوسط متحرك 50' },
  { symbol: 'XAU/USD', direction: 'sell' as const, strength: 'strong' as const, price: 2412, change: -0.85, reason: 'تقاطع MACD سلبي مع تشبع شرائي' },
  { symbol: 'EUR/USD', direction: 'buy' as const, strength: 'weak' as const, price: 1.0845, change: 0.32, reason: 'نمط انعكاسي على الإطار اليومي' },
  { symbol: 'SOL/USD', direction: 'sell' as const, strength: 'medium' as const, price: 178.5, change: -1.45, reason: 'رفض من مقاومة 180 مع تباعد RSI' },
]

const STRENGTH_CONFIG = { strong: { label: 'قوية', color: '#00FFA3', bg: 'rgba(0,255,163,0.08)' }, medium: { label: 'متوسطة', color: '#FFB800', bg: 'rgba(255,184,0,0.08)' }, weak: { label: 'ضعيفة', color: '#8B92A8', bg: 'rgba(139,146,168,0.08)' } }

export default function MobileScannerPage() {
  const router = useRouter()
  const quotes = useMarketStore(s => s.quotes)
  const [scanning, setScanning] = useState(false)
  const [filter, setFilter] = useState<'all' | 'buy' | 'sell'>('all')

  const handleScan = () => { setScanning(true); setTimeout(() => setScanning(false), 2000) }
  const filtered = MOCK_SIGNALS.filter(s => filter === 'all' || s.direction === filter)

  return (
    <div className="m-page">
      <MobilePageHeader title="سكانر السوق" subtitle="اكتشف الفرص اللحظية" />

      {/* Scan Button */}
      <div style={{ padding: '0 16px', marginBottom: 10 }}>
        <button onClick={handleScan} disabled={scanning} style={{ width: '100%', padding: '12px 0', borderRadius: 14, background: 'linear-gradient(135deg, #00FFA3, #00D4FF)', border: 'none', color: '#000', fontSize: 14, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: scanning ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, touchAction: 'manipulation' }}>
          {scanning ? <RefreshCw size={16} className="animate-spin" /> : <ScanSearch size={16} />}
          {scanning ? 'جارٍ الفحص...' : 'فحص السوق الآن'}
        </button>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 0, margin: '0 16px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 2 }}>
        {([['all', 'الكل'], ['buy', 'شراء'], ['sell', 'بيع']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: filter === key ? 'rgba(0,212,255,0.12)' : 'transparent', border: 'none', color: filter === key ? '#00D4FF' : 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>{label}</button>
        ))}
      </div>

      {/* Results Count */}
      <div style={{ padding: '0 16px', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>{filtered.length} فرصة</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={10} color="#8B92A8" /><span style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>آخر فحص: منذ دقيقة</span></div>
      </div>

      {/* Signals */}
      {filtered.map((signal, i) => {
        const sc = STRENGTH_CONFIG[signal.strength]
        const isBuy = signal.direction === 'buy'
        return (
          <IOSCard key={i} onClick={() => router.push(`/mobile/chart?symbol=${signal.symbol}`)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: isBuy ? 'rgba(0,255,163,0.1)' : 'rgba(255,69,58,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isBuy ? <TrendingUp size={18} color="#00FFA3" /> : <TrendingDown size={18} color="#FF453A" />}
                </div>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{signal.symbol}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: isBuy ? '#00FFA3' : '#FF453A', fontFamily: "'Cairo', sans-serif", marginRight: 8 }}>{isBuy ? 'فرصة شراء' : 'فرصة بيع'}</span>
                </div>
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: sc.bg, color: sc.color, fontFamily: "'Cairo', sans-serif" }}>{sc.label}</span>
            </div>
            <div style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", lineHeight: 1.5, marginBottom: 6 }}>{signal.reason}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>${signal.price.toLocaleString()}</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: signal.change >= 0 ? '#00FFA3' : '#FF453A', fontFamily: "'JetBrains Mono', monospace" }}>{signal.change >= 0 ? '+' : ''}{signal.change.toFixed(2)}%</span>
            </div>
          </IOSCard>
        )
      })}
      <div style={{ height: 16 }} />
    </div>
  )
}
