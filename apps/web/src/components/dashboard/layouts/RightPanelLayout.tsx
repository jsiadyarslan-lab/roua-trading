'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Brain, ScanSearch, Zap, Swords, Landmark, Bot, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { AgentControlMini } from '@/components/dashboard/AgentControlMini'
import { ScannerMini } from '@/components/dashboard/ScannerMini'
import { AICouncilPanel } from '@/components/dashboard/AICouncilPanel'
import { StrategicCouncilPanel } from '@/components/dashboard/StrategicCouncilPanel'
import { SmartExecutorPanel } from '@/components/dashboard/SmartExecutorPanel'
import { MultiTfScannerMini } from '@/components/dashboard/MultiTfScannerMini'
import { useDecisionFlow } from '@/hooks/useDecisionFlow'
import { useTabAlertStore, type TabId } from '@/hooks/useTabAlertStore'
import { useScopedStyle } from '@/hooks/useScopedStyle'
import { useRightPanelState } from '@/hooks/useRightPanelState'
import { useTranslations } from 'next-intl'

// LazicPanel uses browser-only APIs (fetch + interval) → load on client only
const LazicPanel = dynamic(() => import('@/components/dashboard/LazicPanel').then(m => ({ default: m.LazicPanel })), { ssr: false })

const T = {
  bg: '#0B0E14',
  bg2: '#1A1D29',
  bg3: '#16181A',
  card: '#1A1D29',
  border: 'rgba(255,255,255,0.06)',
  border2: 'rgba(0,212,255,0.12)',
  primary: '#0A84FF',
  accent: '#00D4FF',
  success: '#00FFA3',
  danger: '#FF4757',
  amber: '#FFB800',
  purple: '#B388FF',
  cyan: '#00D4FF',
  green: '#00FFA3',
  red: '#FF4757',
  text: '#F0F2F5',
  text2: '#8B92A8',
  text3: '#8B92A8',
}

