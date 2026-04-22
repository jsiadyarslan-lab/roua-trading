'use client'

import { useState } from 'react'
import { Play, Pause, AlertTriangle, ShieldAlert, Zap, Settings2 } from 'lucide-react'
import { useSymbolStore } from '@/hooks/useSymbolStore'

const T = {
  bg:      '#0F1113',
  bg2:     '#111214',
  card:    '#111214',
  border:  'rgba(0, 229, 255, 0.08)',
  accent:  '#00E5FF',
  success: '#00C853',
  danger:  '#FF3B30',
  amber:   '#FFB800',
  purple:  '#B388FF',
  text:    '#E6EBF5',
  text2:   '#8090A8',
  text3:   '#A0AFC3',
}

const recentSignals = [
  { pair: 'BTC/USD', type: 'BUY', time: '10:42 AM', profit: '+1.2%', conf: 92 },
  { pair: 'ETH/USD', type: 'SELL', time: '09:15 AM', profit: '+0.8%', conf: 85 },
  { pair: 'SOL/USD', type: 'BUY', time: '08:30 AM', profit: '-0.2%', conf: 76 },
]

export function BotCommandCenter() {
  const [isActive, setIsActive] = useState(true)
  const [risk, setRisk] = useState<'low' | 'med' | 'high'>('med')
  const { setSelectedSymbol } = useSymbolStore()

  return (
    <div className="custom-scrollbar no-scrollbar" style={{ height: '100%', overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      
      {/* Bot Master Switch */}
      <div style={{
        background: isActive ? 'rgba(0,200,83,0.05)' : 'rgba(255,59,48,0.05)',
        border: `1px solid ${isActive ? 'rgba(0,200,83,0.2)' : 'rgba(255,59,48,0.2)'}`,
        borderRadius: 8, padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: isActive ? T.success : T.danger,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            boxShadow: `0 0 12px ${isActive ? T.success : T.danger}40`
          }}>
            {isActive ? <Zap size={16} /> : <Pause size={16} />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif" }}>محرك التداول الذكي</span>
            <span style={{ fontSize: 9, color: isActive ? T.success : T.danger, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
              {isActive ? 'SYSTEM ONLINE - AUTOTRADE ACTIVE' : 'SYSTEM PAUSED - MANUAL ONLY'}
            </span>
          </div>
        </div>
        <button
          onClick={() => setIsActive(!isActive)}
          style={{
            background: isActive ? 'transparent' : T.success,
            border: `1px solid ${isActive ? T.danger : T.success}`,
            color: isActive ? T.danger : '#fff',
            padding: '6px 12px', borderRadius: 6, fontSize: 10, fontWeight: 800, cursor: 'pointer',
            fontFamily: "'Cairo', sans-serif", transition: '0.2s'
          }}
        >
          {isActive ? 'إيقاف البوت' : 'تفعيل البوت'}
        </button>
      </div>

      {/* Risk Management */}
      <div style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <Settings2 size={12} color={T.text2} />
          <span style={{ fontSize: 11, fontWeight: 700, color: T.text2, fontFamily: "'Cairo', sans-serif" }}>إدارة المخاطر (Risk Level)</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'low', label: 'مخاطرة منخفضة', color: T.success, desc: '1% Max Drawdown' },
            { id: 'med', label: 'مخاطرة متوسطة', color: T.amber, desc: '3% Max Drawdown' },
            { id: 'high', label: 'عالي المخاطرة', color: T.danger, desc: '5% Max Drawdown' }
          ].map(r => (
            <button
              key={r.id}
              onClick={() => setRisk(r.id as any)}
              style={{
                flex: 1, padding: '8px 4px', borderRadius: 6, cursor: 'pointer', transition: '0.2s',
                background: risk === r.id ? `${r.color}15` : 'transparent',
                border: `1px solid ${risk === r.id ? r.color : T.border}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4
              }}
            >
              <span style={{ fontSize: 10, fontWeight: risk === r.id ? 800 : 500, color: risk === r.id ? r.color : T.text, fontFamily: "'Cairo', sans-serif" }}>{r.label}</span>
              <span style={{ fontSize: 8, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>{r.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Latest Signals Log */}
      <div style={{ flex: 1, background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <ShieldAlert size={12} color={T.accent} />
          <span style={{ fontSize: 11, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif" }}>سجل الإشارات الأخير</span>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {recentSignals.map((sig, i) => {
            const isBuy = sig.type === 'BUY'
            const c = isBuy ? T.success : T.danger
            return (
              <div key={i} onClick={() => setSelectedSymbol(sig.pair)} style={{
                background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: '8px 10px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: '0.2s'
              }} onMouseEnter={e => e.currentTarget.style.borderColor = c} onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 8, fontWeight: 800, color: c, background: `${c}15`, padding: '2px 6px', borderRadius: 4, fontFamily: "'JetBrains Mono', monospace"
                  }}>{sig.type}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{sig.pair}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 9, color: T.success, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{sig.profit}</span>
                  <span style={{ fontSize: 8, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>{sig.time}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      
    </div>
  )
}
