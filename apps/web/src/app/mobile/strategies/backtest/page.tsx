'use client'

import { useState } from 'react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { FlaskConical, Play, BarChart3, TrendingUp, TrendingDown, Loader2 } from 'lucide-react'

const MOCK_STRATEGIES = ['اختراق الزخم', 'شبكة DCA', 'عودة للمتوسط', 'VWAP + RSI']
const MOCK_RESULTS = { totalReturn: '+23.4%', maxDrawdown: '-8.2%', sharpeRatio: '1.84', winRate: '67%', totalTrades: 245, avgHoldingTime: '4.2 ساعة', profitFactor: '2.14' }

export default function MobileBacktestPage() {
  const [strategy, setStrategy] = useState(MOCK_STRATEGIES[0])
  const [startDate, setStartDate] = useState('2025-01-01')
  const [endDate, setEndDate] = useState('2025-05-01')
  const [capital, setCapital] = useState('10000')
  const [running, setRunning] = useState(false)
  const [showResults, setShowResults] = useState(false)

  const runBacktest = () => { setRunning(true); setTimeout(() => { setRunning(false); setShowResults(true) }, 2500) }

  return (
    <div className="m-page">
      <MobilePageHeader title="اختبار الاستراتيجيات" subtitle="Backtest" />

      {/* Config */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><FlaskConical size={16} color="#FF9F43" /><span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>إعدادات الاختبار</span></div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", display: 'block', marginBottom: 3 }}>الاستراتيجية</label>
          <select value={strategy} onChange={e => setStrategy(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', color: '#FFF', fontSize: 12, fontFamily: "'Cairo', sans-serif", outline: 'none' }}>
            {MOCK_STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <div><label style={{ fontSize: 10, fontWeight: 700, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", display: 'block', marginBottom: 3 }}>من تاريخ</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', color: '#FFF', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", outline: 'none', direction: 'ltr' }} /></div>
          <div><label style={{ fontSize: 10, fontWeight: 700, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", display: 'block', marginBottom: 3 }}>إلى تاريخ</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', color: '#FFF', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", outline: 'none', direction: 'ltr' }} /></div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", display: 'block', marginBottom: 3 }}>رأس المال الابتدائي</label>
          <input type="number" value={capital} onChange={e => setCapital(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', color: '#FFF', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: 'none', direction: 'ltr' }} />
        </div>
        <button onClick={runBacktest} disabled={running} style={{ width: '100%', padding: '10px 0', borderRadius: 10, background: running ? 'rgba(255,159,67,0.2)' : 'linear-gradient(135deg, #FF9F43, #FF6B35)', border: 'none', color: running ? '#FF9F43' : '#000', fontSize: 13, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: running ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, touchAction: 'manipulation' }}>
          {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          {running ? 'جارٍ الاختبار...' : 'تشغيل الاختبار'}
        </button>
      </IOSCard>

      {/* Results */}
      {showResults && (
        <>
          <div style={{ padding: '0 16px', marginBottom: 6, marginTop: 6 }}><span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>النتائج</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 16px', marginBottom: 8 }}>
            <IOSCard noMargin><div style={{ textAlign: 'center' }}><TrendingUp size={14} color="#00FFA3" style={{ margin: '0 auto 3px' }} /><div style={{ fontSize: 16, fontWeight: 900, color: '#00FFA3', fontFamily: "'JetBrains Mono', monospace" }}>{MOCK_RESULTS.totalReturn}</div><div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>العائد الإجمالي</div></div></IOSCard>
            <IOSCard noMargin><div style={{ textAlign: 'center' }}><TrendingDown size={14} color="#FF453A" style={{ margin: '0 auto 3px' }} /><div style={{ fontSize: 16, fontWeight: 900, color: '#FF453A', fontFamily: "'JetBrains Mono', monospace" }}>{MOCK_RESULTS.maxDrawdown}</div><div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>أقصى تراجع</div></div></IOSCard>
            <IOSCard noMargin><div style={{ textAlign: 'center' }}><BarChart3 size={14} color="#00D4FF" style={{ margin: '0 auto 3px' }} /><div style={{ fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{MOCK_RESULTS.sharpeRatio}</div><div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>شارب</div></div></IOSCard>
            <IOSCard noMargin><div style={{ textAlign: 'center' }}><FlaskConical size={14} color="#FFB800" style={{ margin: '0 auto 3px' }} /><div style={{ fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{MOCK_RESULTS.winRate}</div><div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>نسبة الفوز</div></div></IOSCard>
          </div>
          <IOSCard>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}><span style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>عدد الصفقات</span><span style={{ fontSize: 11, fontWeight: 800, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{MOCK_RESULTS.totalTrades}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}><span style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>متوسط مدة الصفقة</span><span style={{ fontSize: 11, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>{MOCK_RESULTS.avgHoldingTime}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}><span style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>معامل الربح</span><span style={{ fontSize: 11, fontWeight: 800, color: '#00FFA3', fontFamily: "'JetBrains Mono', monospace" }}>{MOCK_RESULTS.profitFactor}</span></div>
          </IOSCard>
        </>
      )}
      <div style={{ height: 16 }} />
    </div>
  )
}
