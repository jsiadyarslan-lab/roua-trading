'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Play, Plus, GitBranch, Save, Trash2, X, ArrowDown, Settings2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

/* ─── Design Tokens ─── */
const C = {
  accent:  '#00D4FF',
  success: '#32D74B',
  danger:  '#FF453A',
  amber:   '#FFB800',
  purple:  '#A78BFA',
  text:    '#F0F2F5',
  text2:   'rgba(235,235,245,0.5)',
  text3:   'rgba(235,235,245,0.25)',
  bg:      '#1C1C1E',
  border:  'rgba(255,255,255,0.08)',
}
const FONT_AR   = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

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
    category: 'مؤشرات',
    items: [
      { type: 'indicator', label: 'RSI', sublabel: 'مؤشر القوة النسبية', color: C.accent, icon: '📊' },
      { type: 'indicator', label: 'MACD', sublabel: 'تقارب/تباعد المتوسطات', color: C.accent, icon: '📈' },
      { type: 'indicator', label: 'Bollinger Bands', sublabel: 'نطاقات بولينجر', color: C.accent, icon: '📏' },
      { type: 'indicator', label: 'EMA', sublabel: 'المتوسط الأسي', color: C.accent, icon: '📉' },
    ],
  },
  {
    category: 'شروط',
    items: [
      { type: 'condition', label: 'تقاطع مؤشرات', sublabel: 'Crossover', color: '#0A84FF', icon: '🔀' },
      { type: 'condition', label: 'مستوى سعري', sublabel: 'Price Level', color: '#0A84FF', icon: '🎯' },
      { type: 'condition', label: 'حجم تداول', sublabel: 'Volume Spike', color: '#0A84FF', icon: '📦' },
      { type: 'condition', label: 'زمني', sublabel: 'Time-based', color: '#0A84FF', icon: '⏰' },
    ],
  },
  {
    category: 'إجراءات',
    items: [
      { type: 'action', label: 'شراء (Buy Market)', sublabel: 'أمر سوق شراء', color: C.success, icon: '🟢' },
      { type: 'action', label: 'بيع (Sell Market)', sublabel: 'أمر سوق بيع', color: C.amber, icon: '🟡' },
      { type: 'action', label: 'شراء محدد', sublabel: 'Limit Buy', color: C.success, icon: '📋' },
      { type: 'action', label: 'بيع محدد', sublabel: 'Limit Sell', color: C.amber, icon: '📋' },
    ],
  },
  {
    category: 'إدارة مخاطر',
    items: [
      { type: 'risk', label: 'إيقاف خسارة', sublabel: 'Stop Loss', color: C.purple, icon: '🛑' },
      { type: 'risk', label: 'جني أرباح', sublabel: 'Take Profit', color: C.purple, icon: '💰' },
      { type: 'risk', label: 'حجم المركز', sublabel: 'Position Size %', color: C.purple, icon: '📐' },
      { type: 'risk', label: 'الحد الأقصى للسحب', sublabel: 'Max Drawdown', color: C.purple, icon: '🧮' },
    ],
  },
]

