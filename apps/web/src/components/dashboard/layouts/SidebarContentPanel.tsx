'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bot, Play, Square, AlertTriangle, TrendingUp, TrendingDown, Activity, ExternalLink } from 'lucide-react'
import { PortfolioMini } from '@/components/portfolio/PortfolioMini'
import { AlNarratorMini } from '@/components/ai/AlNarratorMini'
import { ExecutionPanel } from '@/components/dashboard/execution/ExecutionPanel'
import { OrderBookMini } from '@/components/dashboard/OrderBookMini'
import { WatchlistMini } from '@/components/dashboard/WatchlistMini'
import { PriceAlertsPanel } from '@/components/dashboard/PriceAlertsPanel'
import {
  DesktopBacktestPanel,
  DesktopCalendarPanel,
  DesktopCorrelationPanel,
  DesktopNewsPanel,
} from '@/components/dashboard/DesktopContextPanels'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { useAgentStore, AgentStatus } from '@/hooks/useAgentStore'
import { getDataStatus, getSourceLabel } from '@/lib/dashboard-live'

export interface ActiveTabInfo {
  label: string
  helper: string
  accent: string
  tone: string
}

interface SidebarContentPanelProps {
  activeTab: string
  activeTabInfo: ActiveTabInfo
  searchQuery: string
  setSearchQuery: (q: string) => void
}

