'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import type { QuoteData } from '@/hooks/useMarketStore'
import { BarChart3, Brain, ChevronDown, ScanSearch, Wallet, PanelRight, Zap } from 'lucide-react'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { NotificationToasts } from '@/components/dashboard/NotificationCenter'
import { LeftSidebarLayout } from '@/components/dashboard/layouts/LeftSidebarLayout'
import { SidebarDrawer } from '@/components/dashboard/layouts/SidebarDrawer'
import { RightPanelLayout } from '@/components/dashboard/layouts/RightPanelLayout'
import { WatchlistMini } from '@/components/dashboard/WatchlistMini'
import { QuickExecutionMini } from '@/components/dashboard/QuickExecutionMini'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useDashboardStore, type TradingMode } from '@/lib/dashboard-store'
import { getDataStatus, getSourceLabel, getStatusLabel, getStatusTone, type DataStatus } from '@/lib/dashboard-live'

const DASHBOARD_SYMBOLS = ['BTC/USD', 'ETH/USD', 'EUR/USD', 'GBP/USD', 'XAU/USD', 'AAPL', 'TSLA']

// Dynamic imports for heavy components (code splitting)
const RouaChart = dynamic(() => import('@/components/charts/RouaChart'), { ssr: false })
const AlpacaPositions = dynamic(() => import('@/components/dashboard/AlpacaPositions').then(m => ({ default: m.AlpacaPositions })), { ssr: false })
const BotEngine = dynamic(() => import('@/components/dashboard/BotEngine').then(m => ({ default: m.BotEngine })), { ssr: false })
const NotificationEngine = dynamic(() => import('@/components/dashboard/NotificationEngine').then(m => ({ default: m.NotificationEngine })), { ssr: false })
const GlobalLogicEngine = dynamic(() => import('@/components/dashboard/GlobalLogicEngine').then(m => ({ default: m.GlobalLogicEngine })), { ssr: false })
const OrderBookPanel = dynamic(() => import('@/components/dashboard/OrderBookPanel'), { ssr: false })
const ScannerMini = dynamic(() => import('@/components/dashboard/ScannerMini').then(m => ({ default: m.ScannerMini })), { ssr: false })
const AlNarratorMini = dynamic(() => import('@/components/ai/AlNarratorMini').then(m => ({ default: m.AlNarratorMini })), { ssr: false })
const PortfolioMini = dynamic(() => import('@/components/portfolio/PortfolioMini').then(m => ({ default: m.PortfolioMini })), { ssr: false })

const T = {
  bg: '#0B0E14',
  bg2: '#0F1117',
  card: '#1A1D29',
  border: 'rgba(255,255,255,0.05)',
  cyan: '#00D4FF',
  success: '#00FFA3',
  danger: '#FF4757',
  warning: '#FFB800',
  info: '#00D4FF',
  text: '#F0F2F5',
  text3: '#8B92A8',
  gradientProfit: 'linear-gradient(135deg, #00FFA3, #00CC82)',
  gradientLoss: 'linear-gradient(135deg, #FF4757, #FF3344)',
  gradientInfo: 'linear-gradient(135deg, #00D4FF, #0A84FF)',
}

const HEADER_H = 108
const PANEL_H = 30
const ANIM = 'height 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease'

// Mode configuration — determines UI accent and available features per mode
const MODE_CONFIG: Record<TradingMode, { accent: string; glowBg: string; label: string; labelAr: string; description: string }> = {
  trader: {
    accent: '#00d4ff',
    glowBg: 'rgba(0,212,255,0.04)',
    label: 'Trader',
    labelAr: 'وضع التاجر',
    description: 'ربط سريع، شارت متقدم، متابعة فورية',
  },
  investor: {
    accent: '#10b981',
    glowBg: 'rgba(16,185,129,0.04)',
    label: 'Investor',
    labelAr: 'وضع المستثمر',
    description: 'محفظة استثمارية، توزيع الأصول، أداء طويل المدى',
  },
  ai: {
    accent: '#a78bfa',
    glowBg: 'rgba(167,139,250,0.04)',
    label: 'AI',
    labelAr: 'وضع الذكاء الاصطناعي',
    description: 'تحليلات AI، توصيات ذكية، إشارات آلية',
  },
}

type MobileView = 'execution' | 'market' | 'portfolio' | 'insight'

const formatMoney = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '$—'
  const num = typeof value === 'string' ? parseFloat(value) : Number(value)
  if (!Number.isFinite(num)) return '$—'
  const abs = Math.abs(num)
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return num < 0 ? `-$${formatted}` : `$${formatted}`
}

const formatQuotePrice = (value: unknown) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  return num.toLocaleString('en-US', { maximumFractionDigits: num > 100 ? 2 : 4 })
}

