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

import { useScopedStyle } from '@/hooks/useScopedStyle'

// ── Design Tokens (canonical + local extensions) ──
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
    <div className="scanner-page-root" style={{
      width: '100%', height: 'calc(100dvh - 60px)',
      background: '#0B0E14', padding: '8px 16px', boxSizing: 'border-box',
      direction: 'inherit', fontFamily: "var(--font-ar)",
      display: 'flex', gap: 12, overflow: 'hidden',
      paddingTop: isMobile ? '48px' : '8px',
    }}>
      {/* Scoped styles via useScopedStyle */}{/* Mobile sidebar toggle */}
      {isMobile && (
        <button
          onClick={() => setSidebarVisible(!sidebarVisible)}
          style={{
            position: 'fixed', top: 12, right: 12, zIndex: 60,
            width: 36, height: 36, borderRadius: 'var(--radius-md)',
            background: '#151A22', border: `1px solid ${'#2A313C'}`,
            color: '#F0F2F5', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: 'var(--text-base)',
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
        flex: 1, background: '#151A22', border: `0.5px solid ${'#2A313C'}`,
        borderRadius: 'var(--radius-md)', overflow: 'hidden', display: 'flex', flexDirection: 'column'
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
  useScopedStyle(`@media (max-width: 767px) {
          .scanner-page-root { height: 100% !important; }
        }
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
          .scanner-sidebar-wrapper.scanner-sidebar-visible { display: flex !important; position: fixed; top: 0; inset-inline-end: 0; bottom: 0; z-index: 50; box-shadow: -4px 0 20px rgba(0,0,0,0.5); }
        }`)

  return (
    <ScannerProvider>
      <ScannerContent />
    </ScannerProvider>
  )
}