export function SidebarContentPanel({
  activeTab,
  activeTabInfo,
  searchQuery,
  setSearchQuery,
}: SidebarContentPanelProps) {
  const selectedSymbol = useSymbolStore((s) => s.selectedSymbol)
  const quotes = useMarketStore((s) => s.quotes)
  const activeQuote = selectedSymbol ? quotes[selectedSymbol] : null
  const quoteStatus = getDataStatus(activeQuote)
  const sourceLabel = getSourceLabel(activeQuote?.source)

  const [contentKey, setContentKey] = useState(activeTab)

  useMemo(() => {
    setContentKey(activeTab)
  }, [activeTab])

  return (
    <section
      className="flex flex-col min-w-0 min-h-0"
      style={{
        background: `linear-gradient(180deg, #1E2233, #1A1D29)`,
        direction: 'rtl',
      }}
    >
      {/* Tab content — no header, full height for content */}
      <div
        className="flex-1 min-h-0 overflow-hidden"
        style={{ background: 'linear-gradient(180deg, rgba(8,13,20,0.92), rgba(6,10,16,0.98))' }}
      >
        <div
          className="h-full min-h-0 overflow-hidden rounded-lg border border-[rgba(0,212,255,0.10)]"
          style={{
            background: 'linear-gradient(180deg, rgba(14,20,30,0.98), rgba(8,12,19,0.98))',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02), 0 6px 14px rgba(0,0,0,0.12)',
          }}
        >
          <div
            key={contentKey}
            className="w-full h-full overflow-hidden"
            style={{ animation: 'sidebarContentFadeIn 0.2s ease-out' }}
          >
            {activeTab === 'portfolio' && (
              <PortfolioMini
                compact
                dataStatus={quoteStatus}
                lastUpdatedAt={activeQuote?.timestamp ?? null}
                sourceLabel={sourceLabel}
                selectedSymbol={selectedSymbol}
              />
            )}
            {activeTab === 'execute' && (
              <ExecutionPanel
                mobile
                dataStatus={quoteStatus}
                lastUpdatedAt={activeQuote?.timestamp ?? null}
                sourceLabel={sourceLabel}
              />
            )}
            {activeTab === 'book' && <OrderBookMini />}
            {activeTab === 'watch' && <WatchlistMini />}
            {activeTab === 'alerts' && <PriceAlertsPanel />}
            {activeTab === 'ai' && (
              <AlNarratorMini
                compact
                selectedSymbol={selectedSymbol}
                dataStatus={quoteStatus}
              />
            )}
            {activeTab === 'trader' && <TradingAgentMini />}
            {activeTab === 'news' && <DesktopNewsPanel />}
            {activeTab === 'calendar' && <DesktopCalendarPanel />}
            {activeTab === 'backtest' && <DesktopBacktestPanel />}
            {activeTab === 'correlation' && <DesktopCorrelationPanel />}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes sidebarContentFadeIn {
          from { opacity: 0; transform: translateY(3px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes agentPulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </section>
  )
}

/* ─── Trading Agent Mini Widget (sidebar) ─── */
function TradingAgentMini() {
  const { agentState, performance, positions, loading, fetchStatus, startAgent, stopAgent } = useAgentStore()

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  const status = agentState?.status ?? AgentStatus.IDLE
  const isRunning = status === AgentStatus.RUNNING
  const isEmergency = status === AgentStatus.EMERGENCY_STOP
  const dailyPnL = agentState?.dailyPnL ?? 0
  const dailyTrades = agentState?.dailyTradesCount ?? 0

  const getStatusColor = () => {
    switch (status) {
      case AgentStatus.RUNNING: return '#00FFA3'
      case AgentStatus.PAUSED: return '#FFB800'
      case AgentStatus.EMERGENCY_STOP: return '#FF4757'
      case AgentStatus.DAILY_LIMIT_REACHED: return '#FFB800'
      case AgentStatus.STOPPED: return '#8B92A8'
      default: return '#5A6178'
    }
  }

  const getStatusLabel = () => {
    switch (status) {
      case AgentStatus.RUNNING: return 'يعمل'
      case AgentStatus.PAUSED: return 'متوقف مؤقتاً'
      case AgentStatus.EMERGENCY_STOP: return 'إيقاف طارئ'
      case AgentStatus.DAILY_LIMIT_REACHED: return 'حد يومي'
      case AgentStatus.STOPPED: return 'متوقف'
      default: return 'في الانتظار'
    }
  }

  const statusColor = getStatusColor()

  return (
    <div style={{
      padding: '12px',
      direction: 'rtl',
      fontFamily: "'Cairo', sans-serif",
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10,
          background: `linear-gradient(135deg, #FF8C42, #FF6B35)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: isRunning ? '0 0 16px rgba(255,140,66,0.3)' : 'none',
        }}>
          <Bot size={18} color="#000" strokeWidth={2.5} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#F0F2F5' }}>وكيل التداول</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: statusColor,
              boxShadow: `0 0 6px ${statusColor}`,
              animation: isRunning ? 'agentPulse 2s ease-in-out infinite' : 'none',
            }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: statusColor }}>{getStatusLabel()}</span>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
        marginBottom: 14,
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 8, padding: '8px 10px',
        }}>
          <div style={{ fontSize: 9, color: '#5A6178', fontWeight: 700 }}>P&L اليومي</div>
          <div style={{
            fontSize: 14, fontWeight: 800,
            color: dailyPnL >= 0 ? '#00FFA3' : '#FF4757',
            fontFamily: "'JetBrains Mono', monospace",
            direction: 'ltr', textAlign: 'right',
          }}>
            {dailyPnL >= 0 ? '+' : ''}{dailyPnL.toFixed(2)}
          </div>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 8, padding: '8px 10px',
        }}>
          <div style={{ fontSize: 9, color: '#5A6178', fontWeight: 700 }}>صفقات اليوم</div>
          <div style={{
            fontSize: 14, fontWeight: 800, color: '#00D4FF',
            fontFamily: "'JetBrains Mono', monospace",
          }}>{dailyTrades}</div>
        </div>
        {performance && (
          <>
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 8, padding: '8px 10px',
            }}>
              <div style={{ fontSize: 9, color: '#5A6178', fontWeight: 700 }}>نسبة الفوز</div>
              <div style={{
                fontSize: 14, fontWeight: 800,
                color: performance.winRate >= 50 ? '#00FFA3' : '#FF4757',
                fontFamily: "'JetBrains Mono', monospace",
              }}>{performance.winRate.toFixed(0)}%</div>
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 8, padding: '8px 10px',
            }}>
              <div style={{ fontSize: 9, color: '#5A6178', fontWeight: 700 }}>مراكز مفتوحة</div>
              <div style={{
                fontSize: 14, fontWeight: 800, color: '#B388FF',
                fontFamily: "'JetBrains Mono', monospace",
              }}>{positions.length}</div>
            </div>
          </>
        )}
      </div>

      {/* Open Positions (compact) */}
      {positions.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8B92A8', marginBottom: 6 }}>المراكز المفتوحة</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {positions.slice(0, 4).map((pos) => (
              <div key={pos.id} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 8px', borderRadius: 6,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
              }}>
                {pos.side === 'BUY' ? <TrendingUp size={10} color="#00FFA3" /> : <TrendingDown size={10} color="#FF4757" />}
                <span style={{ fontSize: 10, fontWeight: 700, color: '#F0F2F5', fontFamily: "'JetBrains Mono', monospace" }}>{pos.symbol}</span>
                <span style={{ fontSize: 9, color: pos.side === 'BUY' ? '#00FFA3' : '#FF4757', fontWeight: 700 }}>{pos.side === 'BUY' ? 'شراء' : 'بيع'}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, marginLeft: 'auto',
                  color: pos.unrealizedPnl >= 0 ? '#00FFA3' : '#FF4757',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {pos.unrealizedPnl >= 0 ? '+' : ''}{pos.unrealizedPnl.toFixed(2)}
                </span>
              </div>
            ))}
            {positions.length > 4 && (
              <div style={{ fontSize: 9, color: '#5A6178', textAlign: 'center' }}>+{positions.length - 4} أخرى</div>
            )}
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {!isRunning ? (
          <button
            onClick={() => startAgent('SCALPING')}
            disabled={loading}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '10px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #00FFA3, #10B981)',
              color: '#000', fontSize: 11, fontWeight: 800,
              fontFamily: "'Cairo', sans-serif", cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            <Play size={12} fill="#000" />
            تشغيل
          </button>
        ) : (
          <button
            onClick={() => stopAgent(false)}
            disabled={loading}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '10px', borderRadius: 8, border: 'none',
              background: 'rgba(255,71,87,0.15)',
              color: '#FF4757', fontSize: 11, fontWeight: 800,
              fontFamily: "'Cairo', sans-serif", cursor: loading ? 'not-allowed' : 'pointer',
              border: '1px solid rgba(255,71,87,0.3)',
            }}
          >
            <Square size={12} />
            إيقاف
          </button>
        )}
        {isRunning && (
          <button
            onClick={() => stopAgent(true)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              padding: '10px 12px', borderRadius: 8,
              background: 'rgba(255,71,87,0.10)',
              color: '#FF4757', fontSize: 9, fontWeight: 800,
              fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
              border: '1px solid rgba(255,71,87,0.2)',
            }}
          >
            <AlertTriangle size={11} />
            طارئ
          </button>
        )}
      </div>

      {/* Link to full page */}
      <Link href="/dashboard/autonomous-trader" style={{ textDecoration: 'none' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          padding: '8px', borderRadius: 8,
          background: 'rgba(255,140,66,0.08)',
          border: '1px solid rgba(255,140,66,0.2)',
          color: '#FF8C42', fontSize: 10, fontWeight: 700,
          fontFamily: "'Cairo', sans-serif",
          cursor: 'pointer', transition: 'all 0.15s',
        }}>
          <Activity size={11} />
          لوحة التحكم الكاملة
          <ExternalLink size={9} />
        </div>
      </Link>

      {/* Error Warning */}
      {agentState?.lastError && (
        <div style={{
          marginTop: 10, padding: '8px 10px', borderRadius: 6,
          background: 'rgba(255,71,87,0.08)',
          border: '1px solid rgba(255,71,87,0.2)',
          fontSize: 9, color: '#FF4757', fontFamily: "'Cairo', sans-serif",
        }}>
          <AlertTriangle size={10} style={{ display: 'inline', marginLeft: 4 }} />
          {agentState.lastError}
        </div>
      )}
    </div>
  )
}
