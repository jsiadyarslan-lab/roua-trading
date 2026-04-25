'use client'

import { useState } from 'react'
import { Bot, Brain, ScanSearch, Sparkles, Waves } from 'lucide-react'
import { BotMini } from '@/components/dashboard/BotMini'
import { ScannerMini } from '@/components/dashboard/ScannerMini'
import { BotCommandCenter } from '@/components/dashboard/BotCommandCenter'
import { AICouncilPanel } from '@/components/dashboard/AICouncilPanel'
import { MultiTfScannerMini } from '@/components/dashboard/MultiTfScannerMini'
import { useDecisionFlow } from '@/hooks/useDecisionFlow'

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
  const { selectedSymbol, scanner, council, engineState, narrator, loading } = useDecisionFlow()
  const TABS = [
    { id: 'bot', label: 'البوت', accent: T.cyan, icon: Bot, subtitle: 'التنفيذ والإدارة' },
    { id: 'council', label: 'المجلس', accent: T.accent, icon: Brain, subtitle: 'الترجيح والحكم' },
    { id: 'scanner', label: 'السكانر', accent: T.amber, icon: ScanSearch, subtitle: 'اكتشاف الفرص' },
    { id: 'multi-tf', label: 'متعدد الأطر', accent: T.purple, icon: Waves, subtitle: 'النظام والانحياز' },
    { id: 'signals', label: 'إشارات', accent: T.green, icon: Sparkles, subtitle: 'التحويل للتنفيذ' },
  ]
  const activeTab = TABS.find((tab) => tab.id === active) || TABS[0]
  const spotlightMap = {
    bot: {
      headline: engineState === 'armed' ? 'المحرك جاهز' : engineState === 'scanning' ? 'المحرك يمسح السوق' : 'المحرك تحت السيطرة',
      detail: scanner?.entryBias || '—',
      statLabel: 'الحالة',
      statValue: engineState.toUpperCase(),
    },
    council: {
      headline: council?.recommendation ? `المجلس يميل إلى ${council.recommendation}` : 'المجلس يزن الأدلة',
      detail: council?.conflictExplanation || council?.masterStrategy || 'قراءة إجماعية للأصل الحالي مع ترجيح المخاطر.',
      statLabel: 'الإجماع',
      statValue: council ? `${council.consensusScore}%` : '—',
    },
    scanner: {
      headline: scanner ? `${scanner.pair} تحت المجهر` : 'السكانر يفتش عن فرصة',
      detail: scanner?.reasons?.[0] || 'يرتب الفرص حسب الزخم والاتجاه والانحياز التنفيذي.',
      statLabel: 'القوة',
      statValue: scanner ? `${scanner.strength}%` : '—',
    },
    'multi-tf': {
      headline: 'انحياز متعدد الأطر',
      detail: 'اقرأ من اليومي حتى 15M قبل أن تفكر في الزر.',
      statLabel: 'الرمز',
      statValue: selectedSymbol,
    },
    signals: {
      headline: 'الإشارات الجاهزة للتنفيذ',
      detail: narrator?.nextTrigger || 'صف الإشارات الآن يربط الرصد بالتنفيذ الورقي مباشرة.',
      statLabel: 'المصدر',
      statValue: scanner?.source || 'unified',
    },
  } as const

  const spotlight = spotlightMap[active as keyof typeof spotlightMap] ?? spotlightMap.bot

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
              {spotlight.headline}
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
          padding: '9px 11px',
          borderBottom: `1px solid rgba(0, 229, 255, 0.10)`,
          background: 'rgba(255,255,255,0.03)',
          display: 'grid',
          gap: 8,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 8,
          }}
        >
          <div
            style={{
              minWidth: 0,
              borderRadius: 12,
              border: `1px solid rgba(255,255,255,0.10)`,
              background: 'rgba(0,0,0,0.18)',
              padding: '7px 8px',
            }}
          >
            <div style={{ fontSize: 8, color: T.text3, marginBottom: 4 }}>{spotlight.statLabel}</div>
            <div style={{ fontSize: 11, color: activeTab.accent, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {spotlight.statValue}
            </div>
          </div>
          <div
            style={{
              borderRadius: 12,
              border: `1px solid rgba(255,255,255,0.10)`,
              background: 'rgba(0,0,0,0.18)',
              padding: '7px 8px',
              minWidth: 76,
            }}
          >
            <div style={{ fontSize: 8, color: T.text3, marginBottom: 4 }}>التركيز</div>
            <div style={{ fontSize: 11, color: T.text, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{selectedSymbol}</div>
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
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              style={{
                minWidth: 0,
                minHeight: 30,
                padding: '4px 4px',
                background: isActive ? `${t.accent}20` : 'rgba(255,255,255,0.045)',
                border: `1px solid ${isActive ? `${t.accent}70` : 'rgba(255,255,255,0.10)'}`,
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
                boxShadow: isActive ? `0 0 0 1px ${t.accent}24 inset, 0 0 18px ${t.accent}18` : 'inset 0 1px 0 rgba(255,255,255,0.02)',
                overflow: 'hidden',
              }}
            >
              <Icon size={10} color={isActive ? t.accent : '#93A7C3'} />
              <span style={{ fontSize: 7, fontWeight: isActive ? 800 : 700, lineHeight: 1, color: isActive ? T.text : '#AEC0D6' }}>{t.label}</span>
              <span style={{ fontSize: 6, color: isActive ? T.text3 : '#708299', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1 }}>
                {t.subtitle}
              </span>
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
          background: '#071019',
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            borderRadius: 16,
            border: `1px solid rgba(255,255,255,0.10)`,
            background: 'linear-gradient(180deg, rgba(14,20,30,0.98), rgba(8,13,20,0.98))',
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.035), 0 18px 40px rgba(0,0,0,0.26)`,
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
    </div>
  )
}
