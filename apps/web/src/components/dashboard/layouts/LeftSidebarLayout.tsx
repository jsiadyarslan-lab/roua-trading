'use client'

import { useMemo, useState } from 'react'
import { PortfolioMini } from '@/components/portfolio/PortfolioMini'
import { AlNarratorMini } from '@/components/ai/AlNarratorMini'
import { QuickExecutionMini } from '@/components/dashboard/QuickExecutionMini'
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
import { getDataStatus, getSourceLabel } from '@/lib/dashboard-live'

const T = {
  shell: '#0B0E14',
  rail: '#0A0D14',
  railSoft: '#0E1118',
  panel: '#1A1D29',
  panelTop: '#1E2233',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(0,212,255,0.18)',
  text: '#E8EEF8',
  textSoft: '#A2B4C8',
  textMute: '#6F849C',
  cyan: '#00D4FF',
  blue: '#0A84FF',
  green: '#00FFA3',
  red: '#FF4757',
  amber: '#FFB800',
  purple: '#B388FF',
}

type TabId =
  | 'portfolio'
  | 'execute'
  | 'book'
  | 'watch'
  | 'alerts'
  | 'ai'
  | 'news'
  | 'calendar'
  | 'backtest'
  | 'correlation'

const TABS: Array<{
  id: TabId
  label: string
  helper: string
  accent: string
  tone: string
}> = [
  { id: 'portfolio', label: 'المحفظة', helper: 'الرصيد والمراكز', accent: T.blue, tone: 'المركز المالي' },
  { id: 'execute', label: 'التنفيذ', helper: 'أمر سريع', accent: T.green, tone: 'أمر السوق' },
  { id: 'book', label: 'دفتر الأوامر', helper: 'العمق والسيولة', accent: T.red, tone: 'بنية السوق' },
  { id: 'watch', label: 'قائمة السوق', helper: 'المراقبة الحية', accent: T.cyan, tone: 'الرموز النشطة' },
  { id: 'alerts', label: 'التنبيهات', helper: 'قواعد المتابعة', accent: T.amber, tone: 'الشروط والتنبيه' },
  { id: 'ai', label: 'رؤى AI', helper: 'الشرح والسياق', accent: T.purple, tone: 'القراءة التفسيرية' },
  { id: 'news', label: 'الأخبار', helper: 'تدفق السوق', accent: T.cyan, tone: 'السياق الإخباري' },
  { id: 'calendar', label: 'الأجندة', helper: 'أحداث مؤثرة', accent: T.amber, tone: 'الماكرو القادم' },
  { id: 'backtest', label: 'المختبر', helper: 'اختبار سريع', accent: T.purple, tone: 'صلاحية الفكرة' },
  { id: 'correlation', label: 'الارتباط', helper: 'ترابط الأصول', accent: T.green, tone: 'مخاطر التداخل' },
]

