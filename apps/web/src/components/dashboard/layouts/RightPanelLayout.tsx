'use client'

import { useState } from 'react'
import { BotMini } from '@/components/dashboard/BotMini'
import { ScannerMini } from '@/components/dashboard/ScannerMini'
import { WatchlistMini } from '@/components/dashboard/WatchlistMini'
import { BotCommandCenter } from '@/components/dashboard/BotCommandCenter'
import { AICouncilPanel } from '@/components/dashboard/AICouncilPanel'
import { MultiTfScannerMini } from '@/components/dashboard/MultiTfScannerMini'

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
         {active === 'multi-tf' && <MultiTfScannerMini />}
      </div>
    </div>
  )
}
