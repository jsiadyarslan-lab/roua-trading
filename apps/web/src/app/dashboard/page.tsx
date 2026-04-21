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
  id, label, labelEn, accent = T.primary,
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
        border: `1px solid ${isDragOver ? T.accent : T.border}`,
        borderRadius: 12,
        overflow: 'hidden',
        background: isDragOver ? `${T.accent}08` : T.card,
        transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
        minHeight: PANEL_H,
        boxShadow: isDragOver ? `0 0 20px ${T.accent}15` : 'none',
        position: 'relative'
      }}
    >
      {/* ── Header bar ── */}
      <div style={{
        height: PANEL_H, flexShrink: 0,
        background: `linear-gradient(90deg, ${accent}08, transparent)`,
        borderBottom: collapsed ? 'none' : `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center',
        padding: '0 12px', gap: 8, cursor: 'default',
        userSelect: 'none',
      }}>
        {/* Drag handle */}
        <div
          draggable
          onDragStart={e => onDragStart(e, id)}
          style={{ cursor: 'grab', color: T.text3, display: 'flex', alignItems: 'center', flexShrink: 0, padding: '4px 0' }}
          title="اسحب لإعادة الترتيب"
        >
          <GripVertical size={14} opacity={0.5} />
        </div>

        {/* Title Group */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flex: 1 }}>
          <span style={{
            fontFamily: "'Cairo', sans-serif", fontSize: 13,
            fontWeight: 800, color: T.text,
          }}>{label}</span>
          
          {labelEn && (
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5,
              color: T.text3, letterSpacing: '0.05em', opacity: 0.6,
              fontWeight: 500
            }}>{labelEn}</span>
          )}
        </div>

        {/* Action Toggle */}
        <button
          onClick={onToggle}
          title={collapsed ? 'توسيع' : 'طي'}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: T.text3, padding: 4, display: 'flex', alignItems: 'center',
            transition: 'all 0.2s', borderRadius: 6
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = T.text
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = T.text3
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <ChevronDown size={14} style={{
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }} />
        </button>
      </div>

      {/* ── Body ── */}
      <div style={{
        flex: 1, overflow: 'hidden',
        opacity: collapsed ? 0 : 1,
        transition: 'opacity 0.2s ease',
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
const COL1_PANELS: Record<string, { label: string; accent: string; flex?: string; height?: number; labelEn?: string }> = {
  portfolio:    { label: 'المحفظة',      accent: T.primary, flex: '0 0 32%', labelEn: 'PORTFOLIO' },
  'quick-exec': { label: 'التنفيذ السريع', accent: T.success,  height: 168,     labelEn: 'EXECUTION' },
  'order-book': { label: 'دفتر الأوامر',  accent: T.danger,   height: 380,     labelEn: 'ORDERBOOK' },
  'watchlist':  { label: 'قائمة الأسواق',  accent: T.accent,   height: 480,     labelEn: 'WATCHLIST' },
  narrator:     { label: 'سرد السوق AI', accent: T.purple,   flex: '0 0 28%', labelEn: 'INSIGHTS'  },
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

      <div className="dash-grid" style={{
        height: `calc(100vh - ${HEADER_H}px)`,
        background: T.bg,
        gap: 12,
        padding: 12
      }}>

        {/* ══════════ COL 1 — أدوات يمين (draggable) ══════════ */}
        <div
          className="dash-col dash-col-left"
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
        <div className="dash-col dash-col-center" style={{ overflow: 'hidden', gap: 12 }}>

          {/* الشارت — ثابت غير قابل للسحب */}
          <div style={{
            flex: 1,
            background: T.card,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{
              height: PANEL_H, flexShrink: 0,
              background: `linear-gradient(90deg, ${T.primary}08, transparent)`,
              borderBottom: `1px solid ${T.border}`,
              display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8,
            }}>
              <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 13, fontWeight: 800, color: T.text, flex: 1 }}>الرسم البياني</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, color: T.text3, opacity: 0.6 }}>MARKET CHART</span>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <Empty label="شاشة التداول الرئيسية" color={T.primary} />
            </div>
          </div>

          {/* الصفقات المفتوحة — collapsible */}
          <div style={{
            flexShrink: 0,
            height: posOpen ? 120 : PANEL_H,
            transition: ANIM,
            background: T.card,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              height: PANEL_H, flexShrink: 0,
              background: `linear-gradient(90deg, ${T.success}08, transparent)`,
              borderBottom: posOpen ? `1px solid ${T.border}` : 'none',
              display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8,
            }}>
              <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 13, fontWeight: 800, color: T.text, flex: 1 }}>الصفقات المفتوحة</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, color: T.success, opacity: 0.8 }}>OPEN TRADES</span>
              <button
                onClick={() => setPosOpen(p => !p)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: T.text3, padding: 4 }}
              >
                <ChevronDown size={14} style={{ transform: posOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
              </button>
            </div>
            <div style={{ flex: 1, opacity: posOpen ? 1 : 0, transition: 'opacity 0.2s', overflow: 'hidden' }}>
              <Empty label="لا توجد مراكز مفتوحة حالياً" color={T.success} />
            </div>
          </div>
        </div>

        {/* ══════════ COL 3 — Tabs Panel ══════════ */}
        <div className="dash-col dash-col-right">
          <Col3TabbedPanel />
        </div>

        {/* Mobile Sidebar (Visible only on mobile) */}
        <div className="dash-col dash-col-right-mobile" style={{ display: 'none', padding: '0 4px 20px' }}>
             <Col3TabbedPanel />
             <div style={{ height: 10 }} />
             <WatchlistMini />
        </div>

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
