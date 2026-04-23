'use client'

import { useState } from 'react'
import { BotMini } from '@/components/dashboard/BotMini'
import { ScannerMini } from '@/components/dashboard/ScannerMini'
import { WatchlistMini } from '@/components/dashboard/WatchlistMini'
import { BotCommandCenter } from '@/components/dashboard/BotCommandCenter'
import { AICouncilPanel } from '@/components/dashboard/AICouncilPanel'

const T = {
  bg:      '#0F1113',
  bg2:     '#111214',
  bg3:     '#16181A',
  card:    '#111214',
  border:  'rgba(0, 229, 255, 0.08)',
  border2: 'rgba(0, 229, 255, 0.15)',
  primary: '#0A84FF',
  accent:  '#00E5FF',
  success: '#00C853',
  danger:  '#FF3B30',
  amber:   '#FFB800',
  purple:  '#B388FF',
  cyan:    '#00E5FF',
  green:   '#00C853',
  red:     '#FF3B30',
  text:    '#E6EBF5',
  text2:   '#8090A8',
  text3:   '#A0AFC3',
}

function Empty({ label, color = T.text3 }: { label?: string; color?: string }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{
        fontFamily: "'Cairo', sans-serif", fontSize: 11, color, opacity: 0.4,
      }}>{label ?? 'قيد التطوير'}</span>
    </div>
  )
}

export function RightPanelLayout({ quotes }: { quotes: any }) {
  const [active, setActive] = useState('bot')
  const TABS = [
    { id: 'bot', label: 'البوت', accent: T.cyan },
    { id: 'council', label: 'المجلس', accent: T.accent },
    { id: 'scanner', label: 'السكانر', accent: T.amber },
    { id: 'multi-tf', label: 'متعدد الأطر', accent: T.purple },
    { id: 'signals', label: 'إشارات', accent: T.green },
  ]

  return (
    <div className="dash-col" style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: T.card, border: `0.5px solid ${T.border}`,
      borderRadius: 10, overflow: 'hidden'
    }}>
      {/* Sleek Segmented Tabs Header */}
      <div style={{
        display: 'flex', background: T.bg, borderBottom: `0.5px solid ${T.border}`,
        padding: '6px 6px 0', gap: 6, flexShrink: 0
      }}>
        {TABS.map(t => {
           const isActive = active === t.id
           return (
             <button key={t.id} onClick={() => setActive(t.id)} style={{
               flex: 1, padding: '6px 0', background: 'transparent',
               border: 'none',
               borderBottom: `2px solid ${isActive ? t.accent : 'transparent'}`,
               color: isActive ? T.text : T.text3,
               fontSize: 10, fontWeight: isActive ? 700 : 500, cursor: 'pointer',
               fontFamily: "'Cairo', sans-serif", transition: '0.2s',
               display: 'flex', justifyContent: 'center', alignItems: 'center'
             }}>
               {t.label}
             </button>
           )
        })}
      </div>
      
      {/* Tab Body */}
      <div style={{ flex: 1, overflow: 'hidden', padding: 0 }}>
         {active === 'bot' && (
           <div className="custom-scrollbar" style={{ height: '100%', overflowY: 'auto' }}>
             <BotMini quotes={quotes} />
           </div>
         )}
         {active === 'council' && <AICouncilPanel />}
         {active === 'scanner' && <div className="custom-scrollbar" style={{ height: '100%', overflowY: 'auto' }}><ScannerMini /></div>}
         {active === 'signals' && <BotCommandCenter />}
         {active === 'multi-tf' && (
           <div className="custom-scrollbar" style={{ height: '100%', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
               <span style={{ fontSize: 14, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>BTC/USD</span>
               <span style={{ fontSize: 9, background: `${T.purple}15`, border: `0.5px solid ${T.purple}30`, color: T.purple, padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>Live AI Sync</span>
             </div>
             
             <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, justifyContent: 'center' }}>
               {[
                 { tf: '15M', state: 'Bullish',  strength: 85, color: T.green },
                 { tf: '1H',  state: 'Slight Bullish', strength: 65, color: T.green },
                 { tf: '4H',  state: 'Neutral',  strength: 40, color: T.amber },
                 { tf: '1D',  state: 'Bearish',  strength: 25, color: T.red }
               ].map((t, i) => (
                 <div key={i} style={{ background: T.bg2, borderRadius: 6, border: `0.5px solid ${T.border}`, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
                   <span style={{ fontSize: 10, fontWeight: 900, color: t.color, width: 24, fontFamily: "'JetBrains Mono', monospace" }}>{t.tf}</span>
                   <div style={{ flex: 1, height: 4, background: T.bg, borderRadius: 2, overflow: 'hidden', margin: '0 4px' }}>
                     <div style={{ height: '100%', width: `${t.strength}%`, background: t.color, boxShadow: `0 0 6px ${t.color}80` }} />
                   </div>
                   <span style={{ fontSize: 9, color: t.color, fontWeight: 800, width: 24, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{t.strength}%</span>
                 </div>
               ))}
             </div>

             <div style={{ marginTop: 'auto', textAlign: 'center', fontSize: 10, color: T.text2, padding: '8px', border: `0.5px dashed ${T.border}`, borderRadius: 6, fontWeight: 600 }}>
               استراتيجية الأطر: <span style={{color: T.purple}}>Scalping</span>
             </div>
           </div>
         )}
      </div>
    </div>
  )
}
