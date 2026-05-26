'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, X as XIcon, Star, TrendingUp, TrendingDown } from 'lucide-react'
import { useMarketStore } from '@/hooks/useMarketStore'
import { T } from '@/lib/theme-tokens'
import { useTranslations } from 'next-intl'

interface SymbolSearchProps {
  value: string
  onChange: (symbol: string) => void
  onSelect: (symbol: string) => void
  currentPrice?: number
}

const CRYPTO_SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'XRP/USD', 'ADA/USD', 'DOGE/USD', 'AVAX/USD', 'DOT/USD', 'MATIC/USD', 'LINK/USD', 'UNI/USD']
const FOREX_SYMBOLS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD', 'NZD/USD']
const STOCK_SYMBOLS = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'NVDA', 'META']

const TYPE_COLORS: Record<string, string> = {
  crypto: T.amber,
  forex: T.cyan,
  stock: T.green,
}

function getRecentSymbols(): string[] {
  try {
    return JSON.parse(localStorage.getItem('roua-recent-symbols') || '[]')
  } catch { return [] }
}

function addRecentSymbol(symbol: string) {
  try {
    const recent = getRecentSymbols().filter(s => s !== symbol)
    recent.unshift(symbol)
    localStorage.setItem('roua-recent-symbols', JSON.stringify(recent.slice(0, 5)))
  } catch {}
}

export function SymbolSearch({ value, onChange, onSelect, currentPrice }: SymbolSearchProps) {
  const te = useTranslations('dashboard.execution')
  const tc = useTranslations('common')
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState(value)
  const quotes = useMarketStore(state => state.quotes)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const ALL_SYMBOLS = useMemo(() => [
    ...CRYPTO_SYMBOLS.map(s => ({ symbol: s, type: 'crypto' as const, label: tc('crypto') })),
    ...FOREX_SYMBOLS.map(s => ({ symbol: s, type: 'forex' as const, label: tc('forex') })),
    ...STOCK_SYMBOLS.map(s => ({ symbol: s, type: 'stock' as const, label: tc('stocks') })),
  ], [tc])

  useEffect(() => { setSearch(value) }, [value])

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Keyboard shortcut: Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(true)
        setTimeout(() => inputRef.current?.focus(), 50)
      }
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const recentSymbols = useMemo(() => getRecentSymbols(), [isOpen])

  const filtered = useMemo(() => {
    const q = search.toUpperCase().replace(/\//g, '')
    if (!q) return ALL_SYMBOLS
    return ALL_SYMBOLS.filter(s =>
      s.symbol.toUpperCase().replace(/\//g, '').includes(q) ||
      s.label.includes(search)
    )
  }, [search, ALL_SYMBOLS])

  const handleSelect = (symbol: string) => {
    onChange(symbol)
    addRecentSymbol(symbol)
    setIsOpen(false)
    onSelect(symbol)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex items-center gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--surface)] px-3 py-2 transition-colors focus-within:border-[var(--accent)]">
        <Search size={13} className="text-[var(--muted)] shrink-0" />
        <input
          ref={inputRef}
          value={search}
          onChange={e => {
            setSearch(e.target.value.toUpperCase())
            onChange(e.target.value.toUpperCase())
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={te('searchAsset')}
          className="flex-1 bg-transparent text-[var(--foreground)] text-xs font-bold font-mono outline-none placeholder:text-[var(--text3)]"
          aria-label={te('searchAssetAria')}
        />
        {(currentPrice ?? 0) > 0 && (
          <span className="text-[10px] font-mono font-bold text-[var(--accent)] whitespace-nowrap">
            ${(currentPrice ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        )}
        {search && (
          <button onClick={() => { setSearch(''); onChange('') }} className="text-[var(--muted)] hover:text-[var(--foreground)]">
            <XIcon size={12} />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-52 overflow-y-auto rounded-lg border border-[var(--card-border)] bg-[#1A1D29] shadow-xl backdrop-blur-sm">
          {/* Recent symbols */}
          {recentSymbols.length > 0 && !search && (
            <div className="border-b border-[var(--card-border)] p-2">
              <div className="flex items-center gap-1 mb-1">
                <Star size={9} className="text-[var(--amber)]" />
                <span className="text-[8px] font-bold text-[var(--muted)]">{te('recentAssets')}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {recentSymbols.map(s => {
                  const quote = quotes[s]
                  const change = quote?.changePercent ?? 0
                  return (
                    <button
                      key={s}
                      onClick={() => handleSelect(s)}
                      className="flex items-center gap-1 rounded-md border border-[var(--card-border)] bg-[rgba(255,255,255,0.03)] px-2 py-1 text-[9px] font-bold text-[var(--foreground)] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                    >
                      <span className="font-mono">{s}</span>
                      {quote && (
                        <span className={`flex items-center gap-0.5 ${change >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                          {change >= 0 ? <TrendingUp size={7} /> : <TrendingDown size={7} />}
                          {Math.abs(change).toFixed(1)}%
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* All matching symbols */}
          <div className="p-1">
            {filtered.map(s => {
              const quote = quotes[s.symbol]
              const change = quote?.changePercent ?? 0
              const typeColor = TYPE_COLORS[s.type]
              return (
                <button
                  key={s.symbol}
                  onClick={() => handleSelect(s.symbol)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[10px] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded px-1 py-0.5 text-[7px] font-bold"
                      style={{ color: typeColor, background: `${typeColor}15`, border: `1px solid ${typeColor}30` }}
                    >
                      {s.label}
                    </span>
                    <span className="font-mono font-bold text-[var(--foreground)]">{s.symbol}</span>
                  </div>
                  {quote && (
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[var(--foreground)]">
                        ${quote.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                      <span className={`flex items-center gap-0.5 font-mono text-[9px] ${change >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                        {change >= 0 ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
                        {Math.abs(change).toFixed(2)}%
                      </span>
                    </div>
                  )}
                </button>
              )
            })}
            {filtered.length === 0 && (
              <div className="py-3 text-center text-[9px] text-[var(--muted)]">{te('noResults')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
