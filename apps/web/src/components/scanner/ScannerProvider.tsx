'use client'

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { useScannerData } from './hooks/useScannerData'
import { useScannerFilters } from './hooks/useScannerFilters'
import { useBrowserNotifications } from './hooks/useBrowserNotifications'
import type { SortKey, SortDir, CategoryFilter, DirectionFilter, SignalFilter } from './hooks/useScannerFilters'
import type { ScannerItem, HeatmapItem, ScannerOverview } from './hooks/useScannerData'

interface ScannerContextValue {
  scanData: ScannerItem[]
  heatmapData: HeatmapItem[]
  overview: ScannerOverview | null
  filteredData: ScannerItem[]
  loading: boolean
  lastUpdate: Date | null
  countdown: number
  error: string | null
  refresh: () => Promise<void>
  selectedSymbol: string | null
  setSelectedSymbol: (s: string | null) => void
  search: string
  setSearch: (v: string) => void
  category: CategoryFilter
  setCategory: (v: CategoryFilter) => void
  timeframe: string
  setTimeframe: (v: string) => void
  sortKey: SortKey
  setSortKey: (v: SortKey) => void
  sortDir: SortDir
  setSortDir: (v: SortDir) => void
  directionFilter: DirectionFilter
  setDirectionFilter: (v: DirectionFilter) => void
  signalFilter: SignalFilter
  setSignalFilter: (v: SignalFilter) => void
  toggleSort: (key: SortKey) => void
  activeTab: string
  setActiveTab: (tab: string) => void
  handleBellClick: (symbol: string) => void
  hasAlertForSymbol: (symbol: string) => boolean
}

const ScannerContext = createContext<ScannerContextValue | null>(null)

export function useScannerContext() {
  const ctx = useContext(ScannerContext)
  if (!ctx) throw new Error('useScannerContext must be inside ScannerProvider')
  return ctx
}

export function ScannerProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState('scanner')
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)

  const {
    scanData, heatmapData, overview, loading, lastUpdate, countdown, refresh, error,
  } = useScannerData({})

  const filters = useScannerFilters(scanData)

  const notifications = useBrowserNotifications()

  const handleBellClick = useCallback((symbol: string) => {
    // Request notification permission if not yet granted
    if (notifications.permission !== 'granted') {
      notifications.requestPermission()
    }
    // Add a default RSI alert for the symbol
    notifications.addAlert({
      symbol,
      type: 'RSI_OVERBOUGHT',
      value: 70,
      label: `RSI Overbought Alert - ${symbol}`,
      labelAr: `تنبيه تشبع شرائي RSI - ${symbol}`,
    })
  }, [notifications])

  // SSE fallback: try EventSource, fall back to polling (already handled by useScannerData)
  const sseRef = useRef<EventSource | null>(null)
  useEffect(() => {
    try {
      const es = new EventSource('/api/scanner/feed')
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data)
          if (d?.type === 'scan_update') refresh()
        } catch { /* ignore parse errors */ }
      }
      es.onerror = () => { es.close() }
      sseRef.current = es
    } catch { /* SSE not supported, polling is fallback */ }
    return () => { sseRef.current?.close() }
  }, [refresh])

  const value: ScannerContextValue = {
    scanData, heatmapData, overview, loading, lastUpdate, countdown, refresh, error,
    filteredData: filters.filteredData,
    selectedSymbol, setSelectedSymbol,
    search: filters.search, setSearch: filters.setSearch,
    category: filters.category, setCategory: filters.setCategory,
    timeframe: filters.timeframe, setTimeframe: filters.setTimeframe,
    sortKey: filters.sortKey, setSortKey: filters.setSortKey,
    sortDir: filters.sortDir, setSortDir: filters.setSortDir,
    directionFilter: filters.directionFilter, setDirectionFilter: filters.setDirectionFilter,
    signalFilter: filters.signalFilter, setSignalFilter: filters.setSignalFilter,
    toggleSort: filters.toggleSort,
    activeTab, setActiveTab,
    handleBellClick,
    hasAlertForSymbol: notifications.hasAlertForSymbol,
  }

  return (
    <ScannerContext.Provider value={value}>
      {children}
    </ScannerContext.Provider>
  )
}
