'use client'

import { useState } from 'react'
import { Play, Plus, Settings2, Shield, Activity, GitBranch, Save, Trash2, X as XIcon, ArrowDown } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

const T = {
  bg: '#04050C', bg2: '#0D1117', card: '#08090F', cardHover: '#0B0F19',
  surface: '#1A1D29', cyan: '#00D4FF', green: '#00FFA3', greenDim: '#00CC82',
  red: '#FF4757', redDim: '#FF3344', amber: '#FFB800', purple: '#B388FF',
  blue: '#0A84FF',
  text: '#F0F2F5', text2: '#94a3b8', text3: '#8B92A8',
  border: 'rgba(255,255,255,0.06)', border2: 'rgba(0,212,255,0.16)',
}

interface StrategyNode {
  id: string
  type: 'condition' | 'action' | 'risk' | 'indicator'
  label: string
  sublabel: string
  color: string
  icon: string
}

const AVAILABLE_COMPONENTS: { category: string; items: Omit<StrategyNode, 'id'>[] }[] = [
  {
    category: 'مؤشرات (Indicators)',
    items: [
      { type: 'indicator', label: 'RSI', sublabel: 'مؤشر القوة النسبية', color: T.cyan, icon: '📊' },
      { type: 'indicator', label: 'MACD', sublabel: 'تقارب/تباعد المتوسطات', color: T.cyan, icon: '📈' },
      { type: 'indicator', label: 'Bollinger Bands', sublabel: 'نطاقات بولينجر', color: T.cyan, icon: '📏' },
      { type: 'indicator', label: 'EMA', sublabel: 'المتوسط الأسي', color: T.cyan, icon: '📉' },
    ],
  },
  {
    category: 'شروط (Conditions)',
    items: [
      { type: 'condition', label: 'تقاطع مؤشرات', sublabel: 'Crossover', color: T.blue, icon: '🔀' },
      { type: 'condition', label: 'مستوى سعري', sublabel: 'Price Level', color: T.blue, icon: '🎯' },
      { type: 'condition', label: 'حجم تداول', sublabel: 'Volume Spike', color: T.blue, icon: '📦' },
      { type: 'condition', label: 'زمني', sublabel: 'Time-based', color: T.blue, icon: '⏰' },
    ],
  },
  {
    category: 'إجراءات (Actions)',
    items: [
      { type: 'action', label: 'شراء (Buy Market)', sublabel: 'أمر سوق شراء', color: T.green, icon: '🟢' },
      { type: 'action', label: 'بيع (Sell Market)', sublabel: 'أمر سوق بيع', color: T.amber, icon: '🟡' },
      { type: 'action', label: 'شراء محدد', sublabel: 'Limit Buy', color: T.green, icon: '📋' },
      { type: 'action', label: 'بيع محدد', sublabel: 'Limit Sell', color: T.amber, icon: '📋' },
    ],
  },
  {
    category: 'إدارة مخاطر (Risk)',
    items: [
      { type: 'risk', label: 'إيقاف خسارة', sublabel: 'Stop Loss', color: T.purple, icon: '🛑' },
      { type: 'risk', label: 'جني أرباح', sublabel: 'Take Profit', color: T.purple, icon: '💰' },
      { type: 'risk', label: 'حجم المركز', sublabel: 'Position Size %', color: T.purple, icon: '📐' },
      { type: 'risk', label: 'الحد الأقصى للسحب', sublabel: 'Max Drawdown', color: T.purple, icon: '🧮' },
    ],
  },
]

