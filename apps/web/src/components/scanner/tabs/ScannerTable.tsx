'use client'

import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { useScannerContext } from '../ScannerProvider'
import { ScannerTableRow } from './ScannerTableRow'
import type { SortKey } from '../hooks/useScannerFilters'

const T = {
  bg2: '#0D1117', card: '#08090F', surface: '#1A1D29',
  cyan: '#00D4FF', text: '#F0F2F5', text2: '#94a3b8', text3: '#8B92A8',
  border: 'rgba(255,255,255,0.06)',
}

const COLUMNS: { key: SortKey | null; label: string; width?: number }[] = [
  { key: null, label: 'الرمز', width: 160 },
  { key: 'technicalScore', label: 'الدرجة المركبة', width: 90 },
  { key: 'changePercent', label: 'التغير%', width: 90 },
  { key: 'confidence', label: 'الاتجاه', width: 60 },
  { key: 'rsi', label: 'RSI', width: 70 },
  { key: 'momentumScore', label: 'MACD', width: 80 },
  { key: null, label: 'Stoch', width: 60 },
  { key: null, label: 'ADX', width: 50 },
  { key: null, label: 'الخط البياني', width: 84 },
  { key: null, label: 'رأي AI', width: 90 },
  { key: null, label: 'إجراء', width: 90 },
]

function SortIcon({ colKey, sortKey, sortDir }: { colKey: SortKey | null; sortKey: SortKey; sortDir: string }) {
  if (!colKey || colKey !== sortKey) return <ArrowUpDown size={10} color={T.text3} style={{ opacity: 0.4 }} />
  return sortDir === 'desc'
    ? <ArrowDown size={10} color={T.cyan} />
    : <ArrowUp size={10} color={T.cyan} />
}

export function ScannerTable() {
  const ctx = useScannerContext()

  return (
    <div style={{
      flex: 1, overflow: 'auto', direction: 'rtl',
      background: T.card,
    }}>
      <style>{`
        @keyframes fadeInRow { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .scanner-scroll::-webkit-scrollbar { width: 5px; }
        .scanner-scroll::-webkit-scrollbar-track { background: ${T.bg2}; }
        .scanner-scroll::-webkit-scrollbar-thumb { background: ${T.surface}; border-radius: 3px; }
        .scanner-scroll::-webkit-scrollbar-thumb:hover { background: ${T.text3}40; }
      `}</style>

      {ctx.loading && ctx.filteredData.length === 0 ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 300, color: T.text3, fontFamily: "'Cairo', sans-serif", fontSize: 13,
        }}>
          جاري تحميل البيانات...
        </div>
      ) : ctx.filteredData.length === 0 ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 300, color: T.text3, fontFamily: "'Cairo', sans-serif", fontSize: 13,
        }}>
          لا توجد بيانات مطابقة
        </div>
      ) : (
        <table style={{
          width: '100%', borderCollapse: 'collapse',
          fontSize: 11, fontFamily: "'Cairo', sans-serif",
        }}>
          {/* Header */}
          <thead>
            <tr style={{ background: T.bg2, position: 'sticky', top: 0, zIndex: 2 }}>
              {COLUMNS.map(col => (
                <th
                  key={col.label}
                  onClick={col.key ? () => { ctx.toggleSort(col.key!) } : undefined}
                  style={{
                    padding: '10px 8px', fontSize: 9, fontWeight: 800,
                    color: col.key === ctx.sortKey ? T.cyan : T.text3,
                    fontFamily: "'Cairo', sans-serif",
                    borderBottom: `1px solid ${T.border}`,
                    cursor: col.key ? 'pointer' : 'default',
                    whiteSpace: 'nowrap', textAlign: 'center', direction: 'rtl',
                    width: col.width, minWidth: col.width,
                    userSelect: 'none', transition: 'color 0.2s',
                  }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {col.label}
                    {col.key && <SortIcon colKey={col.key} sortKey={ctx.sortKey} sortDir={ctx.sortDir} />}
                  </div>
                </th>
              ))}
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
