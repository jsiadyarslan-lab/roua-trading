'use client'

import { useState, useEffect } from 'react'
import {
  ScanSearch, Target, Activity, TrendingUp, TrendingDown, Brain, 
  Search, ChevronDown, List, Zap, Plus, LayoutGrid, Map, Clock, Filter
} from 'lucide-react'

// Matching Micro-Aesthetic Tokens
const T = {
  bg:      '#04050C',
  bg2:     '#0D1117',
  card:    '#08090F',
  cardHover:'#0B0F19',
  card2:   '#0B0E14', // Subtle contrast for headers
  blue:    '#0A84FF',
  cyan:    '#00C8FF',
  green:   '#00FFC6',
  red:     '#FF4D4D',
  amber:   '#FFB800',
  purple:  '#B388FF',
  text:    '#E6EBF5',
  text2:   '#8090A8',
  text3:   '#A0AFC3',
  border:  'rgba(10,132,255,0.10)',
  border2: 'rgba(10,132,255,0.16)',
}

interface ScannerItem {
  symbol: string
  type: string
  price: number
  changePct: number
  rsi: number
  macd: string
  aiScore: string
  aiColor: string
  volume: string
}

type TabType = 'scanner' | 'heatmap' | 'patterns' | 'timeframes'

export default function ScannerPage() {
  const [data, setData] = useState<ScannerItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('scanner')
  const [filterType, setFilterType] = useState('All')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchData()
  }, [filterType])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/scanner/feed?type=${filterType}`)
      const j = await res.json()
      if (j.success) setData(j.data)
    } finally {
      setLoading(false)
    }
  }

  const sortedByChange = [...data].sort((a, b) => b.changePct - a.changePct)
  const topGainers = sortedByChange.slice(0, Math.max(3, Math.floor(data.length / 2)))
  const topLosers = sortedByChange.slice(-Math.max(3, Math.floor(data.length / 2))).reverse()

  const TabButton = ({ id, icon: Icon, label }: { id: TabType, icon: any, label: string }) => {
    const isActive = activeTab === id
    return (
      <button
        onClick={() => setActiveTab(id)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
          background: isActive ? `${T.cyan}10` : 'transparent',
          color: isActive ? T.cyan : T.text2,
          borderLeft: isActive ? `3px solid ${T.cyan}` : '3px solid transparent',
          transition: 'all 0.2s ease', fontFamily: "'Cairo', sans-serif"
        }}
        onMouseEnter={e => !isActive && (e.currentTarget.style.background = T.bg2)}
        onMouseLeave={e => !isActive && (e.currentTarget.style.background = 'transparent')}
      >
        <Icon size={14} color={isActive ? T.cyan : T.text3} />
        <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 600 }}>{label}</span>
      </button>
    )
  }

  return (
    <div style={{
      width: '100%', height: 'calc(100vh - 60px)',
      background: T.bg, padding: '12px 20px', boxSizing: 'border-box',
      direction: 'rtl', fontFamily: "'Cairo', sans-serif",
      display: 'flex', gap: 16, overflow: 'hidden'
    }}>
      <style>{`
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #0A84FF22; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #0A84FF44; }
      `}</style>

      {/* ── Sidebar Navigation ── */}
      <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ padding: '4px 0' }}>
          <h1 style={{ margin: '0 0 6px 0', fontSize: 14, fontWeight: 800, color: T.text, display: 'flex', alignItems: 'center', gap: 6 }}>
            السكانر المتقدم <ScanSearch size={16} color={T.amber} />
          </h1>
          <p style={{ margin: 0, fontSize: 10, color: T.text2, lineHeight: 1.5 }}>
            تحليل متعدد الأصول ومسح فوري بالذكاء الاصطناعي.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <TabButton id="scanner" icon={LayoutGrid} label="جدول المسح الحي" />
          <TabButton id="heatmap" icon={Map} label="الخريطة الحرارية" />
          <TabButton id="patterns" icon={Brain} label="الأنماط الفنية (AI)" />
          <TabButton id="timeframes" icon={Clock} label="تحليل متعدد الأطر" />
        </div>
        
        <div style={{ marginTop: 'auto', background: `${T.blue}08`, padding: '12px', borderRadius: 8, border: `0.5px solid ${T.blue}20` }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.blue, fontSize: 10, fontWeight: 800, marginBottom: 4 }}>
             <Activity size={12} /> متصل بالبيانات الحية
           </div>
           <div style={{ fontSize: 9, color: T.text3 }}>جميع الحسابات التقنية تنفذ بالوقت الفعلي.</div>
        </div>
      </div>

      {/* ── Main Content Area ── */}
      <div style={{ 
        flex: 1, background: T.card, border: `0.5px solid ${T.border}`, 
        borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' 
      }}>
        
        {/* TAB 1: SCANNER TABLE */}
        {activeTab === 'scanner' && (
          <>
            <div style={{ padding: '10px 16px', borderBottom: `0.5px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: T.card2, flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>جدول المسح الحي</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', background: T.bg2, borderRadius: 6, padding: '2px' }}>
                  {['All', 'Forex', 'Crypto', 'Stock'].map(tab => (
                    <button key={tab} onClick={() => setFilterType(tab)} style={{
                      background: filterType === tab ? `${T.cyan}18` : 'transparent',
                      border: 'none', color: filterType === tab ? T.cyan : T.text2,
                      padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
                      fontSize: 10, fontWeight: filterType === tab ? 700 : 500, fontFamily: "'JetBrains Mono', monospace"
                    }}>
                      {tab}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', background: T.bg, border: `0.5px solid ${T.border}`, borderRadius: 6, padding: '0 8px', height: 28 }}>
                  <Search size={12} color={T.text3} />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث عن رمز..." style={{ background: 'transparent', border: 'none', color: T.text, fontSize: 10, outline: 'none', padding: '0 6px', width: 100, fontFamily: "'Cairo', sans-serif" }} />
                </div>
              </div>
            </div>

            {/* Table Header */}
            <div style={{ 
              display: 'grid', gridTemplateColumns: 'minmax(120px, 1.5fr) minmax(80px, 1fr) minmax(80px, 1fr) minmax(80px, 1fr) minmax(80px, 1fr) minmax(100px, 1.5fr) minmax(80px, 1fr)', 
              padding: '10px 16px', borderBottom: `0.5px solid ${T.border}`, background: `linear-gradient(90deg, ${T.cyan}05, transparent)`,
              fontSize: 10, color: T.text3, fontWeight: 700, gap: 10, flexShrink: 0
            }}>
              <div>الرمز (Pair)</div>
              <div>السعر</div>
              <div>التغير %</div>
              <div style={{ textAlign: 'center' }}>RSI</div>
              <div style={{ textAlign: 'center' }}>MACD</div>
              <div style={{ textAlign: 'center' }}>تقييم الذكاء (AI)</div>
              <div style={{ textAlign: 'center' }}>إجراءات</div>
            </div>

            {/* Table Body */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text3, fontSize: 11 }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${T.cyan}`, borderTopColor: 'transparent', animation: 'spin 1s linear infinite', marginLeft: 8 }} />
                  جارٍ فحص وتحليل الأسواق...
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              ) : data.filter(d => d.symbol.toLowerCase().includes(search.toLowerCase())).map((row) => (
                <div key={row.symbol} style={{ 
                  display: 'grid', gridTemplateColumns: 'minmax(120px, 1.5fr) minmax(80px, 1fr) minmax(80px, 1fr) minmax(80px, 1fr) minmax(80px, 1fr) minmax(100px, 1.5fr) minmax(80px, 1fr)', 
                  padding: '10px 16px', borderBottom: `0.5px solid ${T.bg2}`, gap: 10,
                  alignItems: 'center', transition: 'all 0.1s', cursor: 'pointer'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = T.cardHover; e.currentTarget.style.borderColor = T.border; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = T.bg2; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${T.blue}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `0.5px solid ${T.blue}40` }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: T.blue, fontFamily: "'JetBrains Mono', monospace" }}>{row.symbol[0]}</span>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{row.symbol}</div>
                      <div style={{ fontSize: 9, color: T.text3, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>{row.type} • V:{row.volume}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>${row.price < 10 ? row.price.toFixed(4) : row.price.toFixed(2)}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: row.changePct >= 0 ? T.green : T.red }}>{row.changePct >= 0 ? '+' : ''}{row.changePct.toFixed(2)}%</div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", background: row.rsi > 70 ? `${T.red}15` : row.rsi < 30 ? `${T.green}15` : T.bg2, color: row.rsi > 70 ? T.red : row.rsi < 30 ? T.green : T.text2, border: `0.5px solid ${row.rsi > 70 ? T.red : row.rsi < 30 ? T.green : T.border}` }}>{row.rsi}</span>
                  </div>
                  <div style={{ textAlign: 'center', fontSize: 10, color: Number(row.macd) > 0 ? T.green : T.red, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{row.macd}</div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 9, fontWeight: 800, background: `${row.aiColor}10`, color: row.aiColor, border: `0.5px solid ${row.aiColor}30`, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Brain size={10} /> {row.aiScore}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                    <button title="تفاصيل" style={{ width: 24, height: 24, borderRadius: 4, border: `0.5px solid ${T.border}`, background: T.bg2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><List size={11} color={T.text2} /></button>
                    <button title="تنفيذ ذكي" style={{ width: 24, height: 24, borderRadius: 4, border: `0.5px solid ${T.border}`, background: T.bg2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Zap size={11} color={T.cyan} /></button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* TAB 2: HEATMAP */}
        {activeTab === 'heatmap' && (
          <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}><Map color={T.purple} size={16} /> الخريطة الحرارية للسيولة</h2>
            <p style={{ fontSize: 11, color: T.text3, marginBottom: 20 }}>تصور بصري يوضح قوة تدفق السيولة الشرائية والبيعية في الأسواق.</p>
            
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(3, 1fr)', gap: 10 }}>
              {loading ? <div style={{ color: T.text2, fontSize: 11 }}>جارٍ التحميل...</div> : <>
                {topGainers.map((g, i) => (
                  <div key={g.symbol} style={{ 
                    background: `linear-gradient(135deg, ${T.green}${Math.max(10, 40 - i*10)}, ${T.green}10)`, 
                    border: `0.5px solid ${T.green}60`, borderRadius: 8, padding: '12px', 
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gridColumn: i === 0 ? 'span 2' : 'span 1', gridRow: i === 0 ? 'span 2' : 'span 1',
                    boxShadow: i === 0 ? `0 0 20px ${T.green}10` : 'none', transition: 'transform 0.2s', cursor: 'pointer'
                  }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                    <div style={{ fontSize: i === 0 ? 20 : 13, fontWeight: 800, color: '#fff', fontFamily: "'JetBrains Mono', monospace", textShadow: '0 1px 5px rgba(0,0,0,0.5)' }}>{g.symbol}</div>
                    <div style={{ fontSize: i === 0 ? 12 : 9, color: T.green, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, marginTop: 4 }}>+{g.changePct.toFixed(2)}%</div>
                  </div>
                ))}
                
                {topLosers.map((l, i) => (
                  <div key={l.symbol} style={{ 
                    background: `linear-gradient(135deg, ${T.red}${Math.max(10, 30 - i*8)}, ${T.red}10)`, 
                    border: `0.5px solid ${T.red}50`, borderRadius: 8, padding: '12px', 
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gridColumn: 'span 1', gridRow: 'span 1', transition: 'transform 0.2s', cursor: 'pointer'
                  }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', fontFamily: "'JetBrains Mono', monospace", textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>{l.symbol}</div>
                    <div style={{ fontSize: 9, color: '#ffb3b3', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, marginTop: 4 }}>{l.changePct.toFixed(2)}%</div>
                  </div>
                ))}
              </>}
            </div>
          </div>
        )}

        {/* TAB 3: AI PATTERNS */}
        {activeTab === 'patterns' && (
          <div style={{ padding: '24px', height: '100%', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}><Brain color={T.cyan} size={16} /> الأنماط الفنية المكتشفة</h2>
            <p style={{ fontSize: 11, color: T.text3, marginBottom: 24 }}>يقرأ الذكاء الشموع ويبحث عن التكوينات الانعكاسية والاستمرارية.</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { pair: 'BTC/USD', conf: 94, pattern: 'علم صاعد (Bull Flag)', color: T.green, type: 'up', desc: 'نموذج استمراري للزخم العالي. يشير لتوطيد قبل اختراق المقاومة المجاورة.' },
                { pair: 'EUR/USD', conf: 88, pattern: 'رأس وكتفين (Head & Shoulders)', color: T.red, type: 'down', desc: 'يتم تشكيل الكتف الأيمن مع ضعف ملحوظ في الزخم الشرائي (Divergence).' },
                { pair: 'AAPL', conf: 82, pattern: 'كوب وعروة (Cup and Handle)', color: T.blue, type: 'up', desc: 'تشكل قوس صاعد واختبار ناجح، يتزامن مع تحسن العوائد.' }
              ].map((p, i) => (
                <div key={i} style={{ background: T.bg2, borderRadius: 8, border: `0.5px solid ${T.border}`, padding: '16px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ width: 80, height: 80, borderRadius: '50%', background: `radial-gradient(circle, ${p.color}15 0%, transparent 70%)`, position: 'absolute', top: -20, right: -20 }} />
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: T.text, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{p.pair}</span>
                    <span style={{ fontSize: 9, color: p.color, background: `${p.color}10`, border: `0.5px solid ${p.color}30`, padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>الثقة: {p.conf}%</span>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 6, background: `${p.color}10`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {p.type === 'up' ? <TrendingUp size={16} color={p.color} /> : <TrendingDown size={16} color={p.color} />}
                    </div>
                    <div style={{ fontSize: 14, color: p.color, fontWeight: 700 }}>{p.pattern}</div>
                  </div>
                  
                  <div style={{ fontSize: 11, color: T.text3, lineHeight: 1.6, background: T.bg, padding: '10px', borderRadius: 6 }}>
                    {p.desc}
                  </div>
                  
                  <button style={{ width: '100%', marginTop: 12, padding: '6px', background: T.card, border: `0.5px solid ${T.border}`, borderRadius: 6, color: T.text, fontWeight: 600, fontSize: 10, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
                    عرض المخطط <Target size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: MULTI TIMEFRAMES */}
        {activeTab === 'timeframes' && (
          <div style={{ padding: '24px', height: '100%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={16} color={T.amber} /> تحليل متعدد الأطر</h2>
                <p style={{ margin: 0, fontSize: 11, color: T.text3 }}>تحليل انسجام الزخم (Confluence) بين الأطر لاتخاذ قرار متوافق.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: T.bg, padding: '4px 10px', borderRadius: 6, border: `0.5px solid ${T.border}` }}>
                <span style={{ fontSize: 10, color: T.text2 }}>الأصل المعروض:</span>
                <span style={{ fontSize: 12, color: T.amber, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>SOL/USD</span>
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { tf: '15 Min', desc: 'زخم لحظي قوي لكسر المقاومة اليومية.', strength: 85, state: 'Strong Bullish', color: T.green },
                { tf: '1 Hour', desc: 'تداول صاعد متزن وتماسك فوق المتوسطات.', strength: 65, state: 'Bullish', color: T.green },
                { tf: '4 Hour', desc: 'مسار عرضي بعد موجة بيع سابقة، يحاول التعافي.', strength: 40, state: 'Neutral / Range', color: T.amber },
                { tf: '1 Day', desc: 'ضعف في الاتجاه العام، لم يتم كسر مسار الهبوط ההيكلي.', strength: 25, state: 'Bearish', color: T.red }
              ].map((tf, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', background: T.bg2, padding: '10px 14px', borderRadius: 8, border: `0.5px solid ${T.border}` }}>
                  <div style={{ width: 60, flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: tf.color, fontFamily: "'JetBrains Mono', monospace" }}>{tf.tf}</div>
                  </div>
                  
                  <div style={{ flex: 1, margin: '0 12px' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                       <span style={{ fontSize: 11, color: T.text, fontWeight: 700 }}>{tf.state}</span>
                       <span style={{ fontSize: 10, color: tf.color, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{tf.strength}% Pow</span>
                     </div>
                     <div style={{ height: 4, background: T.bg, borderRadius: 2, overflow: 'hidden' }}>
                       <div style={{ height: '100%', width: `${tf.strength}%`, background: tf.color, borderRadius: 2, boxShadow: `0 0 6px ${tf.color}40` }} />
                     </div>
                     <div style={{ marginTop: 4, fontSize: 10, color: T.text3, lineHeight: 1.4 }}>{tf.desc}</div>
                  </div>
                </div>
              ))}
              
              {/* Verdict Verdict */}
              <div style={{ marginTop: 8, background: `linear-gradient(135deg, ${T.cyan}10, ${T.card})`, border: `0.5px solid ${T.cyan}30`, borderRadius: 8, padding: '12px', textAlign: 'center' }}>
                 <h3 style={{ margin: '0 0 6px', color: T.cyan, fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                   <Brain size={14} color={T.cyan} /> القرار الاستراتيجي 
                 </h3>
                 <p style={{ margin: 0, color: T.text, fontSize: 11, lineHeight: 1.6, maxWidth: 600, marginInline: 'auto' }}>
                   بناءً على التضارب بين الأطر الصغيرة والكبيرة، يُنصح حالياً بالتداول اللحظي (Scalping) لدعم صفقات سريعة.
                 </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
