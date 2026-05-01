'use client'

import { useState, useMemo } from 'react'
import {
  Trophy, Crown, Medal, TrendingUp, TrendingDown, Users, Shield,
  Target, Clock, BarChart3, Copy, Lock, Unlock, Star, Zap,
  ChevronUp, Flame, Award, CheckCircle, Eye, ChevronDown,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'

/* ──────────────── Design Tokens ──────────────── */
const T = {
  bg: '#04050C', bg2: '#0D1117', card: '#08090F', cardHover: '#0B0F19',
  surface: '#1A1D29', cyan: '#00D4FF', green: '#00FFA3', greenDim: '#00CC82',
  red: '#FF4757', redDim: '#FF3344', amber: '#FFB800', purple: '#B388FF',
  blue: '#0A84FF',
  text: '#F0F2F5', text2: '#94a3b8', text3: '#8B92A8',
  border: 'rgba(255,255,255,0.06)', border2: 'rgba(0,212,255,0.16)',
  gold: '#FFB800', silver: '#94a3b8', bronze: '#CD7F32',
}

/* ──────────────── Types ──────────────── */
type TimePeriod = 'أسبوعي' | 'شهري' | 'سنوي' | 'كلي'
type CategoryFilter = 'العائد' | 'نسبة الفوز' | 'الاتساق' | 'إدارة المخاطر'

interface Trader {
  id: string
  name: string
  type: string
  avatar: string
  returnPct: number
  winRate: number
  maxDrawdown: number
  aum: string
  followers: number
  copyAvailable: boolean
  consistency: number
  riskScore: number
  isCurrentUser?: boolean
}

/* ──────────────── Mock Data ──────────────── */
const MOCK_TRADERS: Trader[] = [
  { id: '1', name: 'خالد الراشدي', type: 'مضارب', avatar: 'خ', returnPct: 187.4, winRate: 89.2, maxDrawdown: -8.4, aum: '$4.2M', followers: 3240, copyAvailable: true, consistency: 94, riskScore: 72 },
  { id: '2', name: 'سارة المنصوري', type: 'مدير محفظة', avatar: 'س', returnPct: 142.8, winRate: 82.6, maxDrawdown: -6.1, aum: '$12.5M', followers: 2890, copyAvailable: true, consistency: 91, riskScore: 65 },
  { id: '3', name: 'عبدالله القحطاني', type: 'تحليل فني', avatar: 'ع', returnPct: 124.5, winRate: 78.4, maxDrawdown: -12.3, aum: '$2.8M', followers: 2150, copyAvailable: true, consistency: 87, riskScore: 78 },
  { id: '4', name: 'نورة العتيبي', type: 'استثمار طويل', avatar: 'ن', returnPct: 98.2, winRate: 91.5, maxDrawdown: -4.2, aum: '$18.7M', followers: 1960, copyAvailable: false, consistency: 96, riskScore: 42 },
  { id: '5', name: 'فهد الدوسري', type: 'خوارزمي', avatar: 'ف', returnPct: 87.6, winRate: 76.8, maxDrawdown: -9.7, aum: '$6.1M', followers: 1540, copyAvailable: true, consistency: 83, riskScore: 68 },
  { id: '6', name: 'ريم السبيعي', type: 'تداول يومي', avatar: 'ر', returnPct: 76.3, winRate: 73.2, maxDrawdown: -14.8, aum: '$1.4M', followers: 1280, copyAvailable: true, consistency: 79, riskScore: 81 },
  { id: '7', name: 'محمد الشمري', type: 'مضارب', avatar: 'م', returnPct: 68.9, winRate: 85.1, maxDrawdown: -7.5, aum: '$3.6M', followers: 1120, copyAvailable: true, consistency: 88, riskScore: 58 },
  { id: '8', name: 'لمى الحربي', type: 'مدير محفظة', avatar: 'ل', returnPct: 62.4, winRate: 80.3, maxDrawdown: -5.8, aum: '$9.3M', followers: 980, copyAvailable: false, consistency: 92, riskScore: 45 },
  { id: '9', name: 'تركي العنزي', type: 'تحليل فني', avatar: 'ت', returnPct: 55.7, winRate: 71.6, maxDrawdown: -11.2, aum: '$2.1M', followers: 870, copyAvailable: true, consistency: 76, riskScore: 74 },
  { id: '10', name: 'هند الزهراني', type: 'استثمار طويل', avatar: 'ه', returnPct: 48.3, winRate: 88.9, maxDrawdown: -3.9, aum: '$22.4M', followers: 760, copyAvailable: true, consistency: 95, riskScore: 38 },
  { id: '11', name: 'سلطان الغامدي', type: 'خوارزمي', avatar: 'س', returnPct: 42.1, winRate: 69.4, maxDrawdown: -16.5, aum: '$880K', followers: 640, copyAvailable: true, consistency: 72, riskScore: 85 },
  { id: '12', name: 'دانة المالكي', type: 'تداول يومي', avatar: 'د', returnPct: 38.6, winRate: 74.8, maxDrawdown: -10.1, aum: '$1.7M', followers: 520, copyAvailable: false, consistency: 81, riskScore: 62 },
  { id: '13', name: 'يزيد القرني', type: 'مضارب', avatar: 'ي', returnPct: 34.2, winRate: 67.3, maxDrawdown: -18.7, aum: '$560K', followers: 430, copyAvailable: true, consistency: 68, riskScore: 88 },
  { id: '14', name: 'أمل الرشيدي', type: 'مدير محفظة', avatar: 'أ', returnPct: 29.8, winRate: 86.2, maxDrawdown: -5.1, aum: '$7.8M', followers: 380, copyAvailable: true, consistency: 90, riskScore: 48 },
  { id: '15', name: 'بندر السلمي', type: 'تحليل فني', avatar: 'ب', returnPct: 24.5, winRate: 63.7, maxDrawdown: -13.6, aum: '$420K', followers: 310, copyAvailable: true, consistency: 74, riskScore: 76 },
  { id: '16', name: 'وجدان العمري', type: 'استثمار طويل', avatar: 'و', returnPct: 21.3, winRate: 90.1, maxDrawdown: -2.8, aum: '$15.2M', followers: 270, copyAvailable: false, consistency: 97, riskScore: 32 },
  { id: '17', name: 'عبدالرحمن الحازمي', type: 'خوارزمي', avatar: 'ع', returnPct: 18.7, winRate: 72.5, maxDrawdown: -8.9, aum: '$940K', followers: 220, copyAvailable: true, consistency: 77, riskScore: 71 },
  { id: '18', name: 'مها البلوي', type: 'تداول يومي', avatar: 'م', returnPct: 15.4, winRate: 65.8, maxDrawdown: -19.2, aum: '$340K', followers: 180, copyAvailable: true, consistency: 65, riskScore: 90 },
  { id: '19', name: 'سلطانة الشهري', type: 'مضارب', avatar: 'س', returnPct: 12.8, winRate: 78.9, maxDrawdown: -7.2, aum: '$680K', followers: 150, copyAvailable: true, consistency: 82, riskScore: 55 },
  { id: '20', name: 'أحمد النفيعي', type: 'تحليل فني', avatar: 'أ', returnPct: 9.6, winRate: 60.4, maxDrawdown: -21.5, aum: '$210K', followers: 90, copyAvailable: true, consistency: 61, riskScore: 92, isCurrentUser: true },
]

/* ──────────────── Achievement Badges ──────────────── */
const BADGES = [
  { id: 'first-trade', name: 'أول صفقة', icon: Zap, color: T.cyan, unlocked: true, desc: 'أتممت أول صفقة بنجاح' },
  { id: '100-trades', name: '100 صفقة', icon: BarChart3, color: T.green, unlocked: true, desc: 'نفّذت 100 صفقة' },
  { id: 'top-monthly', name: 'أعلى عائد شهري', icon: Crown, color: T.gold, unlocked: true, desc: 'حققت أعلى عائد شهري' },
  { id: 'consistent', name: 'متداول متسق', icon: Target, color: T.amber, unlocked: false, desc: 'حافظ على أداء متسق لمدة 6 أشهر' },
  { id: 'ai-expert', name: 'خبير AI', icon: Flame, color: T.purple, unlocked: false, desc: 'استخدم الذكاء الاصطناعي في 50 تحليل' },
  { id: 'risk-master', name: 'خبير المخاطر', icon: Shield, color: T.green, unlocked: false, desc: 'حافظ على سحب أقصى أقل من 5%' },
  { id: 'community', name: 'قائد المجتمع', icon: Users, color: T.blue, unlocked: false, desc: 'اجمع أكثر من 1000 متابع' },
  { id: 'win-streak', name: 'سلسلة انتصارات', icon: Award, color: T.amber, unlocked: false, desc: '10 صفقات رابحة متتالية' },
]

/* ──────────────── Helper Functions ──────────────── */
const formatNumber = (n: number) => n.toLocaleString('en-US')

const returnTypeColor = (val: number) => val >= 0 ? T.green : T.red

const drawdownColor = (val: number) => {
  const abs = Math.abs(val)
  if (abs <= 5) return T.green
  if (abs <= 10) return T.amber
  return T.red
}

/* ──────────────── Podium Card Component ──────────────── */
function PodiumCard({ trader, rank }: { trader: Trader; rank: 1 | 2 | 3 }) {
  const isFirst = rank === 1
  const colors = {
    1: { main: T.gold, bg: `${T.gold}08`, border: `${T.gold}25`, glow: `${T.gold}15` },
    2: { main: T.silver, bg: `${T.silver}08`, border: `${T.silver}20`, glow: `${T.silver}10` },
    3: { main: T.bronze, bg: `${T.bronze}08`, border: `${T.bronze}20`, glow: `${T.bronze}10` },
  }[rank]

  return (
    <div style={{
      background: `linear-gradient(180deg, ${colors.bg}, ${T.card})`,
      border: `1px solid ${colors.border}`,
      borderRadius: 20, padding: isFirst ? 28 : 22,
      position: 'relative', overflow: 'hidden',
      boxShadow: isFirst ? `0 0 40px ${colors.glow}` : `0 0 20px ${colors.glow}`,
      transition: 'transform 0.3s, box-shadow 0.3s',
      cursor: 'pointer',
      flex: isFirst ? 1.15 : 1,
      minWidth: 0,
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-6px)'; e.currentTarget.style.boxShadow = `0 0 50px ${colors.glow}` }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = isFirst ? `0 0 40px ${colors.glow}` : `0 0 20px ${colors.glow}` }}
    >
      {/* Crown / Medal */}
      <div style={{
        position: 'absolute', top: 12, left: 12,
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {isFirst ? (
          <Crown size={22} color={colors.main} fill={colors.main} style={{ filter: `drop-shadow(0 0 6px ${colors.main}60)` }} />
        ) : (
          <Medal size={18} color={colors.main} />
        )}
        <span style={{ fontSize: 12, fontWeight: 800, color: colors.main, fontFamily: "'JetBrains Mono', monospace" }}>
          #{rank}
        </span>
      </div>

      {/* Radial decoration for 1st */}
      {isFirst && (
        <div style={{
          position: 'absolute', top: '-40%', right: '-20%', width: '70%', height: '120%',
          background: `radial-gradient(ellipse, ${T.gold}06, transparent 70%)`,
          pointerEvents: 'none',
        }} />
      )}

      {/* Avatar */}
      <div style={{
        display: 'flex', justifyContent: 'center', marginBottom: 14,
        marginTop: 8,
      }}>
        <div style={{
          width: isFirst ? 68 : 56, height: isFirst ? 68 : 56, borderRadius: '50%',
          background: `linear-gradient(135deg, ${colors.main}30, ${colors.main}10)`,
          border: `2px solid ${colors.main}50`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: isFirst ? 24 : 20, fontWeight: 900, color: colors.main,
          fontFamily: "'Cairo', sans-serif",
          boxShadow: `0 0 20px ${colors.main}20`,
        }}>
          {trader.avatar}
        </div>
      </div>

      {/* Name & Type */}
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: isFirst ? 16 : 14, fontWeight: 900, color: T.text, marginBottom: 3 }}>
          {trader.name}
        </div>
        <div style={{ fontSize: 11, color: T.text3 }}>{trader.type}</div>
      </div>

      {/* Return */}
      <div style={{
        textAlign: 'center', marginBottom: 12,
        padding: '8px 0', borderRadius: 10,
        background: `${returnTypeColor(trader.returnPct)}10`,
        border: `1px solid ${returnTypeColor(trader.returnPct)}20`,
      }}>
        <div style={{ fontSize: 9, color: T.text3, marginBottom: 2 }}>العائد</div>
        <div style={{
          fontSize: isFirst ? 20 : 17, fontWeight: 900,
          color: returnTypeColor(trader.returnPct),
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          +{trader.returnPct.toFixed(1)}%
        </div>
      </div>

      {/* Win Rate & Followers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ background: T.surface, borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: T.text3, marginBottom: 2 }}>معدل الفوز</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
            {trader.winRate.toFixed(1)}%
          </div>
        </div>
        <div style={{ background: T.surface, borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: T.text3, marginBottom: 2 }}>المتابعون</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
            {formatNumber(trader.followers)}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ──────────────── Badge Card Component ──────────────── */
function BadgeCard({ badge }: { badge: typeof BADGES[number] }) {
  return (
    <div style={{
      background: badge.unlocked ? `${badge.color}08` : T.card,
      border: `1px solid ${badge.unlocked ? `${badge.color}25` : T.border}`,
      borderRadius: 14, padding: 16,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
      opacity: badge.unlocked ? 1 : 0.55,
      position: 'relative', overflow: 'hidden',
    }}
      onMouseEnter={e => { if (badge.unlocked) e.currentTarget.style.transform = 'translateY(-3px)' }}
      onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
      onClick={() => toast({
        title: badge.unlocked ? `${badge.name} ✅` : `${badge.name} 🔒`,
        description: badge.desc,
      })}
    >
      {/* Lock overlay for locked badges */}
      {!badge.unlocked && (
        <div style={{
          position: 'absolute', top: 8, left: 8,
        }}>
          <Lock size={10} color={T.text3} />
        </div>
      )}
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: badge.unlocked ? `${badge.color}15` : T.surface,
        border: badge.unlocked ? `1px solid ${badge.color}30` : `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <badge.icon size={20} color={badge.unlocked ? badge.color : T.text3} />
      </div>
      <div style={{ fontSize: 11, fontWeight: 800, color: badge.unlocked ? T.text : T.text3 }}>
        {badge.name}
      </div>
      {!badge.unlocked && (
        <div style={{ fontSize: 9, color: T.text3, display: 'flex', alignItems: 'center', gap: 3 }}>
          <Lock size={8} /> مقفل
        </div>
      )}
      {badge.unlocked && (
        <div style={{ fontSize: 9, color: badge.color, display: 'flex', alignItems: 'center', gap: 3 }}>
          <Unlock size={8} /> مفتوح
        </div>
      )}
    </div>
  )
}

/* ──────────────── Main Page Component ──────────────── */
export default function LeaderboardPage() {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('شهري')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('العائد')
  const [copyingTraders, setCopyingTraders] = useState<Set<string>>(new Set())
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const timePeriods: TimePeriod[] = ['أسبوعي', 'شهري', 'سنوي', 'كلي']
  const categoryTabs: { key: CategoryFilter; icon: typeof TrendingUp }[] = [
    { key: 'العائد', icon: TrendingUp },
    { key: 'نسبة الفوز', icon: Target },
    { key: 'الاتساق', icon: BarChart3 },
    { key: 'إدارة المخاطر', icon: Shield },
  ]

  /* Sort traders based on selected category */
  const sortedTraders = useMemo(() => {
    return [...MOCK_TRADERS].sort((a, b) => {
      switch (categoryFilter) {
        case 'العائد': return b.returnPct - a.returnPct
        case 'نسبة الفوز': return b.winRate - a.winRate
        case 'الاتساق': return b.consistency - a.consistency
        case 'إدارة المخاطر': return a.riskScore - b.riskScore
        default: return b.returnPct - a.returnPct
      }
    })
  }, [categoryFilter])

  const top3 = sortedTraders.slice(0, 3)
  const restTraders = sortedTraders.slice(3)
  const currentUser = MOCK_TRADERS.find(t => t.isCurrentUser)!

  const currentUserRank = sortedTraders.findIndex(t => t.isCurrentUser) + 1

  const toggleCopy = (traderId: string, traderName: string) => {
    setCopyingTraders(prev => {
      const next = new Set(prev)
      if (next.has(traderId)) {
        next.delete(traderId)
        toast({ title: `تم إيقاف نسخ ${traderName}`, description: 'لن يتم نسخ صفقات هذا المتداول بعد الآن' })
      } else {
        next.add(traderId)
        toast({ title: `تم بدء نسخ ${traderName} ✅`, description: 'سيتم نسخ الصفقات تلقائياً' })
      }
      return next
    })
  }

  /* Stats summary */
  const totalActiveTraders = 1847
  const totalReturns = '+32.4%'
  const avgWinRate = '76.8%'

  return (
    <div className="custom-scrollbar" style={{
      padding: '32px 24px', direction: 'rtl',
      fontFamily: "'Cairo', sans-serif",
      height: '100%', overflowY: 'auto',
      background: T.bg,
    }}>
      {/* ──── Header ──── */}
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{
              padding: 8, borderRadius: 12, background: `${T.amber}12`,
              border: `1px solid ${T.amber}25`,
            }}>
              <Trophy size={20} color={T.amber} />
            </div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text }}>لوحة الصدارة</h1>
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 20,
              background: `${T.amber}18`, color: T.amber,
              fontFamily: "'JetBrains Mono', monospace",
            }}>LIVE</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: T.text2 }}>
            تابع أفضل المتداولين على منصة رؤى حسب الأداء والاتساق وإدارة المخاطر
          </p>
        </div>
      </div>

      {/* ──── Stats Summary Row ──── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { icon: Users, label: 'إجمالي المتداولين النشطين', val: formatNumber(totalActiveTraders), color: T.cyan },
          { icon: TrendingUp, label: 'إجمالي العوائد', val: totalReturns, color: T.green },
          { icon: Target, label: 'متوسط معدل الفوز', val: avgWinRate, color: T.amber },
        ].map((s, i) => (
          <div key={i} style={{
            background: T.card, border: `0.5px solid ${T.border}`,
            borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{ padding: 10, borderRadius: 12, background: `${s.color}12` }}>
              <s.icon size={22} color={s.color} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.text2, marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{s.val}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ──── Time Period Filter ──── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {timePeriods.map(period => (
            <button key={period} onClick={() => setTimePeriod(period)} style={{
              padding: '7px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: 5,
              background: timePeriod === period ? `${T.cyan}15` : T.surface,
              border: `1px solid ${timePeriod === period ? `${T.cyan}40` : T.border}`,
              color: timePeriod === period ? T.cyan : T.text2,
              fontFamily: "'Cairo', sans-serif",
            }}>
              <Clock size={12} /> {period}
            </button>
          ))}
        </div>

        {/* Category Filter Tabs */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {categoryTabs.map(tab => (
            <button key={tab.key} onClick={() => setCategoryFilter(tab.key)} style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: 6,
              background: categoryFilter === tab.key ? `${T.cyan}15` : T.surface,
              border: `1px solid ${categoryFilter === tab.key ? `${T.cyan}40` : T.border}`,
              color: categoryFilter === tab.key ? T.cyan : T.text2,
              fontFamily: "'Cairo', sans-serif",
            }}>
              <tab.icon size={13} /> {tab.key}
            </button>
          ))}
        </div>
      </div>

      {/* ──── Top 3 Podium ──── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1.15fr 1fr',
        gap: 16, marginBottom: 28,
        alignItems: 'end',
      }}>
        {/* 2nd Place */}
        <PodiumCard trader={top3[1]} rank={2} />
        {/* 1st Place */}
        <PodiumCard trader={top3[0]} rank={1} />
        {/* 3rd Place */}
        <PodiumCard trader={top3[2]} rank={3} />
      </div>

      {/* ──── Full Rankings Table ──── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart3 size={16} color={T.cyan} />
            الترتيب الكامل
          </h2>
          <span style={{ fontSize: 11, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
            {sortedTraders.length} متداول
          </span>
        </div>

        {/* Scrollable Table Container */}
        <div style={{
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: 16, overflow: 'hidden',
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%', borderCollapse: 'collapse',
              fontFamily: "'Cairo', sans-serif",
              minWidth: 800,
            }}>
              {/* Table Header */}
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  {[
                    { label: '#', width: 50 },
                    { label: 'المتداول', width: 'auto' },
                    { label: 'العائد', width: 100 },
                    { label: 'معدل الفوز', width: 95 },
                    { label: 'السحب الأقصى', width: 105 },
                    { label: 'الأصول المدارة', width: 110 },
                    { label: 'المتابعون', width: 90 },
                    { label: 'متاح للنسخ', width: 110 },
                  ].map((col, i) => (
                    <th key={i} style={{
                      padding: '12px 14px', fontSize: 11, fontWeight: 800,
                      color: T.text3, textAlign: i === 0 ? 'center' : 'right',
                      background: T.surface, whiteSpace: 'nowrap',
                      width: col.width,
                    }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Table Body */}
              <tbody>
                {restTraders.map((trader, idx) => {
                  const rank = idx + 4
                  const isExpanded = expandedRow === trader.id
                  const isCurrent = trader.isCurrentUser

                  return (
                <tr key={trader.id} style={{
                  borderBottom: `1px solid ${T.border}`,
                  background: isCurrent ? `${T.cyan}06` : 'transparent',
                  transition: 'background 0.2s',
                  cursor: 'pointer',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = `${T.cyan}04`}
                  onMouseLeave={e => e.currentTarget.style.background = isCurrent ? `${T.cyan}06` : 'transparent'}
                  onClick={() => setExpandedRow(isExpanded ? null : trader.id)}
                >
                  {/* Rank */}
                  <td style={{
                    padding: '12px 14px', fontSize: 13, fontWeight: 800,
                    color: rank <= 5 ? T.amber : T.text3,
                    textAlign: 'center',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {rank}
                  </td>

                  {/* Trader */}
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: `${T.cyan}12`, border: `1px solid ${T.border2}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 900, color: T.cyan,
                        fontFamily: "'Cairo', sans-serif", flexShrink: 0,
                      }}>
                        {trader.avatar}
                      </div>
                      <div>
                        <div style={{
                          fontSize: 13, fontWeight: 800, color: T.text,
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          {trader.name}
                          {isCurrent && (
                            <span style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 10,
                              background: `${T.cyan}18`, color: T.cyan, fontWeight: 800,
                            }}>أنت</span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: T.text3 }}>{trader.type}</div>
                      </div>
                    </div>
                  </td>

                  {/* Return */}
                  <td style={{
                    padding: '12px 14px', fontSize: 13, fontWeight: 800,
                    color: returnTypeColor(trader.returnPct),
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: 'nowrap',
                  }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      {trader.returnPct >= 0 ? <ChevronUp size={12} /> : <TrendingDown size={12} />}
                      {trader.returnPct >= 0 ? '+' : ''}{trader.returnPct.toFixed(1)}%
                    </span>
                  </td>

                  {/* Win Rate */}
                  <td style={{
                    padding: '12px 14px', fontSize: 13, fontWeight: 800,
                    color: T.text,
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: 'nowrap',
                  }}>
                    {trader.winRate.toFixed(1)}%
                  </td>

                  {/* Max Drawdown */}
                  <td style={{
                    padding: '12px 14px', fontSize: 13, fontWeight: 800,
                    color: drawdownColor(trader.maxDrawdown),
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: 'nowrap',
                  }}>
                    {trader.maxDrawdown.toFixed(1)}%
                  </td>

                  {/* AUM */}
                  <td style={{
                    padding: '12px 14px', fontSize: 13, fontWeight: 800,
                    color: T.text2,
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: 'nowrap',
                  }}>
                    {trader.aum}
                  </td>

                  {/* Followers */}
                  <td style={{
                    padding: '12px 14px', fontSize: 13, fontWeight: 800,
                    color: T.text2,
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: 'nowrap',
                  }}>
                    {formatNumber(trader.followers)}
                  </td>

                  {/* Copy Available */}
                  <td style={{ padding: '12px 14px' }}>
                    {trader.copyAvailable ? (
                      <button
                        onClick={e => { e.stopPropagation(); toggleCopy(trader.id, trader.name) }}
                        style={{
                          padding: '5px 14px', borderRadius: 20, fontSize: 11, fontWeight: 800,
                          cursor: 'pointer', transition: 'all 0.2s',
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          background: copyingTraders.has(trader.id) ? `${T.red}12` : `${T.green}12`,
                          border: `1px solid ${copyingTraders.has(trader.id) ? `${T.red}35` : `${T.green}35`}`,
                          color: copyingTraders.has(trader.id) ? T.red : T.green,
                          fontFamily: "'Cairo', sans-serif",
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {copyingTraders.has(trader.id) ? 'إيقاف' : 'نسخ'}
                        <Copy size={11} />
                      </button>
                    ) : (
                      <span style={{
                        fontSize: 10, color: T.text3,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '4px 10px', borderRadius: 20,
                        background: T.surface, border: `1px solid ${T.border}`,
                      }}>
                        <Lock size={9} /> غير متاح
                      </span>
                    )}
                  </td>
                </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ──── Your Ranking Card ──── */}
      <div style={{
        background: `linear-gradient(135deg, ${T.cyan}08, ${T.card})`,
        border: `1px solid ${T.border2}`,
        borderRadius: 16, padding: '20px 24px', marginBottom: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 16,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Glow */}
        <div style={{
          position: 'absolute', top: '-50%', right: '-10%', width: '40%', height: '150%',
          background: `radial-gradient(ellipse, ${T.cyan}06, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: `${T.cyan}12`, border: `1px solid ${T.cyan}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Star size={24} color={T.cyan} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: T.text, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              ترتيبك الحالي
              <span style={{
                fontSize: 11, padding: '2px 10px', borderRadius: 10,
                background: `${T.cyan}15`, color: T.cyan,
                fontFamily: "'JetBrains Mono', monospace", fontWeight: 800,
              }}>
                #{currentUserRank}
              </span>
            </div>
            <div style={{ fontSize: 12, color: T.text2 }}>
              {currentUser.name} — عائد +{currentUser.returnPct.toFixed(1)}% | معدل الفوز {currentUser.winRate.toFixed(1)}%
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: T.text3, marginBottom: 3 }}>الاتساق</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.amber, fontFamily: "'JetBrains Mono', monospace" }}>
              {currentUser.consistency}%
            </div>
          </div>
          <div style={{ width: 1, height: 32, background: T.border }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: T.text3, marginBottom: 3 }}>السحب الأقصى</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: drawdownColor(currentUser.maxDrawdown), fontFamily: "'JetBrains Mono', monospace" }}>
              {currentUser.maxDrawdown.toFixed(1)}%
            </div>
          </div>
          <div style={{ width: 1, height: 32, background: T.border }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: T.text3, marginBottom: 3 }}>المتابعون</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
              {formatNumber(currentUser.followers)}
            </div>
          </div>
        </div>
      </div>

      {/* ──── Achievement Badges ──── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Award size={16} color={T.purple} />
          <h2 style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: 0 }}>شارات الإنجاز</h2>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 20,
            background: `${T.purple}15`, color: T.purple,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {BADGES.filter(b => b.unlocked).length}/{BADGES.length}
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: 12,
        }}>
          {BADGES.map(badge => (
            <BadgeCard key={badge.id} badge={badge} />
          ))}
        </div>
      </div>

      {/* ──── Footer Spacer ──── */}
      <div style={{ height: 24 }} />
    </div>
  )
}