export default function DashboardPage() {
  const globalQuotes = useMarketStore(state => state.quotes) as Record<string, QuoteData | undefined>
  const selectedSymbol = useSymbolStore(state => state.selectedSymbol)
  const setSelectedSymbol = useSymbolStore(state => state.setSelectedSymbol)
  const currentPrice = globalQuotes[selectedSymbol]?.price ?? null
  const activeQuote = globalQuotes[selectedSymbol] ?? null
  const account = usePositionsStore(state => state.account)
  const positions = usePositionsStore(state => state.positions)
  const lastUpdate = usePositionsStore(state => state.lastUpdate)
  const positionsError = usePositionsStore(state => state.error)
  const fetchAccount = usePositionsStore(state => state.fetchAccount)
  const fetchPositions = usePositionsStore(state => state.fetchPositions)
  const chartFullscreen = useDashboardStore(state => state.chartFullscreen)
  const toggleChartFullscreen = useDashboardStore(state => state.toggleChartFullscreen)
  const mode = useDashboardStore(state => state.mode)
  const [posOpen, setPosOpen] = useState(true)
  const modeConfig = MODE_CONFIG[mode]

  // Auto-expand positions panel when entering fullscreen
  useEffect(() => {
    if (chartFullscreen && !posOpen) {
      setPosOpen(true)
    }
  }, [chartFullscreen])
  const [activeMobileView, setActiveMobileView] = useState<MobileView>('execution')
  const [chartExpanded, setChartExpanded] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [isCompactDesktopViewport, setIsCompactDesktopViewport] = useState(false)
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false)
  const [sidebarPinned, setSidebarPinned] = useState(false)
  const [tradeDialogOpen, setTradeDialogOpen] = useState(false)

  useEffect(() => {
    fetchAccount()
    fetchPositions()
    const intervalId = window.setInterval(() => {
      fetchAccount()
      fetchPositions()
    }, 60000)

    return () => window.clearInterval(intervalId)
  }, [fetchAccount, fetchPositions])

  // Cross-device sync: refresh data when the page becomes visible
  // (user switches back from another tab/device or returns to the app)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchAccount()
        fetchPositions()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [fetchAccount, fetchPositions])

  // Cross-tab sync: listen for account data changes from other tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key?.startsWith('roua_') || e.key === null) {
        fetchAccount()
        fetchPositions()
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [fetchAccount, fetchPositions])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mobileMedia = window.matchMedia('(max-width: 767px)')
    const compactDesktopMedia = window.matchMedia('(max-width: 1280px)')

    const syncViewport = () => {
      setIsMobileViewport(mobileMedia.matches)
      setIsCompactDesktopViewport(compactDesktopMedia.matches && !mobileMedia.matches)
    }

    syncViewport()
    mobileMedia.addEventListener('change', syncViewport)
    compactDesktopMedia.addEventListener('change', syncViewport)

    return () => {
      mobileMedia.removeEventListener('change', syncViewport)
      compactDesktopMedia.removeEventListener('change', syncViewport)
    }
  }, [])

  const quotes = useMemo(() => {
    const entries = DASHBOARD_SYMBOLS.flatMap(symbol => {
      const quote = globalQuotes[symbol]
      return quote ? [[symbol, quote] as const] : []
    })
    return new Map<string, QuoteData>(entries)
  }, [globalQuotes])

  const mobileSymbols = useMemo(() => {
    const defaults = ['BTC/USD', 'ETH/USD', 'SOL/USD']
    const ordered = [selectedSymbol, ...defaults.filter(sym => sym !== selectedSymbol)]
    return ordered.slice(0, 3).map(symbol => ({
      symbol,
      quote: globalQuotes[symbol] ?? null,
    }))
  }, [globalQuotes, selectedSymbol])

  const mobileSummaryCards = [
    { label: 'الرصيد', value: formatMoney(account?.equity), tone: T.text },
    { label: 'قوة الشراء', value: formatMoney(account?.buyingPower), tone: T.success },
    { label: 'المراكز', value: `${positions.length}`, tone: T.cyan },
  ]

  const quoteStatus = getDataStatus(activeQuote)
  const sourceLabel = getSourceLabel(activeQuote?.source)

  // Derive account data status
  const dataSource = usePositionsStore(state => state.dataSource)
  const accountDataStatus: DataStatus = (() => {
    if (positionsError) return 'disconnected'
    if (!account) return 'disconnected'
    // إذا كان الحساب موجود لكن بدون بيانات حقيقية (equity=0 ولا مراكز)، اعتبره "تجريبي"
    const hasRealData = Number(account.equity) > 0 || Number(account.longMarketValue) > 0 || Number(account.shortMarketValue) > 0 || positions.length > 0
    if (!lastUpdate && !hasRealData) return 'demo'
    if (!lastUpdate) return 'fallback'
    // إذا كانت البيانات من NestJS، اعتبرها مباشرة/احتياطية حسب حالة الأسعار
    if (dataSource === 'nestjs') {
      return quoteStatus === 'live' ? 'live' : quoteStatus === 'delayed' ? 'delayed' : 'fallback'
    }
    if (dataSource === 'alpaca') {
      return quoteStatus === 'live' ? 'live' : 'fallback'
    }
    return quoteStatus === 'live' ? 'live' : quoteStatus === 'delayed' ? 'delayed' : 'fallback'
  })()

  // Calculate P&L for balance card — use live-calculated P&L from positions
  // (positions now update in real-time via GlobalLogicEngine + useMarketStore)
  // Fallback to account's unrealizedPnl if positions aren't loaded yet
  const equityValue = Number(account?.equity) || 0
  const cashValue = Number(account?.cash) || 0
  const longMarketValue = Number(account?.longMarketValue) || 0
  const shortMarketValue = Number(account?.shortMarketValue) || 0
  const positionsValue = longMarketValue + shortMarketValue
  const initialMargin = Number(account?.initialMargin) || 0
  const freeMargin = Math.max(0, equityValue - initialMargin) // الهامش الحر = الرصيد - الهامش المستخدم
  // P&L لحظي من المراكز (محسوب من الأسعار المباشرة) بدلاً من account.unrealizedPnl المتجمد
  const livePositionsPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0)
  const unrealizedPnl = positions.length > 0 ? livePositionsPnl : (Number(account?.unrealizedPnl) || 0)
  const isProfitable = unrealizedPnl >= 0

  return (
    <>
      <style>{`
        .dashboard-shell {
          min-height: calc(100dvh - ${HEADER_H}px);
          background: #0B0E14;
          background-image:
            radial-gradient(ellipse at 20% 0%, rgba(0,212,255,0.04) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 100%, rgba(0,255,163,0.02) 0%, transparent 50%);
          color: #F0F2F5;
          overflow: hidden;
        }

        .dash-grid {
          display: grid;
          grid-template-columns: minmax(240px, 280px) minmax(0, 1fr) minmax(300px, 350px);
          gap: 8px;
          min-height: calc(100dvh - ${HEADER_H}px);
          height: calc(100dvh - ${HEADER_H}px);
          padding: 8px;
          box-sizing: border-box;
          overflow: hidden;
        }

        .dash-grid.chart-fullscreen {
          grid-template-columns: 0px minmax(0, 1fr) 0px !important;
        }

        .dash-grid.chart-fullscreen .dash-col-left,
        .dash-grid.chart-fullscreen .dash-col-right,
        .dash-grid.chart-fullscreen .dash-col-right-mobile {
          visibility: hidden !important;
          overflow: hidden !important;
          pointer-events: none !important;
        }

        .dash-grid.chart-fullscreen .dash-col-center {
          overflow: hidden !important;
        }

        .dash-grid.chart-fullscreen .dash-col-center .panel:first-child {
          flex: 1 1 0% !important;
          min-height: 0 !important;
          overflow: hidden !important;
        }

        .dash-grid.chart-fullscreen .dash-col-center .panel:last-child {
          flex-shrink: 0 !important;
          min-height: 160px !important;
          max-height: 280px !important;
          height: auto !important;
          visibility: visible !important;
          pointer-events: auto !important;
          overflow-y: auto !important;
        }

        .dash-col {
          min-width: 0;
          min-height: 0;
          overflow: hidden;
        }

        /* ── Glassmorphism Panel ── */
        .panel {
          background: rgba(26, 29, 41, 0.65);
          backdrop-filter: blur(16px) saturate(1.4);
          -webkit-backdrop-filter: blur(16px) saturate(1.4);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 14px;
          overflow: hidden;
          min-width: 0;
          box-shadow: 0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04);
          position: relative;
        }
        .panel::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at top right, rgba(0, 212, 255, 0.05), transparent 40%),
            radial-gradient(circle at bottom left, rgba(0, 255, 163, 0.03), transparent 35%);
          pointer-events: none;
          z-index: 0;
        }

        .panel > * { position: relative; z-index: 1; }

        .panel-header {
          min-height: ${PANEL_H}px;
          padding: 0 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          background: linear-gradient(90deg, rgba(0,212,255,0.05), transparent 60%);
          box-sizing: border-box;
        }

        .panel-title {
          font-family: 'Cairo', sans-serif;
          font-size: 12px;
          font-weight: 800;
        }

        .summary-row {
          display: flex;
          gap: 20px;
          flex-wrap: wrap;
          align-items: center;
          font-size: 11px;
          font-family: 'Cairo', sans-serif;
          font-weight: 700;
        }

        .summary-item {
          display: flex;
          gap: 6px;
          align-items: center;
          white-space: nowrap;
        }

        .summary-label {
          color: ${T.text3};
        }

        .summary-value {
          color: ${T.text};
          font-family: 'JetBrains Mono', monospace;
        }

        .summary-value--success {
          color: ${T.success};
        }

        .summary-value--accent {
          color: ${T.cyan};
        }

        /* ── Balance Card ── */
        .balance-card {
          background: linear-gradient(135deg, rgba(0,212,255,0.12), rgba(0,255,163,0.06), rgba(26,29,41,0.8));
          border: 1px solid rgba(0,212,255,0.15);
          border-radius: 14px;
          padding: 14px 18px;
          position: relative;
          overflow: hidden;
        }
        .balance-card::before {
          content: '';
          position: absolute;
          top: -50%;
          right: -30%;
          width: 200px;
          height: 200px;
          background: radial-gradient(circle, rgba(0,212,255,0.08), transparent 60%);
          pointer-events: none;
        }
        .balance-card::after {
          content: '';
          position: absolute;
          bottom: -40%;
          left: -20%;
          width: 180px;
          height: 180px;
          background: radial-gradient(circle, rgba(0,255,163,0.06), transparent 60%);
          pointer-events: none;
        }

        /* ── LED Connection Indicator ── */
        .led-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: ${T.success};
          box-shadow: 0 0 6px ${T.success}, 0 0 12px rgba(0,255,163,0.3);
          animation: ledPulse 2s ease-in-out infinite;
        }

        @keyframes ledPulse {
          0%, 100% { opacity: 0.7; box-shadow: 0 0 4px ${T.success}; }
          50% { opacity: 1; box-shadow: 0 0 8px ${T.success}, 0 0 16px rgba(0,255,163,0.4); }
        }

        /* ── Striped Rows ── */
        .striped-rows > :nth-child(even) {
          background: rgba(255,255,255,0.015);
        }

        /* ── Hover Glow Effect ── */
        .hover-glow {
          transition: border-color 0.3s, box-shadow 0.3s;
        }
        .hover-glow:hover {
          border-color: rgba(0,212,255,0.20) !important;
          box-shadow: 0 0 20px rgba(0,212,255,0.08), 0 12px 40px rgba(0,0,0,0.4) !important;
        }

        /* ── Count-up Animation ── */
        @keyframes countUp {
          from { opacity: 0.4; transform: translateY(3px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .count-up {
          animation: countUp 0.5s ease-out;
        }

        /* ── Stagger Animation ── */
        @keyframes fadeInSlideUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-in-1 { animation: fadeInSlideUp 0.4s ease-out 0.05s both; }
        .animate-in-2 { animation: fadeInSlideUp 0.4s ease-out 0.1s both; }
        .animate-in-3 { animation: fadeInSlideUp 0.4s ease-out 0.15s both; }

        .mobile-dashboard-shell,
        .mobile-bottom-nav,
        .dash-col-right-mobile {
          display: none;
        }

        @media (max-width: 1500px) {
          .dash-grid {
            grid-template-columns: minmax(230px, 260px) minmax(0, 1fr) minmax(280px, 320px);
          }
        }

        @media (max-width: 1280px) {
          .dash-grid {
            grid-template-columns: minmax(220px, 250px) minmax(0, 1fr);
          }

          .dash-col-right {
            display: none;
          }

          .dash-col-right-mobile {
            display: block;
          }
        }

        @media (max-width: 767px) {
          .dash-grid {
            display: none;
          }

          .mobile-dashboard-shell {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 10px 10px calc(124px + env(safe-area-inset-bottom));
            background: ${T.bg};
            box-sizing: border-box;
            width: 100%;
            overflow-x: hidden;
            overflow-y: auto;
            min-height: 100dvh;
          }

          .mobile-hero-trading-area {
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-width: 0;
          }

          .mobile-market-strip {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
          }

          .mobile-market-pill {
            min-width: 0;
            padding: 10px 8px;
            border-radius: 14px;
            border: 1px solid rgba(0, 212, 255, 0.12);
            background: rgba(26, 29, 41, 0.6);
            backdrop-filter: blur(8px);
            text-align: center;
            transition: all 0.2s;
          }

          .mobile-market-pill--active {
            border-color: rgba(0, 212, 255, 0.35);
            background: rgba(0, 212, 255, 0.08);
            box-shadow: 0 0 0 1px rgba(0, 212, 255, 0.08) inset, 0 0 16px rgba(0, 212, 255, 0.06);
          }

          .mobile-hero-card {
            border-radius: 16px;
            overflow: hidden;
            border: 1px solid rgba(0, 212, 255, 0.10);
            background: rgba(26, 29, 41, 0.6);
            backdrop-filter: blur(10px);
          }

          .mobile-hero-card__header {
            min-height: 44px;
            padding: 0 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid rgba(0, 212, 255, 0.08);
          }

          .mobile-hero-chart {
            height: 38dvh;
            min-height: 240px;
            max-height: 360px;
            overflow: hidden;
          }

          .mobile-hero-chart--expanded {
            height: 72dvh;
            max-height: none;
          }

          .mobile-summary-strip {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
            padding: 10px 12px;
            border-radius: 14px;
            background: rgba(26, 29, 41, 0.6);
            backdrop-filter: blur(8px);
            border: 1px solid rgba(255, 255, 255, 0.06);
          }

          .mobile-summary-card {
            min-width: 0;
            padding-inline: 2px;
            text-align: center;
          }

          .mobile-primary-ticket {
            border-radius: 16px;
            border: 1px solid rgba(0, 212, 255, 0.10);
            background: rgba(26, 29, 41, 0.6);
            backdrop-filter: blur(8px);
            overflow: hidden;
          }

          .mobile-panel-shell {
            border-radius: 16px;
            overflow: hidden;
            border: 1px solid rgba(0, 212, 255, 0.10);
            background: rgba(26, 29, 41, 0.6);
            backdrop-filter: blur(8px);
            min-height: max(320px, calc(100dvh - 380px));
          }

          .mobile-bottom-nav {
            display: block;
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 80;
            padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
            background: rgba(11, 14, 20, 0.94);
            border-top: 1px solid rgba(0, 212, 255, 0.10);
            backdrop-filter: blur(20px) saturate(1.5);
            -webkit-backdrop-filter: blur(20px) saturate(1.5);
            box-sizing: border-box;
          }

          .mobile-bottom-nav__inner {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
          }

          .mobile-bottom-nav__button {
            min-height: 50px;
            padding: 8px 4px;
            border: 1px solid transparent;
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.03);
            color: ${T.text3};
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
            cursor: pointer;
            transition: all 0.18s ease;
            box-sizing: border-box;
            touch-action: manipulation;
          }

          .mobile-bottom-nav__button--active {
            background: rgba(0, 212, 255, 0.10);
            color: ${T.text};
            border-color: rgba(0, 212, 255, 0.20);
            box-shadow: 0 0 0 1px rgba(0, 212, 255, 0.08) inset, 0 0 12px rgba(0, 212, 255, 0.06);
          }

          .mobile-bottom-nav__label {
            font-size: 10px;
            font-weight: 700;
            font-family: 'Cairo', sans-serif;
            line-height: 1;
          }

          .mobile-section {
            min-width: 0;
            border-radius: 14px;
            overflow: hidden;
            background: ${T.card};
            border: 1px solid ${T.border};
            box-sizing: border-box;
          }

          .mobile-section__header {
            min-height: 48px;
            padding: 0 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            border-bottom: 1px solid ${T.border};
            background: linear-gradient(90deg, rgba(0, 212, 255, 0.06), transparent);
            box-sizing: border-box;
          }

          .mobile-section__title {
            font-family: 'Cairo', sans-serif;
            font-size: 12px;
            font-weight: 800;
            color: ${T.text};
          }

          .mobile-section__body {
            min-width: 0;
            overflow: hidden;
          }

          .mobile-chart-shell {
            height: min(74vh, 720px);
            min-height: 420px;
          }
        }

        @media (min-width: 768px) {
          .mobile-dashboard-shell,
          .mobile-bottom-nav {
            display: none;
          }
        }

        .dash-col::-webkit-scrollbar {
          width: 3px;
        }

        .dash-col::-webkit-scrollbar-track {
          background: transparent;
        }

        .dash-col::-webkit-scrollbar-thumb {
          background: rgba(0,212,255,0.15);
          border-radius: 10px;
        }

        .dash-col::-webkit-scrollbar-thumb:hover {
          background: rgba(0,212,255,0.30);
        }

        .live-status-dot {
          animation: live-dot 1.8s ease-in-out infinite;
        }

        @keyframes live-dot {
          0%, 100% { transform: scale(1); opacity: 0.65; }
          50% { transform: scale(1.35); opacity: 1; }
        }
      `}</style>

      <BotEngine />
      <NotificationEngine quotes={quotes} />
      <GlobalLogicEngine />
      <NotificationToasts />

      {!isMobileViewport && (
        <div className={`dash-grid dashboard-shell${chartFullscreen ? ' chart-fullscreen' : ''}`}>
          {/* Left Sidebar — hidden on compact desktop when drawer is used */}
          {!(isCompactDesktopViewport && !sidebarPinned) && (
            <div className="dash-col dash-col-left animate-in-1" style={{ height: '100%' }}>
              <LeftSidebarLayout />
            </div>
          )}

          {/* Center Column: Mode Banner + Chart + Balance + Positions */}
          <div className="dash-col dash-col-center animate-in-2" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, minHeight: 0 }}>
            {/* Mode Banner */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 14px', borderRadius: 10,
              background: modeConfig.glowBg,
              border: `1px solid ${modeConfig.accent}20`,
              flexShrink: 0,
              transition: 'all 0.3s ease',
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: modeConfig.accent,
                boxShadow: `0 0 8px ${modeConfig.accent}60`,
                animation: 'ledPulse 2s ease-in-out infinite',
              }} />
              <span style={{
                fontFamily: "'Cairo', sans-serif", fontSize: 11, fontWeight: 800,
                color: modeConfig.accent, letterSpacing: '0.02em',
              }}>{modeConfig.labelAr}</span>
              <span style={{
                fontFamily: "'Cairo', sans-serif", fontSize: 10,
                color: T.text3, marginRight: 8,
              }}>— {modeConfig.description}</span>
              <div style={{ flex: 1 }} />
              {mode === 'trader' && (
                <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: T.text3, fontWeight: 600 }}>
                  {activeMobileView === 'execution' ? 'LIVE' : 'READY'}
                </span>
              )}
              {mode === 'investor' && (
                <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: '#10b981', fontWeight: 600 }}>
                  LONG-TERM
                </span>
              )}
              {mode === 'ai' && (
                <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: '#a78bfa', fontWeight: 600 }}>
                  AI-ACTIVE
                </span>
              )}
            </div>
            {/* Chart Panel */}
            <div className="panel hover-glow" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <RouaChart
                  currentPrice={currentPrice}
                  isChartFullscreen={chartFullscreen}
                  onToggleChartFullscreen={toggleChartFullscreen}
                />
              </div>
            </div>

            {/* Balance Card + Positions Panel */}
            <div className="panel hover-glow" style={{ flexShrink: 0, height: posOpen ? (chartFullscreen ? 220 : 240) : PANEL_H, transition: ANIM, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div className="panel-header">
                <div className="summary-row">
                  {/* Balance with gradient */}
                  <div className="summary-item" style={{ gap: 8 }}>
                    <div className="led-indicator" style={{ background: getStatusTone(accountDataStatus), boxShadow: `0 0 6px ${getStatusTone(accountDataStatus)}, 0 0 12px ${getStatusTone(accountDataStatus)}33` }} />
                    <span className="summary-label">الرصيد:</span>
                    <span className="summary-value count-up" style={{ fontSize: 13, fontWeight: 800 }}>{formatMoney(account?.equity)}</span>
                    <span style={{ fontSize: 9, color: getStatusTone(accountDataStatus), fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>
                      {getStatusLabel(accountDataStatus)}
                    </span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">الهامش الحر:</span>
                    <span className="summary-value summary-value--success">{formatMoney(freeMargin)}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">قيمة المراكز:</span>
                    <span className="summary-value summary-value--accent">{formatMoney(positionsValue)}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">كمية الهامش:</span>
                    <span className="summary-value">{formatMoney(initialMargin)}</span>
                  </div>
                  {unrealizedPnl !== 0 && (
                    <div className="summary-item">
                      <span className="summary-label">P&L:</span>
                      <span className="summary-value" style={{
                        color: isProfitable ? T.success : T.danger,
                        fontWeight: 800,
                      }}>
                        {isProfitable ? '+' : '-'}{formatMoney(Math.abs(unrealizedPnl))}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setPosOpen(prev => !prev)}
                  title={posOpen ? 'إخفاء المراكز' : 'إظهار المراكز'}
                  aria-label={posOpen ? 'إخفاء المراكز' : 'إظهار المراكز'}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: T.text3, padding: 4, borderRadius: 6, transition: 'all 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = T.cyan)}
                  onMouseLeave={e => (e.currentTarget.style.color = T.text3)}
                >
                  <ChevronDown size={14} style={{ transform: posOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
                </button>
              </div>

              <div className="striped-rows" style={{ flex: 1, opacity: posOpen ? 1 : 0, transition: 'opacity 0.2s', overflow: 'hidden' }}>
                <AlpacaPositions />
              </div>
            </div>
          </div>

          {/* Right Panel — mode-aware content */}
          {!isCompactDesktopViewport && (
            <div className="dash-col dash-col-right animate-in-3" style={{ height: '100%' }}>
              {mode === 'trader' && <RightPanelLayout quotes={quotes} />}
              {mode === 'investor' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
                  <div className="panel hover-glow" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <PortfolioMini dataStatus={quoteStatus} lastUpdatedAt={activeQuote?.timestamp ?? null} sourceLabel={sourceLabel} selectedSymbol={selectedSymbol} />
                  </div>
                  <div className="panel hover-glow" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <WatchlistMini selectedSymbol={selectedSymbol} />
                  </div>
                </div>
              )}
              {mode === 'ai' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
                  <div className="panel hover-glow" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <AlNarratorMini selectedSymbol={selectedSymbol} dataStatus={quoteStatus} />
                  </div>
                  <div className="panel hover-glow" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <ScannerMini selectedSymbol={selectedSymbol} />
                  </div>
                </div>
              )}
            </div>
          )}

          {isCompactDesktopViewport && (
            <div className="dash-col dash-col-right-mobile panel" style={{ padding: '0 4px 20px' }}>
              {mode === 'trader' && <RightPanelLayout quotes={quotes} />}
              {mode === 'investor' && (
                <>
                  <PortfolioMini dataStatus={quoteStatus} lastUpdatedAt={activeQuote?.timestamp ?? null} sourceLabel={sourceLabel} selectedSymbol={selectedSymbol} />
                  <div style={{ height: 10 }} />
                  <WatchlistMini selectedSymbol={selectedSymbol} />
                </>
              )}
              {mode === 'ai' && (
                <>
                  <AlNarratorMini selectedSymbol={selectedSymbol} dataStatus={quoteStatus} />
                  <div style={{ height: 10 }} />
                  <ScannerMini selectedSymbol={selectedSymbol} />
                </>
              )}
              {mode === 'trader' && (
                <>
                  <div style={{ height: 10 }} />
                  <WatchlistMini />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {isMobileViewport && (
        <div className="mobile-dashboard-shell">
          <div className="mobile-hero-trading-area">
            <div className="mobile-market-strip">
              {mobileSymbols.map(({ symbol, quote }) => {
                const active = symbol === selectedSymbol

                return (
                  <button
                    key={symbol}
                    type="button"
                    onClick={() => setSelectedSymbol(symbol)}
                    className={`mobile-market-pill${active ? ' mobile-market-pill--active' : ''}`}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: 10, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>{symbol}</div>
                    <div style={{ fontSize: 14, color: T.text, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>
                      {formatQuotePrice(quote?.price)}
                    </div>
                    <div style={{ fontSize: 9, color: getStatusTone(getDataStatus(quote)), marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                      {getStatusLabel(getDataStatus(quote))}
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="mobile-hero-card">
              <div className="mobile-hero-card__header">
                <span className="mobile-section__title">Chart</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setTradeDialogOpen(true)}
                    title="تداول"
                    aria-label="فتح نافذة التداول"
                    style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #00FFC6, #0A84FF)',
                      border: 'none', color: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 0 12px rgba(0,255,198,0.3), 0 0 4px rgba(10,132,255,0.2)',
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                    }}
                    onMouseDown={e => e.currentTarget.style.transform = 'scale(0.9)'}
                    onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    <Zap size={15} fill="white" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartExpanded(value => !value)}
                    title={chartExpanded ? 'تصغير الرسم البياني' : 'توسيع الرسم البياني'}
                    aria-label={chartExpanded ? 'تصغير الرسم البياني' : 'توسيع الرسم البياني'}
                    style={{ background: 'transparent', border: 'none', color: T.text3, cursor: 'pointer' }}
                  >
                    <ChevronDown size={16} style={{ transform: chartExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} />
                  </button>
                </div>
              </div>

              <div className={`mobile-hero-chart${chartExpanded ? ' mobile-hero-chart--expanded' : ''}`}>
                <RouaChart
                  currentPrice={currentPrice}
                  mobile
                  compact={!chartExpanded}
                  onExpand={() => setChartExpanded(value => !value)}
                  isChartFullscreen={chartFullscreen}
                  onToggleChartFullscreen={toggleChartFullscreen}
                />
              </div>
            </div>

            <div className="mobile-summary-strip">
              {mobileSummaryCards.map(card => (
                <div key={card.label} className="mobile-summary-card">
                  <div style={{ fontSize: 9, color: T.text3, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.label}</div>
                  <div style={{ fontSize: 11, color: card.tone, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mobile-panel-shell">
            {activeMobileView === 'execution' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10, height: '100%' }}>
                <div className="mobile-section__header">
                  <span className="mobile-section__title">الحساب والمراكز</span>
                  <BarChart3 size={18} color={T.text3} />
                </div>
                <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${T.border}`, background: T.card }}>
                  <PortfolioMini mobile compact dataStatus={quoteStatus} lastUpdatedAt={activeQuote?.timestamp ?? null} sourceLabel={sourceLabel} selectedSymbol={selectedSymbol} />
                </div>
              </div>
            )}

            {activeMobileView === 'market' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10, height: '100%' }}>
                <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${T.border}`, background: T.card }}>
                  <OrderBookPanel mobile collapsedByDefault dataStatus={quoteStatus} lastUpdatedAt={activeQuote?.timestamp ?? null} sourceLabel={sourceLabel} />
                </div>
                <div style={{ minHeight: 0, flex: 1, borderRadius: 14, overflow: 'hidden', border: `1px solid ${T.border}`, background: T.card }}>
                  <WatchlistMini selectedSymbol={selectedSymbol} />
                </div>
              </div>
            )}

            {activeMobileView === 'portfolio' && (
              <div style={{ padding: 10, height: '100%' }}>
                <div style={{ height: '100%', borderRadius: 14, overflow: 'hidden', border: `1px solid ${T.border}`, background: T.card }}>
                  <PortfolioMini mobile dataStatus={quoteStatus} lastUpdatedAt={activeQuote?.timestamp ?? null} sourceLabel={sourceLabel} selectedSymbol={selectedSymbol} />
                </div>
              </div>
            )}

            {activeMobileView === 'insight' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10, height: '100%' }}>
                <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${T.border}`, background: T.card }}>
                  <ScannerMini mobile compact selectedSymbol={selectedSymbol} />
                </div>
                <div style={{ minHeight: 0, flex: 1, borderRadius: 14, overflow: 'hidden', border: `1px solid ${T.border}`, background: T.card }}>
                  <AlNarratorMini mobile compact selectedSymbol={selectedSymbol} dataStatus={quoteStatus} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Trade Dialog (bottom sheet) for mobile */}
      {isMobileViewport && tradeDialogOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setTradeDialogOpen(false)}
        >
          <div
            style={{ width: '100%', maxHeight: '85dvh', background: '#0B0E14', borderTopLeftRadius: 20, borderTopRightRadius: 20, border: '1px solid rgba(0,212,255,0.15)', overflow: 'auto', padding: 16, paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 14, fontWeight: 800, color: '#F0F2F5' }}>تنفيذ سريع</span>
              <button onClick={() => setTradeDialogOpen(false)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, width: 32, height: 32, color: '#8B92A8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>✕</button>
            </div>
            <QuickExecutionMini mobile dataStatus={accountDataStatus} lastUpdatedAt={activeQuote?.timestamp ?? null} sourceLabel={sourceLabel} />
          </div>
        </div>
      )}

      {/* Sidebar Drawer for compact desktop */}
      {isCompactDesktopViewport && !sidebarPinned && (
        <SidebarDrawer
          open={sidebarDrawerOpen}
          onClose={() => setSidebarDrawerOpen(false)}
          onPin={() => setSidebarPinned(true)}
          pinned={sidebarPinned}
        >
          <LeftSidebarLayout />
        </SidebarDrawer>
      )}

      {/* FAB button to open sidebar on compact desktop */}
      {isCompactDesktopViewport && !sidebarDrawerOpen && !sidebarPinned && (
        <button
          type="button"
          className="sidebar-fab sidebar-fab--pulsing"
          onClick={() => setSidebarDrawerOpen(true)}
          title="فتح الشريط الجانبي"
          aria-label="فتح الشريط الجانبي"
        >
          <PanelRight size={22} />
        </button>
      )}

      {/* FAB button for mobile */}
      {isMobileViewport && (
        <button
          type="button"
          className="sidebar-fab"
          onClick={() => setSidebarDrawerOpen(true)}
          title="المحفظة"
          aria-label="المحفظة"
        >
          <Wallet size={22} />
        </button>
      )}

      {/* Mobile drawer */}
      {isMobileViewport && sidebarDrawerOpen && (
        <SidebarDrawer
          open={sidebarDrawerOpen}
          onClose={() => setSidebarDrawerOpen(false)}
        >
          <LeftSidebarLayout />
        </SidebarDrawer>
      )}

      {isMobileViewport && (
        <nav className="mobile-bottom-nav" aria-label="Mobile dashboard navigation">
          <div className="mobile-bottom-nav__inner">
            {[
              { id: 'execution', label: 'تنفيذ', icon: BarChart3 },
              { id: 'market', label: 'السوق', icon: ScanSearch },
              { id: 'portfolio', label: 'المحفظة', icon: Wallet },
              { id: 'insight', label: 'رؤى', icon: Brain },
            ].map(item => {
              const Icon = item.icon
              const active = activeMobileView === item.id

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveMobileView(item.id as MobileView)}
                  className={`mobile-bottom-nav__button${active ? ' mobile-bottom-nav__button--active' : ''}`}
                  title={item.label}
                  aria-label={item.label}
                >
                  <Icon size={18} />
                  <span className="mobile-bottom-nav__label">{item.label}</span>
                </button>
              )
            })}
          </div>
        </nav>
      )}
    </>
  )
}