export function RightPanelLayout({ quotes: _quotes }: { quotes: any }) {
  useScopedStyle(`
        @keyframes tab-alert-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.8; }
        }
        .decision-center-tab:hover:not(:disabled) {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 0 4px 16px rgba(0,212,255,0.15), 0 0 0 1px rgba(0,212,255,0.12) inset !important;
          border-color: rgba(0,212,255,0.35) !important;
          background-image: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,212,255,0.04)) !important;
        }
        .decision-center-tab:active:not(:disabled) {
          transform: translateY(0) scale(0.98);
        }
      `)
  const tr = useTranslations('dashboard.rightPanel')
  const [active, setActive] = useState('executor')
  const { selectedSymbol, scanner, council } = useDecisionFlow()
  const { alerts, clearAlert } = useTabAlertStore()
  const { collapsed: rightCollapsed, toggleCollapse: toggleRightCollapse } = useRightPanelState()

  // Clear alerts when user opens a tab
  const handleTabClick = (tabId: string) => {
    setActive(tabId)
    clearAlert(tabId as TabId)
  }

  const TABS = [
    { id: 'lazic', label: tr('tabLazic'), accent: '#FF6B35', icon: Zap, subtitle: tr('subtitleLazic') },
    { id: 'executor', label: tr('tabExecutor'), accent: T.cyan, icon: Swords, subtitle: tr('subtitleExecutor') },
    { id: 'strategic', label: tr('tabStrategic'), accent: T.purple, icon: Landmark, subtitle: tr('subtitleStrategic') },
    { id: 'trader', label: tr('tabTrader'), accent: '#FF8C42', icon: Bot, subtitle: tr('subtitleTrader') },
    { id: 'council', label: tr('tabCouncil'), accent: T.accent, icon: Brain, subtitle: tr('subtitleCouncil') },
    { id: 'scanner', label: tr('tabScanner'), accent: T.amber, icon: ScanSearch, subtitle: tr('subtitleScanner') },
  ]
  const activeTab = TABS.find((tab) => tab.id === active) || TABS[0]
  const headlineMap = {
    lazic: tr('headlineLazic'),
    executor: tr('headlineExecutor'),
    strategic: tr('headlineStrategic'),
    council: council?.recommendation ? tr('headlineCouncil', { recommendation: council.recommendation }) : tr('headlineCouncilDefault'),
    scanner: scanner ? tr('headlineScanner', { symbol: scanner.pair }) : tr('headlineScannerDefault'),
    trader: tr('headlineTrader'),
  } as const

  const headline = headlineMap[active as keyof typeof headlineMap] ?? tr('headlineDefault')

  // V555: عند الطي، اعرض زر فتح صغير فقط
  if (rightCollapsed) {
    return (
      <div
        className="dash-col"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          height: '100%',
          minHeight: 0,
          background: 'rgba(26, 29, 41, 0.65)',
          backdropFilter: 'blur(16px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
          padding: '8px 4px',
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={toggleRightCollapse}
          title={tr('expand') || 'Expand'}
          aria-label="Expand right panel"
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            border: '1px solid rgba(0,212,255,0.18)',
            background: 'rgba(0, 0, 0, 0.9)',
            color: T.text3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <PanelLeftOpen size={14} />
        </button>
        {/* أيقونات التبويبات مصغرة */}
        {TABS.map(t => {
          const Icon = t.icon
          const isActive = active === t.id
          return (
            <button
              key={t.id}
              onClick={() => { handleTabClick(t.id); toggleRightCollapse(); }}
              title={t.label}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: isActive ? `${t.accent}18` : 'rgba(255,255,255,0.035)',
                border: `1px solid ${isActive ? `${t.accent}55` : 'rgba(255,255,255,0.08)'}`,
                color: isActive ? t.accent : T.text3,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
            >
              <Icon size={13} />
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div
      className="dash-col"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        maxHeight: '100%',
        background: 'rgba(26, 29, 41, 0.65)',
        backdropFilter: 'blur(16px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
        position: 'relative',
      }}
    >
      {/* Subtle radial glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(circle at top right, ${activeTab.accent}06, transparent 40%)`,
      }} />

      <div
        style={{
          padding: '6px 10px 5px',
          borderBottom: `1px solid rgba(0, 212, 255, 0.10)`,
          background: `linear-gradient(90deg, ${activeTab.accent}15, rgba(255,255,255,0.01))`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          position: 'relative',
          zIndex: 1,
        }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: activeTab.accent,
                  boxShadow: `0 0 10px ${activeTab.accent}66`,
                }}
              />
              <div style={{ fontSize: 10, fontWeight: 800, color: T.text, fontFamily: "var(--font-ar)" }}>
                {tr('decisionCenter')}
              </div>
            </div>
            <div style={{ marginTop: 2, fontSize: 7.5, color: T.text3, fontFamily: "var(--font-ar)" }}>
              {headline}
            </div>
          </div>
          <div style={{ display: 'grid', gap: 3, justifyItems: 'end' }}>
            <div
              style={{
                fontSize: 8,
                color: activeTab.accent,
                background: `${activeTab.accent}12`,
                border: `1px solid ${activeTab.accent}25`,
                borderRadius: 999,
                padding: '2px 6px',
                fontWeight: 800,
                fontFamily: "var(--font-mono)",
                whiteSpace: 'nowrap',
              }}
            >
              {activeTab.label}
            </div>
            <div style={{ fontSize: 7, color: T.text3, fontFamily: "var(--font-mono)" }}>
              {selectedSymbol}
            </div>
          </div>
          {/* V555: زر طي اللوحة اليمنى */}
          <button
            type="button"
            onClick={toggleRightCollapse}
            title="Collapse"
            aria-label="Collapse right panel"
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              border: '1px solid rgba(0,212,255,0.18)',
              background: 'rgba(0, 0, 0, 0.9)',
              color: T.text3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              flexShrink: 0,
            }}
          >
            <PanelLeftClose size={13} />
          </button>
        </div>

      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: '3px 5px',
          flexShrink: 0,
          background: 'rgba(255,255,255,0.02)',
          borderBottom: `1px solid rgba(0, 212, 255, 0.08)`,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {TABS.map(t => {
          const isActive = active === t.id
          const Icon = t.icon
          const alert = alerts[t.id as TabId] ?? null
          const hasAlert = alert !== null && alert.count > 0
          const alertCount = alert?.count || 0
          const alertColor = alert?.color || t.accent

          return (
            <button
              key={t.id}
              onClick={() => handleTabClick(t.id)}
              className="decision-center-tab"
              title={t.label}
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 22,
                padding: '2px 2px',
                background: isActive ? `${t.accent}18` : hasAlert ? `${alertColor}06` : 'rgba(255,255,255,0.035)',
                border: `1px solid ${isActive ? `${t.accent}55` : hasAlert ? `${alertColor}35` : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 5,
                color: isActive ? T.text : T.text3,
                cursor: 'pointer',
                fontFamily: "var(--font-ar)",
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                boxShadow: isActive
                  ? `0 0 0 1px ${t.accent}20 inset, 0 0 8px ${t.accent}08`
                  : hasAlert
                    ? `0 0 0 1px ${alertColor}10 inset`
                    : 'inset 0 1px 0 rgba(255,255,255,0.02)',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {/* Alert badge */}
              {hasAlert && !isActive && (
                <div style={{
                  position: 'absolute',
                  top: 1,
                  insetInlineEnd: 1,
                  minWidth: 8,
                  height: 8,
                  borderRadius: 999,
                  background: alertColor,
                  color: '#000',
                  fontSize: 5,
                  fontWeight: 900,
                  fontFamily: "var(--font-mono)",
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 0 6px ${alertColor}80`,
                  animation: 'tab-alert-pulse 2s ease-in-out infinite',
                  zIndex: 2,
                }}>
                  {alertCount > 9 ? '9+' : alertCount}
                </div>
              )}

              <Icon size={8} color={isActive ? t.accent : hasAlert ? alertColor : '#93A7C3'} />
              <span style={{ fontSize: 6, fontWeight: isActive ? 800 : 600, lineHeight: 1, color: isActive ? T.text : hasAlert ? alertColor : '#AEC0D6', whiteSpace: 'nowrap' }}>{t.label}</span>
            </button>
          )
        })}
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          padding: 4,
          display: 'flex',
          flexDirection: 'column',
          background: '#0B0E14',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 0,
            height: '100%',
            overflowY: 'auto',
            borderRadius: 10,
            border: `1px solid rgba(0,212,255,0.10)`,
            background: 'linear-gradient(180deg, rgba(14,20,30,0.98), rgba(8,13,20,0.98))',
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.035), 0 18px 40px rgba(0,0,0,0.26)`,
          }}
          className="custom-scrollbar"
        >
        <div style={{ display: active === 'lazic' ? 'contents' : 'none' }}><LazicPanel /></div>
        <div style={{ display: active === 'executor' ? 'contents' : 'none' }}><SmartExecutorPanel /></div>
        <div style={{ display: active === 'strategic' ? 'contents' : 'none' }}><StrategicCouncilPanel /></div>
        <div style={{ display: active === 'council' ? 'contents' : 'none' }}><AICouncilPanel /></div>
        <div style={{ display: active === 'scanner' ? 'contents' : 'none' }}><ScannerMini /></div>
        <div style={{ display: active === 'trader' ? 'contents' : 'none' }}><AgentControlMini /></div>
        </div>
      </div>
    </div>
  )
}