export default function MobileStrategyBuilderPage() {
  const router = useRouter()
  const [nodes, setNodes] = useState<StrategyNode[]>([])
  const [strategyName, setStrategyName] = useState('استراتيجية جديدة')
  const [showComponents, setShowComponents] = useState(false)

  const addNode = (item: Omit<StrategyNode, 'id'>) => {
    const newNode: StrategyNode = { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }
    setNodes(prev => [...prev, newNode])
    toast({ title: `تمت إضافة: ${item.label}`, description: item.sublabel })
  }

  const removeNode = (id: string) => { setNodes(prev => prev.filter(n => n.id !== id)) }

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
    if (nodes.length === 0) { toast({ title: 'لا يمكن الحفظ', description: 'أضف مكونات واحدة على الأقل', variant: 'destructive' }); return }
    toast({ title: 'تم حفظ المسودة ✅', description: `تم حفظ "${strategyName}" مع ${nodes.length} مكون` })
  }

  const handleBacktest = () => {
    if (nodes.length === 0) { toast({ title: 'لا يمكن الاختبار', description: 'أضف مكونات واحدة على الأقل', variant: 'destructive' }); return }
    toast({ title: 'جارٍ تشغيل Backtest...', description: 'سيتم إشعارك عند انتهاء الاختبار' })
  }

  return (
    <div style={{ minHeight: '100%', background: '#000', direction: 'rtl', paddingBottom: 20 }}>
      {/* ─── Sticky Header ─── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top, 20px) + 8px) 20px 16px',
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        position: 'sticky', top: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => router.back()} style={{
          width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.07)',
          border: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ArrowRight size={18} color="#FFFFFF" />
        </motion.button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <div style={{ color: C.accent, display: 'flex' }}><GitBranch size={20} /></div>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: C.text, fontFamily: FONT_AR }}>محرر الاستراتيجيات</h1>
        </div>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {/* Strategy Name */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{
          padding: '14px 16px', borderRadius: 16, marginBottom: 16,
          background: 'rgba(28,28,30,0.6)', backdropFilter: 'blur(20px)',
          border: `0.5px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <GitBranch size={16} color={C.accent} />
          <input type="text" value={strategyName} onChange={e => setStrategyName(e.target.value)} style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: C.text, fontSize: 15, fontWeight: 700, fontFamily: FONT_AR, direction: 'rtl',
          }} placeholder="اسم الاستراتيجية..." />
          <span style={{ fontSize: 10, color: C.text3, fontFamily: FONT_MONO }}>{nodes.length} مكون</span>
          {nodes.length > 0 && (
            <button onClick={() => setNodes([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger, display: 'flex', alignItems: 'center' }}>
              <Trash2 size={14} />
            </button>
          )}
        </motion.div>

        {/* Flow Canvas */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} style={{
          borderRadius: 20, marginBottom: 16, minHeight: 200,
          background: 'rgba(4,4,8,0.8)', border: `0.5px solid ${C.border}`,
          padding: 20, position: 'relative', overflow: 'auto',
        }}>
          {/* Grid background */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundImage: `radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)`,
            backgroundSize: '20px 20px', opacity: 0.5, pointerEvents: 'none',
          }} />

          {nodes.length === 0 ? (
            <div style={{ position: 'relative', textAlign: 'center', padding: '40px 16px' }}>
              <Settings2 size={40} color="rgba(255,255,255,0.08)" style={{ margin: '0 auto 12px' }} />
              <div style={{ color: C.text2, fontSize: 13, fontWeight: 700, fontFamily: FONT_AR, marginBottom: 6 }}>
                اضغط على + لإضافة مكونات
              </div>
              <div style={{ color: C.text3, fontSize: 11, fontFamily: FONT_AR }}>
                سيتم ربط المكونات تلقائياً بتسلسل منطقي
              </div>
            </div>
          ) : (
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
              {/* Start */}
              <div style={{ padding: '6px 20px', borderRadius: 16, background: `${C.accent}15`, border: `0.5px solid ${C.accent}40`, color: C.accent, fontSize: 11, fontWeight: 800, fontFamily: FONT_MONO }}>▶ بداية</div>
              <ArrowDown size={16} color={C.text3} style={{ margin: '3px 0' }} />

              {nodes.map((node, idx) => (
                <div key={node.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                  <div style={{
                    width: '100%', padding: '12px 14px', borderRadius: 12,
                    background: `${node.color}10`, border: `0.5px solid ${node.color}35`,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, background: `${node.color}20`, color: node.color, fontWeight: 700, fontFamily: FONT_MONO, whiteSpace: 'nowrap' }}>
                      {node.type === 'indicator' ? 'IND' : node.type === 'condition' ? 'COND' : node.type === 'action' ? 'ACT' : 'RISK'}
                    </span>
                    <span style={{ fontSize: 14 }}>{node.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: FONT_AR, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.label}</div>
                      <div style={{ fontSize: 9, color: C.text3, fontFamily: FONT_AR }}>{node.sublabel}</div>
                    </div>
                    <span style={{ fontSize: 9, color: C.text3, fontFamily: FONT_MONO }}>خطوة {idx + 1}</span>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button onClick={() => moveNode(idx, 'up')} disabled={idx === 0} style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'not-allowed' : 'pointer', color: C.text3, padding: 2, opacity: idx === 0 ? 0.3 : 1 }}>
                        <ArrowDown size={11} style={{ transform: 'rotate(180deg)' }} />
                      </button>
                      <button onClick={() => moveNode(idx, 'down')} disabled={idx === nodes.length - 1} style={{ background: 'none', border: 'none', cursor: idx === nodes.length - 1 ? 'not-allowed' : 'pointer', color: C.text3, padding: 2, opacity: idx === nodes.length - 1 ? 0.3 : 1 }}>
                        <ArrowDown size={11} />
                      </button>
                      <button onClick={() => removeNode(node.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger, padding: 2 }}>
                        <X size={11} />
                      </button>
                    </div>
                  </div>
                  <ArrowDown size={16} color={C.text3} style={{ margin: '3px 0' }} />
                </div>
              ))}

              {/* End */}
              <div style={{ padding: '6px 20px', borderRadius: 16, background: `${C.purple}15`, border: `0.5px solid ${C.purple}40`, color: C.purple, fontSize: 11, fontWeight: 800, fontFamily: FONT_MONO }}>◼ نهاية</div>
            </div>
          )}
        </motion.div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <motion.button whileTap={{ scale: 0.95 }} onClick={handleSaveDraft} style={{
            flex: 1, padding: '12px', borderRadius: 14, background: 'rgba(28,28,30,0.6)',
            border: `0.5px solid ${C.border}`, color: C.text, fontSize: 13, fontWeight: 800,
            fontFamily: FONT_AR, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <Save size={16} /> حفظ المسودة
          </motion.button>
          <motion.button whileTap={{ scale: 0.95 }} onClick={handleBacktest} style={{
            flex: 1, padding: '12px', borderRadius: 14, background: `linear-gradient(135deg, ${C.accent}, #0A84FF)`,
            border: 'none', color: '#000', fontSize: 13, fontWeight: 800,
            fontFamily: FONT_AR, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <Play size={16} /> اختبار
          </motion.button>
        </div>

        {/* Add Components Button */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowComponents(!showComponents)}
          style={{
            width: '100%', padding: '14px', borderRadius: 16,
            background: showComponents ? `${C.accent}15` : 'rgba(28,28,30,0.6)',
            border: `0.5px solid ${showComponents ? `${C.accent}30` : C.border}`,
            color: showComponents ? C.accent : C.text2, fontSize: 14, fontWeight: 800,
            fontFamily: FONT_AR, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <Plus size={18} /> إضافة مكونات
        </motion.button>

        {/* Components Panel */}
        <AnimatePresence>
          {showComponents && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              style={{ overflow: 'hidden', marginTop: 12 }}
            >
              {AVAILABLE_COMPONENTS.map((cat, catIdx) => (
                <div key={catIdx} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.text2, fontFamily: FONT_AR, marginBottom: 8, paddingBottom: 4, borderBottom: `0.5px solid ${C.border}` }}>
                    {cat.category}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {cat.items.map((item, itemIdx) => (
                      <motion.button
                        key={itemIdx}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => addNode(item)}
                        style={{
                          padding: '12px 14px', background: `${item.color}08`,
                          border: `0.5px solid ${item.color}25`, borderRadius: 14,
                          color: C.text, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 10, textAlign: 'right', fontFamily: FONT_AR,
                        }}
                      >
                        <span style={{ fontSize: 16 }}>{item.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: item.color, fontFamily: FONT_AR }}>{item.label}</div>
                          <div style={{ fontSize: 9, color: C.text3, fontFamily: FONT_AR }}>{item.sublabel}</div>
                        </div>
                        <Plus size={12} color={item.color} style={{ opacity: 0.5 }} />
                      </motion.button>
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
