'use client'

import { useState } from 'react'
import { Bot, Brain, ScanSearch, Sparkles, Waves } from 'lucide-react'
import { BotMini } from '@/components/dashboard/BotMini'
import { ScannerMini } from '@/components/dashboard/ScannerMini'
import { BotCommandCenter } from '@/components/dashboard/BotCommandCenter'
import { AICouncilPanel } from '@/components/dashboard/AICouncilPanel'
import { MultiTfScannerMini } from '@/components/dashboard/MultiTfScannerMini'
import { useDecisionFlow } from '@/hooks/useDecisionFlow'
import { useTabAlertStore, type TabId } from '@/hooks/useTabAlertStore'

const T = {
  bg: '#0F1113',
  bg2: '#111214',
  bg3: '#16181A',
  card: '#111214',
  border: 'rgba(0, 229, 255, 0.08)',
  border2: 'rgba(0, 229, 255, 0.15)',
  primary: '#0A84FF',
  accent: '#00E5FF',
  success: '#00C853',
  danger: '#FF3B30',
  amber: '#FFB800',
  purple: '#B388FF',
  cyan: '#00E5FF',
  green: '#00C853',
  red: '#FF3B30',
  text: '#E6EBF5',
  text2: '#8090A8',
  text3: '#A0AFC3',
}

