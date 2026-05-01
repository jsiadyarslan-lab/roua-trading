'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { ScannerProvider, useScannerContext } from '@/components/scanner/ScannerProvider'
import { ScannerSidebar } from '@/components/scanner/ScannerSidebar'
import { ScannerToolbar } from '@/components/scanner/ScannerToolbar'

// Dynamic imports for heavy tab components (lazy-loaded per tab)
const ScannerTable = dynamic(() => import('@/components/scanner/tabs/ScannerTable').then(m => ({ default: m.ScannerTable })), { ssr: false })
const HeatmapGrid = dynamic(() => import('@/components/scanner/tabs/HeatmapGrid').then(m => ({ default: m.HeatmapGrid })), { ssr: false })
const PatternsView = dynamic(() => import('@/components/scanner/tabs/PatternsView').then(m => ({ default: m.PatternsView })), { ssr: false })
const MultiTfPanel = dynamic(() => import('@/components/scanner/tabs/MultiTfPanel').then(m => ({ default: m.MultiTfPanel })), { ssr: false })
const MarketOverview = dynamic(() => import('@/components/scanner/tabs/MarketOverview').then(m => ({ default: m.MarketOverview })), { ssr: false })
const ScreenerTab = dynamic(() => import('@/components/scanner/tabs/ScreenerTab').then(m => ({ default: m.ScreenerTab })), { ssr: false })
const DeepAnalysisModal = dynamic(() => import('@/components/scanner/modals/DeepAnalysisModal').then(m => ({ default: m.DeepAnalysisModal })), { ssr: false })

// ── Design Tokens ──
const T = {
  bg:      '#04050C',
  bg2:     '#0D1117',
  card:    '#08090F',
  cardHover:'#0B0F19',
  card2:   '#0B0E14',
  surface: '#1A1D29',
  blue:    '#0A84FF',
  cyan:    '#00D4FF',
  green:   '#00FFA3',
  greenDim:'#00CC82',
  red:     '#FF4757',
  redDim:  '#FF3344',
  amber:   '#FFB800',
  purple:  '#B388FF',
  text:    '#F0F2F5',
  text2:   '#94a3b8',
  text3:   '#8B92A8',
  border:  'rgba(255,255,255,0.06)',
  border2: 'rgba(0,212,255,0.16)',
}

// ── Main Content Router ──
function ScannerContent() {
  const { activeTab, selectedSymbol, setSelectedSymbol } = useScannerContext()
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const isMobile = useMediaQuery('(max-width: 767px)')

  // Auto-hide sidebar on mobile
  useEffect(() => {
    if (isMobile) setSidebarVisible(false)
    else setSidebarVisible(true)
  }, [isMobile])

  const renderTab = () => {
    switch (activeTab) {
      case 'scanner':
        return (
          <>
            <ScannerToolbar />
            <ScannerTable />
          </>
        )
      case 'heatmap':
        return <HeatmapGrid />
      case 'patterns':
        return <PatternsView />
      case 'timeframes':
        return <MultiTfPanel />
      case 'overview':
        return <MarketOverview />
      case 'screener':
        return <ScreenerTab />
      default:
        return (
          <>
            <ScannerToolbar />
            <ScannerTable />
          </>
        )
    }
  }

  return (
    <div style={{
      width: '100%', height: 'calc(100dvh - 60px)',
      background: T.bg, padding: '8px 16px', boxSizing: 'border-box',
      direction: 'rtl', fontFamily: "'Cairo', sans-serif",
      display: 'flex', gap: 12, overflow: 'hidden',
      paddingTop: isMobile ? '48px' : '8px',
    }}>
      <style>{`
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #0A84FF22; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #0A84FF44; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100%{ opacity:1; } 50%{ opacity:0.5; } }
        .scanner-sidebar-wrapper { display: flex; }
        .scanner-table-scroll { -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
        @media (max-width: 767px) {
          .scanner-sidebar-wrapper { display: none !important; }
          .scanner-sidebar-wrapper.scanner-sidebar-visible { display: flex !important; position: fixed; top: 0; right: 0; bottom: 0; z-index: 50; box-shadow: -4px 0 20px rgba(0,0,0,0.5); }
        }
      `}</style>

      {/* Mobile sidebar toggle */}
      {isMobile && (
        <button
          onClick={() => setSidebarVisible(!sidebarVisible)}
          style={{
            position: 'fixed', top: 12, right: 12, zIndex: 60,
            width: 36, height: 36, borderRadius: 8,
            background: T.card, border: `1px solid ${T.border}`,
            color: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: 14,
          }}
        >
          ☰
        </button>
      )}
      {isMobile && sidebarVisible && (
        <div
          onClick={() => setSidebarVisible(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }}
        />
      )}

      {/* ── Sidebar ── */}
      <div className={`scanner-sidebar-wrapper${sidebarVisible ? ' scanner-sidebar-visible' : ''}`}>
        <ScannerSidebar />
      </div>

      {/* ── Main Content ── */}
      <div style={{
        flex: 1, background: T.card, border: `0.5px solid ${T.border}`,
        borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column'
      }}>
        {renderTab()}
      </div>

      {/* ── Deep Analysis Modal ── */}
      {selectedSymbol && (
        <DeepAnalysisModal />
      )}
    </div>
  )
}

// ── Page Export ──
export default function AdvancedScannerPage() {
  return (
    <ScannerProvider>
      <ScannerContent />
    </ScannerProvider>
  )
}
