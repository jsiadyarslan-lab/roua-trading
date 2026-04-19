'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Bell, Wifi, WifiOff, ChevronDown } from 'lucide-react'
import { useDashboardStore } from '@/lib/dashboard-store'

export default function Header() {
  const { wsConnected, selectedPair } = useDashboardStore()
  const [searchFocused, setSearchFocused] = useState(false)

  return (
    <div
      style={{ gridArea: 'header' }}
      className="glass flex items-center justify-between px-4 gap-4"
    >
      {/* Search bar */}
      <motion.div
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 flex-1 max-w-md"
        animate={{
          border: searchFocused
            ? '1px solid var(--accent-border)'
            : '1px solid var(--border-subtle)',
          background: searchFocused
            ? 'var(--bg-card)'
            : 'var(--bg-input)',
        }}
        style={{ transition: 'all 0.2s' }}
      >
        <Search size={16} style={{ color: 'var(--text-muted)' }} />
        <input
          type="text"
          placeholder="بحث عن زوج، أداة، إشارة..."
          className="bg-transparent border-none outline-none text-sm flex-1"
          style={{
            color: 'var(--text-main)',
            fontFamily: 'var(--font-ar)',
          }}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
        />
        <kbd
          className="text-[10px] px-1.5 py-0.5 rounded border"
          style={{
            color: 'var(--text-muted)',
            borderColor: 'var(--border-strong)',
            background: 'var(--bg-input)',
          }}
        >
          ⌘K
        </kbd>
      </motion.div>

      {/* Active pair display */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'var(--bg-input)' }}>
        <span className="text-sm font-semibold" style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
          {selectedPair}
        </span>
      </div>

      {/* Connection status */}
      <div className="flex items-center gap-4">
        {/* WebSocket status */}
        <div className="flex items-center gap-2">
          <motion.div
            className="flex items-center gap-1.5 px-2 py-1 rounded-md"
            style={{
              background: wsConnected ? 'var(--profit-bg)' : 'var(--loss-bg)',
            }}
          >
            <motion.div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: wsConnected ? 'var(--profit)' : 'var(--loss)' }}
              animate={{
                opacity: wsConnected ? [1, 0.4, 1] : 1,
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
              }}
            />
            <span className="text-[11px] font-medium" style={{ color: wsConnected ? 'var(--profit)' : 'var(--loss)', fontFamily: 'var(--font-mono)' }}>
              {wsConnected ? 'LIVE' : 'OFF'}
            </span>
            {wsConnected ? <Wifi size={12} style={{ color: 'var(--profit)' }} /> : <WifiOff size={12} style={{ color: 'var(--loss)' }} />}
          </motion.div>
        </div>

        {/* Latency & FPS */}
        <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          <span>170ms</span>
          <span style={{ color: 'var(--border-strong)' }}>|</span>
          <span>26fps</span>
        </div>

        {/* Notification bell */}
        <button className="relative p-2 rounded-lg transition-colors hover:bg-[var(--bg-card-hover)]">
          <Bell size={18} style={{ color: 'var(--text-secondary)' }} />
          <span
            className="absolute top-1 left-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
            style={{
              background: 'var(--loss)',
              color: '#fff',
            }}
          >
            3
          </span>
        </button>

        {/* User avatar */}
        <button className="flex items-center gap-2 p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-card-hover)]">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
          >
            م
          </div>
          <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>
    </div>
  )
}
