'use client'

import { useState, useMemo, useCallback } from 'react'
import type { ScannerItem } from './useScannerData'

type SortKey = 'compositeScore' | 'technicalScore' | 'changePercent' | 'rsi' | 'volume' | 'confidence' | 'trendScore' | 'momentumScore'
type SortDir = 'asc' | 'desc'
type CategoryFilter = 'ALL' | 'CRYPTO' | 'FOREX' | 'STOCK' | 'COMMODITY'
type DirectionFilter = 'ALL' | 'BUY' | 'SELL' | 'NEUTRAL'
type SignalFilter = 'ALL' | 'STRONG_TREND' | 'REVERSAL' | 'BREAKOUT' | 'CONSOLIDATION' | 'DIVERGENCE'

interface UseScannerFiltersReturn {
  filteredData: ScannerItem[]
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
}

export type { SortKey, SortDir, CategoryFilter, DirectionFilter, SignalFilter }

const DIRECTION_MAP: Record<string, DirectionFilter> = {
  STRONG_BUY: 'BUY', BUY: 'BUY',
  STRONG_SELL: 'SELL', SELL: 'SELL',
  NEUTRAL: 'NEUTRAL',
}

const SIGNAL_MAP: Record<string, SignalFilter> = {
  TREND: 'STRONG_TREND', REVERSION: 'REVERSAL',
  BREAKOUT: 'BREAKOUT', CONSOLIDATION: 'CONSOLIDATION',
  DIVERGENCE: 'DIVERGENCE',
}

export function useScannerFilters(data: ScannerItem[]): UseScannerFiltersReturn {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('ALL')
  const [timeframe, setTimeframe] = useState('1h')
  const [sortKey, setSortKey] = useState<SortKey>('technicalScore')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('ALL')
  const [signalFilter, setSignalFilter] = useState<SignalFilter>('ALL')

  // Debounce search
  const searchTimer = useMemo(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 250)
    return id
  }, [search])
  // Cleanup handled by useMemo re-creation

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => d === 'desc' ? 'asc' : 'desc')
      } else {
        setSortDir('desc')
      }
      return key
    })
  }, [])

  const filteredData = useMemo(() => {
    let result = data

    // Search filter
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter(d =>
        d.symbol.toLowerCase().includes(q) ||
        d.name.toLowerCase().includes(q)
      )
    }

    // Category filter
    if (category !== 'ALL') {
      result = result.filter(d => d.category === category)
    }

    // Direction filter
    if (directionFilter !== 'ALL') {
      result = result.filter(d => DIRECTION_MAP[d.direction] === directionFilter)
    }

    // Signal filter
    if (signalFilter !== 'ALL') {
      result = result.filter(d => {
        const mapped = SIGNAL_MAP[d.signalClass]
        return mapped === signalFilter
      })
    }

    // Sort — properly handle nested SmartScore fields
    result = [...result].sort((a, b) => {
      const getSortValue = (item: ScannerItem, key: SortKey): number => {
        // SmartScore fields are nested inside item.smartScore
        if (key === 'compositeScore' || key === 'trendScore' || key === 'momentumScore') {
          return (item.smartScore as any)?.[key] ?? 0
        }
        return (item as any)[key] ?? 0
      }
      const aVal = getSortValue(a, sortKey)
      const bVal = getSortValue(b, sortKey)
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal
    })

    return result
  }, [data, debouncedSearch, category, directionFilter, signalFilter, sortKey, sortDir])

  return {
    filteredData, search, setSearch, category, setCategory,
    timeframe, setTimeframe, sortKey, setSortKey, sortDir, setSortDir,
    directionFilter, setDirectionFilter, signalFilter, setSignalFilter,
    toggleSort,
  }
}
