'use client'

import { useState, useEffect, useRef } from 'react'
import { Brain, Search, Send, Activity, BarChart2, Cpu, FileText, AlertTriangle, MessageSquare, TrendingUp, TrendingDown, Target, Info, Zap, ChevronDown } from 'lucide-react'

const T = {
  bg:      '#04050C',
  bg2:     '#0D1117',
  card:    '#08090F',
  blue:    '#0A84FF',
  cyan:    '#00C8FF',
  green:   '#00FFC6',
  red:     '#FF4D4D',
  amber:   '#FFB800',
  purple:  '#B388FF',
  text:    '#E6EBF5',
  text2:   '#8090A8',
  text3:   '#A0AFC3',
  border:  'rgba(10,132,255,0.12)',
  border2: 'rgba(10,132,255,0.20)',
}

const AI_MODELS = [
  { name: 'Google Gemini 2.5 Pro', role: 'العقل المدبر', color: T.cyan,   dot: '#00C8FF' },
  { name: 'Groq — Llama 3',        role: 'السرعة الصاروخية', color: T.blue, dot: '#0A84FF' },
  { name: 'GLM-4 (Zhipu)',         role: 'المحلل المالي',   color: T.amber, dot: '#FFB800' },
  { name: 'Amazon Bedrock',        role: 'المستشار الخاص',  color: T.purple,dot: '#A259FF' },
]

const ASSETS = ['EUR/USD', 'XAU/USD', 'BTC/USD', 'GBP/USD', 'USD/JPY', 'SOL/USD', 'زوج آخر ..']

interface Message {
  id: string
  role: 'user' | 'ai'
  content: string
  timestamp: string
}

const DEMO_CHAT: Message[] = [
  { id: '1', role: 'ai', content: 'مرحباً بك في المحلل الذكي! أنا هنا لمساعدتك في تحليل أي أصل مالي، قراءة المؤشرات الفنية، أو تقديم استشارات تداول بناءً على حالة السوق الحية. ماذا نراجع اليوم؟', timestamp: '10:00 ص' }
]

