'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowRight, FlaskConical, ChevronDown } from 'lucide-react'
import dynamic from 'next/dynamic'
import { ScopedStyle } from '@/components/ScopedStyle'

/* ─── Design Tokens ─── */
const C = {
  accent: '#00D4FF', success: '#32D74B', danger: '#FF453A', amber: '#FFB800',
  purple: '#A78BFA', text: '#F0F2F5', text2: 'rgba(235,235,245,0.5)',
  text3: 'rgba(235,235,245,0.25)', border: 'rgba(255,255,255,0.08)',
}
const FONT_AR = "'Cairo', sans-serif"

function PanelLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
      <div style={{ width: 28, height: 28, border: `2px solid ${C.purple}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <ScopedStyle>{`@keyframes spin { to { transform: rotate(360deg); } }`}</ScopedStyle>
    </div>
  )
}

const BacktestPanel = dynamic(() => import('../../[locale]/dashboard/neural/BacktestPanel'), { ssr: false, loading: () => <PanelLoader /> })
const NeuralPanel = dynamic(() => import('../../[locale]/dashboard/neural/NeuralPanel'), { ssr: false, loading: () => <PanelLoader /> })
const SwarmPanel = dynamic(() => import('../../[locale]/dashboard/neural/SwarmPanel'), { ssr: false, loading: () => <PanelLoader /> })
const OptimizerPanel = dynamic(() => import('../../[locale]/dashboard/neural/OptimizerPanel'), { ssr: false, loading: () => <PanelLoader /> })
const ComparisonPanel = dynamic(() => import('../../[locale]/dashboard/neural/ComparisonPanel'), { ssr: false, loading: () => <PanelLoader /> })

const TABS = [
  { id: 'backtest', label: 'الباك تست', icon: '📊' },
  { id: 'optimizer', label: 'المُحسِّن', icon: '🔧' },
  { id: 'comparison', label: 'المقارنة', icon: '⚖️' },
  { id: 'neural', label: 'الشبكة العصبية', icon: '🧠' },
  { id: 'swarm', label: 'سرب الوكلاء', icon: '🐝' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function MobileNeuralPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabId>('backtest')

  return (
    <div style={{ minHeight: '100%', background: '#000', direction: 'rtl', paddingBottom: 20 }}>
      {/* ─── Sticky Header ─── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top, 20px) + 8px) 20px 12px',
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => router.back()} style={{
            width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.07)',
            border: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ArrowRight size={18} color="#FFFFFF" />
          </motion.button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg, #8B5CF6, #D946EF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🧪</div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 900, color: C.text, fontFamily: FONT_AR }}>AI Trading Lab</h1>
              <p style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR }}>مختبر التداول الذكي</p>
            </div>
          </div>
        </div>

        {/* Tabs - scrollable */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', paddingBottom: 4 }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding: '8px 14px', borderRadius: 10, whiteSpace: 'nowrap', border: 'none',
              background: activeTab === tab.id ? `${C.purple}15` : 'transparent',
              color: activeTab === tab.id ? C.purple : C.text2,
              fontSize: 11, fontWeight: 700, fontFamily: FONT_AR, cursor: 'pointer',
              borderBottom: activeTab === tab.id ? `2px solid ${C.purple}` : '2px solid transparent',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '12px 16px' }}>
        {activeTab === 'backtest' && <BacktestPanel />}
        {activeTab === 'optimizer' && <OptimizerPanel />}
        {activeTab === 'comparison' && <ComparisonPanel />}
        {activeTab === 'neural' && <NeuralPanel />}
        {activeTab === 'swarm' && <SwarmPanel />}
      </div>
    </div>
  )
}
