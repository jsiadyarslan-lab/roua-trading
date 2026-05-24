'use client'

import { ScanSearch, LayoutGrid, Map, Brain, Clock, BarChart3, Filter, RefreshCw } from 'lucide-react'
import { useScannerContext } from './ScannerProvider'
import { useTranslations } from 'next-intl'

const T = {
  bg: '#0B0E14', bg2: '#1A1D29', card: '#1A1D29', surface: '#1A1D29',
  cyan: '#00D4FF', green: '#00FFA3', text: '#F0F2F5', text2: '#8B92A8',
  text3: '#8B92A8', border: 'rgba(255,255,255,0.06)', border2: 'rgba(0,212,255,0.16)',
}

const NAV_KEYS = ['scanner', 'heatmap', 'patterns', 'multitf', 'overview', 'screener'] as const
const NAV_ICONS = [LayoutGrid, Map, Brain, Clock, BarChart3, Filter] as const

export function ScannerSidebar() {
  const { activeTab, setActiveTab, countdown, lastUpdate, refresh } = useScannerContext()
  const t = useTranslations('dashboard.scannerSidebar')
  const mins = Math.floor(countdown / 60)
  const secs = countdown % 60

  const formatTime = (d: Date) => {
    const h = d.getHours().toString().padStart(2, '0')
    const m = d.getMinutes().toString().padStart(2, '0')
    return `${h}:${m}`
  }

  const navItems = NAV_KEYS.map((key, i) => {
    const Icon = NAV_ICONS[i]
    return {
      key,
      icon: <Icon size={16} />,
      label: t(key === 'scanner' ? 'scanTable' : key === 'multitf' ? 'multiTimeframe' : key),
    }
  })

  return (
    <div style={{
      width: 200, minWidth: 200, height: '100%', background: T.card,
      borderInlineStart: `1px solid ${T.border}`, direction: 'inherit',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 14px 12px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <ScanSearch size={20} color={T.cyan} />
          <span style={{ fontSize: 13, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
            {t('advancedScanner')}
          </span>
        </div>
        <p style={{ fontSize: 9, color: T.text3, lineHeight: 1.5, fontFamily: "'Cairo', sans-serif", margin: 0 }}>
          {t('subtitle')}
        </p>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 0' }}>
        {navItems.map(item => {
          const active = activeTab === item.key
          return (
            <button
              key={item.key} onClick={() => setActiveTab(item.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 14px', border: 'none', cursor: 'pointer',
                background: active ? `${T.cyan}08` : 'transparent',
                borderInlineEnd: active ? `2px solid ${T.cyan}` : '2px solid transparent',
                color: active ? T.cyan : T.text3,
                transition: 'all 0.2s', direction: 'inherit', textAlign: 'right',
              }}
            >
              <span style={{ display: 'flex', color: active ? T.cyan : T.text3 }}>{item.icon}</span>
              <span style={{
                fontSize: 11, fontWeight: active ? 700 : 600,
                fontFamily: "'Cairo', sans-serif",
              }}>
                {item.label}
              </span>
            </button>
          )
        })}
      </nav>

      {/* Status */}
      <div style={{
        padding: '12px 14px', borderTop: `1px solid ${T.border}`,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {/* Live indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: T.green,
              boxShadow: `0 0 6px ${T.green}60`,
            }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: T.green, fontFamily: "'Cairo', sans-serif" }}>
              {t('live')}
            </span>
          </div>
          <span style={{
            fontSize: 10, fontWeight: 700, color: T.text2,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {mins}:{secs.toString().padStart(2, '0')}
          </span>
        </div>

        {/* Refresh */}
        <button
          onClick={refresh}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '6px 0', borderRadius: 6, border: `0.5px solid ${T.border}`,
            background: T.surface, color: T.text2, cursor: 'pointer', fontSize: 10,
            fontFamily: "'Cairo', sans-serif", fontWeight: 700, transition: 'all 0.2s',
          }}
        >
          <RefreshCw size={12} /> {t('refreshNow')}
        </button>

        {/* Last update */}
        {lastUpdate && (
          <span style={{ fontSize: 8, color: T.text3, fontFamily: "'Cairo', sans-serif", textAlign: 'center' }}>
            {t('lastUpdate')} {formatTime(lastUpdate)}
          </span>
        )}

        {/* Badge */}
        <span style={{
          display: 'inline-block', textAlign: 'center', padding: '3px 8px',
          borderRadius: 4, fontSize: 8, fontWeight: 800,
          fontFamily: "'Cairo', sans-serif", color: T.cyan,
          background: `${T.cyan}10`, border: `0.5px solid ${T.border2}`,
        }}>
          {t('techIndicators')}
        </span>
      </div>
    </div>
  )
}
