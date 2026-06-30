'use client'

import { useState, useEffect } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useTranslations } from 'next-intl'
import { 
  Building2, Globe, TrendingUp, TrendingDown, Activity, 
  FileText, Search, ShieldAlert, Cpu, Eye, Filter, Zap, Target, LineChart,
  Download, Calendar, Save, AlertTriangle, BarChart, ChevronDown
} from 'lucide-react'

import { T as SharedT } from '@/lib/unified-tokens'
import { useScopedStyle } from '@/hooks/useScopedStyle'

// Unified Theme matching Portfolio and Scanner exactly (canonical + local extensions)
const T = { ...SharedT, amber2: '#E6A23C' }

const Gauge = ({ value, max, label, color }: { value: number, max: number, label: string, color: string }) => {
  const radius = 20
  const circum = 2 * Math.PI * radius
  const strokeDasharray = `${(value / max) * circum} ${circum}`
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ position: 'relative', width: 44, height: 44 }}>
         <svg width="44" height="44" viewBox="0 0 44 44" style={{ transform: 'rotate(-90deg)' }}>
           <circle cx="22" cy="22" r={radius} fill="none" stroke={`${color}15`} strokeWidth="3" />
           <circle cx="22" cy="22" r={radius} fill="none" stroke={color} strokeWidth="3" strokeDasharray={strokeDasharray} strokeLinecap="round" style={{ transition: '1s ease-out' }} />
         </svg>
         <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: "var(--font-mono)" }}>{value}</div>
      </div>
      <div style={{ fontSize: 9, color: T.text3, fontWeight: 600 }}>{label}</div>
    </div>
  )
}

// Mock data removed — only real strategy reports from the API are displayed

