'use client'

import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useScannerContext } from '../ScannerProvider'
import { ScannerTableRow } from './ScannerTableRow'
import type { SortKey } from '../hooks/useScannerFilters'
import { ScopedStyle } from '@/components/ScopedStyle'
import T from '@/lib/unified-tokens'

const COLUMN_KEYS: { key: SortKey | null; labelKey: string; width?: number }[] = [
  { key: null, labelKey: 'table.symbol', width: 160 },
  { key: 'technicalScore', labelKey: 'table.compositeScore', width: 90 },
  { key: 'changePercent', labelKey: 'table.changePercent', width: 90 },
  { key: 'confidence', labelKey: 'table.direction', width: 60 },
  { key: 'rsi', labelKey: 'indicators.rsi', width: 70 },
  { key: 'momentumScore', labelKey: 'indicators.macd', width: 80 },
  { key: null, labelKey: 'indicators.stoch', width: 60 },
  { key: null, labelKey: 'indicators.adx', width: 50 },
  { key: null, labelKey: 'table.sparkline', width: 84 },
  { key: null, labelKey: 'table.aiOpinion', width: 90 },
  { key: null, labelKey: 'table.action', width: 90 },
]

function SortIcon({ colKey, sortKey, sortDir }: { colKey: SortKey | null; sortKey: SortKey; sortDir: string }) {
  if (!colKey || colKey !== sortKey) return <ArrowUpDown size={10} color={T.text3} style={{ opacity: 0.4 }} />
  return sortDir === 'desc'
    ? <ArrowDown size={10} color={T.cyan} />
    : <ArrowUp size={10} color={T.cyan} />
}

export function ScannerTable() {
  const t = useTranslations('scannerAdvanced')
  const ctx = useScannerContext()

  return (
    <div style={{
      flex: 1, overflow: 'auto', direction: 'inherit',
      background: T.card,
    }}>
      <ScopedStyle>{`
        @keyframes fadeInRow { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .scanner-scroll::-webkit-scrollbar { width: 5px; }
        .scanner-scroll::-webkit-scrollbar-track { background: ${T.bg2}; }
        .scanner-scroll::-webkit-scrollbar-thumb { background: ${T.surface}; border-radius: 3px; }
        .scanner-scroll::-webkit-scrollbar-thumb:hover { background: ${T.text3}40; }
      `}</ScopedStyle>

      {ctx.loading && ctx.filteredData.length === 0 ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 300, color: T.text3, fontFamily: "var(--font-ar)", fontSize: 'var(--text-sm)',
        }}>
          {t('table.loading')}
        </div>
      ) : ctx.filteredData.length === 0 ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 300, color: T.text3, fontFamily: "var(--font-ar)", fontSize: 'var(--text-sm)',
        }}>
          {t('table.noData')}
        </div>
      ) : (
        <table style={{
          width: '100%', borderCollapse: 'collapse',
          fontSize: 'var(--text-xs)', fontFamily: "var(--font-ar)",
        }}>
          {/* Header */}
          <thead>
            <tr style={{ background: T.bg2, position: 'sticky', top: 0, zIndex: 2 }}>
              {COLUMN_KEYS.map(col => {
                // Only translate keys that start with "table." or "indicators." — others are universal
                const colLabel = (col.labelKey.startsWith('table.') || col.labelKey.startsWith('indicators.')) ? t(col.labelKey) : col.labelKey
                return (
                  <th
                    key={col.labelKey}
                    onClick={col.key ? () => { ctx.toggleSort(col.key!) } : undefined}
                    style={{
                      padding: '10px 8px', fontSize: 'var(--text-xs)', fontWeight: 800,
                      color: col.key === ctx.sortKey ? T.cyan : T.text3,
                      fontFamily: "var(--font-ar)",
                      borderBottom: `1px solid ${T.border}`,
                      cursor: col.key ? 'pointer' : 'default',
                      whiteSpace: 'nowrap', textAlign: 'center', direction: 'inherit',
                      width: col.width, minWidth: col.width,
                      userSelect: 'none', transition: 'color 0.2s',
                    }}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {colLabel}
                      {col.key && <SortIcon colKey={col.key} sortKey={ctx.sortKey} sortDir={ctx.sortDir} />}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {ctx.filteredData.map((item, i) => (
              <ScannerTableRow
                key={item.symbol}
                item={item}
                index={i}
                isSelected={ctx.selectedSymbol === item.symbol}
                onSelect={ctx.setSelectedSymbol}
                onBellClick={ctx.handleBellClick}
                hasActiveAlert={ctx.hasAlertForSymbol(item.symbol)}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
