'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { GripVertical, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { PortfolioMini } from '@/components/portfolio/PortfolioMini'
import { AlNarratorMini } from '@/components/ai/AlNarratorMini'
import { QuickExecutionMini } from '@/components/dashboard/QuickExecutionMini'
import { OrderBookMini } from '@/components/dashboard/OrderBookMini'
import { WatchlistMini } from '@/components/dashboard/WatchlistMini'
import { ScannerMini } from '@/components/dashboard/ScannerMini'
import { BotMini } from '@/components/dashboard/BotMini'

/* ─── Design tokens ─── */
const T = {
  bg:      '#04050C',
  bg2:     '#0D1117',
  bg3:     '#0D1520',
  card:    '#08090F',
  border:  'rgba(10,132,255,0.10)',
  border2: 'rgba(10,132,255,0.18)',
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

const HEADER_H = 100

const PANEL_H = 30               // collapsed height (header bar only)
const ANIM    = 'height 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease'

/* ════════════════════════════════════════════
   Collapsible + Draggable Panel
════════════════════════════════════════════ */
interface PanelProps {
  id:        string
  label:     string
  labelEn?:  string
  accent?:   string
  flex?:     string | number
  height?:   number
  children?: React.ReactNode
  collapsed: boolean
  onToggle:  () => void
  /* DnD */
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragOver:  (e: React.DragEvent, id: string) => void
  onDrop:      (e: React.DragEvent, id: string) => void
  isDragOver:  boolean
}

function Panel({
  id, label, labelEn, accent = T.blue,
  flex, height, children,
  collapsed, onToggle,
  onDragStart, onDragOver, onDrop, isDragOver,
}: PanelProps) {
  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver(e, id) }}
      onDrop={e => onDrop(e, id)}
      style={{
        flex: collapsed ? `0 0 ${PANEL_H}px` : (height ? `0 0 ${height}px` : (flex ?? 1)),
        display: 'flex', flexDirection: 'column',
        border: `0.5px solid ${isDragOver ? accent : T.border}`,
        borderRadius: 10, overflow: 'hidden',
        background: isDragOver ? `${accent}08` : T.card,
        transition: ANIM + ', border-color 0.15s, background 0.15s',
        minHeight: PANEL_H,
      }}
    >
      {/* ── Header bar ── */}
      <div style={{
        height: PANEL_H, flexShrink: 0,
        background: `linear-gradient(90deg, ${accent}12, transparent)`,
        borderBottom: collapsed ? 'none' : `0.5px solid ${T.border}`,
        display: 'flex', alignItems: 'center',
        padding: '0 8px', gap: 5, cursor: 'default',
        userSelect: 'none',
      }}>
        {/* Drag handle */}
        <div
          draggable
          onDragStart={e => onDragStart(e, id)}
          style={{ cursor: 'grab', color: T.text3, display: 'flex', alignItems: 'center', flexShrink: 0 }}
          title="اسحب لإعادة الترتيب"
        >
          <GripVertical size={12} />
        </div>

        {/* Accent bar */}
        <div style={{ width: 3, height: 14, borderRadius: 2, background: accent, flexShrink: 0 }} />

        {/* Title */}
        <span style={{
          fontFamily: "'Cairo', sans-serif", fontSize: 11.5,
          fontWeight: 700, color: T.text, flex: 1,
        }}>{label}</span>

        {/* Label EN */}
        {labelEn && (
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 7.5,
            color: accent, letterSpacing: '0.05em', opacity: 0.75,
          }}>{labelEn}</span>
        )}

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          title={collapsed ? 'توسيع' : 'طي'}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: T.text3, padding: 2, display: 'flex', alignItems: 'center',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = accent)}
          onMouseLeave={e => (e.currentTarget.style.color = T.text3)}
        >
          <ChevronDown size={12} style={{
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 0.22s ease',
          }} />
        </button>
      </div>

      {/* ── Body ── */}
      <div style={{
        flex: 1, overflow: 'hidden',
        opacity: collapsed ? 0 : 1,
        transition: 'opacity 0.18s ease',
        pointerEvents: collapsed ? 'none' : 'auto',
      }}>
        {children}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════
   Placeholder body
════════════════════════════════════════════ */
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

