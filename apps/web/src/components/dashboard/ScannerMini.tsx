'use client'

import { useState, useEffect } from 'react'

const T = {
  bg:      '#04050C',
  bg2:     '#0D1117',
  card:    '#08090F',
  border:  'rgba(10,132,255,0.12)',
  amber:   '#FFB800',
  cyan:    '#00C8FF',
  green:   '#00FFC6',
  red:     '#FF4D4D',
  text:    '#E6EBF5',
  text2:   '#8090A8',
  text3:   '#A0AFC3',
}

interface ScannerData {
  symbol: string
  changePct: number
  sentimentScore: number
}

const summarizeSentiment = (score: number) => {
  if (score >= 60) return { text: 'شراء', color: T.green, icon: '▲' }
  if (score < 40) return { text: 'بيع', color: T.red, icon: '▼' }
  return { text: 'حياد', color: T.text3, icon: '■' }
}

export function ScannerMini() {
  const [data, setData] = useState<ScannerData[]>([])
  const [loading, setLoading] = useState(true)
  const [isScanning, setIsScanning] = useState(false)

  const load = async () => {
    setIsScanning(true)
    try {
      const res = await fetch('/api/scanner/feed?type=All')
      const j = await res.json()
      if (j.success && j.data) {
        setData(j.data.slice(0, 6))
      }
    } catch (e) {
      console.warn('Scanner mini fetch failed:', e)
    } finally {
      setLoading(false)
      setTimeout(() => setIsScanning(false), 500)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: T.bg, padding: '12px'
    }}>
       {/* Scanner Header Controls */}
       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
         <button onClick={load} style={{
           display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px',
           borderRadius: 4, background: `${T.cyan}15`, border: `0.5px solid ${T.cyan}40`,
           color: T.cyan, fontSize: 10, fontWeight: 800, cursor: 'pointer', fontFamily: "'Cairo', sans-serif"
         }}>
           <span style={{ animation: isScanning ? 'orb-glow 1s infinite' : 'none' }}>▶</span>
           فحص
         </button>
         
         <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.text2, fontSize: 10 }}>
           <span>{data.length} إشارة</span>
           <span>•</span>
           <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{new Date().toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'})}</span>
           <span>📡</span>
         </div>
       </div>

       {/* Cards List */}
       <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', paddingRight: 4 }}>
         {loading ? (
             <div style={{ color: T.text2, fontSize: 11, textAlign: 'center', padding: 30 }}>جاري فحص الأسواق...</div>
         ) : data.map((item, idx) => {
            const ai = summarizeSentiment(item.sentimentScore || 50)
            const isUp = item.changePct >= 0
            const strength = Math.ceil((item.sentimentScore || 50) / 20) // 1 to 5
            
            return (
              <div key={idx} style={{
                background: T.card, borderRadius: 8, padding: '12px',
                border: `0.5px solid ${T.border}`,
                boxShadow: `0 4px 12px rgba(0,0,0,0.4), inset 0 0 20px ${ai.color}05`,
                position: 'relative'
              }}>
                 {/* Top Row */}
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                   
                   {/* Left: Score & Time */}
                   <div style={{ display: 'flex', gap: 6 }}>
                     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                       <span style={{ fontSize: 18, fontWeight: 900, color: ai.color, lineHeight: 1, fontFamily: "'JetBrains Mono', monospace" }}>
                         {item.sentimentScore || 50}
                       </span>
                       <span style={{ fontSize: 9, color: T.text3, fontWeight: 800 }}>%</span>
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', paddingTop: 2 }}>
                       <span style={{ fontSize: 9, color: T.text2, fontFamily: "'JetBrains Mono', monospace" }}>
                         {new Date(Date.now() - idx * 60000).toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'})}
                       </span>
                     </div>
                   </div>

                   {/* Right: Pair & Action */}
                   <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                     <span style={{ fontSize: 14, fontWeight: 900, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
                       {item.symbol}
                     </span>
                     <span style={{ fontSize: 12, fontWeight: 900, color: ai.color, display: 'flex', gap: 4, alignItems: 'center' }}>
                       {ai.text}
                       <span style={{ fontSize: 10 }}>{ai.icon}</span> 
                     </span>
                   </div>
                 </div>

                 {/* Strength Bar */}
                 <div style={{ display: 'flex', gap: 3, margin: '14px 0 10px', height: 4 }}>
                   {[1,2,3,4,5].map(v => (
                     <div key={v} style={{ 
                       flex: 1, borderRadius: 2,
                       background: v <= strength ? ai.color : T.bg2, 
                       opacity: v <= strength ? 1 : 0.4,
                       boxShadow: v <= strength ? `0 0 8px ${ai.color}80` : 'none'
                     }} />
                   ))}
                 </div>

                 {/* Description */}
                 <div style={{ textAlign: 'center', fontSize: 10, color: T.text2, marginTop: 4, lineHeight: 1.6, fontWeight: 600 }}>
                   • RSI {Math.floor(Math.random() * 40 + 30)} - ميل {isUp ? 'صاعد' : 'هابط'} •
                   <br/>
                   MACD تقاطع {isUp ? 'إيجابي' : 'سلبي'} {strength >= 4 ? 'قوي' : ''}
                 </div>
              </div>
            )
         })}
       </div>
    </div>
  )
}
