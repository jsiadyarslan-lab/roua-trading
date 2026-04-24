'use client'

import { useState } from 'react'
import { Bot, Brain, ScanSearch, Sparkles, Waves } from 'lucide-react'
import { BotMini } from '@/components/dashboard/BotMini'
import { ScannerMini } from '@/components/dashboard/ScannerMini'
import { BotCommandCenter } from '@/components/dashboard/BotCommandCenter'
import { AICouncilPanel } from '@/components/dashboard/AICouncilPanel'
import { MultiTfScannerMini } from '@/components/dashboard/MultiTfScannerMini'
import { SmartSetupBar } from '@/components/dashboard/SmartSetupBar'

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

export function RightPanelLayout({ quotes }: { quotes: any }) {
  const [active, setActive] = useState('bot')
  const TABS = [
    { id: 'bot', label: 'البوت', accent: T.cyan, icon: Bot, subtitle: 'التنفيذ والإدارة' },
    { id: 'council', label: 'المجلس', accent: T.accent, icon: Brain, subtitle: 'الترجيح والحكم' },
    { id: 'scanner', label: 'السكانر', accent: T.amber, icon: ScanSearch, subtitle: 'اكتشاف الفرص' },
    { id: 'multi-tf', label: 'متعدد الأطر', accent: T.purple, icon: Waves, subtitle: 'النظام والانحياز' },
    { id: 'signals', label: 'إشارات', accent: T.green, icon: Sparkles, subtitle: 'التحويل للتنفيذ' },
  ]
  const activeTab = TABS.find((tab) => tab.id === active) || TABS[0]

  return (
    <div
      className="dash-col"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        maxHeight: '100%',
        background: 'linear-gradient(180deg, rgba(0,229,255,0.05), rgba(255,255,255,0.01))',
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: 10, borderBottom: `1px solid ${T.border}`, background: 'rgba(255,255,255,0.02)' }}>
        <SmartSetupBar compact />
      </div>

      <div
        style={{
          padding: '10px 12px 8px',
          borderBottom: `1px solid ${T.border}`,
          background: 'linear-gradient(90deg, rgba(0,229,255,0.08), transparent)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
            مركز القرار التشغيلي
          </div>
          <div style={{ fontSize: 9, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>
            {activeTab.subtitle}
          </div>
        </div>
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
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '10px 10px 8px',
          overflowX: 'auto',
          flexShrink: 0,
          background: 'rgba(255,255,255,0.02)',
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        {TABS.map(t => {
          const isActive = active === t.id
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              style={{
                minWidth: 88,
                padding: '10px 10px 9px',
                background: isActive ? `${t.accent}12` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isActive ? `${t.accent}35` : T.border}`,
                borderRadius: 12,
                color: isActive ? T.text : T.text3,
                cursor: 'pointer',
                fontFamily: "'Cairo', sans-serif",
                transition: '0.18s ease',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                boxShadow: isActive ? `0 0 0 1px ${t.accent}10 inset` : 'none',
              }}
            >
              <Icon size={14} color={isActive ? t.accent : T.text3} />
              <span style={{ fontSize: 10, fontWeight: isActive ? 800 : 700 }}>{t.label}</span>
            </button>
          )
        })}
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          background: T.bg,
        }}
      >
        {active === 'bot' && (
          <div
            className="custom-scrollbar"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 14,
              overflowX: 'hidden',
            }}
          >
            <BotMini />
          </div>
        )}

        {active === 'council' && (
          <div
            className="custom-scrollbar"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 14,
              overflowX: 'hidden',
            }}
          >
            <AICouncilPanel />
          </div>
        )}

        {active === 'scanner' && (
          <div
            className="custom-scrollbar"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 14,
              overflowX: 'hidden',
            }}
          >
            <ScannerMini />
          </div>
        )}

        {active === 'signals' && (
          <div
            className="custom-scrollbar"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 14,
              overflowX: 'hidden',
            }}
          >
            <BotCommandCenter />
          </div>
        )}

        {active === 'multi-tf' && (
          <div
            className="custom-scrollbar"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 14,
              overflowX: 'hidden',
            }}
          >
            <MultiTfScannerMini />
          </div>
        )}
      </div>
    </div>
  )
}