/* ════════════════════════════════════════════
   useDraggableColumn — manages order + DnD for a column
════════════════════════════════════════════ */
function useDraggableColumn(storageKey: string, initial: string[]) {
  const [order, setOrder]     = useState<string[]>(() => {
    if (typeof window === 'undefined') return initial
    try {
      const s = localStorage.getItem(storageKey)
      return s ? JSON.parse(s) : initial
    } catch { return initial }
  })
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const s = localStorage.getItem(storageKey + '_c')
      return s ? JSON.parse(s) : {}
    } catch { return {} }
  })
  const [dragOver, setDragOver] = useState<string | null>(null)
  const dragging = useRef<string | null>(null)

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(order))
  }, [order, storageKey])

  useEffect(() => {
    localStorage.setItem(storageKey + '_c', JSON.stringify(collapsed))
  }, [collapsed, storageKey])

  const onDragStart = useCallback((_e: React.DragEvent, id: string) => {
    dragging.current = id
  }, [])

  const onDragOver = useCallback((_e: React.DragEvent, id: string) => {
    if (dragging.current && dragging.current !== id) setDragOver(id)
  }, [])

  const onDrop = useCallback((_e: React.DragEvent, targetId: string) => {
    const from = dragging.current
    if (!from || from === targetId) { setDragOver(null); return }
    setOrder(prev => {
      const next = [...prev]
      const fi = next.indexOf(from)
      const ti = next.indexOf(targetId)
      if (fi < 0 || ti < 0) return prev
      next.splice(fi, 1)
      next.splice(ti, 0, from)
      return next
    })
    dragging.current = null
    setDragOver(null)
  }, [])

  const onDragEnd = useCallback(() => {
    dragging.current = null
    setDragOver(null)
  }, [])

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  return {
    order, collapsed, dragOver,
    onDragStart, onDragOver, onDrop, onDragEnd, toggleCollapse,
  }
}

/* ════════════════════════════════════════════
   PANEL DEFINITIONS
════════════════════════════════════════════ */
const COL1_PANELS: Record<string, { label: string; accent: string; flex?: string; height?: number; body: string }> = {
  portfolio:  { label: 'المحفظة',      accent: T.blue,   flex: '0 0 32%', body: '' },
  'quick-exec': { label: 'التنفيذ السريع', accent: T.green,  height: 126,     body: ''                              },
  'order-book': { label: 'دفتر الأوامر',  accent: T.amber,  height: 320,      body: ''                   },
  'watchlist':  { label: 'قائمة الأسواق',  accent: T.cyan,   height: 440,     body: ''                   },
  narrator:   { label: 'سرد السوق',    accent: T.purple, flex: '0 0 22%', body: '' },
}

// COL3 panels replaced with Tabs in Col3TabbedPanel

