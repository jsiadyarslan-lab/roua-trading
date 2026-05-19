'use client'

import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { GitMerge, Info, TrendingUp, TrendingDown } from 'lucide-react'

const PAIRS = ['BTC/USD', 'ETH/USD', 'XAU/USD', 'EUR/USD', 'SOL/USD']
const CORR_DATA: Record<string, Record<string, number>> = {
  'BTC/USD': { 'BTC/USD': 1, 'ETH/USD': 0.87, 'XAU/USD': 0.12, 'EUR/USD': -0.15, 'SOL/USD': 0.82 },
  'ETH/USD': { 'BTC/USD': 0.87, 'ETH/USD': 1, 'XAU/USD': 0.08, 'EUR/USD': -0.11, 'SOL/USD': 0.79 },
  'XAU/USD': { 'BTC/USD': 0.12, 'ETH/USD': 0.08, 'XAU/USD': 1, 'EUR/USD': 0.65, 'SOL/USD': 0.05 },
  'EUR/USD': { 'BTC/USD': -0.15, 'ETH/USD': -0.11, 'XAU/USD': 0.65, 'EUR/USD': 1, 'SOL/USD': -0.18 },
  'SOL/USD': { 'BTC/USD': 0.82, 'ETH/USD': 0.79, 'XAU/USD': 0.05, 'EUR/USD': -0.18, 'SOL/USD': 1 },
}

const corrColor = (v: number) => v > 0.5 ? '#00FFA3' : v > 0 ? 'rgba(0,255,163,0.5)' : v < -0.5 ? '#FF453A' : v < 0 ? 'rgba(255,69,58,0.5)' : '#8B92A8'
const corrBg = (v: number) => v > 0.5 ? 'rgba(0,255,163,0.08)' : v > 0 ? 'rgba(0,255,163,0.04)' : v < -0.5 ? 'rgba(255,69,58,0.08)' : v < 0 ? 'rgba(255,69,58,0.04)' : 'rgba(255,255,255,0.02)'

export default function MobileCorrelationPage() {
  return (
    <div className="m-page">
      <MobilePageHeader title="الارتباط" subtitle="معامل ارتباط بيرسون بين الأزواج" />

      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><Info size={16} color="#00D4FF" /><span style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", lineHeight: 1.5 }}>معامل بيرسون يقيس قوة واتجاه العلاقة بين زوجين. القيمة من -1 (عكسية كاملة) إلى +1 (طردية كاملة).</span></div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(0,255,163,0.4)' }} /><span style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>طردي</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(255,255,255,0.1)' }} /><span style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>محايد</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(255,69,58,0.4)' }} /><span style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>عكسي</span></div>
        </div>
      </IOSCard>

      {/* Matrix */}
      <div style={{ padding: '0 16px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', direction: 'ltr' }}>
          <thead>
            <tr>
              <th style={{ padding: '6px 4px', fontSize: 8, fontWeight: 800, color: '#8B92A8', fontFamily: "'JetBrains Mono', monospace", textAlign: 'center', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}></th>
              {PAIRS.map(p => <th key={p} style={{ padding: '6px 2px', fontSize: 7, fontWeight: 800, color: '#8B92A8', fontFamily: "'JetBrains Mono', monospace", textAlign: 'center', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>{p.split('/')[0]}</th>)}
            </tr>
          </thead>
          <tbody>
            {PAIRS.map(row => (
              <tr key={row}>
                <td style={{ padding: '6px 4px', fontSize: 8, fontWeight: 800, color: '#F0F2F5', fontFamily: "'JetBrains Mono', monospace", borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>{row.split('/')[0]}</td>
                {PAIRS.map(col => {
                  const v = CORR_DATA[row]?.[col] ?? 0
                  return <td key={col} style={{ padding: '6px 2px', textAlign: 'center', background: corrBg(v), borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}><span style={{ fontSize: 9, fontWeight: 800, color: corrColor(v), fontFamily: "'JetBrains Mono', monospace" }}>{v.toFixed(2)}</span></td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Key Correlations */}
      <div style={{ padding: '0 16px', marginTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif", marginBottom: 6 }}>أقوى الارتباطات</div>
      </div>
      {[
        { pair1: 'BTC/USD', pair2: 'ETH/USD', corr: 0.87, label: 'طردي قوي' },
        { pair1: 'BTC/USD', pair2: 'SOL/USD', corr: 0.82, label: 'طردي قوي' },
        { pair1: 'XAU/USD', pair2: 'EUR/USD', corr: 0.65, label: 'طردي متوسط' },
        { pair1: 'EUR/USD', pair2: 'SOL/USD', corr: -0.18, label: 'عكسي ضعيف' },
      ].map((item, i) => (
        <IOSCard key={i}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GitMerge size={14} color={item.corr > 0 ? '#00FFA3' : '#FF453A'} />
              <span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{item.pair1} — {item.pair2}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: corrColor(item.corr), fontFamily: "'JetBrains Mono', monospace" }}>{item.corr > 0 ? '+' : ''}{item.corr.toFixed(2)}</span>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: corrBg(item.corr), color: corrColor(item.corr), fontFamily: "'Cairo', sans-serif" }}>{item.label}</span>
            </div>
          </div>
        </IOSCard>
      ))}
      <div style={{ height: 16 }} />
    </div>
  )
}
