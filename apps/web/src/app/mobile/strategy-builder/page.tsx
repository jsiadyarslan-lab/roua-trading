'use client'

import { useState, useCallback, useRef } from 'react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { GitMerge, Plus, Trash2, Play, Save, Settings, Zap, TrendingUp, BarChart3, ShieldAlert, Target, ArrowDown } from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

type NodeType = 'trigger' | 'condition' | 'action' | 'risk'

interface StrategyNode {
  id: string
  type: NodeType
  label: string
  config: Record<string, string | number>
}

const NODE_TYPES: { type: NodeType; label: string; icon: any; color: string }[] = [
  { type: 'trigger', label: 'مشغّل', icon: Zap, color: C.accent },
  { type: 'condition', label: 'شرط', icon: BarChart3, color: C.amber },
  { type: 'action', label: 'إجراء', icon: TrendingUp, color: C.success },
  { type: 'risk', label: 'حماية', icon: ShieldAlert, color: C.danger },
]

const TRIGGER_OPTIONS = [
  { value: 'price_above', label: 'السعر فوق مستوى' },
  { value: 'price_below', label: 'السعر تحت مستوى' },
  { value: 'rsi_oversold', label: 'RSI تشبع بيعي' },
  { value: 'rsi_overbought', label: 'RSI تشبع شرائي' },
  { value: 'volume_spike', label: 'ارتفاع الحجم' },
  { value: 'ema_cross', label: 'تقاطع EMA' },
]

const CONDITION_OPTIONS = [
  { value: 'trend_up', label: 'اتجاه صعودي' },
  { value: 'trend_down', label: 'اتجاه هبوطي' },
  { value: 'ranging', label: 'سوق عرضي' },
  { value: 'volatile', label: 'سوق متقلب' },
]

const ACTION_OPTIONS = [
  { value: 'buy', label: 'شراء' },
  { value: 'sell', label: 'بيع' },
  { value: 'close_long', label: 'إغلاق شراء' },
  { value: 'close_short', label: 'إغلاق بيع' },
  { value: 'set_tp', label: 'تعيين جني أرباح' },
  { value: 'set_sl', label: 'تعيين وقف خسارة' },
]

const RISK_OPTIONS = [
  { value: 'max_position', label: 'حد حجم المركز' },
  { value: 'daily_loss', label: 'حد الخسارة اليومية' },
  { value: 'max_open', label: 'حد المراكز المفتوحة' },
  { value: 'trailing_stop', label: 'وقف متحرك' },
]

const NODE_COLORS: Record<NodeType, string> = {
  trigger: C.accent,
  condition: C.amber,
  action: C.success,
  risk: C.danger,
}

