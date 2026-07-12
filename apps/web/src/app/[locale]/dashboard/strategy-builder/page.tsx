'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Play, Plus, Settings2, Shield, Activity, GitBranch, Save, Trash2, X as XIcon, ArrowDown } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useScopedStyle } from '@/hooks/useScopedStyle'

interface StrategyNode {
  id: string
  type: 'condition' | 'action' | 'risk' | 'indicator'
  label: string
  sublabel: string
  color: string
  icon: string
}

export default function StrategyBuilderPage() {
  useScopedStyle(`@media (max-width: 767px) {
          .strategy-builder-main { height: 100% !important; }
        }`)
  const sb = useTranslations('dashboard.strategyBuilder')

  const [nodes, setNodes] = useState<StrategyNode[]>([])
  const [strategyName, setStrategyName] = useState(sb('newStrategy'))
  const [showPanel, setShowPanel] = useState(true)

  const availableComponents: { category: string; items: Omit<StrategyNode, 'id'>[] }[] = [
    {
      category: sb('catIndicators'),
      items: [
        { type: 'indicator', label: sb('indRsiLabel'), sublabel: sb('indRsiSub'), color: '#00D4FF', icon: '📊' },
        { type: 'indicator', label: sb('indMacdLabel'), sublabel: sb('indMacdSub'), color: '#00D4FF', icon: '📈' },
        { type: 'indicator', label: sb('indBbLabel'), sublabel: sb('indBbSub'), color: '#00D4FF', icon: '📏' },
        { type: 'indicator', label: sb('indEmaLabel'), sublabel: sb('indEmaSub'), color: '#00D4FF', icon: '📉' },
      ],
    },
    {
      category: sb('catConditions'),
      items: [
        { type: 'condition', label: sb('condCrossLabel'), sublabel: sb('condCrossSub'), color: '#0A84FF', icon: '🔀' },
        { type: 'condition', label: sb('condPriceLabel'), sublabel: sb('condPriceSub'), color: '#0A84FF', icon: '🎯' },
        { type: 'condition', label: sb('condVolumeLabel'), sublabel: sb('condVolumeSub'), color: '#0A84FF', icon: '📦' },
        { type: 'condition', label: sb('condTimeLabel'), sublabel: sb('condTimeSub'), color: '#0A84FF', icon: '⏰' },
      ],
    },
    {
      category: sb('catActions'),
      items: [
        { type: 'action', label: sb('actBuyMarketLabel'), sublabel: sb('actBuyMarketSub'), color: '#00FFA3', icon: '🟢' },
        { type: 'action', label: sb('actSellMarketLabel'), sublabel: sb('actSellMarketSub'), color: '#FFB800', icon: '🟡' },
        { type: 'action', label: sb('actBuyLimitLabel'), sublabel: sb('actBuyLimitSub'), color: '#00FFA3', icon: '📋' },
        { type: 'action', label: sb('actSellLimitLabel'), sublabel: sb('actSellLimitSub'), color: '#FFB800', icon: '📋' },
      ],
    },
    {
      category: sb('catRisk'),
      items: [
        { type: 'risk', label: sb('riskStopLossLabel'), sublabel: sb('riskStopLossSub'), color: '#B388FF', icon: '🛑' },
        { type: 'risk', label: sb('riskTakeProfitLabel'), sublabel: sb('riskTakeProfitSub'), color: '#B388FF', icon: '💰' },
        { type: 'risk', label: sb('riskPositionSizeLabel'), sublabel: sb('riskPositionSizeSub'), color: '#B388FF', icon: '📐' },
        { type: 'risk', label: sb('riskMaxDrawdownLabel'), sublabel: sb('riskMaxDrawdownSub'), color: '#B388FF', icon: '🧮' },
      ],
    },
  ]

  const addNode = (item: Omit<StrategyNode, 'id'>) => {
    const newNode: StrategyNode = {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    }
    setNodes(prev => [...prev, newNode])
    toast({ title: sb('toastAdded', { label: item.label }), description: item.sublabel })
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
      toast({ title: sb('toastCannotSave'), description: sb('toastCannotSaveDesc'), variant: 'destructive' })
      return
    }
    toast({ title: sb('toastDraftSaved'), description: sb('toastDraftSavedDesc', { name: strategyName, count: nodes.length }) })
  }

  const handleBacktest = () => {
    if (nodes.length === 0) {
      toast({ title: sb('toastCannotTest'), description: sb('toastCannotTestDesc'), variant: 'destructive' })
      return
    }
    toast({ title: sb('toastRunningBacktest'), description: sb('toastRunningBacktestDesc') })
  }

  const handleClearAll = () => {
    setNodes([])
    toast({ title: sb('toastCleared') })
  }

  return (
    <div className="custom-scrollbar" style={{ padding: '32px 24px', direction: 'inherit', fontFamily: "var(--font-ar)", height: '100%', overflowY: 'auto' }}>
      {/* Scoped styles via useScopedStyle */}{/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <GitBranch size={20} color={'#00D4FF'} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#F0F2F5' }}>{sb('pageTitle')}</h1>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-2xl)',
              background: `${'#00D4FF'}18`, color: '#00D4FF',
              fontFamily: "var(--font-mono)",
            }}>NO-CODE BUILDER</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#9CA3B5' }}>
            {sb('pageSubtitle')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={handleSaveDraft}
            style={{ background: '#151A22', color: '#F0F2F5', padding: '8px 20px', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${'#2A313C'}`, cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#00D4FF'; e.currentTarget.style.color = '#00D4FF' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#2A313C'; e.currentTarget.style.color = '#F0F2F5' }}
          >
            <Save size={16} /> {sb('saveDraft')}
          </button>
          <button
            onClick={handleBacktest}
            style={{ background: `linear-gradient(135deg, ${'#00D4FF'}, ${'#0A84FF'})`, color: '#fff', padding: '8px 20px', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            <Play size={16} /> {sb('backtestBtn')}
          </button>
        </div>
      </div>

      <div className="strategy-builder-main" style={{ display: 'flex', gap: 20, height: 'calc(100vh - 180px)' }}>
        {/* Strategy Flow (Left/Main Area) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Strategy Name Input */}
          <div style={{
            background: '#151A22', border: `1px solid ${'#2A313C'}`, borderRadius: 'var(--radius-xl)', padding: '14px 20px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <GitBranch size={16} color={'#00D4FF'} />
            <input
              type="text"
              value={strategyName}
              onChange={e => setStrategyName(e.target.value)}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: '#F0F2F5', fontSize: 15, fontWeight: 700, fontFamily: "var(--font-ar)",
                direction: 'inherit',
              }}
              placeholder={sb('strategyNamePlaceholder')}
            />
            <span style={{ fontSize: 11, color: '#6B7280', fontFamily: "var(--font-mono)" }}>
              {sb('componentCount', { count: nodes.length })}
            </span>
            {nodes.length > 0 && (
              <button
                onClick={handleClearAll}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#FF4757', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, fontFamily: "var(--font-ar)" }}
              >
                <Trash2 size={12} /> {sb('clearAll')}
              </button>
            )}
          </div>

          {/* Flow Canvas */}
          <div style={{
            flex: 1, background: '#02040a', border: `1px solid ${'#2A313C'}`, borderRadius: 'var(--radius-xl)',
            position: 'relative', overflow: 'auto', padding: 24,
          }}>
            {/* Grid Background */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundImage: `radial-gradient(${'#2A313C'} 1px, transparent 1px)`,
              backgroundSize: '24px 24px', opacity: 0.5, pointerEvents: 'none',
            }} />

            {nodes.length === 0 ? (
              /* Empty State */
              <div style={{ position: 'relative', textAlign: 'center', padding: '60px 20px' }}>
                <Settings2 size={48} color={'#2A313C'} style={{ marginBottom: 16, marginInline: 'auto' }} />
                <div style={{ color: '#9CA3B5', fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
                  {sb('emptyTitle')}
                </div>
                <div style={{ color: '#6B7280', fontSize: 13 }}>
                  {sb('emptySubtitle')}
                </div>
              </div>
            ) : (
              /* Flow Nodes */
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, maxWidth: 500, margin: '0 auto' }}>
                {/* Start Node */}
                <div style={{
                  padding: '8px 24px', borderRadius: 'var(--radius-2xl)',
                  background: `${'#00D4FF'}15`, border: `1px solid ${'#00D4FF'}40`,
                  color: '#00D4FF', fontSize: 13, fontWeight: 800, fontFamily: "var(--font-mono)",
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  ▶ {sb('strategyStart')}
                </div>
                <ArrowDown size={20} color={'#6B7280'} style={{ margin: '4px 0' }} />

                {nodes.map((node, idx) => (
                  <div key={node.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                    <div style={{
                      width: '100%', padding: '14px 18px', borderRadius: 'var(--radius-lg)',
                      background: `${node.color}10`, border: `1px solid ${node.color}35`,
                      display: 'flex', alignItems: 'center', gap: 12,
                      position: 'relative', transition: 'all 0.2s',
                    }}>
                      {/* Type Badge */}
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-lg)',
                        background: `${node.color}20`, color: node.color,
                        fontWeight: 700, fontFamily: "var(--font-mono)",
                        whiteSpace: 'nowrap',
                      }}>
                        {node.type === 'indicator' ? 'IND' : node.type === 'condition' ? 'COND' : node.type === 'action' ? 'ACT' : 'RISK'}
                      </span>
                      {/* Icon & Label */}
                      <span style={{ fontSize: 17 }}>{node.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#F0F2F5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.label}</div>
                        <div style={{ fontSize: 11, color: '#6B7280' }}>{node.sublabel}</div>
                      </div>
                      {/* Step Number */}
                      <span style={{ fontSize: 11, color: '#6B7280', fontFamily: "var(--font-mono)" }}>
                        {sb('step', { n: idx + 1 })}
                      </span>
                      {/* Move & Delete Buttons */}
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => moveNode(idx, 'up')}
                          disabled={idx === 0}
                          style={{
                            background: 'transparent', border: `1px solid ${'#2A313C'}`, borderRadius: 'var(--radius-sm)',
                            color: idx === 0 ? '#6B7280' : '#9CA3B5', cursor: idx === 0 ? 'not-allowed' : 'pointer',
                            padding: 2, display: 'flex', opacity: idx === 0 ? 0.3 : 1,
                          }}
                          title={sb('moveUp')}
                        >
                          <ArrowDown size={12} style={{ transform: 'rotate(180deg)' }} />
                        </button>
                        <button
                          onClick={() => moveNode(idx, 'down')}
                          disabled={idx === nodes.length - 1}
                          style={{
                            background: 'transparent', border: `1px solid ${'#2A313C'}`, borderRadius: 'var(--radius-sm)',
                            color: idx === nodes.length - 1 ? '#6B7280' : '#9CA3B5', cursor: idx === nodes.length - 1 ? 'not-allowed' : 'pointer',
                            padding: 2, display: 'flex', opacity: idx === nodes.length - 1 ? 0.3 : 1,
                          }}
                          title={sb('moveDown')}
                        >
                          <ArrowDown size={12} />
                        </button>
                        <button
                          onClick={() => removeNode(node.id)}
                          style={{
                            background: 'transparent', border: `1px solid ${'#2A313C'}`, borderRadius: 'var(--radius-sm)',
                            color: '#FF4757', cursor: 'pointer', padding: 2, display: 'flex',
                          }}
                          title={sb('deleteNode')}
                        >
                          <XIcon size={12} />
                        </button>
                      </div>
                    </div>
                    {/* Connector Arrow */}
                    <ArrowDown size={20} color={'#6B7280'} style={{ margin: '4px 0' }} />
                  </div>
                ))}

                {/* End Node */}
                <div style={{
                  padding: '8px 24px', borderRadius: 'var(--radius-2xl)',
                  background: `${'#B388FF'}15`, border: `1px solid ${'#B388FF'}40`,
                  color: '#B388FF', fontSize: 13, fontWeight: 800, fontFamily: "var(--font-mono)",
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  ◼ {sb('strategyEnd')}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Components */}
        <div style={{
          width: showPanel ? 280 : 48, background: '#151A22', border: `1px solid ${'#2A313C'}`,
          borderRadius: 'var(--radius-xl)', padding: showPanel ? 16 : 8, display: 'flex', flexDirection: 'column',
          transition: 'all 0.3s', overflow: 'hidden', flexShrink: 0,
        }}>
          {/* Toggle Panel Button */}
          <button
            onClick={() => setShowPanel(!showPanel)}
            style={{
              background: 'transparent', border: 'none', color: '#9CA3B5', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: showPanel ? 12 : 0, padding: 4,
            }}
          >
            {showPanel ? <XIcon size={16} /> : <Plus size={16} />}
          </button>

          {showPanel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', flex: 1 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: '#F0F2F5', margin: 0 }}>{sb('availableComponents')}</h3>

              {availableComponents.map((cat, catIdx) => (
                <div key={catIdx}>
                  <div style={{ fontSize: 11, color: '#9CA3B5', fontWeight: 700, marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${'#2A313C'}` }}>
                    {cat.category}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {cat.items.map((item, itemIdx) => (
                      <button
                        key={itemIdx}
                        onClick={() => addNode(item)}
                        style={{
                          padding: '10px 12px', background: `${item.color}08`,
                          border: `1px solid ${item.color}25`, borderRadius: 'var(--radius-md)',
                          color: '#F0F2F5', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 8,
                          transition: 'all 0.2s', textAlign: 'right',
                          fontFamily: "var(--font-ar)",
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
                        <span style={{ fontSize: 15 }}>{item.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: item.color }}>{item.label}</div>
                          <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 400 }}>{item.sublabel}</div>
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
