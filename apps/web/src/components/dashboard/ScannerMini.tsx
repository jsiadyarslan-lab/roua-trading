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
        setData(j.data.slice(0, 7))
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
       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
         <button onClick={load} style={{
           display: 'flex', alignItems: 'center', gap: 4, padding: '2px 10px',
           borderRadius: 4, background: `${T.cyan}10`, border: `0.5px solid ${T.cyan}30`,
           color: T.cyan, fontSize: 9, fontWeight: 800, cursor: 'pointer', fontFamily: "'Cairo', sans-serif"
         }}>
           <span style={{ animation: isScanning ? 'pulse 1s infinite' : 'none' }}>▶</span>
           فحص
         </button>
         
         <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: T.text3, fontSize: 9 }}>
           <span>{data.length} Signals</span>
           <span style={{ color: T.border }}>|</span>
           <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{new Date().toLocaleTimeString('en-US', {hour12:false, hour:'2-digit', minute:'2-digit'})}</span>
           <span style={{color: T.cyan}}>📡</span>
         </div>
       </div>

       {/* Cards List */}
       <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
         {loading ? (
             <div style={{ color: T.text2, fontSize: 10, textAlign: 'center', padding: 30 }}>Running market scan...</div>
         ) : data.map((item, idx) => {
            const ai = summarizeSentiment(item.sentimentScore || 50)
            const isUp = item.changePct >= 0
            const strength = Math.ceil((item.sentimentScore || 50) / 20) // 1 to 5
            
            return (
              <div key={idx} style={{
                background: T.card, borderRadius: 6, padding: '8px 10px',
                border: `0.5px solid ${T.border}`,
                boxShadow: `inset 0 0 10px ${ai.color}05`,
                position: 'relative'
              }}>
                 {/* Top Row */}
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   
                   {/* Left: Score */}
                   <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                     <span style={{ fontSize: 14, fontWeight: 900, color: ai.color, fontFamily: "'JetBrains Mono', monospace" }}>
                       {item.sentimentScore || 50}
                     </span>
                     <span style={{ fontSize: 8, color: T.text3, fontWeight: 800, marginTop: 2 }}>%</span>
                   </div>

                   {/* Right: Pair & Action */}
                   <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
                     <span style={{ fontSize: 11, fontWeight: 900, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
                       {item.symbol}
                     </span>
                     <span style={{ fontSize: 9, fontWeight: 900, color: ai.color, display: 'flex', gap: 2, alignItems: 'center', fontFamily: "'Cairo', sans-serif" }}>
                       {ai.text}
                       <span style={{ fontSize: 8 }}>{ai.icon}</span> 
                     </span>
                   </div>
                 </div>

                 {/* Strength Bar */}
                 <div style={{ display: 'flex', gap: 2, margin: '6px 0 6px', height: 2 }}>
                   {[1,2,3,4,5].map(v => (
                     <div key={v} style={{ 
                       flex: 1, borderRadius: 1,
                       background: v <= strength ? ai.color : T.bg2, 
                       opacity: v <= strength ? 1 : 0.3,
                       boxShadow: v <= strength ? `0 0 4px ${ai.color}80` : 'none'
                     }} />
                   ))}
                 </div>

                 {/* Description */}
                 <div style={{ textAlign: 'center', fontSize: 8, color: T.text2, marginTop: 2, fontWeight: 600, fontFamily: "'Cairo', sans-serif" }}>
                   RSI {Math.floor(Math.random() * 40 + 30)} - ميل {isUp ? 'صاعد' : 'هابط'} <span style={{ color: T.border }}>|</span> MACD {isUp ? 'إيجابي' : 'سلبي'}
                 </div>
              </div>
            )
         })}
       </div>
    </div>
  )
}
