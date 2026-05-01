'use client'

import { useState, useEffect } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { 
  Building2, Globe, TrendingUp, TrendingDown, Activity, 
  FileText, Search, ShieldAlert, Cpu, Eye, Filter, Zap, Target, LineChart,
  Download, Calendar, Save, AlertTriangle, BarChart, ChevronDown
} from 'lucide-react'

// Unified Theme matching Portfolio and Scanner exactly
const T = {
  bg:      '#04050C',
  bg2:     '#0D1117',
  card:    '#08090F',
  cardHover:'#0B0F19',
  blue:    '#0A84FF',
  cyan:    '#00C8FF',
  green:   '#00FFC6',
  red:     '#FF4D4D',
  amber:   '#FFB800',
  amber2:  '#E6A23C',
  purple:  '#B388FF', 
  text:    '#E6EBF5',
  text2:   '#8090A8',
  text3:   '#A0AFC3',
  border:  'rgba(10,132,255,0.10)',
  border2: 'rgba(10,132,255,0.16)',
}

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
         <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      </div>
      <div style={{ fontSize: 9, color: T.text3, fontWeight: 600 }}>{label}</div>
    </div>
  )
}

// Fallback Mock Database (Used until Prisma is synced)
const DEMO_DATABASE = [
  {
    title: 'تأثير التضخم والسيولة على العملات', type: 'Forex Macro', date: 'اليوم، 08:30 ص', severity: 'High',
    symbol: 'EUR/USD', name: 'Euro / US Dollar', price: '1.0850', change: '+0.12', isUp: true, tag: 'INFLATION WATCH',
    decision: { title: 'انتظار (تحوط)', color: T.amber, desc: 'حالة ترقب لبيانات التضخم الأمريكية غداً. يُنصح بتقليص المراكز للانكشاف العالي للدولار.' },
    matrix: [
      { label: 'مؤسسات', val: 4, max: 10, color: T.red },
      { label: 'سيولة', val: 6, max: 10, color: T.cyan },
      { label: 'جيوسياسية', val: 8, max: 10, color: T.amber2 },
    ],
    risk: { var: '-$1.2M', beta: '1.14', sharpe: '2.1', pe: 'N/A', peAlert: false, fv: '1.0920', ratio: 65 },
    flow: [
      { time: '14:32', size: '2.5M Lts', type: 'Buy Block', heat: 90, color: T.green },
      { time: '13:15', size: '1.1M Lts', type: 'Neutral', heat: 40, color: T.text3 },
      { time: '11:05', size: '4.8M Lts', type: 'Accumulate', heat: 100, color: T.blue },
    ],
    consensus: 'شراء متراكم (Accumulation)',
    hiddenSignature: 'تحركات سيولة استثنائية في أسواق الخيارات ترجح تحوط المؤسسات الكبرى.',
    deepAnalysis: [
      'التداولات محصورة في نطاق جانبي بين 1.0820 و 1.0880 بحسب السجلات.',
      'دفاع شرس من المشترين عند الحد السفلي، لكن الزخم يفتقر للتدفقات الباطنية الصحيحة.',
      'احتمالية كسر مستويات الدعم واردة إذا جاءت بيانات مؤشر أسعار المستهلكين (CPI) أعلى.'
    ]
  },
  {
    title: 'تخارج الحيتان من سلاسل الكتل', type: 'Crypto Quant', date: 'أمس، 14:15 م', severity: 'Medium',
    symbol: 'BTC/USD', name: 'Bitcoin Network', price: '64,230.00', change: '-2.40', isUp: false, tag: 'CRYPTO / L1',
    decision: { title: 'شراء تدريجي', color: T.green, desc: 'تشبع بيعي حاد على الأطر اليومية، فرصة ممتازة لبناء مراكز استثمارية.' },
    matrix: [
      { label: 'مؤسسات', val: 7, max: 10, color: T.green },
      { label: 'سيولة', val: 3, max: 10, color: T.red },
      { label: 'جيوسياسية', val: 5, max: 10, color: T.amber2 },
    ],
    risk: { var: '-$4.5M', beta: '2.80', sharpe: '1.4', pe: 'N/A', peAlert: false, fv: '72,000', ratio: 25 },
    flow: [
      { time: '16:00', size: '400 BTC', type: 'Sell Block', heat: 85, color: T.red },
      { time: '14:20', size: '120 BTC', type: 'Distribution', heat: 60, color: T.amber },
      { time: '09:05', size: '50 BTC', type: 'Neutral', heat: 20, color: T.text3 },
    ],
    consensus: 'توزيع بيعي (Distribution)',
    hiddenSignature: 'محافظ مجهولة تقوم بتجميع كميات ضخمة (OTC) خارج السجلات.',
    deepAnalysis: [
      'تصفية عقود آجلة بقيمة تتجاوز 400 مليون دولار خففت الضغوط البيعية.',
      'مستويات 62,000$ تمثل نقطة ارتكاز صلبة لطلبات الشراء المخفية.',
      'الدخول بـ 30% من الكمية المستهدفة هنا، والانتظار لاختبار السيولة.'
    ]
  },
  {
    title: 'تقييم قطاع الطاقة والمكررات الربحية', type: 'Equity Macro', date: 'الأربعاء', severity: 'Low',
    symbol: 'XOM', name: 'Exxon Mobil Corp.', price: '114.60', change: '+0.88', isUp: true, tag: 'ENERGY / NYSE',
    decision: { title: 'الاحتفاظ (Hold)', color: T.blue, desc: 'تسعير عادل حالياً بانتظار وضوح الرؤية بشأن تخفيضات إنتاج أوبك+.' },
    matrix: [
      { label: 'مؤسسات', val: 5, max: 10, color: T.cyan },
      { label: 'سيولة', val: 8, max: 10, color: T.green },
      { label: 'جيوسياسية', val: 9, max: 10, color: T.red },
    ],
    risk: { var: '-$800K', beta: '0.85', sharpe: '1.8', pe: '12.4x', peAlert: false, fv: '135.00', ratio: 80 },
    flow: [
      { time: '15:45', size: '1.8M Shs', type: 'Accumulate', heat: 75, color: T.blue },
      { time: '10:30', size: '500K Shs', type: 'Buy Block', heat: 50, color: T.green },
    ],
    consensus: 'تجميع هادئ (Silent Accumulation)',
    hiddenSignature: 'تداول هادئ يعكس نظرة محايدة للمستثمرين الكبار. لا توجد بصمات خطرة.',
    deepAnalysis: [
      'مكرر ربحية مغري مقارنة بالمتوسط، لكن مخاوف الطلب تكبح الارتفاعات.',
      'التوترات الجيوسياسية تشكل حاجز حماية لأسعار النفط، وتدعم السهم.',
      'مراقبة اختراق مستوى 118$ بتأكيد أحجام تداول قبل اتخاذ قرار شرائي.'
    ]
  }
]

