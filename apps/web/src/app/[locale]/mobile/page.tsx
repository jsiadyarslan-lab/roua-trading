'use client';
import { useState, useEffect, useCallback } from 'react';
import { usePositionsStore } from '@/hooks/usePositionsStore';
import { useSymbolStore } from '@/hooks/useSymbolStore';
import dynamic from 'next/dynamic';
import { useRouter, useParams } from 'next/navigation';

// Lazy load heavy components
const RouaChart = dynamic(() => import('@/components/charts/RouaChart'), { ssr: false });

// ── الألوان ────────────────────────────────────────────────
const C = {
  bg:       '#0B0E14',
  bg2:      '#0F1117',
  card:     '#151821',
  card2:    '#1A1D29',
  border:   '#1E2235',
  cyan:     '#00D4FF',
  green:    '#00FFA3',
  red:      '#FF4757',
  amber:    '#FFB800',
  text:     '#F0F2F5',
  text2:    '#8B92A8',
  text3:    '#4A5068',
  gold:     '#d4af37',
  nav:      '#0D1018',
};

// ── تعريف التبويبات ─────────────────────────────────────────
type TabId = 'home' | 'chart' | 'trade' | 'positions' | 'ai' | 'more';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'home',      label: 'الرئيسية',  icon: 'home' },
  { id: 'chart',     label: 'الشارت',    icon: 'chart' },
  { id: 'trade',     label: 'تداول',     icon: 'trade' },
  { id: 'positions', label: 'مراكزي',    icon: 'pos' },
  { id: 'ai',        label: 'الذكاء',    icon: 'ai' },
  { id: 'more',      label: 'المزيد',    icon: 'more' },
];

