'use client'

import { useState, useEffect } from 'react'
import { Play, Square, Settings2, Activity, Cpu } from 'lucide-react'

const T = {
  bg:      '#04050C',
  bg2:     '#0D1117',
  card:    '#08090F',
  border:  'rgba(10,132,255,0.12)',
  blue:    '#0A84FF',
  cyan:    '#00C8FF',
  green:   '#00FFC6',
  red:     '#FF4D4D',
  purple:  '#B388FF',
  text:    '#E6EBF5',
  text2:   '#8090A8',
  text3:   '#A0AFC3',
}

export function BotMini() {
  const [isActive, setIsActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ pnl: 0, winRate: 0, trades: 0, strategy: '', name: '' })
  const [statusMsg, setStatusMsg] = useState('يرجى الانتظار...')

  // Fetch bot data on load
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/trading/bot')
        const j = await res.json()
        if (j.success && j.data) {
          setIsActive(j.data.isActive)
          setStats({
            pnl: j.data.dailyPnl,
            winRate: j.data.winRate,
            trades: j.data.totalTrades,
            strategy: j.data.strategy,
            name: j.data.name
          })
          setStatusMsg(j.data.statusMessage)
        }
      } catch (e) {
        setStatusMsg('خطأ في الاتصال')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Toggle Bot Action
  const toggleBot = async () => {
    const newState = !isActive
    setIsActive(newState) // Optimistic update
    setStatusMsg('جاري تحديث الخادم...')
    try {
      const res = await fetch('/api/trading/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newState })
      })
      const j = await res.json()
      if (j.success) {
        setStatusMsg(newState ? 'المحرك نشط' : 'نظام متوقف')
      } else {
        setIsActive(!newState) // Revert
        setStatusMsg('فشل في التعديل')
      }
    } catch {
      setIsActive(!newState) // Revert
      setStatusMsg('خطأ شبكة')
    }
  }

  if (loading) {
    return <div style={{ color: T.text2, fontSize: 10, textAlign: 'center', margin: 'auto' }}>جارٍ جلب البيانات...</div>
  }

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      padding: '8px 12px', boxSizing: 'border-box', background: T.bg
    }}>
      {/* Header -> Status & Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Cpu size={14} color={isActive ? T.cyan : T.text3} />
          <span style={{ fontSize: 11, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
            {stats.name || 'HFT-Alpha'}
          </span>
        </div>
        
        {/* Status Badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 12,
          background: isActive ? `${T.green}15` : `${T.text3}15`,
          border: `0.5px solid ${isActive ? T.green : T.text3}40`
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%', background: isActive ? T.green : T.text3,
            boxShadow: isActive ? `0 0 6px ${T.green}` : 'none'
          }} />
          <span style={{ fontSize: 9, color: isActive ? T.green : T.text3, fontWeight: 800, fontFamily: "'Cairo', sans-serif" }}>
            {isActive ? 'نشــط' : 'متوقــف'}
          </span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
        {/* Metric 1 */}
        <div style={{ background: T.bg2, padding: '6px 8px', borderRadius: 6, border: `0.5px solid ${T.border}` }}>
          <div style={{ fontSize: 8.5, color: T.text3, marginBottom: 2, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>الربح اليومي</div>
          <div style={{ fontSize: 11, fontWeight: 800, color: stats.pnl >= 0 ? T.green : T.red, fontFamily: "'JetBrains Mono', monospace" }}>
            {stats.pnl >= 0 ? '+' : ''}${stats.pnl.toFixed(2)}
          </div>
        </div>
        {/* Metric 2 */}
        <div style={{ background: T.bg2, padding: '6px 8px', borderRadius: 6, border: `0.5px solid ${T.border}` }}>
          <div style={{ fontSize: 8.5, color: T.text3, marginBottom: 2, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>معدل الفوز</div>
          <div style={{ fontSize: 11, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{stats.winRate.toFixed(1)}%</div>
        </div>
        {/* Metric 3 */}
        <div style={{ background: T.bg2, padding: '6px 8px', borderRadius: 6, border: `0.5px solid ${T.border}` }}>
          <div style={{ fontSize: 8.5, color: T.text3, marginBottom: 2, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>إجمالي العمليات</div>
          <div style={{ fontSize: 11, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{stats.trades}</div>
        </div>
        {/* Metric 4 */}
        <div style={{ background: T.bg2, padding: '6px 8px', borderRadius: 6, border: `0.5px solid ${T.border}` }}>
           <div style={{ fontSize: 8.5, color: T.text3, marginBottom: 2, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>الاستراتيجية</div>
           <div style={{ fontSize: 9.5, fontWeight: 700, color: T.purple, fontFamily: "'Cairo', sans-serif" }}>{stats.strategy || 'سكالبينغ'}</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
        <button 
          onClick={toggleBot}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            height: 28, borderRadius: 4, border: `0.5px solid ${isActive ? T.red + '40' : T.green + '40'}`,
            background: isActive ? `${T.red}10` : `${T.green}10`,
            color: isActive ? T.red : T.green, cursor: 'pointer',
            fontSize: 10, fontWeight: 800, transition: '0.2s', fontFamily: "'Cairo', sans-serif"
          }}
        >
          {isActive ? <><Square size={10} fill="currentColor" /> إيقاف المحرك</> : <><Play size={10} fill="currentColor" /> تشغيل المحرك</>}
        </button>
        <button style={{
          width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 4, background: T.bg2, border: `0.5px solid ${T.border}`, color: T.text2,
          cursor: 'pointer', transition: '0.2s'
        }} onMouseEnter={e => e.currentTarget.style.color = T.cyan} onMouseLeave={e => e.currentTarget.style.color = T.text2}>
          <Settings2 size={12} />
        </button>
      </div>

      {/* Ping/System status bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, borderTop: `0.5px solid ${T.border}`, paddingTop: 6 }}>
        <span style={{ fontSize: 8, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>{statusMsg}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
           <Activity size={8} color={isActive ? T.cyan : T.text3} />
           <span style={{ fontSize: 8, color: isActive ? T.cyan : T.text3, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>متصل بالخادم</span>
        </div>
      </div>
    </div>
  )
}
