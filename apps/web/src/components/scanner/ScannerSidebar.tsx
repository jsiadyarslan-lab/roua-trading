'use client'

import { ScanSearch, LayoutGrid, Map, Brain, Clock, BarChart3, Filter, RefreshCw } from 'lucide-react'
import { useScannerContext } from './ScannerProvider'
import { useTranslations } from 'next-intl'

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

  const NAV_LABEL_KEYS: Record<string, string> = {
    scanner: 'scanTable',
    heatmap: 'heatmap',
    patterns: 'patterns',
    multitf: 'multiTimeframe',
    overview: 'overview',
    screener: 'customScreener',
  }

  const navItems = NAV_KEYS.map((key, i) => {
    const Icon = NAV_ICONS[i]
    return {
      key,
      icon: <Icon size={16} />,
      label: t(NAV_LABEL_KEYS[key] || key),
    }
  })

  return (
    <div style={{
      width: 200, minWidth: 200, height: '100%', background: '#151A22',
      borderInlineStart: `1px solid ${'#2A313C'}`, direction: 'inherit',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 14px 12px', borderBottom: `1px solid ${'#2A313C'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <ScanSearch size={20} color={'#00D4FF'} />
          <span style={{ fontSize: 13, fontWeight: 800, color: '#F0F2F5', fontFamily: "var(--font-ar)" }}>
            {t('advancedScanner')}
          </span>
        </div>
        <p style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.5, fontFamily: "var(--font-ar)", margin: 0 }}>
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
                background: active ? `${'#00D4FF'}08` : 'transparent',
                borderInlineEnd: active ? `2px solid ${'#00D4FF'}` : '2px solid transparent',
                color: active ? '#00D4FF' : '#6B7280',
                transition: 'all 0.2s', direction: 'inherit', textAlign: 'right',
              }}
            >
              <span style={{ display: 'flex', color: active ? '#00D4FF' : '#6B7280' }}>{item.icon}</span>
              <span style={{
                fontSize: 11, fontWeight: active ? 700 : 600,
                fontFamily: "var(--font-ar)",
              }}>
                {item.label}
              </span>
            </button>
          )
        })}
      </nav>

      {/* Status */}
      <div style={{
        padding: '12px 14px', borderTop: `1px solid ${'#2A313C'}`,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {/* Live indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: '#00FFA3',
              boxShadow: `0 0 6px ${'#00FFA3'}60`,
            }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#00FFA3', fontFamily: "var(--font-ar)" }}>
              {t('live')}
            </span>
          </div>
          <span style={{
            fontSize: 11, fontWeight: 700, color: '#9CA3B5',
            fontFamily: "var(--font-mono)",
          }}>
            {mins}:{secs.toString().padStart(2, '0')}
          </span>
        </div>

        {/* Refresh */}
        <button
          onClick={refresh}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '6px 0', borderRadius: 'var(--radius-sm)', border: `0.5px solid ${'#2A313C'}`,
            background: '#151A22', color: '#9CA3B5', cursor: 'pointer', fontSize: 11,
            fontFamily: "var(--font-ar)", fontWeight: 700, transition: 'all 0.2s',
          }}
        >
          <RefreshCw size={12} /> {t('refreshNow')}
        </button>

        {/* Last update */}
        {lastUpdate && (
          <span style={{ fontSize: 11, color: '#6B7280', fontFamily: "var(--font-ar)", textAlign: 'center' }}>
            {t('lastUpdate')} {formatTime(lastUpdate)}
          </span>
        )}

        {/* Badge */}
        <span style={{
          display: 'inline-block', textAlign: 'center', padding: '3px 8px',
          borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 800,
          fontFamily: "var(--font-ar)", color: '#00D4FF',
          background: `${'#00D4FF'}10`, border: `0.5px solid ${'#3A4150'}`,
        }}>
          {t('techIndicators')}
        </span>
      </div>
    </div>
  )
}