export default function AIPage() {
  const [messages, setMessages] = useState<Message[]>(DEMO_CHAT)
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  
  // Generator State
  const [genAsset, setGenAsset] = useState('EUR/USD')
  const [genType, setGenType] = useState('تحليل شامل')
  const [genTimeframe, setGenTimeframe] = useState('قصير • 1-4 ساعات')
  const [genStyle, setGenStyle] = useState('احترافي')

  // Real-time sentiment
  const [marketAnalysis, setMarketAnalysis] = useState<{ narrative: string, sentiment: string } | null>(null)

  useEffect(() => {
    fetch('/api/ai/narrator')
      .then(res => res.json())
      .then(json => {
        if (json.success) setMarketAnalysis(json.data)
      })
      .catch(() => {})
  }, [])

  // Strategy Testing State
  const [isTesting, setIsTesting] = useState(false)
  const [btStrategy, setBtStrategy] = useState('EMA Cross')
  const [btPair, setBtPair] = useState('EUR/USD')
  const [btEmaFast, setBtEmaFast] = useState(12)
  const [btEmaSlow, setBtEmaSlow] = useState(26)
  const [btRisk, setBtRisk] = useState(2)
  const [btResults, setBtResults] = useState<{
    winRate: string, pnl: string, maxDd: string, sharpe: string, pFactor: string, tradesCount: string
  } | null>(null)

  // AINarrator Readout State
  const [isNarrating, setIsNarrating] = useState(false)
  const [narratorResult, setNarratorResult] = useState('')

  const handleRunBacktest = async () => {
    setIsTesting(true)
    setBtResults(null)
    try {
      const res = await fetch('/api/ai/backtest', {
        method: 'POST', body: JSON.stringify({
          strategyType: btStrategy, pair: btPair, emaFast: btEmaFast, emaSlow: btEmaSlow, risk: btRisk
        })
      })
      const json = await res.json()
      if (json.success) setBtResults(json.data)
    } finally {
      setIsTesting(false)
    }
  }

  const handleRunNarrator = async () => {
    setIsNarrating(true)
    setNarratorResult('')
    try {
      const res = await fetch('/api/ai/narrator')
      const json = await res.json()
      if (json.success && json.data) {
        setNarratorResult(json.data.narrative)
      } else {
        setNarratorResult('تعذر جلب قراءة السوق من قاعدة البيانات.')
      }
    } finally {
      setIsNarrating(false)
    }
  }

  const chatEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const sendMsg = (text: string) => {
    if (!text.trim()) return
    const newMsg: Message = { id: Date.now().toString(), role: 'user', content: text, timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) }
    setMessages(p => [...p, newMsg])
    setInputValue('')
    setIsTyping(true)
    
    // Simulate AI response
    setTimeout(() => {
      let aiResponse = ''
      if (text.toLowerCase().includes('eur/usd') || text.includes('يورو')) {
        aiResponse = 'تحليل EUR/USD: الزوج يختبر حالياً منطقة المقاومة 1.0870. مؤشر القوة النسبية (RSI) عند 62 مما يظهر زخماً إيجابياً، لكن مؤشر MACD يظهر تباعداً بسيطاً. الاستراتيجية المقترحة: الشراء عند اختراق 1.0880 بثبات، أو البيع من المستويات الحالية بوقف خسارة قريب.'
      } else if (text.toLowerCase().includes('gold') || text.includes('ذهب') || text.includes('xau')) {
        aiResponse = 'تحليل الذهب (XAU/USD): يتداول الذهب بضغط بيعي دون 2340$. كسر الدعم 2320$ قد يفتح الطريق لمزيد من التراجع. أنصح بالحذر وعدم اتخاذ مراكز شرائية إلا بعد استقرار الأسعار.'
      } else {
        aiResponse = 'بناءً على المعطيات المتاحة والتحليل الشامل للمؤشرات، أرى أن السوق حاليا يمر بمرحلة تجميع. يرجى الحذر من التقلبات المفاجئة الناتجة عن الأخبار القادمة.'
      }
      
      setMessages(p => [...p, { id: Date.now().toString(), role: 'ai', content: aiResponse, timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) }])
      setIsTyping(false)
    }, 2000)
  }

  const handleSend = () => sendMsg(inputValue)

  const handleGenerate = () => {
    const prompt = `أرجو توليد ${genType} لزوج ${genAsset} على إطار ${genTimeframe} بأسلوب ${genStyle}.`
    sendMsg(prompt)
  }

  const sentimentColor = marketAnalysis?.sentiment === 'bullish' ? T.green 
    : marketAnalysis?.sentiment === 'bearish' ? T.red 
    : marketAnalysis?.sentiment === 'volatile' ? T.amber : T.cyan

  const sentimentAr = marketAnalysis?.sentiment === 'bullish' ? 'صاعد' 
    : marketAnalysis?.sentiment === 'bearish' ? 'هابط' 
    : marketAnalysis?.sentiment === 'volatile' ? 'متقلب' : 'حيادي'

  return (
    <div style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflowY: 'auto', overflowX: 'hidden' }}>
      <div style={{ padding: '24px', direction: 'rtl', fontFamily: "'Cairo', sans-serif", display: 'flex', flexDirection: 'column', boxSizing: 'border-box', minHeight: '100%' }}>
      
      <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(10,132,255,0.3); border-radius: 4px; }
        .gen-select {
          appearance: none;
          background: ${T.bg2};
          border: 1px solid ${T.border};
          color: ${T.text};
          padding: 10px 16px;
          border-radius: 8px;
          font-family: 'Cairo', sans-serif;
          font-size: 13px;
          outline: none;
          width: 100%;
          cursor: pointer;
        }
        .gen-select-wrapper {
          position: relative;
          flex: 1;
        }
        .gen-select-wrapper::after {
          content: '▼';
          font-size: 8px;
          color: ${T.text3};
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          pointer-events: none;
        }
      `}</style>
      
      {/* ── Page Header (Titling & Models) ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexShrink: 0 }}>
        <div style={{ textAlign: 'right' }}>
          <h1 style={{ margin: '0 0 6px 0', fontSize: 26, fontWeight: 900, color: T.text, display: 'flex', alignItems: 'center', gap: 8 }}>
            مركز التحليل الذكي
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: T.text2, wordSpacing: '2px' }}>
            تحليل AI فوري • أدوات متقدمة • رسم بياني تفاعلي • حاسبة الصفقات
          </p>
        </div>

        {/* Distributed Models */}
        <div style={{ display: 'flex', gap: 8 }}>
          {AI_MODELS.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: T.card, border: `0.5px solid ${T.border}`, borderRadius: 20 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: m.dot, boxShadow: `0 0 6px ${m.dot}` }} />
              <span style={{ fontSize: 10, color: T.text }}>{m.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── AI Analysis Generator Card ── */}
      <div style={{ 
        flexShrink: 0, marginBottom: 20,
        background: T.card, borderRadius: 12,
        border: `1px solid ${T.border2}`,
        position: 'relative', overflow: 'hidden',
        padding: '20px 24px'
      }}>
        {/* Top gradient blur line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg, ${T.purple}, ${T.cyan})` }} />

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexDirection: 'row-reverse' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>AI Analysis Generator</span>
              <div style={{ width: 32, height: 32, background: 'rgba(255,100,150,0.1)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Brain size={18} color="#FF7B9C" />
              </div>
            </div>
            <span style={{ fontSize: 11, color: T.text3, marginTop: 4, paddingLeft: 42 }}>مدعوم بـ Claude Anthropic • تحليل احترافي في ثوانٍ</span>
          </div>
        </div>

        {/* Row 1: Asset Selection */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 10, textAlign: 'right' }}>اختر الأصل</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
            {ASSETS.map((asset) => {
              const isActive = genAsset === asset
              return (
                <button
                  key={asset}
                  onClick={() => setGenAsset(asset)}
                  style={{
                    background: isActive ? `${T.cyan}15` : T.bg,
                    border: `1px solid ${isActive ? T.cyan : T.border}`,
                    color: isActive ? T.cyan : T.text2,
                    padding: '8px 16px', borderRadius: 8,
                    cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                    fontWeight: isActive ? 700 : 500,
                    transition: 'all 0.2s'
                  }}
                >
                  {asset}
                </button>
              )
            })}
          </div>
        </div>

        {/* Row 2: Parameters & Action */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', justifyContent: 'space-between' }}>
          
          {/* Selects */}
          <div style={{ display: 'flex', gap: 16, flex: 1, justifyContent: 'flex-start' }}>
            <div className="gen-select-wrapper">
               <div style={{ fontSize: 11, color: T.text3, marginBottom: 8, textAlign: 'right' }}>نوع التحليل</div>
               <select className="gen-select" value={genType} onChange={e => setGenType(e.target.value)}>
                 <option>تحليل شامل</option>
                 <option>تحليل فني فقط (مؤشرات)</option>
                 <option>تحليل أساسي (أخبار)</option>
                 <option>استخراج نقاط الدعم والمقاومة</option>
               </select>
            </div>

            <div className="gen-select-wrapper">
               <div style={{ fontSize: 11, color: T.text3, marginBottom: 8, textAlign: 'right' }}>الإطار الزمني</div>
               <select className="gen-select" value={genTimeframe} onChange={e => setGenTimeframe(e.target.value)}>
                 <option>قصير • 1-4 ساعات</option>
                 <option>متوسط • يومي</option>
                 <option>طويل • أسبوعي</option>
                 <option>للمضاربة • 15 دقيقة</option>
               </select>
            </div>

            <div className="gen-select-wrapper">
               <div style={{ fontSize: 11, color: T.text3, marginBottom: 8, textAlign: 'right' }}>الأسلوب</div>
               <select className="gen-select" value={genStyle} onChange={e => setGenStyle(e.target.value)}>
                 <option>احترافي</option>
                 <option>مختصر</option>
                 <option>مفصل مع الشرح</option>
               </select>
            </div>
          </div>

          {/* Generate Button (will be on the far left in RTL) */}
          <button 
            onClick={handleGenerate}
            disabled={isTyping}
            style={{
              height: 44, width: 140, borderRadius: 10, border: 'none',
              background: `linear-gradient(90deg, #00A3D9, #00E5FF)`,
              color: '#000', fontWeight: 800, fontSize: 15, fontFamily: "'Cairo', sans-serif",
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              cursor: isTyping ? 'not-allowed' : 'pointer', flexShrink: 0,
              opacity: isTyping ? 0.7 : 1, transition: 'transform 0.1s'
            }}
            onMouseDown={e => !isTyping && (e.currentTarget.style.transform = 'scale(0.97)')}
            onMouseUp={e => !isTyping && (e.currentTarget.style.transform = 'scale(1)')}
            onMouseLeave={e => !isTyping && (e.currentTarget.style.transform = 'scale(1)')}
          >
            توليد
            <Zap size={16} fill="#000" />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 450, flexShrink: 0 }}>
        
        {/* ── Right Column: AI Chat Interface ── */}
        <div style={{ 
          flex: '1', display: 'flex', flexDirection: 'column', 
          background: T.card, border: `0.5px solid ${T.border}`, borderRadius: 16, 
          overflow: 'hidden', position: 'relative', minHeight: 450
        }}>
          {/* Chat Header */}
          <div style={{ padding: '16px 20px', borderBottom: `0.5px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: `linear-gradient(90deg, ${T.cyan}08, transparent)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Cpu size={18} color={T.cyan} />
              <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>نتائج التحليل والمحادثة المستمرة</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.text3 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.green }} />
              جاهز لتلقي الطلبات
            </div>
          </div>

          {/* Chat Messages */}
          <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {messages.map((msg) => (
              <div key={msg.id} style={{
                display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                gap: 12, alignItems: 'flex-start',
                alignSelf: msg.role === 'user' ? 'flex-start' : 'flex-end',
                maxWidth: '85%'
              }}>
                {msg.role === 'ai' && (
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `${T.cyan}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${T.cyan}40` }}>
                    <Brain size={16} color={T.cyan} />
                  </div>
                )}
                <div style={{
                  background: msg.role === 'user' ? T.blue : T.card,
                  color: T.text, fontSize: 13, lineHeight: 1.7,
                  padding: '14px 18px', borderRadius: 12,
                  border: msg.role === 'ai' ? `0.5px solid ${T.border}` : 'none',
                  borderTopRightRadius: msg.role === 'user' ? 4 : 12,
                  borderTopLeftRadius: msg.role === 'ai' ? 4 : 12,
                }}>
                  {msg.content}
                  <div style={{ fontSize: 9, color: msg.role === 'user' ? 'rgba(255,255,255,0.5)' : T.text3, marginTop: 6, textAlign: msg.role === 'user' ? 'left' : 'right' }}>
                    {msg.timestamp}
                  </div>
                </div>
              </div>
            ))}
            
            {isTyping && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', maxWidth: '80%', alignSelf: 'flex-end' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: `${T.cyan}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${T.cyan}40` }}>
                  <Brain size={16} color={T.cyan} />
                </div>
                <div style={{ background: T.card, padding: '14px 20px', borderRadius: 12, borderTopLeftRadius: 4, display: 'flex', gap: 4, border: `0.5px solid ${T.border}` }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.text3, animation: 'pulse 1.5s infinite ease-in-out' }} />
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.text3, animation: 'pulse 1.5s infinite ease-in-out 0.2s' }} />
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.text3, animation: 'pulse 1.5s infinite ease-in-out 0.4s' }} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <div style={{ padding: '16px 20px', borderTop: `0.5px solid ${T.border}`, background: T.bg2 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="أرسل استفساراً إضافياً أو اطلب توضيحاً..."
                style={{
                  flex: 1, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10,
                  padding: '12px 16px', color: T.text, fontFamily: "'Cairo', sans-serif", fontSize: 13,
                  outline: 'none', transition: 'border-color 0.2s'
                }}
                onFocus={e => e.target.style.borderColor = T.blue}
                onBlur={e => e.target.style.borderColor = T.border}
              />
              <button
                onClick={handleSend}
                disabled={isTyping}
                style={{
                  width: 46, borderRadius: 10, border: 'none', background: T.blue, color: '#fff',
                  cursor: isTyping ? 'not-allowed' : 'pointer', opacity: isTyping ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s'
                }}
              >
                <Send size={18} style={{ transform: 'rotate(180deg)' }} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Left Column: Active Market Context & Indicators ── */}
        <div style={{ flex: '0 0 320px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* Sentiment Meter */}
          <div style={{ background: T.card, border: `0.5px solid ${T.border}`, borderRadius: 16, padding: '20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Activity size={16} color={sentimentColor} />
                مزاج السوق العام (الآن)
              </div>
            </div>
            
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ 
                fontSize: 28, fontWeight: 900, color: sentimentColor, 
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em',
                textShadow: `0 0 16px ${sentimentColor}40`
              }}>
                {sentimentAr}
              </div>
            </div>

            <div style={{ background: T.bg, padding: '12px', borderRadius: 8, border: `0.5px solid ${T.border}`, fontSize: 11, color: T.text2, lineHeight: 1.6 }}>
              {marketAnalysis ? marketAnalysis.narrative : 'جاري تحليل معنويات السوق الكلية...'}
            </div>
            
            <div style={{ position: 'absolute', top: -30, left: -30, width: 100, height: 100, background: `radial-gradient(circle, ${sentimentColor}15 0%, transparent 70%)`, pointerEvents: 'none' }} />
          </div>

          {/* Quick Technical Scan */}
          <div style={{ flex: 1, background: T.card, border: `0.5px solid ${T.border}`, borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Target size={16} color={T.purple} />
              رصد مؤشرات فنية (مباشر)
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* RSI */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: T.bg, borderRadius: 8, border: `0.5px solid ${T.border}` }}>
                <div>
                  <div style={{ fontSize: 10, color: T.text3, marginBottom: 4 }}>RSI (14) - EUR/USD</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.green }}>62.5</div>
                </div>
                <div style={{ padding: '4px 8px', background: `${T.green}18`, color: T.green, borderRadius: 4, fontSize: 10, fontWeight: 700 }}>إيجابي</div>
              </div>
              
              {/* MACD */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: T.bg, borderRadius: 8, border: `0.5px solid ${T.border}` }}>
                <div>
                  <div style={{ fontSize: 10, color: T.text3, marginBottom: 4 }}>MACD - XAU/USD</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.red }}>-1.24</div>
                </div>
                <div style={{ padding: '4px 8px', background: `${T.red}18`, color: T.red, borderRadius: 4, fontSize: 10, fontWeight: 700 }}>سلبي</div>
              </div>
              
              {/* EMA 20/50 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: T.bg, borderRadius: 8, border: `0.5px solid ${T.border}` }}>
                <div>
                  <div style={{ fontSize: 10, color: T.text3, marginBottom: 4 }}>تقاطع EMA (20/50) - BTC/USD</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.cyan }}>صاعد الدعم: 65k</div>
                </div>
                <div style={{ padding: '4px 8px', background: `${T.cyan}18`, color: T.cyan, borderRadius: 4, fontSize: 10, fontWeight: 700 }}>محايد يميل للشراء</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Component 1: Strategy Testing ── */}
      <div style={{ 
        flexShrink: 0, marginTop: 16,
        background: T.card, borderRadius: 12,
        border: `0.5px solid ${T.border}`,
        padding: '24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          {/* Left Side: Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ 
              background: `${T.green}15`, border: `0.5px solid ${T.green}40`, 
              padding: '6px 12px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.red, boxShadow: `0 0 6px ${T.red}` }} />
              <span style={{ color: T.green, fontSize: 11, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>Deriv حية</span>
            </div>
            <button 
              onClick={handleRunBacktest}
              disabled={isTesting}
              style={{ 
                background: T.cyan, color: '#000', border: 'none', borderRadius: 6, 
                padding: '6px 16px', fontSize: 12, fontWeight: 800, 
                cursor: isTesting ? 'not-allowed' : 'pointer', opacity: isTesting ? 0.7 : 1,
                display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'Cairo', sans-serif" 
            }}>
              {isTesting ? 'جاري...' : 'تشغيل'}
              {!isTesting && <span style={{ fontSize: 10 }}>▶</span>}
            </button>
          </div>

          {/* Right Side: Title */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', color: T.text, fontSize: 16, fontWeight: 800 }}>
              اختبار الاستراتيجيات <span style={{ fontSize: 14 }}>🧪</span>
            </div>
            <div style={{ color: T.text3, fontSize: 11, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>Backtesting</div>
          </div>
        </div>

        {/* 3 Columns Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(200px, 1.5fr) minmax(200px, 1fr)', gap: 30 }}>
          
          {/* Section 1 (Right visually in RTL, left in DOM if dir=rtl) - Results */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 11, color: T.cyan, textAlign: 'right', fontWeight: 700, marginBottom: 8 }}>النتائج</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: '%Win', color: T.green, val: btResults?.winRate },
                { label: 'P&L', color: T.green, val: btResults?.pnl },
                { label: 'Max DD', color: T.red, val: btResults?.maxDd },
                { label: 'Sharpe', color: T.cyan, val: btResults?.sharpe },
                { label: 'P.Factor', color: T.purple, val: btResults?.pFactor },
                { label: 'صفقات', color: T.text, val: btResults?.tradesCount }
              ].map((stat, i) => (
                <div key={i} style={{ background: T.bg, border: `0.5px solid ${T.border}`, borderRadius: 6, padding: '10px 14px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                   <div style={{ fontSize: 10, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>{stat.label}</div>
                   <div style={{ fontSize: 14, fontWeight: 800, color: stat.color, fontFamily: "'JetBrains Mono', monospace" }}>{isTesting ? '...' : stat.val || '-'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2 - Parameters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 20, borderLeft: `0.5px solid ${T.border}` }}>
            <div style={{ fontSize: 11, color: T.cyan, textAlign: 'right', fontWeight: 700, marginBottom: 8 }}>المعاملات</div>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: T.amber, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", width: '40px' }}>{btEmaFast}</span>
              <input type="range" min="5" max="50" value={btEmaFast} onChange={e => setBtEmaFast(parseInt(e.target.value))} style={{ flex: 1, margin: '0 16px', accentColor: T.cyan }} />
              <span style={{ fontSize: 11, color: T.text3, width: '60px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>EMA Fast</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: T.amber, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", width: '40px' }}>{btEmaSlow}</span>
              <input type="range" min="20" max="200" value={btEmaSlow} onChange={e => setBtEmaSlow(parseInt(e.target.value))} style={{ flex: 1, margin: '0 16px', accentColor: T.cyan }} />
              <span style={{ fontSize: 11, color: T.text3, width: '60px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>EMA Slow</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: T.amber, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", width: '40px' }}>{btRisk}%</span>
              <input type="range" min="1" max="10" value={btRisk} onChange={e => setBtRisk(parseInt(e.target.value))} style={{ flex: 1, margin: '0 16px', accentColor: T.cyan }} />
              <span style={{ fontSize: 11, color: T.text3, width: '60px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>مخاطرة%</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: T.amber, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", width: '40px' }}>1:2</span>
              <div style={{ flex: 1, margin: '0 16px', position: 'relative', height: 2, background: T.bg }}>
                 <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '40%', background: T.cyan }} />
                 <div style={{ position: 'absolute', right: '40%', top: -4, width: 10, height: 10, borderRadius: '50%', background: T.cyan, boxShadow: `0 0 6px ${T.cyan}` }} />
              </div>
              <span style={{ fontSize: 11, color: T.text3, width: '60px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>TP:SL</span>
            </div>
          </div>

          {/* Section 3 - Strategy Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingLeft: 20, borderLeft: `0.5px solid ${T.border}` }}>
             <div style={{ fontSize: 11, color: T.cyan, textAlign: 'right', fontWeight: 700, marginBottom: 2 }}>الاستراتيجية</div>
             
             <div className="gen-select-wrapper">
               <div style={{ fontSize: 11, color: T.text3, marginBottom: 8, textAlign: 'right' }}>النوع</div>
               <select className="gen-select" style={{ background: T.bg }} value={btStrategy} onChange={e => setBtStrategy(e.target.value)}>
                 <option>EMA Cross</option>
                 <option>MACD Divergence</option>
                 <option>RSI Oversold</option>
               </select>
             </div>

             <div className="gen-select-wrapper">
               <div style={{ fontSize: 11, color: T.text3, marginBottom: 8, textAlign: 'right' }}>الزوج</div>
               <select className="gen-select" style={{ background: T.bg }} value={btPair} onChange={e => setBtPair(e.target.value)}>
                 <option>EUR/USD</option>
                 <option>XAU/USD</option>
                 <option>BTC/USD</option>
               </select>
             </div>
          </div>
        </div>
      </div>

      {/* ── Component 2: AINarrator Market Readout ── */}
      <div style={{ 
        flexShrink: 0, marginTop: 16,
        background: T.card, borderRadius: 12,
        border: `0.5px solid ${T.border}`,
        padding: '20px 24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <button 
            onClick={handleRunNarrator}
            disabled={isNarrating}
            style={{ 
              background: T.cyan, color: '#000', border: 'none', borderRadius: 6, 
              padding: '6px 20px', fontSize: 12, fontWeight: 800, 
              cursor: isNarrating ? 'not-allowed' : 'pointer', opacity: isNarrating ? 0.7 : 1,
              display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'Cairo', sans-serif" 
          }}>
            {isNarrating ? 'جاري التحليل...' : 'تحليل'} {!isNarrating && <Zap size={14} fill="#000" />}
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.cyan, fontSize: 15, fontWeight: 800 }}>
            سرد السوق — AINarrator <Brain size={18} color="#FF7B9C" />
          </div>
        </div>
        
        <div style={{ 
          background: T.bg, border: `0.5px solid ${T.border}`, borderRadius: 8, 
          padding: '28px', textAlign: 'center', color: isNarrating ? T.text2 : (narratorResult ? T.text : T.text3), 
          fontSize: 13, fontFamily: "'Cairo', sans-serif", lineHeight: 1.8
        }}>
          {isNarrating ? 'حسناً، جاري قراءة سجلات الأخبار وفحص المؤشرات من قاعدة البيانات...' : (narratorResult || 'اضغط "تحليل" لقراءة حالة السوق الحالية وتلخيص الأخبار المؤثرة...')}
        </div>
      </div>
      </div>
    </div>
  )
}