// ── أيقونات SVG مخصصة ──────────────────────────────────────
function Icon({ name, active }: { name: string; active: boolean }) {
  const c = active ? C.cyan : C.text3;
  const s = { width: 22, height: 22 };

  if (name === 'home') return (
    <svg {...s} viewBox="0 0 24 24" fill="none">
      <path d="M3 12L5 10M5 10L12 3L19 10M5 10V20C5 20.5523 5.44772 21 6 21H9M19 10L21 12M19 10V20C19 20.5523 18.5523 21 18 21H15M9 21C9 21 9 15 12 15C15 15 15 21 15 21M9 21H15"
        stroke={c} strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  if (name === 'chart') return (
    <svg {...s} viewBox="0 0 24 24" fill="none">
      <path d="M3 17L7.5 12L10.5 15L14 9L17.5 13L21 7"
        stroke={c} strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round"/>
      {active && <circle cx="21" cy="7" r="2" fill={c}/>}
    </svg>
  );

  if (name === 'trade') return (
    <svg {...s} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={c} strokeWidth={active ? 2 : 1.5}/>
      <path d="M12 7V12L15 15" stroke={c} strokeWidth={active ? 2 : 1.5} strokeLinecap="round"/>
      {active && <circle cx="12" cy="12" r="3" fill={c} opacity="0.3"/>}
    </svg>
  );

  if (name === 'pos') return (
    <svg {...s} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke={c} strokeWidth={active ? 2 : 1.5}/>
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke={c} strokeWidth={active ? 2 : 1.5}/>
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke={c} strokeWidth={active ? 2 : 1.5}/>
      <path d="M14 17.5H21M17.5 14V21" stroke={c} strokeWidth={active ? 2 : 1.5} strokeLinecap="round"/>
    </svg>
  );

  if (name === 'ai') return (
    <svg {...s} viewBox="0 0 24 24" fill="none">
      <path d="M12 2C6.477 2 2 6.477 2 12C2 17.523 6.477 22 12 22C17.523 22 22 17.523 22 12C22 6.477 17.523 2 12 2Z"
        stroke={c} strokeWidth={active ? 2 : 1.5}/>
      <path d="M8 12C8 9.791 9.791 8 12 8C14.209 8 16 9.791 16 12C16 14.209 14.209 16 12 16"
        stroke={c} strokeWidth={active ? 2 : 1.5} strokeLinecap="round"/>
      {active && <circle cx="12" cy="12" r="2" fill={c}/>}
      <path d="M12 2V4M12 20V22M2 12H4M20 12H22" stroke={c} strokeWidth={1.5} strokeLinecap="round"/>
    </svg>
  );

  if (name === 'more') return (
    <svg {...s} viewBox="0 0 24 24" fill="none">
      <circle cx="5" cy="12" r="1.5" fill={c}/>
      <circle cx="12" cy="12" r="1.5" fill={c}/>
      <circle cx="19" cy="12" r="1.5" fill={c}/>
    </svg>
  );

  return null;
}

// ── Bottom Navigation ──────────────────────────────────────
function BottomNav({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <div style={{
      position: 'relative',
      height: 58,
      background: C.nav,
      borderTop: `1px solid ${C.border}`,
      display: 'flex',
      alignItems: 'stretch',
      flexShrink: 0,
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {/* Glow indicator */}
      {TABS.map((tab, i) => tab.id === active && (
        <div key={tab.id} style={{
          position: 'absolute',
          top: 0,
          left: `${(i / TABS.length) * 100}%`,
          width: `${100 / TABS.length}%`,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${C.cyan}, transparent)`,
          transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
        }}/>
      ))}
      {TABS.map(tab => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '6px 0 4px',
              WebkitTapHighlightColor: 'transparent',
              transition: 'transform 0.12s ease',
            }}
            onTouchStart={e => (e.currentTarget.style.transform = 'scale(0.92)')}
            onTouchEnd={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <Icon name={tab.icon} active={isActive}/>
            <span style={{
              fontSize: 9,
              fontFamily: "'Cairo', sans-serif",
              fontWeight: isActive ? 700 : 400,
              color: isActive ? C.cyan : C.text3,
              letterSpacing: 0.3,
              lineHeight: 1,
            }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── شاشة الرئيسية ──────────────────────────────────────────
function HomeScreen() {
  const { account, positions } = usePositionsStore();
  const equity  = Number(account?.equity)         || 0;
  const cash    = Number(account?.cash)            || 0;
  const pnl     = Number(account?.unrealizedPnl)  || 0;
  const margin  = Number(account?.initialMargin)  || 0;

  const openCount  = positions.filter(p => (p as any).status !== 'CLOSED').length;
  const pnlColor   = pnl >= 0 ? C.green : C.red;
  const pnlSign    = pnl >= 0 ? '+' : '';

  const fmt  = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px 8px' }}>

      {/* بطاقة الرصيد */}
      <div style={{
        background: `linear-gradient(135deg, ${C.card} 0%, ${C.card2} 100%)`,
        borderRadius: 16,
        padding: '20px 18px',
        marginBottom: 12,
        border: `1px solid ${C.border}`,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* خط زخرفي */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${C.cyan}55, transparent)`,
        }}/>
        <div style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>
          حقوق الملكية
        </div>
        <div style={{
          fontSize: 30, fontWeight: 800, color: C.text,
          fontFamily: "'JetBrains Mono', monospace", letterSpacing: -0.5,
        }}>
          ${fmt(equity)}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 9, color: C.text3, fontFamily: "'Cairo', sans-serif" }}>الرصيد</div>
            <div style={{ fontSize: 13, color: C.text, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
              ${fmt(cash)}
            </div>
          </div>
          <div style={{ width: 1, background: C.border }}/>
          <div>
            <div style={{ fontSize: 9, color: C.text3, fontFamily: "'Cairo', sans-serif" }}>الهامش</div>
            <div style={{ fontSize: 13, color: C.amber, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
              ${fmt(margin)}
            </div>
          </div>
          <div style={{ width: 1, background: C.border }}/>
          <div>
            <div style={{ fontSize: 9, color: C.text3, fontFamily: "'Cairo', sans-serif" }}>ر/خ عائم</div>
            <div style={{ fontSize: 13, color: pnlColor, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
              {pnlSign}${fmt(Math.abs(pnl))}
            </div>
          </div>
        </div>
      </div>

      {/* المراكز المفتوحة */}
      <div style={{
        background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
        marginBottom: 12, overflow: 'hidden',
      }}>
        <div style={{
          padding: '10px 14px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 11, fontFamily: "'Cairo', sans-serif", color: C.text, fontWeight: 700 }}>
            المراكز المفتوحة
          </span>
          <span style={{
            fontSize: 10, background: `${C.cyan}22`, color: C.cyan,
            padding: '2px 8px', borderRadius: 20, fontWeight: 700,
          }}>
            {openCount}
          </span>
        </div>
        {positions.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: C.text3, fontSize: 12, fontFamily: "'Cairo', sans-serif" }}>
            لا توجد مراكز مفتوحة
          </div>
        ) : positions.slice(0, 4).map((pos: any, i: number) => {
          const posP = Number(pos.unrealizedPnl) || 0;
          const isLong = pos.side === 'BUY' || pos.side === 'long';
          return (
            <div key={pos.id || i} style={{
              padding: '10px 14px',
              borderBottom: i < Math.min(positions.length, 4) - 1 ? `1px solid ${C.border}33` : 'none',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: isLong ? C.green : C.red, flexShrink: 0,
                }}/>
                <div>
                  <div style={{ fontSize: 12, color: C.text, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                    {(pos.symbol || '').replace('/USDT','').replace('/USD','')}
                  </div>
                  <div style={{ fontSize: 9, color: isLong ? C.green : C.red, fontFamily: "'Cairo', sans-serif" }}>
                    {isLong ? 'شراء' : 'بيع'}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: posP >= 0 ? C.green : C.red, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                  {posP >= 0 ? '+' : ''}${posP.toFixed(2)}
                </div>
                <div style={{ fontSize: 9, color: C.text3, fontFamily: "'JetBrains Mono', monospace" }}>
                  {Number(pos.currentPrice || 0).toFixed(2)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

// ── شاشة الشارت ──────────────────────────────────────────────
function ChartScreen() {
  const { selectedSymbol, timeframe, setSelectedSymbol, setTimeframe } = useSymbolStore();
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      <RouaChart
        mobile={true}
        symbol={selectedSymbol}
        timeframe={timeframe}
        currentPrice={null}
        changePercent={null}
        isPaused={false}
        loading={false}
        onSymbolChange={setSelectedSymbol}
        onTimeframeChange={setTimeframe}
        onActivate={() => {}}
      />
    </div>
  );
}

// ── شاشة التداول ─────────────────────────────────────────────
function TradeScreen() {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px' }}>
      <div style={{
        background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
        padding: 20, textAlign: 'center',
      }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>⚡</div>
        <div style={{ color: C.text, fontSize: 14, fontFamily: "'Cairo', sans-serif", fontWeight: 700, marginBottom: 4 }}>
          التنفيذ السريع
        </div>
        <div style={{ color: C.text2, fontSize: 11, fontFamily: "'Cairo', sans-serif" }}>
          افتح الشارت واستخدم لوحة التداول
        </div>
      </div>
    </div>
  );
}

// ── شاشة المراكز ─────────────────────────────────────────────
function PositionsScreen() {
  const { positions } = usePositionsStore();
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 8px' }}>
      {positions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.text3, fontFamily: "'Cairo', sans-serif" }}>
          لا توجد مراكز مفتوحة
        </div>
      ) : positions.map((pos: any, i: number) => {
        const posP  = Number(pos.unrealizedPnl) || 0;
        const isLong = pos.side === 'BUY' || pos.side === 'long';
        const entry  = Number(pos.entryPrice || pos.avgEntryPrice) || 0;
        const curr   = Number(pos.currentPrice) || 0;
        const sl     = Number(pos.stopLoss) || 0;
        const tp     = Number(pos.takeProfit) || 0;
        return (
          <div key={pos.id || i} style={{
            background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
            padding: '12px 14px', marginBottom: 8,
            borderLeft: `3px solid ${isLong ? C.green : C.red}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>
                  {pos.symbol}
                </span>
                <span style={{
                  fontSize: 9, padding: '2px 6px', borderRadius: 4,
                  background: isLong ? `${C.green}20` : `${C.red}20`,
                  color: isLong ? C.green : C.red,
                  fontFamily: "'Cairo', sans-serif", fontWeight: 700,
                }}>
                  {isLong ? 'شراء' : 'بيع'}
                </span>
              </div>
              <span style={{
                fontSize: 13, fontWeight: 800,
                color: posP >= 0 ? C.green : C.red,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {posP >= 0 ? '+' : ''}${fmt(Math.abs(posP))}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
              {[
                { label: 'الدخول', value: `$${entry.toFixed(2)}`, color: C.cyan },
                { label: 'الحالي', value: `$${curr.toFixed(2)}`, color: C.text },
                { label: 'الكمية', value: String(pos.qty || pos.quantity || 0), color: C.amber },
                sl ? { label: 'وقف الخسارة', value: `$${sl.toFixed(2)}`, color: C.red } : null,
                tp ? { label: 'جني الربح', value: `$${tp.toFixed(2)}`, color: C.green } : null,
              ].filter(Boolean).map((item: any, j) => (
                <div key={j} style={{ background: `${C.bg}88`, borderRadius: 6, padding: '5px 8px' }}>
                  <div style={{ fontSize: 8, color: C.text3, fontFamily: "'Cairo', sans-serif" }}>{item.label}</div>
                  <div style={{ fontSize: 10, color: item.color, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── شاشة الذكاء الاصطناعي ────────────────────────────────────
function AIScreen() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || 'ar';

  const tools = [
    { label: 'المجلس الاستراتيجي', icon: '🏛️', href: `/${locale}/dashboard`, color: C.cyan },
    { label: 'الوكيل الآلي', icon: '🤖', href: `/${locale}/dashboard/autonomous-trader`, color: C.green },
    { label: 'المنفذ الذكي', icon: '⚡', href: `/${locale}/dashboard`, color: C.amber },
    { label: 'التحليل الفني', icon: '📊', href: `/${locale}/dashboard/scanner`, color: '#B388FF' },
    { label: 'التنبؤات', icon: '🔮', href: `/${locale}/dashboard/prediction-market`, color: C.gold },
    { label: 'الملاذ', icon: '🛡️', href: `/${locale}/dashboard/sanctuary`, color: C.red },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px 8px' }}>
      <div style={{
        fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif",
        marginBottom: 12, textAlign: 'center',
      }}>
        أدوات الذكاء الاصطناعي
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {tools.map((tool, i) => (
          <button
            key={i}
            onClick={() => router.push(tool.href)}
            style={{
              background: C.card, borderRadius: 12,
              border: `1px solid ${C.border}`,
              padding: '16px 12px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{ fontSize: 28 }}>{tool.icon}</span>
            <span style={{
              fontSize: 10, color: C.text, fontFamily: "'Cairo', sans-serif",
              fontWeight: 700, textAlign: 'center', lineHeight: 1.3,
            }}>
              {tool.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── شاشة المزيد ───────────────────────────────────────────────
function MoreScreen() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || 'ar';

  const sections = [
    {
      title: 'التداول',
      items: [
        { label: 'المحفظة',          icon: '💼', href: `/${locale}/dashboard/portfolio` },
        { label: 'الصفقات',           icon: '📋', href: `/${locale}/dashboard/positions` },
        { label: 'الإشارات',          icon: '📡', href: `/${locale}/dashboard/signals` },
        { label: 'التداول الاجتماعي', icon: '👥', href: `/${locale}/dashboard/copy-trading` },
      ],
    },
    {
      title: 'التحليل',
      items: [
        { label: 'الأخبار',           icon: '📰', href: `/${locale}/dashboard/news` },
        { label: 'السكانر',           icon: '🔍', href: `/${locale}/dashboard/scanner` },
        { label: 'التحليل الاستراتيجي', icon: '🎯', href: `/${locale}/dashboard` },
        { label: 'أسواق التنبؤ',      icon: '🔮', href: `/${locale}/dashboard/prediction-market` },
        { label: 'الارتباط',          icon: '🕸️', href: `/${locale}/dashboard/correlation` },
        { label: 'الشبكة العصبية',    icon: '🧠', href: `/${locale}/dashboard/neural` },
      ],
    },
    {
      title: 'الاستراتيجيات',
      items: [
        { label: 'منشئ الاستراتيجيات', icon: '🛠️', href: `/${locale}/dashboard/strategy-builder` },
        { label: 'الاختبار التاريخي',  icon: '⏪', href: `/${locale}/dashboard/strategies/backtest` },
        { label: 'التقويم',            icon: '📅', href: `/${locale}/dashboard/calendar` },
      ],
    },
    {
      title: 'الحساب',
      items: [
        { label: 'الإعدادات',         icon: '⚙️', href: `/${locale}/dashboard/settings` },
        { label: 'الملف الشخصي',     icon: '👤', href: `/${locale}/dashboard/profile` },
        { label: 'الأمان',            icon: '🔒', href: `/${locale}/dashboard/security/2fa` },
        { label: 'الإشعارات',         icon: '🔔', href: `/${locale}/dashboard/notifications` },
        { label: 'المساعدة',          icon: '❓', href: `/${locale}/dashboard/help` },
        { label: 'لوحة التحكم الكاملة', icon: '🖥️', href: `/${locale}/dashboard` },
      ],
    },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 8px' }}>
      {sections.map((section, si) => (
        <div key={si} style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 10, color: C.text3, fontFamily: "'Cairo', sans-serif",
            fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
            marginBottom: 6, paddingRight: 4,
          }}>
            {section.title}
          </div>
          <div style={{
            background: C.card, borderRadius: 12,
            border: `1px solid ${C.border}`, overflow: 'hidden',
          }}>
            {section.items.map((item, ii) => (
              <button
                key={ii}
                onClick={() => router.push(item.href)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 14px', background: 'none', border: 'none',
                  borderBottom: ii < section.items.length - 1 ? `1px solid ${C.border}33` : 'none',
                  cursor: 'pointer', WebkitTapHighlightColor: 'transparent', textAlign: 'right',
                }}
              >
                <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
                <span style={{ flex: 1, fontSize: 13, color: C.text, fontFamily: "'Cairo', sans-serif", fontWeight: 500 }}>
                  {item.label}
                </span>
                <span style={{ color: C.text3, fontSize: 12 }}>›</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── التطبيق الرئيسي ───────────────────────────────────────────
export default function MobilePage() {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const { fetchAccount, fetchPositions } = usePositionsStore();
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || 'ar';

  // على سطح المكتب → وجّه للـ dashboard الكامل
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      router.replace(`/${locale}/dashboard`);
    }
  }, [router, locale]);

  useEffect(() => {
    fetchAccount();
    fetchPositions();
    const interval = setInterval(() => { fetchAccount(); fetchPositions(); }, 30000);
    return () => clearInterval(interval);
  }, [fetchAccount, fetchPositions]);

  const renderScreen = () => {
    switch (activeTab) {
      case 'home':      return <HomeScreen/>;
      case 'chart':     return <ChartScreen/>;
      case 'trade':     return <TradeScreen/>;
      case 'positions': return <PositionsScreen/>;
      case 'ai':        return <AIScreen/>;
      case 'more':      return <MoreScreen/>;
    }
  };

  return (
    <>
      {/* Header */}
      <div style={{
        height: 52,
        paddingTop: 'env(safe-area-inset-top)',
        background: C.nav,
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: `linear-gradient(135deg, ${C.cyan}33, ${C.cyan}11)`,
            border: `1.5px solid ${C.cyan}66`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 14 }}>🌙</span>
          </div>
          <span style={{
            fontSize: 15, fontWeight: 800, color: C.text,
            fontFamily: "'Cairo', sans-serif",
          }}>
            رؤى
          </span>
        </div>
        <div style={{
          fontSize: 10, color: C.cyan, fontFamily: "'JetBrains Mono', monospace",
          background: `${C.cyan}15`, padding: '3px 8px', borderRadius: 20,
          border: `1px solid ${C.cyan}33`,
        }}>
          LIVE
        </div>
      </div>

      {/* المحتوى */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        {renderScreen()}
      </div>

      {/* Bottom Navigation */}
      <BottomNav active={activeTab} onChange={setActiveTab}/>
    </>
  );
}