function TabButton({
  label,
  accent,
  active,
  onClick,
}: {
  label: string
  accent: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 'fit-content',
        maxWidth: '100%',
        minHeight: 26,
        padding: '5px 8px',
        borderRadius: 8,
        border: `1px solid ${active ? `${accent}55` : 'rgba(148, 163, 184, 0.14)'}`,
        background: active
          ? `linear-gradient(135deg, ${accent}18, rgba(255,255,255,0.03))`
          : 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        cursor: 'pointer',
        textAlign: 'center',
        boxShadow: active
          ? `inset 2px 0 0 ${accent}, 0 0 0 1px ${accent}15, 0 0 14px ${accent}08`
          : 'inset 0 1px 0 rgba(255,255,255,0.02)',
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{ minWidth: 0, maxWidth: '100%' }}>
        <div
          style={{
            fontSize: 7.5,
            lineHeight: 1,
            color: active ? '#FFFFFF' : '#C6D3E2',
            fontWeight: 900,
            fontFamily: "'Cairo', sans-serif",
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </div>
      </div>
      <div
        style={{
          flexShrink: 0,
          width: 3,
          height: 3,
          borderRadius: 999,
          background: active ? accent : 'rgba(255,255,255,0.14)',
          boxShadow: active ? `0 0 8px ${accent}66` : 'none',
        }}
      />
    </button>
  )
}

export function LeftSidebarLayout() {
  const [tab, setTab] = useState<TabId>('portfolio')
  const active = useMemo(() => TABS.find(item => item.id === tab) || TABS[0], [tab])
  
  // Get current symbol and derive data status from market store
  const selectedSymbol = useSymbolStore((s) => s.selectedSymbol)
  const quotes = useMarketStore((s) => s.quotes)
  const activeQuote = selectedSymbol ? quotes[selectedSymbol] : null
  const quoteStatus = getDataStatus(activeQuote)
  const sourceLabel = getSourceLabel(activeQuote?.source)

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '74px minmax(0, 1fr)',
        height: '100%',
        minHeight: 0,
        borderRadius: 14,
        overflow: 'hidden',
        border: `1px solid ${T.borderStrong}`,
        background: 'rgba(26, 29, 41, 0.65)',
        backdropFilter: 'blur(16px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <aside
        style={{
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          background: `linear-gradient(180deg, ${T.rail}, ${T.railSoft})`,
          borderLeft: `1px solid rgba(0,212,255,0.12)`,
        }}
      >
        <div
          style={{
            padding: '8px 5px 7px',
            borderBottom: `1px solid rgba(0,212,255,0.10)`,
            display: 'grid',
            gap: 3,
          }}
        >
          <div style={{ fontSize: 8.5, color: T.text, fontWeight: 900, fontFamily: "'Cairo', sans-serif" }}>الأدوات</div>
          <div style={{ fontSize: 6, color: T.textSoft, lineHeight: 1.3 }}>أسماء فقط</div>
        </div>

        <div
          className="custom-scrollbar"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: 4,
            display: 'grid',
            justifyItems: 'center',
            alignContent: 'start',
            gap: 4,
          }}
        >
          {TABS.map(item => (
            <TabButton
              key={item.id}
              label={item.label}
              accent={item.accent}
              active={item.id === tab}
              onClick={() => setTab(item.id)}
            />
          ))}
        </div>
      </aside>

      <section
        style={{
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          background: `linear-gradient(180deg, ${T.panelTop}, ${T.panel})`,
        }}
      >
        <div
          style={{
            padding: '10px 11px 9px',
            borderBottom: `1px solid rgba(0,212,255,0.10)`,
            display: 'grid',
            gap: 5,
            background: `linear-gradient(90deg, ${active.accent}10, rgba(255,255,255,0.01))`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: active.accent,
                  boxShadow: `0 0 10px ${active.accent}55`,
                  flexShrink: 0,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: T.text, fontWeight: 900, fontFamily: "'Cairo', sans-serif" }}>{active.label}</div>
                <div style={{ marginTop: 2, fontSize: 7.5, color: T.textSoft }}>{active.helper}</div>
              </div>
            </div>
            <div
              style={{
                flexShrink: 0,
                padding: '4px 7px',
                borderRadius: 999,
                border: `1px solid ${active.accent}35`,
                background: `${active.accent}12`,
                color: active.accent,
                fontSize: 6.5,
                fontWeight: 900,
                letterSpacing: '0.03em',
                fontFamily: "'Cairo', sans-serif",
              }}
            >
              {active.tone}
            </div>
          </div>

        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            padding: 4,
            background: 'linear-gradient(180deg, rgba(8,13,20,0.92), rgba(6,10,16,0.98))',
          }}
        >
          <div
            style={{
              height: '100%',
              minHeight: 0,
              overflow: 'hidden',
              borderRadius: 12,
              border: '1px solid rgba(0,212,255,0.12)',
              background: 'linear-gradient(180deg, rgba(14,20,30,0.98), rgba(8,12,19,0.98))',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.025), 0 10px 22px rgba(0,0,0,0.18)',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                zoom: 0.82,
              }}
            >
              {tab === 'portfolio' && <PortfolioMini compact dataStatus={quoteStatus} lastUpdatedAt={activeQuote?.timestamp ?? null} sourceLabel={sourceLabel} selectedSymbol={selectedSymbol} />}
              {tab === 'execute' && <QuickExecutionMini mobile />}
              {tab === 'book' && <OrderBookMini />}
              {tab === 'watch' && <WatchlistMini />}
              {tab === 'alerts' && <PriceAlertsPanel />}
              {tab === 'ai' && <AlNarratorMini compact />}
              {tab === 'news' && <DesktopNewsPanel />}
              {tab === 'calendar' && <DesktopCalendarPanel />}
              {tab === 'backtest' && <DesktopBacktestPanel />}
              {tab === 'correlation' && <DesktopCorrelationPanel />}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