export default function MobileStrategyBuilderPage() {
  const [nodes, setNodes] = useState<StrategyNode[]>([
    { id: '1', type: 'trigger', label: 'السعر فوق مستوى', config: { value: 50000 } },
    { id: '2', type: 'condition', label: 'اتجاه صعودي', config: {} },
    { id: '3', type: 'action', label: 'شراء', config: { qty: 0.01 } },
    { id: '4', type: 'risk', label: 'حد وقف الخسارة', config: { pct: 2 } },
  ])
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const nextId = useRef(5)

  const addNode = useCallback((type: NodeType) => {
    const options = type === 'trigger' ? TRIGGER_OPTIONS : type === 'condition' ? CONDITION_OPTIONS : type === 'action' ? ACTION_OPTIONS : RISK_OPTIONS
    const defaultOption = options[0]
    setNodes(prev => [...prev, {
      id: String(nextId.current++),
      type,
      label: defaultOption.label,
      config: type === 'trigger' ? { value: 0 } : type === 'action' ? { qty: 0.01 } : type === 'risk' ? { pct: 2 } : {},
    }])
    setShowAddPanel(false)
  }, [])

  const removeNode = useCallback((id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id))
    if (selectedNode === id) setSelectedNode(null)
  }, [selectedNode])

  const moveNode = useCallback((id: string, direction: 'up' | 'down') => {
    setNodes(prev => {
      const idx = prev.findIndex(n => n.id === id)
      if (idx < 0) return prev
      const newIdx = direction === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const copy = [...prev]
      ;[copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]]
      return copy
    })
  }, [])

  const updateNodeLabel = useCallback((id: string, label: string) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, label } : n))
  }, [])

  const selected = nodes.find(n => n.id === selectedNode)

  return (
    <div className="m-page">
      <MobilePageHeader title="محرر الاستراتيجيات" subtitle="بناء بصري بدون كود" right={
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setShowAddPanel(!showAddPanel)} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,212,255,0.1)', border: '0.5px solid rgba(0,212,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Plus size={16} color={C.accent} />
          </button>
        </div>
      } />

      {/* Flow Description */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'rgba(0,212,255,0.04)', border: '0.5px solid rgba(0,212,255,0.1)' }}>
          <GitMerge size={14} color={C.accent} />
          <span style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>
            {nodes.length} عقدة — اضغط على العقدة لتعديلها، أو اضغط + لإضافة
          </span>
        </div>
      </div>

      {/* Add Node Panel */}
      {showAddPanel && (
        <div style={{ padding: '0 16px', marginBottom: 12 }}>
          <IOSCard>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>إضافة عقدة</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {NODE_TYPES.map(nt => {
                const Icon = nt.icon
                return (
                  <button key={nt.type} onClick={() => addNode(nt.type)} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                    borderRadius: 10, background: `${nt.color}08`,
                    border: `0.5px solid ${nt.color}18`,
                    cursor: 'pointer',
                  }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: `${nt.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${nt.color}30` }}>
                      <Icon size={14} color={nt.color} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: nt.color, fontFamily: "'Cairo', sans-serif" }}>{nt.label}</span>
                  </button>
                )
              })}
            </div>
          </IOSCard>
        </div>
      )}

      {/* Node Flow */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <IOSCard>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {nodes.map((node, i) => {
              const color = NODE_COLORS[node.type]
              const nodeType = NODE_TYPES.find(nt => nt.type === node.type)
              const Icon = nodeType?.icon || Zap
              const isSelected = selectedNode === node.id

              return (
                <div key={node.id}>
                  {/* Connector Arrow */}
                  {i > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0' }}>
                      <ArrowDown size={14} color="rgba(255,255,255,0.15)" />
                    </div>
                  )}

                  {/* Node */}
                  <div onClick={() => setSelectedNode(isSelected ? null : node.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                    borderRadius: 12,
                    background: isSelected ? `${color}10` : 'rgba(255,255,255,0.02)',
                    border: isSelected ? `1px solid ${color}30` : `0.5px solid ${C.border}`,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${color}30`, flexShrink: 0 }}>
                      <Icon size={16} color={color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>{node.label}</div>
                      <div style={{ fontSize: 8, fontWeight: 700, color, fontFamily: "'Cairo', sans-serif" }}>
                        {node.type === 'trigger' ? 'مشغّل' : node.type === 'condition' ? 'شرط' : node.type === 'action' ? 'إجراء' : 'حماية'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {i > 0 && <button onClick={(e) => { e.stopPropagation(); moveNode(node.id, 'up') }} style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 10, color: C.text2 }}>↑</button>}
                      {i < nodes.length - 1 && <button onClick={(e) => { e.stopPropagation(); moveNode(node.id, 'down') }} style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 10, color: C.text2 }}>↓</button>}
                      <button onClick={(e) => { e.stopPropagation(); removeNode(node.id) }} style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,71,87,0.08)', border: '0.5px solid rgba(255,71,87,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <Trash2 size={10} color={C.danger} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </IOSCard>
      </div>

      {/* Node Editor */}
      {selected && (
        <div style={{ padding: '0 16px', marginBottom: 12 }}>
          <IOSCard>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Settings size={14} color={NODE_COLORS[selected.type]} />
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>تعديل العقدة</span>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif", display: 'block', marginBottom: 4 }}>الوصف</label>
              <input value={selected.label} onChange={e => updateNodeLabel(selected.id, e.target.value)} style={{ width: '100%', height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, padding: '0 10px', color: C.text, fontSize: 12, fontFamily: "'Cairo', sans-serif", outline: 'none', direction: 'rtl' }} />
            </div>

            {/* Type-specific config */}
            {selected.type === 'trigger' && (
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif", display: 'block', marginBottom: 4 }}>القيمة</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {TRIGGER_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => updateNodeLabel(selected.id, opt.label)} style={{
                      padding: '6px 4px', borderRadius: 6,
                      background: selected.label === opt.label ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.02)',
                      border: selected.label === opt.label ? '0.5px solid rgba(0,212,255,0.3)' : `0.5px solid ${C.border}`,
                      color: selected.label === opt.label ? C.accent : C.text2,
                      fontSize: 9, fontWeight: 700, fontFamily: "'Cairo', sans-serif",
                      cursor: 'pointer', textAlign: 'center',
                    }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selected.type === 'condition' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {CONDITION_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => updateNodeLabel(selected.id, opt.label)} style={{
                    padding: '6px 4px', borderRadius: 6,
                    background: selected.label === opt.label ? 'rgba(255,184,0,0.12)' : 'rgba(255,255,255,0.02)',
                    border: selected.label === opt.label ? '0.5px solid rgba(255,184,0,0.3)' : `0.5px solid ${C.border}`,
                    color: selected.label === opt.label ? C.amber : C.text2,
                    fontSize: 9, fontWeight: 700, fontFamily: "'Cairo', sans-serif",
                    cursor: 'pointer', textAlign: 'center',
                  }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {selected.type === 'action' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {ACTION_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => updateNodeLabel(selected.id, opt.label)} style={{
                    padding: '6px 4px', borderRadius: 6,
                    background: selected.label === opt.label ? 'rgba(0,255,163,0.12)' : 'rgba(255,255,255,0.02)',
                    border: selected.label === opt.label ? '0.5px solid rgba(0,255,163,0.3)' : `0.5px solid ${C.border}`,
                    color: selected.label === opt.label ? C.success : C.text2,
                    fontSize: 9, fontWeight: 700, fontFamily: "'Cairo', sans-serif",
                    cursor: 'pointer', textAlign: 'center',
                  }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {selected.type === 'risk' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {RISK_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => updateNodeLabel(selected.id, opt.label)} style={{
                    padding: '6px 4px', borderRadius: 6,
                    background: selected.label === opt.label ? 'rgba(255,71,87,0.12)' : 'rgba(255,255,255,0.02)',
                    border: selected.label === opt.label ? '0.5px solid rgba(255,71,87,0.3)' : `0.5px solid ${C.border}`,
                    color: selected.label === opt.label ? C.danger : C.text2,
                    fontSize: 9, fontWeight: 700, fontFamily: "'Cairo', sans-serif",
                    cursor: 'pointer', textAlign: 'center',
                  }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </IOSCard>
        </div>
      )}

      {/* Save/Run */}
      <div style={{ padding: '0 16px', display: 'flex', gap: 8 }}>
        <button style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: 'rgba(0,212,255,0.1)', border: '0.5px solid rgba(0,212,255,0.2)', color: C.accent, fontSize: 12, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Save size={14} /> حفظ
        </button>
        <button style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: C.accent, border: 'none', color: '#000', fontSize: 12, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Play size={14} /> تشغيل
        </button>
      </div>

      <div style={{ height: 16 }} />
    </div>
  )
}
