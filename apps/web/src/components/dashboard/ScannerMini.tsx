'use client'

import { useState, useEffect } from 'react'
import { Activity } from 'lucide-react'

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

// Map score to arabic states and slim gradients
const summarizeSentiment = (score: number) => {
  if (score > 85) return { text: 'شراء قوي', color: T.green }
  if (score > 55) return { text: 'شـراء', color: T.cyan }
  if (score < 15) return { text: 'بيع قوي', color: T.red }
  if (score < 45) return { text: 'بيـــع', color: T.amber }
  return { text: 'حيــاد', color: T.text3 }
}

export function ScannerMini() {
  const [data, setData] = useState<ScannerData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/scanner/feed?type=All')
        const j = await res.json()
        if (j.success && j.data) {
          setData(j.data.slice(0, 6)) // Fits elegantly into the panel
        }
      } catch (e) {
        console.warn('Scanner mini fetch failed:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: T.bg, overflow: 'hidden'
    }}>
       {/* Small Meta Header */}
       <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px 4px', fontSize: 8.5, color: T.text3, fontWeight: 700, borderBottom: `0.5px solid ${T.border}` }}>
         <div style={{ flex: 1.5 }}>الرمز</div>
         <div style={{ flex: 1, textAlign: 'center' }}>التحليل الذكي</div>
         <div style={{ flex: 0.8, textAlign: 'right' }}>الزخم</div>
       </div>

       {/* Super Slim Rows */}
       <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
         <style>{`
          .scn-scroll::-webkit-scrollbar { width: 2px; }
          .scn-scroll::-webkit-scrollbar-thumb { background: rgba(255, 184, 0, 0.3); }
        `}</style>
         
         <div className="scn-scroll" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
         {loading ? (
             <div style={{ color: T.text2, fontSize: 10, textAlign: 'center', padding: 20 }}>جاري مسح الأسواق...</div>
         ) : data.map((item, idx) => {
            const ai = summarizeSentiment(item.sentimentScore || 50)
            const isUp = item.changePct >= 0
            
            return (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 12px', borderBottom: `0.5px solid ${T.border}`,
                transition: 'background 0.1s', cursor: 'pointer'
              }}
              onMouseEnter={e => e.currentTarget.style.background = T.bg2}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                
                 {/* Symbol block */}
                 <div style={{ flex: 1.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                   <div style={{ width: 2, height: 10, background: ai.color }} />
                   <span style={{ fontSize: 11, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{item.symbol}</span>
                 </div>
                 
                 {/* AI Status */}
                 <div style={{ flex: 1, textAlign: 'center', color: ai.color, fontSize: 9, fontWeight: 800, fontFamily: "'Cairo', sans-serif" }}>
                    {ai.text}
                 </div>

                 {/* Momentum Momentum */}
                 <div style={{ flex: 0.8, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
                   <Activity size={10} color={isUp ? T.green : T.red} opacity={Math.abs(item.changePct) > 2 ? 1 : 0.4} />
                   <span style={{ fontSize: 9, fontWeight: 700, color: isUp ? T.green : T.red, fontFamily: "'JetBrains Mono', monospace" }}>
                      {isUp ? '+' : ''}{item.changePct.toFixed(2)}%
                   </span>
                 </div>
              </div>
            )
         })}
         </div>
       </div>
    </div>
  )
}
