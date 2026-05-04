'use client'

import { useState, useEffect, useCallback } from 'react'

export interface ChartSettings {
  type?: 'candle' | 'hollow' | 'bar' | 'line' | 'area' | 'heikin'
  showGrid?: boolean
  showPriceLine?: boolean
  showVol?: boolean
}

export function useChartPreference(symbol: string) {
  const [settings, setSettings] = useState<ChartSettings>({})
  const [drawings, setDrawings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchPrefs = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/chart-preference?symbol=${encodeURIComponent(symbol)}`)
      if (!res.ok) return
      const { data } = await res.json()
      if (data) {
        if (data.settings) {
          try {
            setSettings(JSON.parse(data.settings))
          } catch {
            setSettings({})
          }
        }
        if (data.drawings) {
          try {
            setDrawings(JSON.parse(data.drawings))
          } catch {
            setDrawings([])
          }
        }
      }
    } catch {
      // Error handled silently
    } finally {
      setLoading(false)
    }
  }, [symbol])

  useEffect(() => {
    fetchPrefs()
  }, [fetchPrefs])

  const savePrefs = useCallback(async (newSettings: ChartSettings, newDrawings: any[]) => {
    try {
      setSettings(newSettings)
      setDrawings(newDrawings)
      await fetch(`/api/chart-preference?symbol=${encodeURIComponent(symbol)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: newSettings, drawings: newDrawings })
      })
    } catch {
      // Error handled silently
    }
  }, [symbol])

  return { settings, drawings, savePrefs, loading }
}
