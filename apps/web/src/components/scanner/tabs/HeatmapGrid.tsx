'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useScannerContext } from '../ScannerProvider'
import type { HeatmapItem } from '../hooks/useScannerData'
import { ScopedStyle } from '@/components/ScopedStyle'
import { useLocale } from 'next-intl'
import { getLocalizedAssetName, safeStr } from '@/lib/utils'

function safeMax(arr: number[]): number {
  if (arr.length === 0) return -Infinity;
  let max = arr[0];
  for (let i = 1; i < arr.length; i++) { if (arr[i] > max) max = arr[i]; }
  return max;
}
function safeMin(arr: number[]): number {
  if (arr.length === 0) return Infinity;
  let min = arr[0];
  for (let i = 1; i < arr.length; i++) { if (arr[i] < min) min = arr[i]; }
  return min;
}

type SortMode = 'changePercent' | 'volume' | 'technicalScore'
type CatFilter = 'ALL' | 'CRYPTO' | 'FOREX' | 'STOCK'

function getHeatColor(pct: number): string {
  return pct >= 0 ? (pct > 3 ? '#00FFA3' : '#00CC82') : (pct < -3 ? '#FF4757' : '#CC3945')
}

function getOpacity(pct: number): number {
  const abs = Math.abs(pct)
  return Math.min(0.1 + (abs / 20) * 0.4, 0.5)
}

function scoreDot(score: number): string {
  if (score >= 60) return '#00FFA3'
  if (score >= 40) return '#00D4FF'
  if (score >= 20) return '#FFB800'
  return '#FF4757'
}

export function HeatmapGrid() {
  const t = useTranslations('scannerAdvanced')
  const locale = useLocale()
  const ctx = useScannerContext()
  const [catFilter, setCatFilter] = useState<CatFilter>('ALL')
  const [sortMode, setSortMode] = useState<SortMode>('changePercent')

  const CATS: { key: CatFilter; label: string }[] = [
    { key: 'ALL', label: t('heatmap.all') }, { key: 'CRYPTO', label: t('categories.crypto') },
    { key: 'FOREX', label: t('categories.forex') }, { key: 'STOCK', label: t('categories.stocks') },
  ]

  const SORTS: { key: SortMode; label: string }[] = [
    { key: 'changePercent', label: t('heatmap.changePercent') },
    { key: 'volume', label: t('heatmap.volume') },
    { key: 'technicalScore', label: t('heatmap.score') },
  ]

  const items = useMemo(() => {
    let data = ctx.heatmapData
    if (catFilter !== 'ALL') data = data.filter(d => d.category === catFilter)
    data = [...data].sort((a, b) => {
      const aVal = (a as any)[sortMode] ?? 0
      const bVal = (b as any)[sortMode] ?? 0
      return Math.abs(bVal) - Math.abs(aVal)
    })
    return data
  }, [ctx.heatmapData, catFilter, sortMode])

  // Compute spans: weight based on volume or marketCap → colSpan/rowSpan 1-3
  const cells = useMemo(() => {
    if (!items.length) return []
    const maxVol = safeMax(items.map(d => d.marketCap ?? d.volume))
    return items.map((d, i) => {
      const w = (d.marketCap ?? d.volume) / maxVol
      const colSpan = w > 0.6 ? 3 : w > 0.3 ? 2 : 1
      const rowSpan = w > 0.5 ? 2 : 1
      return { ...d, colSpan, rowSpan, idx: i }
    })
  }, [items])

  return (
    <div style={{ flex: 1, overflow: 'auto', direction: 'inherit', background: '#151A22', padding: 12 }}>
      <ScopedStyle>{`
        @keyframes fadeCell { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }
        .heat-cell:hover { transform: scale(1.03); box-shadow: 0 4px 20px rgba(0,0,0,0.5); z-index: 2; }
      `}</ScopedStyle>

      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {CATS.map(c => (
          <button key={c.key} onClick={() => setCatFilter(c.key)}
            style={{
              padding: '4px 12px', borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 700,
              fontFamily: "var(--font-ar)", cursor: 'pointer',
              background: catFilter === c.key ? `${'#00D4FF'}20` : '#151A22',
              color: catFilter === c.key ? '#00D4FF' : '#6B7280',
              border: `0.5px solid ${catFilter === c.key ? '#3A4150' : '#2A313C'}`,
              transition: 'all 0.2s',
            }}
          >{c.label}</button>
        ))}
        <div style={{ width: 1, height: 20, background: '#2A313C', margin: '0 4px' }} />
        {SORTS.map(s => (
          <button key={s.key} onClick={() => setSortMode(s.key)}
            style={{
              padding: '4px 12px', borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 700,
              fontFamily: "var(--font-ar)", cursor: 'pointer',
              background: sortMode === s.key ? `${'#00D4FF'}20` : '#151A22',
              color: sortMode === s.key ? '#00D4FF' : '#6B7280',
              border: `0.5px solid ${sortMode === s.key ? '#3A4150' : '#2A313C'}`,
              transition: 'all 0.2s',
            }}
          >{s.label}</button>
        ))}
      </div>

      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gridAutoRows: 'minmax(80px, auto)',
        gridAutoFlow: 'dense',
        gap: 4,
      }}>
        {cells.map(cell => {
          const color = getHeatColor(cell.changePercent)
          const op = getOpacity(cell.changePercent)
          return (
            <div
              key={cell.symbol}
              className="heat-cell"
              onClick={() => ctx.setSelectedSymbol(cell.symbol)}
              style={{
                gridColumn: `span ${cell.colSpan}`,
                gridRow: `span ${cell.rowSpan}`,
                background: `linear-gradient(135deg, ${color}${Math.round(op * 255).toString(16).padStart(2, '0')}, ${'#0F1117'})`,
                borderRadius: 'var(--radius-sm)', padding: '10px 12px', cursor: 'pointer',
                border: `0.5px solid ${'#2A313C'}`,
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                transition: 'all 0.25s ease',
                animation: `fadeCell 0.35s ease ${cell.idx * 25}ms both`,
                minHeight: cell.rowSpan > 1 ? 160 : 80,
              }}
            >
              <div>
                <div style={{
                  fontSize: cell.colSpan > 1 ? 16 : 13, fontWeight: 800, color: '#F0F2F5',
                  fontFamily: "var(--font-mono)",
                }}>
                  {cell.symbol}
                </div>
                <div style={{
                  fontSize: 11, color: '#6B7280', fontWeight: 600,
                  fontFamily: "var(--font-ar)", marginTop: 2,
                }}>
                  {getLocalizedAssetName(cell.symbol, safeStr(cell.name), t, locale)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <div>
                  <div style={{
                    fontSize: cell.colSpan > 1 ? 18 : 14, fontWeight: 900, color,
                    fontFamily: "var(--font-mono)",
                  }}>
                    {cell.changePercent >= 0 ? '+' : ''}{cell.changePercent.toFixed(2)}%
                  </div>
                  <div style={{
                    fontSize: 11, color: '#9CA3B5',
                    fontFamily: "var(--font-mono)",
                  }}>
                    ${cell.price.toLocaleString()}
                  </div>
                </div>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: scoreDot(cell.technicalScore),
                  boxShadow: `0 0 6px ${scoreDot(cell.technicalScore)}50`,
                }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
