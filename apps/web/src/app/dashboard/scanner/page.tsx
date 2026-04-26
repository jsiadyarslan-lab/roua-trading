'use client'

import { ScannerProvider, useScannerContext } from '@/components/scanner/ScannerProvider'
import { ScannerSidebar } from '@/components/scanner/ScannerSidebar'
import { ScannerToolbar } from '@/components/scanner/ScannerToolbar'
import { ScannerTable } from '@/components/scanner/tabs/ScannerTable'
import { HeatmapGrid } from '@/components/scanner/tabs/HeatmapGrid'
import { PatternsView } from '@/components/scanner/tabs/PatternsView'
import { MultiTfPanel } from '@/components/scanner/tabs/MultiTfPanel'
import { MarketOverview } from '@/components/scanner/tabs/MarketOverview'
import { DeepAnalysisModal } from '@/components/scanner/modals/DeepAnalysisModal'

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
      width: '100%', height: 'calc(100vh - 60px)',
      background: T.bg, padding: '8px 16px', boxSizing: 'border-box',
      direction: 'rtl', fontFamily: "'Cairo', sans-serif",
      display: 'flex', gap: 12, overflow: 'hidden'
    }}>
      <style>{`
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #0A84FF22; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #0A84FF44; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100%{ opacity:1; } 50%{ opacity:0.5; } }
      `}</style>

      {/* ── Sidebar ── */}
      <ScannerSidebar />

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
