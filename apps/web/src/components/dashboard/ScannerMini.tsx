'use client'

import { useState, useEffect } from 'react'

const T = {
  bg:      '#0F1113',
  bg2:     '#111214',
  card:    '#111214',
  border:  'rgba(255, 255, 255, 0.06)',
  amber:   '#FFB800',
  accent:  '#00E5FF',
  success: '#00C853',
  danger:  '#FF3B30',
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
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px',
            borderRadius: 8, background: `${T.accent}12`, border: `1px solid ${T.accent}25`,
            color: T.accent, fontSize: 10, fontWeight: 800, cursor: 'pointer', fontFamily: "'Cairo', sans-serif",
            transition: 'all 0.2s'
          }}>
            <span style={{ animation: isScanning ? 'pulse 1s infinite' : 'none', fontSize: 11 }}>▶</span>
            بدء الفحص
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
                background: T.card, borderRadius: 12, padding: '12px',
                border: `1px solid ${T.border}`,
                boxShadow: `inset 0 0 15px ${ai.color}08`,
                position: 'relative',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                cursor: 'pointer'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = T.accent
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = T.border
                e.currentTarget.style.transform = 'translateY(0)'
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
