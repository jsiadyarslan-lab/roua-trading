'use client'

import { useState, useEffect } from 'react'
import { Sparkles, Activity, AlertTriangle, ShieldCheck, Zap, Bell, CheckCircle2 } from 'lucide-react'

const T = {
  bg:      '#0F1113',
  bg2:     '#111214',
  card:    '#111214',
  primary: '#0A84FF',
  accent:  '#00E5FF',
  success: '#00C853',
  danger:  '#FF3B30',
  amber:   '#FFB800',
  purple:  '#B388FF',
  text:    '#E6EBF5',
  text2:   '#8090A8',
  text3:   '#A0AFC3',
  border:  'rgba(255, 255, 255, 0.06)',
}

interface Keyword {
  word: string
  color: keyof typeof T | string
}

interface NarrativeData {
  narrative: string
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'volatile'
  keywords: Keyword[]
  confidence: number // 0-100
  risk: 'Low' | 'Medium' | 'High'
  timestamp: string
}

export function AlNarratorMini() {
  const [data, setData] = useState<NarrativeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  const fetchNarrative = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ai/narrator')
      const json = await res.json()
      // Mocking confidence and risk if not present in API yet
      if (json.success) {
        setData({
          ...json.data,
          confidence: json.data.confidence ?? Math.floor(Math.random() * 40 + 60),
          risk: json.data.risk ?? (['Low', 'Medium', 'High'][Math.floor(Math.random() * 3)])
        })
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNarrative()
    const interval = setInterval(fetchNarrative, 30000)
    return () => clearInterval(interval)
  }, [])

  const sentimentColor = {
    bullish:  T.success,
    bearish:  T.danger,
    neutral:  T.primary,
    volatile: T.amber,
  }

  const isHighConfidence = (data?.confidence ?? 0) > 85

  return (
    <div style={{
      width: '100%', height: '100%',
      padding: '12px',
      display: 'flex', flexDirection: 'column', gap: 12,
      overflow: 'hidden',
      boxSizing: 'border-box',
      position: 'relative',
      background: T.card,
      direction: 'rtl'
    }}>
      {/* Header: Title & Signal Pulse */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: data ? sentimentColor[data.sentiment] : T.text3,
            boxShadow: data ? `0 0 10px ${sentimentColor[data.sentiment]}` : 'none',
            animation: isHighConfidence ? 'orb-pulse 2s infinite' : 'none'
          }} />
          <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text, fontWeight: 800 }}>
            رؤى الذكاء الاصطناعي (AI Insight)
          </span>
        </div>
        
        {data && (
          <div style={{
             fontSize: 9, padding: '2px 8px', borderRadius: 20,
             background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}`,
             color: T.text2, fontFamily: "'JetBrains Mono', monospace"
          }}>
            {new Date(data.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {data ? (
        <>
          {/* Signal & Risk Row */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{
               flex: 1, padding: '10px', borderRadius: 10, background: 'rgba(255,255,255,0.02)',
               border: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 4
            }}>
               <span style={{ fontSize: 8, color: T.text2, fontWeight: 600 }}>إشارة الاتجاه</span>
               <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Activity size={14} color={sentimentColor[data.sentiment]} />
                  <span style={{ fontSize: 13, fontWeight: 900, color: sentimentColor[data.sentiment], fontFamily: "'Cairo', sans-serif" }}>
                    {data.sentiment === 'bullish' ? 'صعود قوي' : data.sentiment === 'bearish' ? 'هبوط محتمل' : 'تذبذب جانبي'}
                  </span>
               </div>
            </div>
            <div style={{
               flex: 1, padding: '10px', borderRadius: 10, background: 'rgba(255,255,255,0.02)',
               border: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 4
            }}>
               <span style={{ fontSize: 8, color: T.text2, fontWeight: 600 }}>مستوى المخاطرة</span>
               <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={14} color={data.risk === 'Low' ? T.success : data.risk === 'Medium' ? T.amber : T.danger} />
                  <span style={{ 
                    fontSize: 13, fontWeight: 900, 
                    color: data.risk === 'Low' ? T.success : data.risk === 'Medium' ? T.amber : T.danger,
                    fontFamily: "'Cairo', sans-serif" 
                  }}>
                    {data.risk === 'Low' ? 'منخفضة' : data.risk === 'Medium' ? 'متوسطة' : 'عالية'}
                  </span>
               </div>
            </div>
          </div>

          {/* Confidence Meter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 9, color: T.text2, fontWeight: 600 }}>مؤشر الثقة (Confidence)</span>
                <span style={{ fontSize: 10, color: T.accent, fontWeight: 900, fontFamily: "'JetBrains Mono', monospace" }}>{data.confidence}%</span>
             </div>
             <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{
                   height: '100%', width: `${data.confidence}%`,
                   background: `linear-gradient(90deg, ${T.primary}, ${T.accent})`,
                   boxShadow: `0 0 10px ${T.accent}40`,
                   transition: 'width 1s ease-out'
                }} />
             </div>
          </div>

          {/* Narrative Blurb */}
          <div 
            onClick={() => setExpanded(!expanded)}
            style={{
               flex: 1, cursor: 'pointer', overflow: 'hidden', padding: '8px',
               background: 'rgba(0,229,255,0.02)', border: `1px dashed ${T.border}`, borderRadius: 8,
               fontSize: 11.5, color: T.text, lineHeight: 1.6, fontFamily: "'Cairo', sans-serif",
               position: 'relative'
            }}
          >
             <div style={{ height: expanded ? 'auto' : '44px', overflow: 'hidden' }}>
                {data.narrative}
             </div>
             {!expanded && (
               <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0, height: 20,
                  background: 'linear-gradient(to top, #111214, transparent)',
                  display: 'flex', justifyContent: 'center', alignItems: 'flex-end', fontSize: 8, color: T.accent
               }}>انقر للتوسع</div>
             )}
          </div>

          {/* Suggested Actions */}
          <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
             <button style={{
                flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: `${T.primary}15`,
                color: T.primary, fontSize: 10, fontWeight: 800, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                fontFamily: "'Cairo', sans-serif"
             }}>
                <Zap size={11} /> تنفيذ آلي
             </button>
             <button style={{
                flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.05)',
                color: T.text, fontSize: 10, fontWeight: 800, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                fontFamily: "'Cairo', sans-serif"
             }}>
                <Bell size={11} color={T.accent} /> تنبيه ذكي
             </button>
          </div>
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text3, fontSize: 11 }}>
          يتم استدعاء الذكاء الاصطناعي...
        </div>
      )}
      
      <style>{`
        @keyframes orb-pulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.3); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