export default function StrategyBuilderPage() {
  const [nodes, setNodes] = useState<StrategyNode[]>([])
  const [strategyName, setStrategyName] = useState('استراتيجية جديدة')
  const [showPanel, setShowPanel] = useState(true)

  const addNode = (item: Omit<StrategyNode, 'id'>) => {
    const newNode: StrategyNode = {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    }
    setNodes(prev => [...prev, newNode])
    toast({ title: `تمت إضافة: ${item.label}`, description: item.sublabel })
  }

  const removeNode = (id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id))
  }

  const moveNode = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= nodes.length) return
    const newNodes = [...nodes]
    const temp = newNodes[index]
    newNodes[index] = newNodes[newIndex]
    newNodes[newIndex] = temp
    setNodes(newNodes)
  }

  const handleSaveDraft = () => {
    if (nodes.length === 0) {
      toast({ title: 'لا يمكن الحفظ', description: 'أضف مكونات واحدة على الأقل للاستراتيجية', variant: 'destructive' })
      return
    }
    toast({ title: 'تم حفظ المسودة ✅', description: `تم حفظ "${strategyName}" مع ${nodes.length} مكون` })
  }

  const handleBacktest = () => {
    if (nodes.length === 0) {
      toast({ title: 'لا يمكن الاختبار', description: 'أضف مكونات واحدة على الأقل للاستراتيجية', variant: 'destructive' })
      return
    }
    toast({ title: 'جارٍ تشغيل Backtest...', description: 'سيتم إشعارك عند انتهاء الاختبار' })
  }

  const handleClearAll = () => {
    setNodes([])
    toast({ title: 'تم مسح الاستراتيجية' })
  }

  return (
    <div className="custom-scrollbar" style={{ padding: '32px 24px', direction: 'rtl', fontFamily: "'Cairo', sans-serif", height: '100%', overflowY: 'auto' }}>
      <style>{`
        @media (max-width: 767px) {
          .strategy-builder-main { height: 100% !important; }
        }
      `}</style>
      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <GitBranch size={20} color={T.cyan} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text }}>محرر الاستراتيجيات البصري</h1>
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 20,
              background: `${T.cyan}18`, color: T.cyan,
              fontFamily: "'JetBrains Mono', monospace",
            }}>NO-CODE BUILDER</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: T.text2 }}>
            صمم خوارزميات التداول الخاصة بك باستخدام واجهة النقر — اختر المكونات واربطها بتسلسل منطقي.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={handleSaveDraft}
            style={{ background: T.surface, color: T.text, padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${T.border}`, cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = T.cyan; e.currentTarget.style.color = T.cyan }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.text }}
          >
            <Save size={16} /> حفظ المسودة
          </button>
          <button
            onClick={handleBacktest}
            style={{ background: `linear-gradient(135deg, ${T.cyan}, ${T.blue})`, color: '#fff', padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            <Play size={16} /> اختبار (Backtest)
          </button>
        </div>
      </div>

      <div className="strategy-builder-main" style={{ display: 'flex', gap: 20, height: 'calc(100vh - 180px)' }}>
        {/* Strategy Flow (Left/Main Area) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Strategy Name Input */}
          <div style={{
            background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '14px 20px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <GitBranch size={16} color={T.cyan} />
            <input
              type="text"
              value={strategyName}
              onChange={e => setStrategyName(e.target.value)}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: T.text, fontSize: 15, fontWeight: 700, fontFamily: "'Cairo', sans-serif",
                direction: 'rtl',
              }}
              placeholder="اسم الاستراتيجية..."
            />
            <span style={{ fontSize: 11, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
              {nodes.length} مكون
            </span>
            {nodes.length > 0 && (
              <button
                onClick={handleClearAll}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: T.red, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}
              >
                <Trash2 size={12} /> مسح الكل
              </button>
            )}
          </div>

          {/* Flow Canvas */}
          <div style={{
            flex: 1, background: '#02040a', border: `1px solid ${T.border}`, borderRadius: 16,
            position: 'relative', overflow: 'auto', padding: 24,
          }}>
            {/* Grid Background */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundImage: `radial-gradient(${T.border} 1px, transparent 1px)`,
              backgroundSize: '24px 24px', opacity: 0.5, pointerEvents: 'none',
            }} />

            {nodes.length === 0 ? (
              /* Empty State */
              <div style={{ position: 'relative', textAlign: 'center', padding: '60px 20px' }}>
                <Settings2 size={48} color={T.border} style={{ marginBottom: 16, marginInline: 'auto' }} />
                <div style={{ color: T.text2, fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
                  اضغط على المكونات من القائمة الجانبية لبناء استراتيجيتك
                </div>
                <div style={{ color: T.text3, fontSize: 12 }}>
                  سيتم ربط المكونات تلقائياً بتسلسل منطقي
                </div>
              </div>
            ) : (
              /* Flow Nodes */
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, maxWidth: 500, margin: '0 auto' }}>
                {/* Start Node */}
                <div style={{
                  padding: '8px 24px', borderRadius: 20,
                  background: `${T.cyan}15`, border: `1px solid ${T.cyan}40`,
                  color: T.cyan, fontSize: 12, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace",
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  ▶ بداية الاستراتيجية
                </div>
                <ArrowDown size={20} color={T.text3} style={{ margin: '4px 0' }} />

                {nodes.map((node, idx) => (
                  <div key={node.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                    <div style={{
                      width: '100%', padding: '14px 18px', borderRadius: 12,
                      background: `${node.color}10`, border: `1px solid ${node.color}35`,
                      display: 'flex', alignItems: 'center', gap: 12,
                      position: 'relative', transition: 'all 0.2s',
                    }}>
                      {/* Type Badge */}
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 10,
                        background: `${node.color}20`, color: node.color,
                        fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                        whiteSpace: 'nowrap',
                      }}>
                        {node.type === 'indicator' ? 'IND' : node.type === 'condition' ? 'COND' : node.type === 'action' ? 'ACT' : 'RISK'}
                      </span>
                      {/* Icon & Label */}
                      <span style={{ fontSize: 16 }}>{node.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.label}</div>
                        <div style={{ fontSize: 10, color: T.text3 }}>{node.sublabel}</div>
                      </div>
                      {/* Step Number */}
                      <span style={{ fontSize: 10, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
                        خطوة {idx + 1}
                      </span>
                      {/* Move & Delete Buttons */}
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => moveNode(idx, 'up')}
                          disabled={idx === 0}
                          style={{
                            background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 4,
                            color: idx === 0 ? T.text3 : T.text2, cursor: idx === 0 ? 'not-allowed' : 'pointer',
                            padding: 2, display: 'flex', opacity: idx === 0 ? 0.3 : 1,
                          }}
                          title="نقل للأعلى"
                        >
                          <ArrowDown size={12} style={{ transform: 'rotate(180deg)' }} />
                        </button>
                        <button
                          onClick={() => moveNode(idx, 'down')}
                          disabled={idx === nodes.length - 1}
                          style={{
                            background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 4,
                            color: idx === nodes.length - 1 ? T.text3 : T.text2, cursor: idx === nodes.length - 1 ? 'not-allowed' : 'pointer',
                            padding: 2, display: 'flex', opacity: idx === nodes.length - 1 ? 0.3 : 1,
                          }}
                          title="نقل للأسفل"
                        >
                          <ArrowDown size={12} />
                        </button>
                        <button
                          onClick={() => removeNode(node.id)}
                          style={{
                            background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 4,
                            color: T.red, cursor: 'pointer', padding: 2, display: 'flex',
                          }}
                          title="حذف"
                        >
                          <XIcon size={12} />
                        </button>
                      </div>
                    </div>
                    {/* Connector Arrow */}
                    <ArrowDown size={20} color={T.text3} style={{ margin: '4px 0' }} />
                  </div>
                ))}

                {/* End Node */}
                <div style={{
                  padding: '8px 24px', borderRadius: 20,
                  background: `${T.purple}15`, border: `1px solid ${T.purple}40`,
                  color: T.purple, fontSize: 12, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace",
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  ◼ نهاية الاستراتيجية
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Components */}
        <div style={{
          width: showPanel ? 280 : 48, background: T.card, border: `1px solid ${T.border}`,
          borderRadius: 16, padding: showPanel ? 16 : 8, display: 'flex', flexDirection: 'column',
          transition: 'all 0.3s', overflow: 'hidden', flexShrink: 0,
        }}>
          {/* Toggle Panel Button */}
          <button
            onClick={() => setShowPanel(!showPanel)}
            style={{
              background: 'transparent', border: 'none', color: T.text2, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: showPanel ? 12 : 0, padding: 4,
            }}
          >
            {showPanel ? <XIcon size={16} /> : <Plus size={16} />}
          </button>

          {showPanel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', flex: 1 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: T.text, margin: 0 }}>المكونات المتاحة</h3>

              {AVAILABLE_COMPONENTS.map((cat, catIdx) => (
                <div key={catIdx}>
                  <div style={{ fontSize: 11, color: T.text2, fontWeight: 700, marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${T.border}` }}>
                    {cat.category}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {cat.items.map((item, itemIdx) => (
                      <button
                        key={itemIdx}
                        onClick={() => addNode(item)}
                        style={{
                          padding: '10px 12px', background: `${item.color}08`,
                          border: `1px solid ${item.color}25`, borderRadius: 8,
                          color: T.text, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 8,
                          transition: 'all 0.2s', textAlign: 'right',
                          fontFamily: "'Cairo', sans-serif",
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = `${item.color}15`
                          e.currentTarget.style.borderColor = `${item.color}50`
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = `${item.color}08`
                          e.currentTarget.style.borderColor = `${item.color}25`
                        }}
                      >
                        <span style={{ fontSize: 14 }}>{item.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: item.color }}>{item.label}</div>
                          <div style={{ fontSize: 9, color: T.text3, fontWeight: 400 }}>{item.sublabel}</div>
                        </div>
                        <Plus size={12} color={item.color} style={{ opacity: 0.5 }} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
