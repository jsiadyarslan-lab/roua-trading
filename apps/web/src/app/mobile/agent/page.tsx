'use client'

import { useEffect, useState } from 'react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import IOSSwitch from '@/components/mobile/IOSSwitch'
import { useAgentStore, AgentStatus, StrategyType } from '@/hooks/useAgentStore'
import {
  Cpu, Activity, Shield, TrendingUp, TrendingDown, Brain,
  Zap, Clock, BarChart3, Target, AlertTriangle, ChevronLeft,
  CheckCircle2, XCircle, Loader2
} from 'lucide-react'

const STRATEGY_LABELS: Record<string, string> = {
  AUTO: 'تلقائي', SCALPING: 'سكالبينغ', SWING: 'سوينغ', GRID: 'شبكة',
  MEAN_REVERSION: 'عودة للمتوسط', MOMENTUM_BREAKOUT: 'اختراق الزخم', DCA: 'متوسط التكلفة', VWAP_RSI: 'VWAP+RSI',
}

const MOCK_DECISIONS = [
  { id: 1, symbol: 'BTC/USDT', action: 'BUY' as const, confidence: 87, reason: 'اختراق مقاومة مع ارتفاع حجم التداول', time: 'منذ 3 دقائق', pnl: null },
  { id: 2, symbol: 'ETH/USDT', action: 'SELL' as const, confidence: 72, reason: 'إشارة تشبع من مؤشر RSI على إطار 4 ساعات', time: 'منذ 12 دقيقة', pnl: '+2.3%' },
  { id: 3, symbol: 'SOL/USDT', action: 'BUY' as const, confidence: 64, reason: 'ارتداد من مستوى فيبوناتشي 0.618', time: 'منذ 28 دقيقة', pnl: '+0.8%' },
  { id: 4, symbol: 'XRP/USDT', action: 'HOLD' as const, confidence: 55, reason: 'منطقة تذبذب ضيقة في انتظار اتجاه أوضح', time: 'منذ 45 دقيقة', pnl: '-0.3%' },
  { id: 5, symbol: 'BNB/USDT', action: 'SELL' as const, confidence: 79, reason: 'نمط قمة مزدوجة على إطار يومي', time: 'منذ ساعة', pnl: '+1.5%' },
]

const C = { accent: '#00D4FF', text2: '#8B92A8', text: '#F0F2F5', border: 'rgba(255,255,255,0.06)', green: '#00FFA3', red: '#FF4757', gold: '#d4af37' }