export default function StrategiesPage() {
  const t = useTranslations('strategies')
  useScopedStyle(`@media (max-width: 767px) {
          .strategies-page-root { height: 100% !important; }
        }
        .strategies-row-2col { display: flex; gap: 12px; }
        .strategies-quant-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        @media (max-width: 767px) {
          .strategies-top-bar { display: none !important; }
          .strategies-sidebar { display: none !important; }
          .strategies-sidebar.strategies-sidebar-open { display: flex !important; position: fixed; top: 0; inset-inline-end: 0; bottom: 0; z-index: 50; width: 280px !important; box-shadow: -4px 0 20px rgba(0,0,0,0.5); }
          .strategies-main { flex: 1 !important; }
          .strategies-row-2col { flex-direction: column !important; }
          .strategies-quant-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
::-webkit-scrollbar { width: 3px; }
               ::-webkit-scrollbar-thumb { background: rgba(10,132,255,0.15); border-radius: 10px; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }`)

  const [data, setData] = useState<any[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
  

      try {
        const res = await fetch('/api/strategies')
        const j = await res.json()
        if (j.success && j.data && j.data.length > 0) {
          setData(j.data)
        }
        // No fallback to mock data — empty state is shown when no reports exist
      } catch {
        setError(t('loadError'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const isMobile = useMediaQuery('(max-width: 767px)')

  // Auto-close sidebar on mobile
  useEffect(() => {
    if (isMobile) setSidebarOpen(false)
    else setSidebarOpen(true)
  }, [isMobile])

  const active = data[activeIdx]

  // Translate date strings from API (Today, Yesterday, or date format)
  const translateDate = (dateStr: string) => {
    if (dateStr === 'Today') return t('today')
    if (dateStr === 'Yesterday') return t('yesterday')
    return dateStr
  }

  if (loading) {
    return <div style={{ color: T.text, padding: 20 }}>{t('loading')}</div>
  }

  if (!active) {
    return (
      <div style={{
        color: T.text,
        padding: 24,
        direction: 'inherit',
        fontFamily: "var(--font-ar)",
      }}>
        <div style={{
          background: T.card,
          border: `0.5px solid ${T.border}`,
          borderRadius: 12,
          padding: 24,
          textAlign: 'center',
        }}>
          <FileText size={28} color={T.blue} style={{ marginBottom: 12 }} />
          <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>{t('noReportsTitle')}</h2>
          <p style={{ margin: 0, color: T.text2, fontSize: 13 }}>
            {error || t('noReportsDesc')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="strategies-page-root" style={{
      width: '100%', height: 'calc(100vh - 60px)',
      background: T.bg, padding: '12px 20px', boxSizing: 'border-box',
      direction: 'inherit', fontFamily: "var(--font-ar)",
      display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden'
    }}>
      {/* Scoped styles via useScopedStyle */}{/* ── 1. Top Bar: Macroeconomic Radar (Ultra-Micro) ── */}
      <div className="strategies-top-bar" style={{ 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
        background: T.card, border: `0.5px solid ${T.border}`, borderRadius: 8, padding: '6px 12px',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Globe size={13} color={T.blue} />
          <span style={{ fontSize: 12, fontWeight: 700, color: T.text, marginRight: 2 }}>{t('macroRadar')}</span>
          <span style={{ fontSize: 9, background: `${T.blue}10`, color: T.blue, padding: '2px 6px', borderRadius: 12, fontWeight: 700, fontFamily: "var(--font-mono)", border: `0.5px solid ${T.border}` }}>
            {t('liveInstiFeed')}
          </span>
          <span style={{ fontSize: 8, color: T.text3, fontFamily: "var(--font-mono)", marginRight: 4 }}>{t('lastUpdate')} {new Date().toLocaleTimeString('ar-SA')}</span>
        </div>
        
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          {[
            { label: t('vixFear'), val: '14.2', chg: '-1.4%', color: T.green },
            { label: t('us10yYield'), val: '4.25%', chg: '+0.03', color: T.amber },
            { label: t('fedTarget'), val: '5.25 - 5.50%', chg: t('unchanged'), color: T.text2 },
            { label: t('smartMoneyIndex'), val: '112.4', chg: '+2.1%', color: T.cyan },
          ].map((id, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, borderInlineStart: i > 0 ? `0.5px solid ${T.border}` : 'none', paddingInlineStart: i > 0 ? 20 : 0 }}>
              <div>
                <div style={{ fontSize: 9, color: T.text3, marginBottom: 1, letterSpacing: 0.5 }}>{id.label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "var(--font-mono)" }}>{id.val}</span>
                  <span style={{ fontSize: 9, color: id.color, fontWeight: 600, fontFamily: "var(--font-mono)" }}>{id.chg}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile sidebar toggle */}
      {isMobile && (
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            position: 'fixed', top: 12, right: 12, zIndex: 60,
            width: 36, height: 36, borderRadius: 8,
            background: T.card, border: `1px solid ${T.border}`,
            color: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: 14,
          }}
        >
          ☰
        </button>
      )}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }}
        />
      )}
      {/* ── Main Content Grid ── */}
      <div style={{ display: 'flex', gap: 12, flex: 1, overflow: 'hidden' }}>
        
        {/* 2. Left Sidebar: RMS */}
        <div className={`strategies-sidebar${sidebarOpen ? ' strategies-sidebar-open' : ''}`} style={{ 
          width: 260, background: T.card, border: `0.5px solid ${T.border}`, borderRadius: 8, 
          display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden'
        }}>
          <div style={{ padding: '12px', borderBottom: `0.5px solid ${T.border}`, background: `linear-gradient(180deg, ${T.blue}05, transparent)` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={13} color={T.blue} /> {t('researchRms')}
              </h2>
              <button style={{ background: `linear-gradient(135deg, ${T.cyan}, ${T.blue})`, border: 'none', borderRadius: 4, padding: '3px 8px', color: '#fff', fontSize: 9, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, letterSpacing: 0.5 }}>
                 {t('update')} <Zap size={10} />
              </button>
            </div>
            
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
               {['weekly', 'monthly', 'yearly', 'custom'].map(p => (
                 <button key={p} style={{ flex: 1, padding: '4px', background: p === 'monthly' ? `${T.blue}15` : T.bg2, border: `0.5px solid ${T.border}`, borderRadius: 4, color: p === 'monthly' ? T.blue : T.text2, fontSize: 9, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                   {p === 'monthly' && <Calendar size={8}/>} {t(p)}
                 </button>
               ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', background: T.bg, border: `0.5px solid ${T.border}`, borderRadius: 6, padding: '0 8px', height: 30 }}>
              <Search size={12} color={T.text3} />
              <input placeholder={t('searchReports')} aria-label={t('searchReports')} style={{ background: 'transparent', border: 'none', color: T.text, fontSize: 11, outline: 'none', padding: '0 8px', width: '100%', fontFamily: "var(--font-ar)" }} />
            </div>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* Scoped styles via useScopedStyle */}{data.map((rep, idx) => (
              <div 
                key={idx} 
                onClick={() => setActiveIdx(idx)}
                style={{ 
                  padding: '10px 12px', borderRadius: 6, cursor: 'pointer', transition: 'all 0.2s ease',
                  background: activeIdx === idx ? `${T.blue}10` : 'transparent',
                  border: `0.5px solid ${activeIdx === idx ? T.border2 : 'transparent'}`,
                }}
                onMouseEnter={e => { if (activeIdx !== idx) e.currentTarget.style.background = T.cardHover; }}
                onMouseLeave={e => { if (activeIdx !== idx) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 9, background: T.bg, padding: '2px 6px', borderRadius: 4, color: T.blue, border: `0.5px solid ${T.border}`, fontFamily: "var(--font-mono)" }}>{rep.type}</span>
                  <span style={{ fontSize: 9, color: T.text3 }}>{translateDate(rep.date)}</span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: activeIdx === idx ? T.text : T.text2, lineHeight: 1.5 }}>
                  {rep.title}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Center Area: Mega Institutional Tear Sheet */}
        <div className="strategies-main" style={{ 
          flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: 12
        }}>
          
          {/* 3.1 Header Dashboard (VIP Tools) */}
          <div key={`header-${activeIdx}`} style={{ animation: 'fadeIn 0.3s ease', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: T.bg2, borderRadius: 8, border: `0.5px solid ${T.border}`, padding: '10px 16px', flexShrink: 0 }}>
            
            {/* Context Actions */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
               <button style={{ padding: '6px 12px', background: `linear-gradient(135deg, ${T.cyan}10, transparent)`, border: `0.5px solid ${T.cyan}40`, borderRadius: 6, color: T.cyan, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                 {t('extract')}
               </button>
               
               <button style={{ padding: '6px 12px', background: T.bg, border: `0.5px solid ${T.border}`, borderRadius: 6, color: T.blue, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                 <Globe size={12} /> {t('markets')} <ChevronDown size={12} />
               </button>

               <div style={{ display: 'flex', alignItems: 'center', background: T.bg, border: `0.5px solid ${T.border}`, borderRadius: 6, padding: '0 10px', height: 30, width: 120 }}>
                 <span style={{ color: T.text, fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", flex: 1, textAlign: 'center' }}>{active.symbol}</span>
                 <Search size={12} color={T.cyan} />
               </div>

               <div style={{ width: 1, height: 20, background: T.border, margin: '0 8px' }} />

               <button title={t('saveDocument')} style={{ width: 30, height: 30, background: T.bg, border: `0.5px solid ${T.border}`, borderRadius: 6, color: T.text2, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s' }}>
                 <Save size={14} />
               </button>
               <button title={t('exportPdfExcel')} style={{ padding: '0 10px', height: 30, background: T.bg, border: `0.5px solid ${T.border}`, borderRadius: 6, color: T.text, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 600, fontSize: 10 }}>
                 <Download size={12} color={T.blue} /> {t('export')}
               </button>
            </div>

            {/* Branding Title */}
            <div style={{ textAlign: 'left' }}>
              <h1 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.cyan, letterSpacing: 0.5, textShadow: `0 0 10px ${T.cyan}20` }}>{t('strategyReports')}</h1>
              <div style={{ fontSize: 8, color: T.text3, letterSpacing: 1, fontFamily: "var(--font-mono)", marginTop: 2, textTransform: 'uppercase' }}>
                {t('branding')}
              </div>
            </div>
          </div>

          {/* 3.2 Main Scrolling Content Block (combines Image + Quant + Flows) */}
          <div key={`body-${activeIdx}`} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', animation: 'fadeIn 0.4s ease', paddingRight: 4, gap: 12 }}>
            {/* Scoped styles via useScopedStyle */}{/* ROW 1: Risk Matrix (Left) & Decision (Right) From Image */}
            <div className="strategies-row-2col">
               {/* Right side: Direct Decision */}
               <div style={{ flex: 1.2, background: T.cardHover, border: `0.5px solid ${T.border}`, borderRadius: 8, padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                   <Target size={14} color={T.cyan} />
                   <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: T.text }}>{t('directDecision')}</h3>
                   <span style={{ fontSize: 9, background: `${T.bg}`, padding: '2px 6px', borderRadius: 4, color: T.text3, marginRight: 'auto', border: `0.5px solid ${T.border}` }}>
                     {active.symbol} - {active.name}
                   </span>
                 </div>
                 
                 <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
                   <div style={{ fontSize: 22, fontWeight: 800, color: active.decision.color, textShadow: `0 0 15px ${active.decision.color}20` }}>
                     {active.decision.title}
                   </div>
                   <div style={{ fontSize: 18, fontWeight: 700, color: T.text, fontFamily: "var(--font-mono)" }}>${active.price}</div>
                   <div style={{ fontSize: 11, fontWeight: 600, color: active.isUp ? T.green : T.red, display: 'flex', alignItems: 'center', fontFamily: "var(--font-mono)" }}>
                     {active.isUp ? <TrendingUp size={12} style={{ marginRight: 4 }}/> : <TrendingDown size={12} style={{ marginRight: 4 }}/>} 
                     {active.change}%
                   </div>
                 </div>
                 
                 <p style={{ fontSize: 11, color: T.text2, lineHeight: 1.6, margin: 0 }}>
                   {active.decision.desc}
                 </p>
               </div>

               {/* Left side: Risk Matrix */}
               <div style={{ flex: 1, background: T.cardHover, border: `0.5px solid ${T.border}`, borderRadius: 8, padding: 20 }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                   <Activity size={14} color={T.purple} />
                   <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: T.purple }}>{t('structuralMatrix')}</h3>
                 </div>
                 
                 <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
                    {active.matrix.map((m, i) => (
                      <Gauge key={i} value={m.val} max={m.max} label={m.label} color={m.color} />
                    ))}
                 </div>
               </div>
            </div>

            {/* ROW 2: Quantitative Data & Fair Value */}
            <div className="strategies-row-2col">
              
              {/* Quant Grid */}
              <div style={{ flex: 1.5, background: T.card, border: `0.5px solid ${T.border}`, borderRadius: 8, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <Building2 size={14} color={T.blue} />
                  <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: T.text }}>{t('quantMetrics')}</h3>
                </div>
                <div className="strategies-quant-grid">
                  {[
                    { label: t('var95'), val: active.risk.var, desc: t('valueAtRisk'), alert: false },
                    { label: t('beta1y'), val: active.risk.beta, desc: t('marketVolatility'), alert: Number(active.risk.beta) > 2 },
                    { label: t('sharpeRatio'), val: active.risk.sharpe, desc: t('riskReturn'), alert: false },
                    { label: t('peRatio'), val: active.risk.pe, desc: t('peRatioDesc'), alert: active.risk.peAlert },
                  ].map((m, i) => (
                    <div key={i} style={{ background: T.bg2, border: `0.5px solid ${m.alert ? T.red : T.border}`, padding: 10, borderRadius: 6 }}>
                      <div style={{ fontSize: 9, color: T.text3, marginBottom: 2 }}>{m.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: m.alert ? T.red : T.text, fontFamily: "var(--font-mono)" }}>{m.val}</div>
                      <div style={{ fontSize: 8, color: m.alert ? T.red : T.text2, marginTop: 4 }}>{m.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fair Value Radar */}
              <div style={{ flex: 1, background: T.bg2, border: `0.5px solid ${T.border}`, borderRadius: 8, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{t('intelligenceValuation')}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.blue, fontFamily: "var(--font-mono)" }}>${active.risk.fv}</span>
                </div>
                <div style={{ height: 4, background: T.bg, borderRadius: 2, overflow: 'hidden', position: 'relative', marginTop: 10, border: `0.5px solid ${T.border}` }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${active.risk.ratio}%`, background: `linear-gradient(90deg, ${T.blue}, ${T.cyan})` }} />
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${active.risk.ratio}%`, width: 2, background: '#fff', boxShadow: '0 0 6px #fff' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 9, color: T.text3, fontFamily: "var(--font-mono)" }}>
                  <span>{t('undervalued')}</span>
                  <span>{t('premium')}</span>
                </div>
              </div>
            </div>

            {/* ROW 3: Hidden Signature Alert + Dark Pools Flow */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: T.card, border: `0.5px solid ${T.border}`, borderRadius: 8, padding: 16 }}>
              <div style={{ background: `${T.amber}05`, border: `0.5px solid ${T.amber}30`, borderInlineEnd: `3px solid ${T.amber}`, borderRadius: 6, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <AlertTriangle size={16} color={T.amber} />
                <div>
                  <h3 style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, color: T.amber }}>{t('hiddenSignature')}</h3>
                  <p style={{ fontSize: 11, color: T.text, margin: 0, fontWeight: 500 }}>{active.hiddenSignature}</p>
                </div>
              </div>

              {/* Sub-row for flow and consensus */}
              <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {active.flow.map((block, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', background: T.bg, border: `0.5px solid ${T.border}`, borderRadius: 4 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, width: 40, fontFamily: "var(--font-mono)" }}>{block.time}</div>
                      <div style={{ flex: 1, margin: '0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, height: 3, background: T.bg2, borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${block.heat}%`, background: `linear-gradient(90deg, ${block.color}22, ${block.color})` }} />
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 600, color: block.color, width: 60 }}>{block.type}</span>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.text, fontFamily: "var(--font-mono)", width: 70, textAlign: 'left' }}>{block.size}</div>
                    </div>
                  ))}
                </div>
                
                <div style={{ flex: 1, padding: 16, background: `${T.blue}08`, border: `0.5px solid ${T.border}`, borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.blue, marginBottom: 6 }}>{t('majorWalletsConsensus')}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{active.consensus}</div>
                </div>
              </div>
            </div>

            {/* ROW 4: Deep Strategic Analysis (AI Memo combination) */}
            <div style={{ background: T.cardHover, border: `0.5px solid ${T.border}`, borderRadius: 8, padding: 20, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                <Cpu size={14} color={T.blue} />
                <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: T.blue }}>{t('deepInstitutionalAnalysis')}</h3>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {active.deepAnalysis.map((line, i) => (
                  <div key={i} style={{ fontSize: 11, color: T.text, lineHeight: 1.7, position: 'relative', paddingInlineEnd: 12, borderInlineEnd: `2px solid ${T.text3}` }}>
                    {line}
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
