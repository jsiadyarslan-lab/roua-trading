'use client'

import { useState, useEffect } from 'react'
import { Sparkles, Activity, AlertTriangle, Info } from 'lucide-react'

const T = {
  bg:      '#04050C',
  card:    '#08090F',
  border:  'rgba(10,132,255,0.12)',
  blue:    '#0A84FF',
  cyan:    '#00C8FF',
  green:   '#00FFC6',
  red:     '#FF4D4D',
  amber:   '#FFB800',
  purple:  '#B388FF',
  text:    '#E6EBF5',
  text2:   '#8090A8',
  text3:   '#A0AFC3',
}

interface Keyword {
  word: string
  color: keyof typeof T | string
}

interface NarrativeData {
  narrative: string
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'volatile'
  keywords: Keyword[]
  timestamp: string
}

function processNarrativeText(text: string, keywords: Keyword[]) {
  // Simple token replacement to inject colored spans for keywords
  let elements: (string | JSX.Element)[] = [text]

  keywords.forEach(({ word, color }) => {
    const nextElements: (string | JSX.Element)[] = []
    const hexColor = (T as any)[color] || color

    elements.forEach(el => {
      if (typeof el === 'string') {
        const parts = el.split(word)
        for (let i = 0; i < parts.length; i++) {
          nextElements.push(parts[i])
          if (i < parts.length - 1) {
            nextElements.push(
              <span key={`${word}-${i}`} style={{
                color: hexColor,
                fontWeight: 700,
                textShadow: `0 0 8px ${hexColor}40`
              }}>
                {word}
              </span>
            )
          }
        }
      } else {
        nextElements.push(el)
      }
    })
    elements = nextElements
  })

  return elements
}

export function AlNarratorMini() {
  const [data, setData] = useState<NarrativeData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchNarrative = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ai/narrator')
      const json = await res.json()
      if (json.success) setData(json.data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNarrative()
    const interval = setInterval(fetchNarrative, 30000) // Update every 30s
    return () => clearInterval(interval)
  }, [])

  const sentimentIcon = {
    bullish:  <Activity size={12} color={T.green} />,
    bearish:  <Activity size={12} color={T.red} style={{ transform: 'scaleY(-1)' }} />,
    neutral:  <Info size={12} color={T.blue} />,
    volatile: <AlertTriangle size={12} color={T.amber} />,
  }

  const sentimentLabel = {
    bullish:  'صاعد',
    bearish:  'هابط',
    neutral:  'حيادي',
    volatile: 'متقلب',
  }

  const sentimentColor = {
    bullish:  T.green,
    bearish:  T.red,
    neutral:  T.blue,
    volatile: T.amber,
  }

  return (
    <div style={{
      width: '100%', height: '100%',
      padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: 8,
      overflow: 'hidden',
      boxSizing: 'border-box',
      position: 'relative'
    }}>
      {/* Header info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={14} color={T.purple} style={{ filter: `drop-shadow(0 0 4px ${T.purple}80)` }} />
          <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.purple, fontWeight: 700 }}>
            تحليل حي
          </span>
        </div>
        
        {data && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 4,
            background: `${sentimentColor[data.sentiment]}15`,
            border: `0.5px solid ${sentimentColor[data.sentiment]}30`
          }}>
            {sentimentIcon[data.sentiment]}
            <span style={{ 
              fontFamily: "'Cairo', sans-serif", fontSize: 9, 
              color: sentimentColor[data.sentiment], fontWeight: 700 
            }}>
              {sentimentLabel[data.sentiment]}
            </span>
          </div>
        )}
      </div>

      {/* Narrative Body */}
      <div style={{
        flex: 1,
        fontFamily: "'Cairo', sans-serif",
        fontSize: 12,
        lineHeight: 1.6,
        color: T.text,
        overflowY: 'auto',
        paddingRight: 4,
        opacity: loading && !data ? 0.5 : 1,
        transition: 'opacity 0.3s'
      }}>
        <style>{`
          .narrator-scroll::-webkit-scrollbar { width: 2px; }
          .narrator-scroll::-webkit-scrollbar-track { background: transparent; }
          .narrator-scroll::-webkit-scrollbar-thumb { background: ${T.purple}40; border-radius: 2px; }
        `}</style>
        
        <div className="narrator-scroll" style={{ height: '100%', overflowY: 'auto' }}>
          {loading && !data ? (
            <div style={{ color: T.text3, fontSize: 11, textAlign: 'center', marginTop: 10 }}>
              يتم تحليل بيانات السوق...
            </div>
          ) : (
            data ? processNarrativeText(data.narrative, data.keywords) : 'تعذر جلب التحليل.'
          )}
        </div>
      </div>
      
      {/* Background glow */}
      <div style={{
        position: 'absolute', right: -20, bottom: -20, width: 80, height: 80,
        background: `radial-gradient(circle, ${T.purple}15 0%, transparent 70%)`,
        pointerEvents: 'none', zIndex: 0
      }} />
    </div>
  )
}
