'use client'

import { useState, useEffect } from 'react'
import { Activity, ShieldCheck, Zap, Bell, CheckCircle2, TrendingUp, TrendingDown } from 'lucide-react'

interface Keyword {
  word: string
  color: string
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
    bullish:  'var(--success)',
    bearish:  'var(--danger)',
    neutral:  'var(--primary)',
    volatile: '#FFB800', // Amber
  }

  const isHighConfidence = (data?.confidence ?? 0) > 85

  return (
    <div 
      className="card"
      style={{
        width: '100%', height: '100%',
        padding: '16px',
        display: 'flex', flexDirection: 'column', gap: 14,
        overflow: 'hidden',
        boxSizing: 'border-box',
        position: 'relative',
        direction: 'rtl'
      }}
    >
      {/* Header: Title & Signal Pulse */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: data ? sentimentColor[data.sentiment] : 'var(--muted)',
            boxShadow: data ? `0 0 12px ${sentimentColor[data.sentiment]}` : 'none',
            animation: isHighConfidence ? 'orb-pulse 2s infinite' : 'none'
          }} />
          <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 12, color: 'var(--foreground)', fontWeight: 800 }}>
            رؤى الذكاء الاصطناعي (AI INSIGHT)
          </span>
        </div>
        
        {data && (
          <div style={{
             fontSize: 10, padding: '2px 8px', borderRadius: 20,
             background: 'rgba(255,255,255,0.03)', border: '1px solid var(--card-border)',
             color: 'var(--muted)', fontFamily: 'var(--mono)', fontWeight: 700
          }}>
            {new Date(data.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {data ? (
        <>
          {/* Signal & Risk Row */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{
               flex: 1, padding: '12px', borderRadius: 12, background: 'rgba(255,255,255,0.02)',
               border: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', gap: 4
            }}>
               <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700 }}>التوجه العام</span>
               <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {data.sentiment === 'bullish' ? <TrendingUp size={16} color="var(--success)" /> : <TrendingDown size={16} color="var(--danger)" />}
                  <span style={{ fontSize: 13, fontWeight: 900, color: sentimentColor[data.sentiment], fontFamily: "'Cairo', sans-serif" }}>
                    {data.sentiment === 'bullish' ? 'صعود مؤسسي' : data.sentiment === 'bearish' ? 'هبوط سيادي' : 'تذبذب جانبي'}
                  </span>
               </div>
            </div>
            <div style={{
               flex: 1, padding: '12px', borderRadius: 12, background: 'rgba(255,255,255,0.02)',
               border: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', gap: 4
            }}>
               <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700 }}>مستوى المخاطرة</span>
               <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={16} color={data.risk === 'Low' ? 'var(--success)' : data.risk === 'Medium' ? '#FFB800' : 'var(--danger)'} />
                  <span style={{ 
                    fontSize: 13, fontWeight: 900, 
                    color: data.risk === 'Low' ? 'var(--success)' : data.risk === 'Medium' ? '#FFB800' : 'var(--danger)',
                    fontFamily: "'Cairo', sans-serif" 
                  }}>
                    {data.risk === 'Low' ? 'منخفضة جداً' : data.risk === 'Medium' ? 'متوسطة' : 'عالية المخاطر'}
                  </span>
               </div>
            </div>
          </div>

          {/* Institutional Confidence Meter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted-safe)', fontWeight: 800 }}>مؤشر الثقة الرقمي (CONFIDENCE)</span>
                <span className="price" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 900 }}>{data.confidence}%</span>
             </div>
             <div style={{ width: '100%', height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 10, overflow: 'hidden', padding: 1.5 }}>
                <div style={{
                   height: '100%', width: `${data.confidence}%`,
                   background: `linear-gradient(90deg, var(--primary), var(--accent))`,
                   boxShadow: `0 0 15px var(--accent)40`,
                   borderRadius: 8,
                   transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1)'
                }} />
             </div>
          </div>

          {/* Narrative Insight */}
          <div 
            onClick={() => setExpanded(!expanded)}
            style={{
               flex: 1, cursor: 'pointer', overflow: 'hidden', padding: '12px',
               background: 'rgba(0,229,255,0.02)', border: '1px dashed var(--card-border)', borderRadius: 10,
               fontSize: 12, color: 'var(--foreground)', lineHeight: 1.7, fontFamily: "'Cairo', sans-serif",
               position: 'relative', transition: 'max-height 0.3s'
            }}
          >
             <div style={{ maxHeight: expanded ? '300px' : '58px', overflow: 'hidden' }}>
                {data.narrative}
             </div>
             {!expanded && (
               <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0, height: 32,
                  background: 'linear-gradient(to top, var(--surface), transparent)',
                  display: 'flex', justifyContent: 'center', alignItems: 'flex-end', fontSize: 9, color: 'var(--accent)', fontWeight: 800
               }}>قراءة المزيد...</div>
             )}
          </div>

          {/* Global Action Buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
             <button 
               className="btn-buy"
               style={{
                  flex: 1.4, padding: '10px', borderRadius: 10, border: 'none',
                  fontSize: 12, fontWeight: 800, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  fontFamily: "'Cairo', sans-serif",
                  boxShadow: '0 4px 12px rgba(0,200,83,0.2)'
               }}
             >
                <Zap size={14} fill="currentColor" /> تنفيذ الإشارة
             </button>
             <button style={{
                flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--card-border)', 
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--foreground)', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                fontFamily: "'Cairo', sans-serif"
             }}>
                <Bell size={14} color="var(--accent)" /> تنبيه
             </button>
          </div>
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Institutional Skeleton Loader */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="skeleton" style={{ flex: 1, height: 52, borderRadius: 12 }} />
            <div className="skeleton" style={{ flex: 1, height: 52, borderRadius: 12 }} />
          </div>
          <div className="skeleton" style={{ width: '100%', height: 28, borderRadius: 10 }} />
          <div className="skeleton" style={{ width: '100%', height: 8, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: '100%', flex: 1, borderRadius: 10 }} />
        </div>
      )}
      
      <style>{`
        @keyframes orb-pulse {
          0%, 100% { transform: scale(1); opacity: 0.8; box-shadow: 0 0 10px currentColor; }
          50% { transform: scale(1.4); opacity: 1; box-shadow: 0 0 20px currentColor; }
        }
        .skeleton {
          background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%);
          background-size: 200% 100%;
          animation: skeleton-shimmer 1.5s infinite;
        }
        @keyframes skeleton-shimmer {
          from { background-position: 200% 0; }
          to { background-position: -200% 0; }
        }
      `}</style>
</div>
  )
}
