'use client'

import { useMemo, useState } from 'react'
import {
  Activity,
  Bell,
  Bot,
  Brain,
  CalendarDays,
  ChartCandlestick,
  GitMerge,
  Newspaper,
  Search,
  Wallet,
} from 'lucide-react'
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

const T = {
  shell: '#09111A',
  rail: '#0C1621',
  railSoft: '#111D2A',
  panel: '#0E1824',
  panelTop: '#122030',
  border: 'rgba(148, 163, 184, 0.12)',
  borderStrong: 'rgba(0, 229, 255, 0.22)',
  text: '#E8EEF8',
  textSoft: '#A2B4C8',
  textMute: '#6F849C',
  cyan: '#00E5FF',
  blue: '#3B82F6',
  green: '#00C853',
  red: '#FF5A54',
  amber: '#F5B942',
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
  icon: any
  accent: string
  tone: string
}> = [
  { id: 'portfolio', label: 'المحفظة', helper: 'الرصيد والمراكز', icon: Wallet, accent: T.blue, tone: 'المركز المالي' },
  { id: 'execute', label: 'التنفيذ', helper: 'أمر سريع', icon: Bot, accent: T.green, tone: 'أمر السوق' },
  { id: 'book', label: 'دفتر الأوامر', helper: 'العمق والسيولة', icon: ChartCandlestick, accent: T.red, tone: 'بنية السوق' },
  { id: 'watch', label: 'قائمة السوق', helper: 'المراقبة الحية', icon: Search, accent: T.cyan, tone: 'الرموز النشطة' },
  { id: 'alerts', label: 'التنبيهات', helper: 'قواعد المتابعة', icon: Bell, accent: T.amber, tone: 'الشروط والتنبيه' },
  { id: 'ai', label: 'رؤى AI', helper: 'الشرح والسياق', icon: Brain, accent: T.purple, tone: 'القراءة التفسيرية' },
  { id: 'news', label: 'الأخبار', helper: 'تدفق السوق', icon: Newspaper, accent: T.cyan, tone: 'السياق الإخباري' },
  { id: 'calendar', label: 'الأجندة', helper: 'أحداث مؤثرة', icon: CalendarDays, accent: T.amber, tone: 'الماكرو القادم' },
  { id: 'backtest', label: 'المختبر', helper: 'اختبار سريع', icon: Activity, accent: T.purple, tone: 'صلاحية الفكرة' },
  { id: 'correlation', label: 'الارتباط', helper: 'ترابط الأصول', icon: GitMerge, accent: T.green, tone: 'مخاطر التداخل' },
]

function TabButton({
  label,
  helper,
  icon: Icon,
  accent,
  active,
  onClick,
}: {
  label: string
  helper: string
  icon: any
  accent: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        minHeight: 50,
        padding: '10px 12px',
        borderRadius: 14,
        border: `1px solid ${active ? `${accent}52` : 'rgba(148, 163, 184, 0.10)'}`,
        background: active
          ? `linear-gradient(90deg, ${accent}18, rgba(255,255,255,0.03))`
          : 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.015))',
        display: 'grid',
        gridTemplateColumns: '28px minmax(0, 1fr)',
        alignItems: 'center',
        gap: 10,
        cursor: 'pointer',
        textAlign: 'right',
        boxShadow: active
          ? `inset 3px 0 0 ${accent}, 0 0 0 1px ${accent}16, 0 8px 22px ${accent}10`
          : 'inset 0 1px 0 rgba(255,255,255,0.02)',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: active ? `${accent}16` : 'rgba(255,255,255,0.035)',
          border: `1px solid ${active ? `${accent}3b` : 'rgba(255,255,255,0.08)'}`,
        }}
      >
        <Icon size={14} color={active ? accent : '#94A9C2'} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            lineHeight: 1.1,
            color: active ? T.text : '#D7E2EF',
            fontWeight: 900,
            fontFamily: "'Cairo', sans-serif",
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 8,
            lineHeight: 1.2,
            color: active ? accent : T.textMute,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {helper}
        </div>
      </div>
    </button>
  )
}

export function LeftSidebarLayout() {
  const [tab, setTab] = useState<TabId>('portfolio')
  const active = useMemo(() => TABS.find(item => item.id === tab) || TABS[0], [tab])

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '156px minmax(0, 1fr)',
        height: '100%',
        minHeight: 0,
        borderRadius: 18,
        overflow: 'hidden',
        border: `1px solid ${T.borderStrong}`,
        background: `linear-gradient(180deg, ${T.shell}, #060B12)`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 20px 44px rgba(0,0,0,0.28)',
      }}
    >
      <aside
        style={{
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          background: `linear-gradient(180deg, ${T.rail}, ${T.railSoft})`,
          borderLeft: `1px solid ${T.border}`,
        }}
      >
        <div
          style={{
            padding: '14px 12px 12px',
            borderBottom: `1px solid ${T.border}`,
            display: 'grid',
            gap: 5,
          }}
        >
          <div style={{ fontSize: 12, color: T.text, fontWeight: 900, fontFamily: "'Cairo', sans-serif" }}>المركز الأيسر</div>
          <div style={{ fontSize: 8, color: T.textSoft, lineHeight: 1.6 }}>تنقل رأسي واضح بين الأدوات والسياق بدون ازدحام.</div>
        </div>

        <div
          className="custom-scrollbar"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: 10,
            display: 'grid',
            alignContent: 'start',
            gap: 8,
          }}
        >
          {TABS.map(item => (
            <TabButton
              key={item.id}
              label={item.label}
              helper={item.helper}
              icon={item.icon}
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
            padding: '14px 16px 12px',
            borderBottom: `1px solid ${T.border}`,
            display: 'grid',
            gap: 8,
            background: `linear-gradient(90deg, ${active.accent}10, rgba(255,255,255,0.01))`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: active.accent,
                  boxShadow: `0 0 16px ${active.accent}77`,
                  flexShrink: 0,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: T.text, fontWeight: 900, fontFamily: "'Cairo', sans-serif" }}>{active.label}</div>
                <div style={{ marginTop: 3, fontSize: 9, color: T.textSoft }}>{active.helper}</div>
              </div>
            </div>
            <div
              style={{
                flexShrink: 0,
                padding: '5px 10px',
                borderRadius: 999,
                border: `1px solid ${active.accent}40`,
                background: `${active.accent}14`,
                color: active.accent,
                fontSize: 8,
                fontWeight: 900,
                letterSpacing: '0.03em',
                fontFamily: "'Cairo', sans-serif",
              }}
            >
              {active.tone}
            </div>
          </div>

          <div
            style={{
              padding: '9px 11px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.07)',
              background: 'rgba(255,255,255,0.028)',
              fontSize: 9,
              color: '#C8D5E4',
              lineHeight: 1.7,
            }}
          >
            اختر من العمود الأيسر ثم ركّز على وحدة واحدة فقط بدل تكديس أدوات كثيرة في نفس اللحظة.
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            padding: 10,
            background: 'linear-gradient(180deg, rgba(8,13,20,0.92), rgba(6,10,16,0.98))',
          }}
        >
          <div
            style={{
              height: '100%',
              minHeight: 0,
              overflow: 'hidden',
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'linear-gradient(180deg, rgba(14,20,30,0.98), rgba(8,12,19,0.98))',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.035), 0 16px 34px rgba(0,0,0,0.22)',
            }}
          >
            {tab === 'portfolio' && <PortfolioMini compact />}
            {tab === 'execute' && <QuickExecutionMini />}
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
      </section>
    </div>
  )
}