export default function MobileAgentPage() {
  const { agentState, loading, fetchStatus, startAgent, stopAgent, startAutoRefresh, stopAutoRefresh } = useAgentStore()
  const [activeTab, setActiveTab] = useState<'decisions' | 'performance' | 'models'>('decisions')

  useEffect(() => { fetchStatus(); startAutoRefresh(); return () => stopAutoRefresh() }, [fetchStatus, startAutoRefresh, stopAutoRefresh])

  const status = agentState?.status ?? null
  const isRunning = status === AgentStatus.RUNNING
  const strategy = agentState?.config?.strategy ?? StrategyType.AUTO
  const dailyPnL = Number(agentState?.dailyPnL ?? 0)
  const dailyTrades = Number(agentState?.dailyTradesCount ?? 0)
  const consecutiveLosses = Number(agentState?.consecutiveLosses ?? 0)
  const winRate = dailyTrades > 0 ? ((dailyTrades - consecutiveLosses) / dailyTrades * 100) : 0
  const totalCycles = agentState?.totalCycles ?? 0

  const statusColor = isRunning ? C.green : status === AgentStatus.EMERGENCY_STOP ? C.red : C.text2
  const statusLabel = isRunning ? 'نشط' : status === AgentStatus.EMERGENCY_STOP ? 'إيقاف طارئ' : 'متوقف'

  const handleToggle = async () => {
    if (isRunning) await stopAgent(false)
    else await startAgent(strategy)
  }

  return (
    <div className="m-page">
      <MobilePageHeader title="وكيل التداول" subtitle="تداول ذاتي بالذكاء الاصطناعي" />

      {/* Status & Toggle Card */}
      <IOSCard highlight={isRunning}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: isRunning ? 'linear-gradient(135deg, #059669, #00D4FF)' : 'rgba(139,146,168,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isRunning ? '0 0 20px rgba(5,150,105,0.3)' : 'none',
            }}>
              <Cpu size={24} color={isRunning ? '#FFF' : '#8B92A8'} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>وكيل التداول</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: 4,
                  background: statusColor,
                  boxShadow: `0 0 8px ${statusColor}60`,
                }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: statusColor, fontFamily: "'Cairo', sans-serif" }}>{statusLabel}</span>
                {isRunning && (
                  <span style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>
                    · الدورة {totalCycles}
                  </span>
                )}
              </div>
            </div>
          </div>
          <IOSSwitch value={isRunning} onChange={handleToggle} color="#059669" />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            flex: 1, padding: '6px 10px', borderRadius: 8,
            background: 'rgba(0,212,255,0.06)', border: '0.5px solid rgba(0,212,255,0.12)',
          }}>
            <div style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>الاستراتيجية</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.accent, fontFamily: "'Cairo', sans-serif" }}>
              {STRATEGY_LABELS[strategy] || strategy}
            </div>
          </div>
          <div style={{
            flex: 1, padding: '6px 10px', borderRadius: 8,
            background: dailyPnL >= 0 ? 'rgba(0,255,163,0.06)' : 'rgba(255,71,87,0.06)',
            border: `0.5px solid ${dailyPnL >= 0 ? 'rgba(0,255,163,0.12)' : 'rgba(255,71,87,0.12)'}`,
          }}>
            <div style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>ربح اليوم</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: dailyPnL >= 0 ? C.green : C.red, fontFamily: "'JetBrains Mono', monospace" }}>
              {dailyPnL >= 0 ? '+' : ''}{dailyPnL.toFixed(2)}
            </div>
          </div>
          <div style={{
            flex: 1, padding: '6px 10px', borderRadius: 8,
            background: 'rgba(179,136,255,0.06)', border: '0.5px solid rgba(179,136,255,0.12)',
          }}>
            <div style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>الصفقات</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#B388FF', fontFamily: "'JetBrains Mono', monospace" }}>
              {dailyTrades}
            </div>
          </div>
        </div>
      </IOSCard>

      {/* Performance Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: '0 16px', marginBottom: 12 }}>
        <IOSCard noMargin>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4 }}>
            <Target size={14} color={winRate >= 50 ? C.green : C.red} />
            <div>
              <div style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>نسبة الربح</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: winRate >= 50 ? C.green : C.red, fontFamily: "'JetBrains Mono', monospace" }}>
                {winRate.toFixed(0)}%
              </div>
            </div>
          </div>
        </IOSCard>
        <IOSCard noMargin>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4 }}>
            <BarChart3 size={14} color={C.accent} />
            <div>
              <div style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>إجمالي الدورات</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>
                {totalCycles}
              </div>
            </div>
          </div>
        </IOSCard>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 16px', marginBottom: 12 }}>
        {(['decisions', 'performance', 'models'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: activeTab === tab ? 'rgba(0,212,255,0.1)' : 'transparent',
              border: activeTab === tab ? '1px solid rgba(0,212,255,0.2)' : '1px solid transparent',
              color: activeTab === tab ? C.accent : C.text2,
              fontSize: 11, fontWeight: 700, fontFamily: "'Cairo', sans-serif",
              transition: 'all 0.2s',
            }}
          >
            {tab === 'decisions' ? 'القرارات' : tab === 'performance' ? 'الأداء' : 'النماذج'}
          </button>
        ))}
      </div>

      {/* Tab: AI Decisions */}
      {activeTab === 'decisions' && (
        <>
          <IOSCard>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Brain size={16} color={C.accent} />
              <span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>قرارات الوكيل</span>
            </div>
            {MOCK_DECISIONS.map((d, i) => (
              <div key={d.id} style={{
                padding: '10px 0',
                borderBottom: i < MOCK_DECISIONS.length - 1 ? '0.5px solid rgba(255,255,255,0.06)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: d.action === 'BUY' ? 'rgba(0,255,163,0.1)' : d.action === 'SELL' ? 'rgba(255,71,87,0.1)' : 'rgba(139,146,168,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {d.action === 'BUY' ? <TrendingUp size={14} color={C.green} /> :
                       d.action === 'SELL' ? <TrendingDown size={14} color={C.red} /> :
                       <Activity size={14} color={C.text2} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }} dir="ltr">{d.symbol}</div>
                      <div style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{d.time}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'start' }}>
                    <div style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                      background: d.action === 'BUY' ? 'rgba(0,255,163,0.1)' : d.action === 'SELL' ? 'rgba(255,71,87,0.1)' : 'rgba(139,146,168,0.1)',
                      fontSize: 10, fontWeight: 800,
                      color: d.action === 'BUY' ? C.green : d.action === 'SELL' ? C.red : C.text2,
                      fontFamily: "'Cairo', sans-serif",
                    }}>
                      {d.action === 'BUY' ? 'شراء' : d.action === 'SELL' ? 'بيع' : 'انتظار'}
                    </div>
                    {d.pnl && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: d.pnl.startsWith('+') ? C.green : C.red, fontFamily: "'JetBrains Mono', monospace", marginTop: 2, direction: 'ltr' }}>
                        {d.pnl}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.6, paddingInlineStart: 36 }}>
                  {d.reason}
                </div>
                {/* Confidence bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, paddingInlineStart: 36 }}>
                  <span style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>الثقة</span>
                  <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      width: `${d.confidence}%`,
                      background: d.confidence >= 75 ? C.green : d.confidence >= 60 ? C.gold : C.red,
                      transition: 'width 0.5s',
                    }} />
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 800,
                    color: d.confidence >= 75 ? C.green : d.confidence >= 60 ? C.gold : C.red,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {d.confidence}%
                  </span>
                </div>
              </div>
            ))}
          </IOSCard>
        </>
      )}

      {/* Tab: Performance */}
      {activeTab === 'performance' && (
        <>
          <IOSCard>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <BarChart3 size={16} color={C.accent} />
              <span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>إحصائيات الأداء</span>
            </div>
            {/* Weekly P&L */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>أداء الأسبوع</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
                {[35, 55, 20, 70, 45, 60, 30].map((h, i) => {
                  const days = ['سبت', 'أحد', 'اثن', 'ثلا', 'أرب', 'خمي', 'جمع']
                  const isProfit = h > 40
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{
                        width: '100%', borderRadius: 4, height: h,
                        background: isProfit ? 'rgba(0,255,163,0.2)' : 'rgba(255,71,87,0.2)',
                        border: `0.5px solid ${isProfit ? 'rgba(0,255,163,0.3)' : 'rgba(255,71,87,0.3)'}`,
                      }} />
                      <span style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{days[i]}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'أفضل صفقة', value: '+8.4%', color: C.green, icon: TrendingUp },
                { label: 'أسوأ صفقة', value: '-3.2%', color: C.red, icon: TrendingDown },
                { label: 'متوسط الربح', value: '+2.1%', color: C.accent, icon: Activity },
                { label: 'نسبة شارب', value: '1.84', color: C.gold, icon: BarChart3 },
              ].map((s, i) => (
                <div key={i} style={{
                  padding: 10, borderRadius: 10, background: 'rgba(255,255,255,0.02)',
                  border: '0.5px solid rgba(255,255,255,0.06)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <s.icon size={12} color={s.color} />
                    <span style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{s.label}</span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</div>
                </div>
              ))}
            </div>
          </IOSCard>

          {/* Risk Metrics */}
          <IOSCard>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Shield size={16} color={C.gold} />
              <span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>مقاييس المخاطر</span>
            </div>
            {[
              { label: 'أقصى تراجع', value: '12.3%', color: C.red, pct: 12 },
              { label: 'القيمة المعرضة للخطر (VaR)', value: '5.1%', color: C.gold, pct: 25 },
              { label: 'عامل الربح', value: '2.34', color: C.green, pct: 70 },
              { label: 'نسبة المكاسب', value: '68%', color: C.accent, pct: 68 },
            ].map((m, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: i < 3 ? '0.5px solid rgba(255,255,255,0.06)' : 'none',
              }}>
                <span style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{m.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 40, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                    <div style={{ height: '100%', borderRadius: 2, width: `${m.pct}%`, background: m.color }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: m.color, fontFamily: "'JetBrains Mono', monospace" }}>{m.value}</span>
                </div>
              </div>
            ))}
          </IOSCard>
        </>
      )}

      {/* Tab: AI Models */}
      {activeTab === 'models' && (
        <>
          <IOSCard>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Brain size={16} color="#B388FF" />
              <span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>نماذج الذكاء الاصطناعي</span>
            </div>
            {[
              { name: 'محلل الاتجاه', accuracy: 82, status: 'active', desc: 'تحليل الاتجاه العام باستخدام شبكات LSTM', votes: 3 },
              { name: 'كاشف الأنماط', accuracy: 76, status: 'active', desc: 'التعرف على أنماط الشارت الكلاسيكية', votes: 2 },
              { name: 'محلل المشاعر', accuracy: 71, status: 'active', desc: 'تحليل مشاعر السوق من الأخبار والسوشيال', votes: 1 },
              { name: 'نموذج التقلب', accuracy: 68, status: 'standby', desc: 'توقع تقلبات السوق على المدى القصير', votes: 0 },
              { name: 'محلل الارتباط', accuracy: 73, status: 'active', desc: 'تحليل ارتباط الأزواج والتنويع', votes: 2 },
            ].map((model, i) => (
              <div key={i} style={{
                padding: '10px 0',
                borderBottom: i < 4 ? '0.5px solid rgba(255,255,255,0.06)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: model.status === 'active' ? 'rgba(179,136,255,0.1)' : 'rgba(139,146,168,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Brain size={14} color={model.status === 'active' ? '#B388FF' : C.text2} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>{model.name}</div>
                      <div style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{model.desc}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'start' }}>
                    <div style={{
                      display: 'inline-block', padding: '2px 6px', borderRadius: 4,
                      background: model.status === 'active' ? 'rgba(0,255,163,0.1)' : 'rgba(139,146,168,0.08)',
                      fontSize: 9, fontWeight: 700,
                      color: model.status === 'active' ? C.green : C.text2,
                      fontFamily: "'Cairo', sans-serif",
                    }}>
                      {model.status === 'active' ? 'نشط' : 'استعداد'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, paddingInlineStart: 36 }}>
                  <span style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>الدقة</span>
                  <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                    <div style={{
                      height: '100%', borderRadius: 2, width: `${model.accuracy}%`,
                      background: model.accuracy >= 75 ? '#B388FF' : model.accuracy >= 65 ? C.gold : C.red,
                    }} />
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#B388FF', fontFamily: "'JetBrains Mono', monospace" }}>{model.accuracy}%</span>
                  {model.votes > 0 && (
                    <span style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>· {model.votes} أصوات</span>
                  )}
                </div>
              </div>
            ))}
          </IOSCard>

          {/* AI Council */}
          <IOSCard>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Zap size={16} color={C.accent} />
              <span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>مجلس الذكاء الاصطناعي</span>
            </div>
            <div style={{
              padding: 12, borderRadius: 10, marginBottom: 10,
              background: 'rgba(0,212,255,0.04)', border: '0.5px solid rgba(0,212,255,0.1)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>الإجماع الحالي</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={14} color={C.green} />
                <span style={{ fontSize: 13, fontWeight: 900, color: C.green, fontFamily: "'Cairo', sans-serif" }}>صاعد</span>
                <span style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>ثقة 74%</span>
              </div>
              <div style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif", marginTop: 6, lineHeight: 1.6 }}>
                3 من 5 نماذج تصوت لصالح الاتجاه الصاعد مع إشارات إيجابية من محلل الاتجاه وكاشف الأنماط ومحلل المشاعر
              </div>
            </div>
            <div style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.8 }}>
              مجلس الذكاء الاصطناعي يجمع توقعات جميع النماذج ويصدر قراراً موحداً بالأغلبية. كل نموذج يصوت بناءً على تحليله المستقل ويحسب الوزن حسب دقته التاريخية.
            </div>
          </IOSCard>
        </>
      )}

      {/* Quick Link to Bot Controls */}
      <IOSCard>
        <a href="/mobile/bot" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(5,150,105,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Zap size={18} color="#059669" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>المنفذ الذكي</div>
              <div style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>تحكم في تنفيذ الصفقات والإعدادات</div>
            </div>
          </div>
          <ChevronLeft size={16} color={C.text2} />
        </a>
      </IOSCard>

      <div style={{ height: 16 }} />
    </div>
  )
}