/* ════════════════════════════════════════════
   DASHBOARD PAGE
════════════════════════════════════════════ */
export default function DashboardPage() {
  const col1 = useDraggableColumn('col1', ['portfolio','quick-exec','order-book','watchlist','narrator'])

  /* Positions open — collapsible separately */
  const [posOpen, setPosOpen] = useState(true)

  return (
    <>
      <style>{`
        @keyframes drop-pulse {
          0%,100% { opacity: 0.5 }
          50%      { opacity: 1   }
        }
        .dash-col::-webkit-scrollbar { width: 4px; }
        .dash-col::-webkit-scrollbar-track { background: transparent; }
        .dash-col::-webkit-scrollbar-thumb { background: #0A84FF22; border-radius: 10px; }
        .dash-col::-webkit-scrollbar-thumb:hover { background: #0A84FF44; }
      `}</style>

      <div style={{
        width: '100%',
        height: `calc(100vh - ${HEADER_H}px)`,
        background: T.bg,
        display: 'grid',
        gridTemplateColumns: '220px 1fr 350px',
        gap: 4, padding: 4,
        overflow: 'hidden',
        direction: 'rtl',
        boxSizing: 'border-box',
      }}>

        {/* ══════════ COL 1 — أدوات يمين (draggable) ══════════ */}
        <div
          className="dash-col"
          style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', overflowX: 'hidden', paddingRight: 4 }}
          onDragEnd={col1.onDragEnd}
        >
          {col1.order.map(id => {
            const def = COL1_PANELS[id]
            if (!def) return null
            const isCollapsed = !!col1.collapsed[id]

            if (id === 'quick-exec') {
              return (
                <Panel
                  key={id} id={id}
                  label={def.label} accent={def.accent}
                  height={isCollapsed ? undefined : def.height}
                  flex={isCollapsed ? undefined : undefined}
                  collapsed={isCollapsed}
                  onToggle={() => col1.toggleCollapse(id)}
                  onDragStart={col1.onDragStart}
                  onDragOver={col1.onDragOver}
                  onDrop={col1.onDrop}
                  isDragOver={col1.dragOver === id}
                >
                  <QuickExecutionMini />
                </Panel>
              )
            }

            return (
              <Panel
                key={id} id={id}
                label={def.label} accent={def.accent}
                flex={isCollapsed ? undefined : def.flex}
                height={isCollapsed ? undefined : def.height}
                collapsed={isCollapsed}
                onToggle={() => col1.toggleCollapse(id)}
                onDragStart={col1.onDragStart}
                onDragOver={col1.onDragOver}
                onDrop={col1.onDrop}
                isDragOver={col1.dragOver === id}
              >
                {id === 'portfolio' ? <PortfolioMini /> : 
                 id === 'narrator' ? <AlNarratorMini /> : 
                 id === 'order-book' ? <OrderBookMini /> : 
                 id === 'watchlist' ? <WatchlistMini /> : 
                 <Empty label={def.body} color={def.accent} />}
              </Panel>
            )
          })}
        </div>

        {/* ══════════ COL 2 — الشارت + الصفقات ══════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden' }}>

          {/* الشارت — ثابت غير قابل للسحب */}
          <div style={{
            flex: 1,
            background: T.card,
            border: `0.5px solid ${T.border}`,
            borderRadius: 10,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{
              height: PANEL_H, flexShrink: 0,
              background: `linear-gradient(90deg, ${T.blue}12, transparent)`,
              borderBottom: `0.5px solid ${T.border}`,
              display: 'flex', alignItems: 'center', padding: '0 10px', gap: 5,
            }}>
              <div style={{ width: 3, height: 14, borderRadius: 2, background: T.blue }} />
              <span style={{
                fontFamily: "'Cairo', sans-serif", fontSize: 11.5,
                fontWeight: 700, color: T.text, flex: 1,
              }}>الشارت</span>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <Empty label="الرسم البياني الرئيسي" color={T.blue} />
            </div>
          </div>

          {/* الصفقات المفتوحة — collapsible */}
          <div style={{
            flexShrink: 0,
            height: posOpen ? 84 : PANEL_H,
            transition: ANIM,
            background: T.card,
            border: `0.5px solid ${T.border}`,
            borderRadius: 10,
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              height: PANEL_H, flexShrink: 0,
              background: `linear-gradient(90deg, ${T.green}12, transparent)`,
              borderBottom: posOpen ? `0.5px solid ${T.border}` : 'none',
              display: 'flex', alignItems: 'center', padding: '0 10px', gap: 5,
            }}>
              <div style={{ width: 3, height: 14, borderRadius: 2, background: T.green }} />
              <span style={{
                fontFamily: "'Cairo', sans-serif", fontSize: 11.5,
                fontWeight: 700, color: T.text, flex: 1,
              }}>الصفقات المفتوحة</span>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 7.5,
                color: T.green, letterSpacing: '0.05em', opacity: 0.75,
              }}>OPEN POSITIONS</span>
              <button
                onClick={() => setPosOpen(p => !p)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: T.text3, padding: 2, display: 'flex', alignItems: 'center',
                }}
              >
                <ChevronDown size={12} style={{
                  transform: posOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 0.22s ease',
                }} />
              </button>
            </div>
            <div style={{ flex: 1, opacity: posOpen ? 1 : 0, transition: 'opacity 0.18s' }}>
              <Empty label="لا توجد صفقات مفتوحة" color={T.green} />
            </div>
          </div>
        </div>

        {/* ══════════ COL 3 — Tabs Panel ══════════ */}
        <Col3TabbedPanel />

      </div>
    </>
  )
}

function Col3TabbedPanel() {
  const [active, setActive] = useState('bot')
  const TABS = [
    { id: 'bot', label: 'البوت', accent: T.cyan },
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
         {active === 'bot' && <div style={{ height: '100%', overflowY: 'auto' }}><BotMini /></div>}
         {active === 'scanner' && <div style={{ height: '100%', overflowY: 'auto' }}><ScannerMini /></div>}
         {active === 'signals' && <Empty label="إشارات الدخول - قريباً" color={T.green} />}
         {active === 'multi-tf' && (
           <div style={{ height: '100%', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
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
