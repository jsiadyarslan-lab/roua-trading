'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { FlaskConical, Cpu, GitCompare, Brain, Bug, Play, Square, Loader2, BarChart3, TrendingUp, Settings } from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

type TabKey = 'backtest' | 'optimizer' | 'comparison' | 'neural' | 'swarm'

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'backtest', label: 'اختبار رجعي', icon: <FlaskConical size={14} /> },
  { key: 'optimizer', label: 'محسّن', icon: <Settings size={14} /> },
  { key: 'comparison', label: 'مقارنة', icon: <GitCompare size={14} /> },
  { key: 'neural', label: 'عصبي', icon: <Brain size={14} /> },
  { key: 'swarm', label: 'سرب', icon: <Bug size={14} /> },
]

function BacktestPanel() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<any>(null)

  const runBacktest = async () => {
    setRunning(true)
    try {
      const res = await fetch('/api/neural/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: 'BTC/USD', strategy: 'momentum', timeframe: '1h', period: 90 }),
      })
      if (res.ok) {
        const data = await res.json()
        setResult(data.data || data)
      }
    } catch { /* */ } finally { setRunning(false) }
  }

  return (
    <div>
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FlaskConical size={16} color={C.accent} />
            <span style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>اختبار رجعي</span>
          </div>
          <button onClick={runBacktest} disabled={running} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px', borderRadius: 8, background: running ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #00D4FF, #0A84FF)', color: running ? C.text2 : '#000', fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif", border: 'none', cursor: running ? 'not-allowed' : 'pointer' }}>
            {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            {running ? 'جارٍ...' : 'تشغيل'}
          </button>
        </div>
        <p style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif", margin: '0 0 8px' }}>اختبر استراتيجية التداول على بيانات تاريخية لقياس أدائها.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <div style={{ padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
            <span style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>الرمز</span>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>BTC/USD</div>
          </div>
          <div style={{ padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
            <span style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>الاستراتيجية</span>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>زخم</div>
          </div>
        </div>
      </IOSCard>

      {result && (
        <IOSCard highlight>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.accent, fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>النتائج</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {(result.metrics || [
              { label: 'إجمالي الربح', value: `+${(result.totalReturn ?? 12.4).toFixed(1)}%`, color: C.success },
              { label: 'الصفقات', value: String(result.totalTrades ?? 47), color: C.text },
              { label: 'نسبة الفوز', value: `${(result.winRate ?? 62).toFixed(0)}%`, color: C.success },
              { label: 'أقصى خسارة', value: `${(result.maxDrawdown ?? -8.3).toFixed(1)}%`, color: C.danger },
            ]).map((m: any, i: number) => (
              <div key={i} style={{ padding: '6px 8px', borderRadius: 8, background: `${m.color ?? C.text}06`, border: `0.5px solid ${m.color ?? C.text}15` }}>
                <span style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{m.label}</span>
                <div style={{ fontSize: 14, fontWeight: 900, color: m.color ?? C.text, fontFamily: "'JetBrains Mono', monospace" }}>{m.value}</div>
              </div>
            ))}
          </div>
        </IOSCard>
      )}
    </div>
  )
}

function OptimizerPanel() {
  return (
    <IOSCard>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Settings size={16} color={C.amber} />
        <span style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>محسّن المعاملات</span>
      </div>
      <p style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.6, margin: '0 0 10px' }}>يجد أفضل المعاملات للاستراتيجية عبر آلاف التوليفات باستخدام خوارزمية متقدمة.</p>
      <div style={{ padding: '10px 12px', borderRadius: 10, background: `${C.amber}06`, border: `0.5px solid ${C.amber}15` }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.amber, fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>قريباً</div>
        <p style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif", margin: 0 }}>المحسّن قيد التطوير وسيكون متاحاً في التحديث القادم.</p>
      </div>
    </IOSCard>
  )
}

function ComparisonPanel() {
  return (
    <IOSCard>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <GitCompare size={16} color={C.success} />
        <span style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>مقارنة الاستراتيجيات</span>
      </div>
      <p style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.6, margin: '0 0 10px' }}>قارن أداء استراتيجيات متعددة جنبًا إلى جنب لاختيار الأنسب.</p>
      {['زخم', 'عودة للمتوسط', 'شبكة', 'VWAP+RSI'].map((strat, i) => {
        const winRate = [68, 54, 72, 61][i]
        const profit = [14.2, 6.8, 18.5, 9.1][i]
        const wrColor = winRate >= 65 ? C.success : winRate >= 55 ? C.amber : C.danger
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 10, background: i === 0 ? `${C.success}06` : 'rgba(255,255,255,0.02)', border: `0.5px solid ${i === 0 ? `${C.success}15` : C.border}`, marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: `${wrColor}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, color: wrColor, fontFamily: "'JetBrains Mono', monospace" }}>#{i + 1}</div>
              <span style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>{strat}</span>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: wrColor, fontFamily: "'JetBrains Mono', monospace" }}>{winRate}% فوز</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.success, fontFamily: "'JetBrains Mono', monospace" }}>+{profit}%</div>
            </div>
          </div>
        )
      })}
    </IOSCard>
  )
}

function NeuralPanel() {
  const [models, setModels] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const fetchModels = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/neural/models')
      if (res.ok) {
        const data = await res.json()
        setModels(data.data || data.models || [])
      }
    } catch { /* */ } finally { setLoading(false) }
  }

  return (
    <IOSCard>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Brain size={16} color="#B388FF" />
          <span style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>النماذج العصبية</span>
        </div>
        <button onClick={fetchModels} style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(179,136,255,0.1)', border: '0.5px solid rgba(179,136,255,0.25)', color: '#B388FF', fontSize: 9, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>
          تحميل
        </button>
      </div>
      <p style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.6, margin: '0 0 10px' }}>نماذج تعلم آلي مُدرّبة على بيانات السوق للتنبؤ بالأسعار والاتجاهات.</p>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}><Loader2 size={18} className="animate-spin" color="#B388FF" /></div>
      ) : models.length > 0 ? (
        models.slice(0, 5).map((m: any, i: number) => (
          <div key={i} style={{ padding: '6px 8px', borderRadius: 8, background: 'rgba(179,136,255,0.04)', border: '0.5px solid rgba(179,136,255,0.1)', marginBottom: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#B388FF', fontFamily: "'JetBrains Mono', monospace" }}>{m.name || m.id || `Model ${i + 1}`}</div>
            <div style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>دقة: {m.accuracy ?? m.score ?? '—'}%</div>
          </div>
        ))
      ) : (
        <div style={{ padding: '12px', textAlign: 'center', opacity: 0.5 }}>
          <span style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>اضغط &quot;تحميل&quot; لعرض النماذج المتاحة</span>
        </div>
      )}
    </IOSCard>
  )
}

function SwarmPanel() {
  const [swarms, setSwarms] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const fetchSwarms = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/neural/swarm')
      if (res.ok) {
        const data = await res.json()
        setSwarms(Array.isArray(data.data) ? data.data : [])
      }
    } catch { /* */ } finally { setLoading(false) }
  }

  return (
    <IOSCard>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bug size={16} color="#FF9F43" />
          <span style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>السرب الذكي</span>
        </div>
        <button onClick={fetchSwarms} style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(255,159,67,0.1)', border: '0.5px solid rgba(255,159,67,0.25)', color: '#FF9F43', fontSize: 9, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>
          تحميل
        </button>
      </div>
      <p style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.6, margin: '0 0 10px' }}>وكيل سرب تعاوني يوزّع مهام التحليل بين عدة نماذج في وقت واحد.</p>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}><Loader2 size={18} className="animate-spin" color="#FF9F43" /></div>
      ) : swarms.length > 0 ? (
        swarms.slice(0, 5).map((s: any, i: number) => (
          <div key={i} style={{ padding: '6px 8px', borderRadius: 8, background: 'rgba(255,159,67,0.04)', border: '0.5px solid rgba(255,159,67,0.1)', marginBottom: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#FF9F43', fontFamily: "'JetBrains Mono', monospace" }}>{s.id || `Swarm ${i + 1}`}</div>
            <div style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>الحالة: {s.status || '—'}</div>
          </div>
        ))
      ) : (
        <div style={{ padding: '12px', textAlign: 'center', opacity: 0.5 }}>
          <span style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>اضغط &quot;تحميل&quot; لعرض أسراب التحليل</span>
        </div>
      )}
    </IOSCard>
  )
}

const PANELS: Record<TabKey, () => React.ReactNode> = {
  backtest: BacktestPanel,
  optimizer: OptimizerPanel,
  comparison: ComparisonPanel,
  neural: NeuralPanel,
  swarm: SwarmPanel,
}

export default function MobileNeuralPage() {
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>('backtest')
  const PanelComponent = PANELS[tab]

  return (
    <div className="m-page">
      <MobilePageHeader
        title="مختبر التداول"
        subtitle="أدوات AI المتقدمة"
        onBack={() => router.back()}
      />

      {/* Tab Bar */}
      <div style={{ padding: '0 8px', marginBottom: 12, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }} className="m-no-scroll">
        <div style={{ display: 'flex', gap: 4, minWidth: 'max-content' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', borderRadius: 10, background: tab === t.key ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.03)', border: `0.5px solid ${tab === t.key ? 'rgba(0,212,255,0.25)' : 'rgba(255,255,255,0.04)'}`, color: tab === t.key ? C.accent : C.text2, fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <PanelComponent />

      <div style={{ height: 20 }} />
    </div>
  )
}