export function RightPanelLayout({ quotes: _quotes }: { quotes: any }) {
  const [active, setActive] = useState('bot')
  const { selectedSymbol, scanner, council, engineState } = useDecisionFlow()
  const { alerts, clearAlert } = useTabAlertStore()

  // Clear alerts when user opens a tab
  const handleTabClick = (tabId: string) => {
    setActive(tabId)
    clearAlert(tabId as TabId)
  }

  const TABS = [
    { id: 'bot', label: 'البوت', accent: T.cyan, icon: Bot, subtitle: 'التنفيذ والإدارة' },
    { id: 'council', label: 'المجلس', accent: T.accent, icon: Brain, subtitle: 'الترجيح والحكم' },
    { id: 'scanner', label: 'السكانر', accent: T.amber, icon: ScanSearch, subtitle: 'اكتشاف الفرص' },
    { id: 'multi-tf', label: 'متعدد الأطر', accent: T.purple, icon: Waves, subtitle: 'النظام والانحياز' },
    { id: 'signals', label: 'إشارات', accent: T.green, icon: Sparkles, subtitle: 'التحويل للتنفيذ' },
  ]
  const activeTab = TABS.find((tab) => tab.id === active) || TABS[0]
  const headlineMap = {
    bot: engineState === 'armed' ? 'المحرك جاهز' : engineState === 'scanning' ? 'المحرك يمسح السوق' : 'المحرك تحت السيطرة',
    council: council?.recommendation ? `المجلس يميل إلى ${council.recommendation}` : 'المجلس يزن الأدلة',
    scanner: scanner ? `${scanner.pair} تحت المجهر` : 'السكانر يفتش عن فرصة',
    'multi-tf': 'انحياز متعدد الأطر',
    signals: 'الإشارات الجاهزة للتنفيذ',
  } as const

  const headline = headlineMap[active as keyof typeof headlineMap] ?? headlineMap.bot

  return (
    <div
      className="dash-col"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        maxHeight: '100%',
        background: 'linear-gradient(180deg, rgba(8,16,24,0.98), rgba(11,17,24,0.98))',
        border: `1px solid rgba(0, 229, 255, 0.16)`,
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 16px 34px rgba(0,0,0,0.22)',
      }}
    >
      <div
        style={{
          padding: '10px 11px 9px',
          borderBottom: `1px solid rgba(0, 229, 255, 0.12)`,
          background: `linear-gradient(90deg, ${activeTab.accent}18, rgba(255,255,255,0.01))`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: activeTab.accent,
                  boxShadow: `0 0 14px ${activeTab.accent}88`,
                }}
              />
              <div style={{ fontSize: 12, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
                مركز القرار التشغيلي
              </div>
            </div>
            <div style={{ marginTop: 4, fontSize: 9, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>
              {headline}
            </div>
          </div>
          <div style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
            <div
              style={{
                fontSize: 9,
                color: activeTab.accent,
                background: `${activeTab.accent}14`,
                border: `1px solid ${activeTab.accent}28`,
                borderRadius: 999,
                padding: '4px 8px',
                fontWeight: 800,
                fontFamily: "'JetBrains Mono', monospace",
                whiteSpace: 'nowrap',
              }}
            >
              {activeTab.label}
            </div>
            <div style={{ fontSize: 8, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
              {selectedSymbol}
            </div>
          </div>
        </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 6,
          padding: '8px',
          flexShrink: 0,
          background: 'rgba(255,255,255,0.03)',
          borderBottom: `1px solid rgba(0, 229, 255, 0.10)`,
        }}
      >
        {TABS.map(t => {
          const isActive = active === t.id
          const Icon = t.icon
          const alert = alerts[t.id as TabId]
          const hasAlert = alert !== null && alert.count > 0
          const alertCount = alert?.count || 0
          const alertColor = alert?.color || t.accent
          const alertLabel = alert?.lastLabel || ''

          return (
            <button
              key={t.id}
              onClick={() => handleTabClick(t.id)}
              style={{
                minWidth: 0,
                minHeight: 30,
                padding: '4px 4px',
                background: isActive ? `${t.accent}20` : hasAlert ? `${alertColor}08` : 'rgba(255,255,255,0.045)',
                border: `1px solid ${isActive ? `${t.accent}70` : hasAlert ? `${alertColor}50` : 'rgba(255,255,255,0.10)'}`,
                borderRadius: 10,
                color: isActive ? T.text : T.text3,
                cursor: 'pointer',
                fontFamily: "'Cairo', sans-serif",
                transition: '0.18s ease',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                boxShadow: isActive
                  ? `0 0 0 1px ${t.accent}24 inset, 0 0 18px ${t.accent}18`
                  : hasAlert
                    ? `0 0 0 1px ${alertColor}15 inset, 0 0 12px ${alertColor}10`
                    : 'inset 0 1px 0 rgba(255,255,255,0.02)',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {/* Alert badge — pulsing dot with count */}
              {hasAlert && !isActive && (
                <div style={{
                  position: 'absolute',
                  top: 2,
                  left: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 12,
                  height: 12,
                  borderRadius: 6,
                  background: alertColor,
                  color: '#000',
                  fontSize: 7,
                  fontWeight: 900,
                  fontFamily: 'monospace',
                  padding: '0 3px',
                  boxShadow: `0 0 8px ${alertColor}80`,
                  animation: 'tab-alert-pulse 2s ease-in-out infinite',
                  zIndex: 2,
                }}>
                  {alertCount > 9 ? '9+' : alertCount}
                </div>
              )}

              {/* Alert label flash — shows latest alert briefly */}
              {hasAlert && !isActive && alertLabel && (
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: `${alertColor}25`,
                  color: alertColor,
                  fontSize: 5.5,
                  fontWeight: 700,
                  fontFamily: "'Cairo', sans-serif",
                  textAlign: 'center',
                  padding: '1px 2px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {alertLabel}
                </div>
              )}

              <Icon size={10} color={isActive ? t.accent : hasAlert ? alertColor : '#93A7C3'} />
              <span style={{ fontSize: 7, fontWeight: isActive ? 800 : hasAlert ? 800 : 700, lineHeight: 1, color: isActive ? T.text : hasAlert ? alertColor : '#AEC0D6' }}>{t.label}</span>
              <span style={{ fontSize: 6, color: isActive ? T.text3 : '#708299', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1 }}>
                {t.subtitle}
              </span>
            </button>
          )
        })}
      </div>

      <style>{`
        @keyframes tab-alert-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.8; }
        }
      `}</style>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          padding: 6,
          display: 'flex',
          flexDirection: 'column',
          background: '#071019',
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 0,
            height: '100%',
            overflowY: 'auto',
            borderRadius: 16,
            border: `1px solid rgba(255,255,255,0.10)`,
            background: 'linear-gradient(180deg, rgba(14,20,30,0.98), rgba(8,13,20,0.98))',
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.035), 0 18px 40px rgba(0,0,0,0.26)`,
          }}
          className="custom-scrollbar"
        >
        {active === 'bot' && <BotMini />}
        {active === 'council' && <AICouncilPanel />}
        {active === 'scanner' && <ScannerMini />}
        {active === 'signals' && <BotCommandCenter />}
        {active === 'multi-tf' && <MultiTfScannerMini />}
        </div>
      </div>
    </div>
  )
}