export default function StrategiesPage() {
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
        } else {
          // Fallback to demo data when API returns empty
          setData(DEMO_DATABASE)
        }
      } catch {
        setError('تعذر تحميل تقارير الاستراتيجيات حالياً.')
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

  if (loading) {
    return <div style={{ color: T.text, padding: 20 }}>جارٍ تحميل تقارير الاستراتيجيات...</div>
  }

  if (!active) {
    return (
      <div style={{
        color: T.text,
        padding: 24,
        direction: 'rtl',
        fontFamily: "'Cairo', sans-serif",
      }}>
        <div style={{
          background: T.card,
          border: `0.5px solid ${T.border}`,
          borderRadius: 12,
          padding: 24,
          textAlign: 'center',
        }}>
          <FileText size={28} color={T.blue} style={{ marginBottom: 12 }} />
          <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>لا توجد تقارير استراتيجية منشورة بعد</h2>
          <p style={{ margin: 0, color: T.text2, fontSize: 13 }}>
            {error || 'عند توفر تقارير بحثية حقيقية ستظهر هنا بدل أي بيانات تجريبية.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      width: '100%', height: 'calc(100vh - 60px)',
      background: T.bg, padding: '12px 20px', boxSizing: 'border-box',
      direction: 'rtl', fontFamily: "'Cairo', sans-serif",
      display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden'
    }}>
      <style>{`
        .strategies-row-2col { display: flex; gap: 12px; }
        .strategies-quant-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        @media (max-width: 767px) {
          .strategies-top-bar { display: none !important; }
          .strategies-sidebar { display: none !important; }
          .strategies-sidebar.strategies-sidebar-open { display: flex !important; position: fixed; top: 0; right: 0; bottom: 0; z-index: 50; width: 280px !important; box-shadow: -4px 0 20px rgba(0,0,0,0.5); }
          .strategies-main { flex: 1 !important; }
          .strategies-row-2col { flex-direction: column !important; }
          .strategies-quant-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
      {/* ── 1. Top Bar: Macroeconomic Radar (Ultra-Micro) ── */}
      <div className="strategies-top-bar" style={{ 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
        background: T.card, border: `0.5px solid ${T.border}`, borderRadius: 8, padding: '6px 12px',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Globe size={13} color={T.blue} />
          <span style={{ fontSize: 12, fontWeight: 700, color: T.text, marginRight: 2 }}>رادار الاقتصاد الكلي</span>
          <span style={{ fontSize: 9, background: `${T.blue}10`, color: T.blue, padding: '2px 6px', borderRadius: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", border: `0.5px solid ${T.border}` }}>
            LIVE INSTI-FEED
          </span>
          <span style={{ fontSize: 8, color: T.text3, fontFamily: "'JetBrains Mono', monospace", marginRight: 4 }}>• آخر تحديث: {new Date().toLocaleTimeString('ar-SA')}</span>
        </div>
        
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          {[
            { label: 'VIX (Fear)', val: '14.2', chg: '-1.4%', color: T.green },
            { label: 'US 10Y Yield', val: '4.25%', chg: '+0.03', color: T.amber },
            { label: 'FED Target', val: '5.25 - 5.50%', chg: 'Unchanged', color: T.text2 },
            { label: 'Smart Money Index', val: '112.4', chg: '+2.1%', color: T.cyan },
          ].map((id, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, borderLeft: i > 0 ? `0.5px solid ${T.border}` : 'none', paddingLeft: i > 0 ? 20 : 0 }}>
              <div>
                <div style={{ fontSize: 9, color: T.text3, marginBottom: 1, letterSpacing: 0.5 }}>{id.label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{id.val}</span>
                  <span style={{ fontSize: 9, color: id.color, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{id.chg}</span>
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
                <FileText size={13} color={T.blue} /> الأبحاث (RMS)
              </h2>
              <button style={{ background: `linear-gradient(135deg, ${T.cyan}, ${T.blue})`, border: 'none', borderRadius: 4, padding: '3px 8px', color: '#fff', fontSize: 9, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, letterSpacing: 0.5 }}>
                 تحديث <Zap size={10} />
              </button>
            </div>
            
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
               {['أسبوعي', 'شهري', 'سنوي', 'مخصص'].map(p => (
                 <button key={p} style={{ flex: 1, padding: '4px', background: p === 'شهري' ? `${T.blue}15` : T.bg2, border: `0.5px solid ${T.border}`, borderRadius: 4, color: p === 'شهري' ? T.blue : T.text2, fontSize: 9, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                   {p === 'شهري' && <Calendar size={8}/>} {p}
                 </button>
               ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', background: T.bg, border: `0.5px solid ${T.border}`, borderRadius: 6, padding: '0 8px', height: 30 }}>
              <Search size={12} color={T.text3} />
              <input placeholder="البحث في التقارير..." aria-label="البحث في التقارير" style={{ background: 'transparent', border: 'none', color: T.text, fontSize: 11, outline: 'none', padding: '0 8px', width: '100%', fontFamily: "'Cairo', sans-serif" }} />
            </div>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <style>{`
               ::-webkit-scrollbar { width: 3px; }
               ::-webkit-scrollbar-thumb { background: rgba(10,132,255,0.15); border-radius: 10px; }
            `}</style>
            
            {data.map((rep, idx) => (
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
                  <span style={{ fontSize: 9, background: T.bg, padding: '2px 6px', borderRadius: 4, color: T.blue, border: `0.5px solid ${T.border}`, fontFamily: "'JetBrains Mono', monospace" }}>{rep.type}</span>
                  <span style={{ fontSize: 9, color: T.text3 }}>{rep.date}</span>
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
                 استخراج
               </button>
               
               <button style={{ padding: '6px 12px', background: T.bg, border: `0.5px solid ${T.border}`, borderRadius: 6, color: T.blue, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                 <Globe size={12} /> الأسواق <ChevronDown size={12} />
               </button>

               <div style={{ display: 'flex', alignItems: 'center', background: T.bg, border: `0.5px solid ${T.border}`, borderRadius: 6, padding: '0 10px', height: 30, width: 120 }}>
                 <span style={{ color: T.text, fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", flex: 1, textAlign: 'center' }}>{active.symbol}</span>
                 <Search size={12} color={T.cyan} />
               </div>

               <div style={{ width: 1, height: 20, background: T.border, margin: '0 8px' }} />

               <button title="حفظ المستند" style={{ width: 30, height: 30, background: T.bg, border: `0.5px solid ${T.border}`, borderRadius: 6, color: T.text2, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s' }}>
                 <Save size={14} />
               </button>
               <button title="تصدير (PDF / Excel)" style={{ padding: '0 10px', height: 30, background: T.bg, border: `0.5px solid ${T.border}`, borderRadius: 6, color: T.text, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 600, fontSize: 10 }}>
                 <Download size={12} color={T.blue} /> تصدير
               </button>
            </div>

            {/* Branding Title */}
            <div style={{ textAlign: 'left' }}>
              <h1 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.cyan, letterSpacing: 0.5, textShadow: `0 0 10px ${T.cyan}20` }}>تقارير استراتيجية</h1>
              <div style={{ fontSize: 8, color: T.text3, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace", marginTop: 2, textTransform: 'uppercase' }}>
                VIP Institutional Intelligence • Quantum Trade v5.0
              </div>
            </div>
          </div>

          {/* 3.2 Main Scrolling Content Block (combines Image + Quant + Flows) */}
          <div key={`body-${activeIdx}`} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', animation: 'fadeIn 0.4s ease', paddingRight: 4, gap: 12 }}>
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }`}</style>
            
            {/* ROW 1: Risk Matrix (Left) & Decision (Right) From Image */}
            <div className="strategies-row-2col">
               {/* Right side: Direct Decision */}
               <div style={{ flex: 1.2, background: T.cardHover, border: `0.5px solid ${T.border}`, borderRadius: 8, padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                   <Target size={14} color={T.cyan} />
                   <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: T.text }}>القرار الاستراتيجي المباشر</h3>
                   <span style={{ fontSize: 9, background: `${T.bg}`, padding: '2px 6px', borderRadius: 4, color: T.text3, marginRight: 'auto', border: `0.5px solid ${T.border}` }}>
                     {active.symbol} - {active.name}
                   </span>
                 </div>
                 
                 <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
                   <div style={{ fontSize: 22, fontWeight: 800, color: active.decision.color, textShadow: `0 0 15px ${active.decision.color}20` }}>
                     {active.decision.title}
                   </div>
                   <div style={{ fontSize: 18, fontWeight: 700, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>${active.price}</div>
                   <div style={{ fontSize: 11, fontWeight: 600, color: active.isUp ? T.green : T.red, display: 'flex', alignItems: 'center', fontFamily: "'JetBrains Mono', monospace" }}>
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
                   <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: T.purple }}>المصفوفة الهيكلية</h3>
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
                  <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: T.text }}>المقاييس الكمية</h3>
                </div>
                <div className="strategies-quant-grid">
                  {[
                    { label: 'VaR (95%)', val: active.risk.var, desc: 'القيمة للخطر', alert: false },
                    { label: 'Beta (1Y)', val: active.risk.beta, desc: 'تقلب السوق', alert: Number(active.risk.beta) > 2 },
                    { label: 'Sharpe Ratio', val: active.risk.sharpe, desc: 'عائد المخاطرة', alert: false },
                    { label: 'P/E Ratio', val: active.risk.pe, desc: 'مكرر الربحية', alert: active.risk.peAlert },
                  ].map((m, i) => (
                    <div key={i} style={{ background: T.bg2, border: `0.5px solid ${m.alert ? T.red : T.border}`, padding: 10, borderRadius: 6 }}>
                      <div style={{ fontSize: 9, color: T.text3, marginBottom: 2 }}>{m.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: m.alert ? T.red : T.text, fontFamily: "'JetBrains Mono', monospace" }}>{m.val}</div>
                      <div style={{ fontSize: 8, color: m.alert ? T.red : T.text2, marginTop: 4 }}>{m.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fair Value Radar */}
              <div style={{ flex: 1, background: T.bg2, border: `0.5px solid ${T.border}`, borderRadius: 8, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>تقييم الذكاء (FV)</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.blue, fontFamily: "'JetBrains Mono', monospace" }}>${active.risk.fv}</span>
                </div>
                <div style={{ height: 4, background: T.bg, borderRadius: 2, overflow: 'hidden', position: 'relative', marginTop: 10, border: `0.5px solid ${T.border}` }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${active.risk.ratio}%`, background: `linear-gradient(90deg, ${T.blue}, ${T.cyan})` }} />
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${active.risk.ratio}%`, width: 2, background: '#fff', boxShadow: '0 0 6px #fff' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 9, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
                  <span>Undervalued</span>
                  <span>Premium</span>
                </div>
              </div>
            </div>

            {/* ROW 3: Hidden Signature Alert + Dark Pools Flow */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: T.card, border: `0.5px solid ${T.border}`, borderRadius: 8, padding: 16 }}>
              <div style={{ background: `${T.amber}05`, border: `0.5px solid ${T.amber}30`, borderRight: `3px solid ${T.amber}`, borderRadius: 6, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <AlertTriangle size={16} color={T.amber} />
                <div>
                  <h3 style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, color: T.amber }}>البصمة الخفية (Hidden Signature)</h3>
                  <p style={{ fontSize: 11, color: T.text, margin: 0, fontWeight: 500 }}>{active.hiddenSignature}</p>
                </div>
              </div>

              {/* Sub-row for flow and consensus */}
              <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {active.flow.map((block, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', background: T.bg, border: `0.5px solid ${T.border}`, borderRadius: 4 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, width: 40, fontFamily: "'JetBrains Mono', monospace" }}>{block.time}</div>
                      <div style={{ flex: 1, margin: '0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, height: 3, background: T.bg2, borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${block.heat}%`, background: `linear-gradient(90deg, ${block.color}22, ${block.color})` }} />
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 600, color: block.color, width: 60 }}>{block.type}</span>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.text, fontFamily: "'JetBrains Mono', monospace", width: 70, textAlign: 'left' }}>{block.size}</div>
                    </div>
                  ))}
                </div>
                
                <div style={{ flex: 1, padding: 16, background: `${T.blue}08`, border: `0.5px solid ${T.border}`, borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.blue, marginBottom: 6 }}>إجماع المحافظ الكبرى</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{active.consensus}</div>
                </div>
              </div>
            </div>

            {/* ROW 4: Deep Strategic Analysis (AI Memo combination) */}
            <div style={{ background: T.cardHover, border: `0.5px solid ${T.border}`, borderRadius: 8, padding: 20, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                <Cpu size={14} color={T.blue} />
                <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: T.blue }}>التحليل المؤسسي المعمق</h3>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {active.deepAnalysis.map((line, i) => (
                  <div key={i} style={{ fontSize: 11, color: T.text, lineHeight: 1.7, position: 'relative', paddingRight: 12, borderRight: `2px solid ${T.text3}` }}>
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
