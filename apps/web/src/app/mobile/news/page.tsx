'use client'

import { useState, useMemo } from 'react'
import { PageHeader, Card } from '@/components/mobile/Card'
import { Search, ExternalLink, Clock, Zap } from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════
   ROUA MOBILE — Market News Feed
   Filterable news cards with sentiment, impact, and search
   ═══════════════════════════════════════════════════════════════ */

// ── Types ──
type NewsCategory = 'crypto' | 'forex' | 'economy'
type Sentiment = 'positive' | 'negative' | 'neutral'
type ImpactLevel = 'high' | 'medium' | 'low'
type FilterTab = 'all' | 'crypto' | 'forex' | 'economy'

interface NewsItem {
  id: string
  source: string
  headline: string
  summary: string
  timeAgo: string
  symbols: string[]
  sentiment: Sentiment
  impact: ImpactLevel
  category: NewsCategory
  url?: string
}

// ── Constants ──
const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'crypto', label: 'كريبتو' },
  { key: 'forex', label: 'فوركس' },
  { key: 'economy', label: 'اقتصاد' },
]

const SENTIMENT_CONFIG: Record<Sentiment, { label: string; color: string; bg: string; border: string }> = {
  positive: { label: 'إيجابي', color: '#00FFA3', bg: 'rgba(0,255,163,0.1)', border: 'rgba(0,255,163,0.2)' },
  negative: { label: 'سلبي', color: '#FF4757', bg: 'rgba(255,71,87,0.1)', border: 'rgba(255,71,87,0.2)' },
  neutral: { label: 'محايد', color: '#FFB800', bg: 'rgba(255,184,0,0.1)', border: 'rgba(255,184,0,0.2)' },
}

const IMPACT_CONFIG: Record<ImpactLevel, { label: string; color: string; bg: string; border: string }> = {
  high: { label: 'عالي', color: '#FF4757', bg: 'rgba(255,71,87,0.08)', border: 'rgba(255,71,87,0.15)' },
  medium: { label: 'متوسط', color: '#FFB800', bg: 'rgba(255,184,0,0.08)', border: 'rgba(255,184,0,0.15)' },
  low: { label: 'منخفض', color: '#8B92A8', bg: 'rgba(139,146,168,0.08)', border: 'rgba(139,146,168,0.15)' },
}

const SOURCE_COLORS: Record<string, string> = {
  'CoinDesk': '#F7931A',
  'Reuters': '#FF8000',
  'Bloomberg': '#627EEA',
  'Arabian Business': '#00D4FF',
  'Cointelegraph': '#00B4D8',
  'ForexLive': '#10B981',
  'CNBC': '#0A66C2',
}

// ── Mock News Data ──
const MOCK_NEWS: NewsItem[] = [
  {
    id: 'n1',
    source: 'CoinDesk',
    headline: 'البيتكوين يتجاوز 68,000 دولار وسط توقعات بتصعيد مؤسسي',
    summary: 'ارتفعت عملة البيتكوين فوق مستوى 68 ألف دولار مع تدفقات قوية على صناديق ETF والتوقعات بدخول مؤسسات أكبر',
    timeAgo: 'منذ 15 د',
    symbols: ['BTC', 'ETH'],
    sentiment: 'positive',
    impact: 'high',
    category: 'crypto',
  },
  {
    id: 'n2',
    source: 'Reuters',
    headline: 'الفيدرالي يشير إلى احتمال خفض الفائدة في الربع القادم',
    summary: 'أشار محافظو الفيدرالي إلى إمكانية تخفيف السياسة النقدية خلال الربع القادم وسط تباطؤ التضخم',
    timeAgo: 'منذ 32 د',
    symbols: ['EUR', 'GBP', 'XAU'],
    sentiment: 'positive',
    impact: 'high',
    category: 'economy',
  },
  {
    id: 'n3',
    source: 'Cointelegraph',
    headline: 'إيثريوم تُطلق تحديث الشبكة الجديد بنجاح',
    summary: 'أتمت شبكة إيثريوم ترقية مهمة تعزز من قابلية التوسع وتخفض رسوم المعاملات بنسبة 40%',
    timeAgo: 'منذ 1 س',
    symbols: ['ETH'],
    sentiment: 'positive',
    impact: 'high',
    category: 'crypto',
  },
  {
    id: 'n4',
    source: 'Bloomberg',
    headline: 'الدولار يتراجع أمام العملات الرئيسية بعد بيانات التوظيف',
    summary: 'هبط مؤشر الدولار بعد بيانات التوظيف الأمريكية التي جاءت أضعف من المتوقع مما زاد ضغوط خفض الفائدة',
    timeAgo: 'منذ 1.5 س',
    symbols: ['EUR', 'GBP', 'JPY'],
    sentiment: 'negative',
    impact: 'high',
    category: 'forex',
  },
  {
    id: 'n5',
    source: 'Arabian Business',
    headline: 'السعودية تعلن عن مشروع جديد لتمويل التقنية المالية',
    summary: 'أطلقت المملكة مبادرة بقيمة 2 مليار دولار لدعم قطاع التقنية المالية والبلوكチェين في المنطقة',
    timeAgo: 'منذ 2 س',
    symbols: ['BTC', 'ETH'],
    sentiment: 'positive',
    impact: 'medium',
    category: 'economy',
  },
  {
    id: 'n6',
    source: 'ForexLive',
    headline: 'اليورو يستقر قرب أعلى مستوى في شهر بعد تعليقات البنك المركزي الأوروبي',
    summary: 'ثبت اليورو فوق 1.09 دولار بعد تصريحات لاغارد الداعمة لاستمرار السياسة المتشددة',
    timeAgo: 'منذ 2.5 س',
    symbols: ['EUR'],
    sentiment: 'neutral',
    impact: 'medium',
    category: 'forex',
  },
  {
    id: 'n7',
    source: 'CoinDesk',
    headline: 'سولانا تسجل نمواً بنسبة 15% مع زيادة في حجم التداول اللامركزي',
    summary: 'شبكة سولانا تشهد طفرة في نشاط DeFi مع ارتفاع حجم التداول على منصات التبادل اللامركزي',
    timeAgo: 'منذ 3 س',
    symbols: ['SOL'],
    sentiment: 'positive',
    impact: 'medium',
    category: 'crypto',
  },
  {
    id: 'n8',
    source: 'Reuters',
    headline: 'البنك المركزي الياباني يرفع أسعار الفائدة بشكل مفاجئ',
    summary: 'فاجأ البنك المركزي الياباني الأسواق برفع الفائدة إلى 0.25% مما أدى لارتفاع حاد في الين',
    timeAgo: 'منذ 4 س',
    symbols: ['JPY', 'EUR', 'GBP'],
    sentiment: 'negative',
    impact: 'high',
    category: 'forex',
  },
  {
    id: 'n9',
    source: 'CNBC',
    headline: 'ذهب يصل لمستوى قياسي جديد فوق 2,350 دولار',
    summary: 'سجل الذهب مستوى تاريخياً جديداً مدعوماً بالقلق الجيوسياسي وتوقعات خفض الفائدة الأمريكية',
    timeAgo: 'منذ 4.5 س',
    symbols: ['XAU'],
    sentiment: 'positive',
    impact: 'high',
    category: 'forex',
  },
  {
    id: 'n10',
    source: 'Cointelegraph',
    headline: 'ريبل تفوز بقرار قضائي جديد في قضية الأوراق المالية',
    summary: 'محكمة استئناف تؤكد حكماً لصالح ريبل بأن XRP لا يعتبر ورقة مالية في المبيعات الثانوية',
    timeAgo: 'منذ 5 س',
    symbols: ['XRP'],
    sentiment: 'positive',
    impact: 'medium',
    category: 'crypto',
  },
  {
    id: 'n11',
    source: 'Bloomberg',
    headline: 'بورصة ناسداك تعلن عن خطة لإدراج صناديق عملات رقمية جديدة',
    summary: 'كشفت ناسداك عن نيتها إدراج ثلاثة صناديق ETF للعملات الرقمية خلال الربع القادم',
    timeAgo: 'منذ 6 س',
    symbols: ['BTC', 'ETH', 'SOL'],
    sentiment: 'positive',
    impact: 'medium',
    category: 'crypto',
  },
  {
    id: 'n12',
    source: 'Reuters',
    headline: 'تضخم منطقة اليورو يتباطأ إلى 2.4% مع تراجع أسعار الطاقة',
    summary: 'انخفض معدل التضخم في منطقة اليورو أكثر من المتوقع مما يعزز فرص خفض الفائدة الأوروبية',
    timeAgo: 'منذ 7 س',
    symbols: ['EUR'],
    sentiment: 'neutral',
    impact: 'medium',
    category: 'economy',
  },
  {
    id: 'n13',
    source: 'ForexLive',
    headline: 'الجنيه الإسترليني يتراجع بعد بيانات النمو البريطانية الضعيفة',
    summary: 'هبط الإسترليني بعد أظهرت البيانات تباطؤ نمو الناتج المحلي البريطاني إلى 0.2%',
    timeAgo: 'منذ 8 س',
    symbols: ['GBP'],
    sentiment: 'negative',
    impact: 'medium',
    category: 'forex',
  },
  {
    id: 'n14',
    source: 'CoinDesk',
    headline: 'بيتكوين كاش يشهد انقساماً جديداً في الشبكة',
    summary: 'انقسمت شبكة بيتكوين كاش مجدداً مما أثار قلق المستثمرين حول استقرار الشبكة',
    timeAgo: 'منذ 10 س',
    symbols: ['BTC'],
    sentiment: 'negative',
    impact: 'low',
    category: 'crypto',
  },
  {
    id: 'n15',
    source: 'Arabian Business',
    headline: 'الإمارات تعزز موقعها كمركز عالمي لتقنية البلوكشين',
    summary: 'أعلنت دبي عن تسريع تراخيص شركات العملات الرقمية مع إطار تنظيمي متطور',
    timeAgo: 'منذ 12 س',
    symbols: ['BTC', 'ETH'],
    sentiment: 'neutral',
    impact: 'low',
    category: 'economy',
  },
  {
    id: 'n16',
    source: 'Bloomberg',
    headline: 'دوجكوين تسجل تراجعاً حاداً بعد تصريحات مسؤول تنظيمي',
    summary: 'تراجعت عملة الدوجكوين 8% بعد تحذيرات من هيئة تنظيمية كبيرة بشأن مميز العملات الميم',
    timeAgo: 'منذ 14 س',
    symbols: ['DOGE'],
    sentiment: 'negative',
    impact: 'medium',
    category: 'crypto',
  },
  {
    id: 'n17',
    source: 'CNBC',
    headline: 'صندوق النقد يخفض توقعات النمو العالمي لـ 2025',
    summary: 'خفض صندوق النقد الدولي توقعاته للنمو الاقتصادي العالمي إلى 2.8% وسط مخاطر جيوسياسية',
    timeAgo: 'منذ 16 س',
    symbols: ['EUR', 'XAU'],
    sentiment: 'negative',
    impact: 'high',
    category: 'economy',
  },
  {
    id: 'n18',
    source: 'ForexLive',
    headline: 'الدولار الأسترالي يتحسن مع ارتفاع أسعار الحديد',
    summary: 'صعد الدولار الأسترالي مدعوماً بارتفاع أسعار السلع الأساسية خاصة خام الحديد',
    timeAgo: 'منذ 18 س',
    symbols: ['AUD'],
    sentiment: 'neutral',
    impact: 'low',
    category: 'forex',
  },
]

// ── News Card Component ──
function NewsCard({ news }: { news: NewsItem }) {
  const sentimentCfg = SENTIMENT_CONFIG[news.sentiment]
  const impactCfg = IMPACT_CONFIG[news.impact]
  const sourceColor = SOURCE_COLORS[news.source] || '#8B92A8'

  return (
    <Card>
      {/* Top: Source + Time */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Source badge */}
          <div style={{
            padding: '2px 7px',
            borderRadius: 5,
            fontSize: 9,
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            color: sourceColor,
            background: `${sourceColor}14`,
            border: `0.5px solid ${sourceColor}25`,
            direction: 'ltr',
          }}>
            {news.source}
          </div>
          {/* Sentiment indicator */}
          <div style={{
            padding: '2px 6px',
            borderRadius: 5,
            fontSize: 9,
            fontWeight: 800,
            fontFamily: 'var(--font-cairo)',
            color: sentimentCfg.color,
            background: sentimentCfg.bg,
            border: `0.5px solid ${sentimentCfg.border}`,
          }}>
            {sentimentCfg.label}
          </div>
        </div>

        {/* Impact + Time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            padding: '2px 5px',
            borderRadius: 5,
            fontSize: 8,
            fontWeight: 700,
            fontFamily: 'var(--font-cairo)',
            color: impactCfg.color,
            background: impactCfg.bg,
            border: `0.5px solid ${impactCfg.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
          }}>
            {news.impact === 'high' && <Zap size={7} color={impactCfg.color} />}
            {impactCfg.label}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={9} color="rgba(255,255,255,0.3)" />
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-cairo)' }}>{news.timeAgo}</span>
          </div>
        </div>
      </div>

      {/* Headline */}
      <div style={{
        fontSize: 14,
        fontWeight: 900,
        color: '#FFF',
        fontFamily: 'var(--font-cairo)',
        lineHeight: 1.6,
        marginBottom: 6,
      }}>
        {news.headline}
      </div>

      {/* Summary */}
      <div style={{
        fontSize: 11,
        fontWeight: 500,
        color: '#8B92A8',
        fontFamily: 'var(--font-cairo)',
        lineHeight: 1.7,
        marginBottom: 10,
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {news.summary}
      </div>

      {/* Bottom: Related symbols */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {news.symbols.map(sym => {
            const symColor = getSymbolColor(sym)
            return (
              <div key={sym} style={{
                padding: '2px 8px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 800,
                fontFamily: 'var(--font-mono)',
                color: symColor,
                background: `${symColor}14`,
                border: `0.5px solid ${symColor}20`,
                direction: 'ltr',
              }}>
                {sym}
              </div>
            )
          })}
        </div>
        <button
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
          }}
          aria-label="فتح الخبر"
          onClick={(e) => { e.stopPropagation() }}
        >
          <ExternalLink size={14} color="rgba(255,255,255,0.2)" />
        </button>
      </div>
    </Card>
  )
}

// ── Helper: get symbol color ──
function getSymbolColor(sym: string): string {
  const map: Record<string, string> = {
    BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF', XRP: '#23292F',
    BNB: '#F3BA2F', ADA: '#0033AD', DOGE: '#C2A633', AVAX: '#E84142',
    DOT: '#E6007A', LINK: '#2A5ADA', EUR: '#003399', GBP: '#C8102E',
    JPY: '#BC002D', AUD: '#00008B', XAU: '#d4af37',
  }
  return map[sym] || '#00D4FF'
}

// ── Main Page Component ──
export default function MobileNewsPage() {
  const [filter, setFilter] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')

  const filteredNews = useMemo(() => {
    let items = MOCK_NEWS

    // Category filter
    if (filter !== 'all') {
      items = items.filter(n => n.category === filter)
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(n =>
        n.headline.toLowerCase().includes(q) ||
        n.summary.toLowerCase().includes(q) ||
        n.symbols.some(s => s.toLowerCase().includes(q)) ||
        n.source.toLowerCase().includes(q)
      )
    }

    return items
  }, [filter, search])

  // Category counts
  const counts = useMemo(() => ({
    all: MOCK_NEWS.length,
    crypto: MOCK_NEWS.filter(n => n.category === 'crypto').length,
    forex: MOCK_NEWS.filter(n => n.category === 'forex').length,
    economy: MOCK_NEWS.filter(n => n.category === 'economy').length,
  }), [])

  return (
    <div className="r-page">
      <PageHeader title="الأخبار" subtitle={`${counts.all} خبر`} />

      {/* Search Bar */}
      <div style={{ padding: '0 var(--space-lg)', marginBottom: 8 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 12,
          padding: '8px 12px',
          border: '0.5px solid rgba(255,255,255,0.06)',
        }}>
          <Search size={16} color="#8B92A8" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث في الأخبار..."
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              color: '#FFF',
              fontSize: 13,
              fontFamily: 'var(--font-cairo)',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="r-tabs">
        {FILTER_TABS.map(t => (
          <button
            key={t.key}
            className={`r-tabs__item ${filter === t.key ? 'r-tabs__item--active' : ''}`}
            onClick={() => setFilter(t.key)}
          >
            {t.label}
            <span style={{
              fontSize: 8,
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              marginLeft: 3,
              opacity: 0.5,
            }}>
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {/* News Cards */}
      <div style={{ marginTop: 4 }}>
        {filteredNews.map(news => (
          <NewsCard key={news.id} news={news} />
        ))}
      </div>

      {/* Empty state */}
      {filteredNews.length === 0 && (
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          color: 'rgba(255,255,255,0.3)',
          fontFamily: 'var(--font-cairo)',
          fontSize: 13,
        }}>
          لا توجد أخبار مطابقة
        </div>
      )}

      <div style={{ height: 80 }} />
    </div>
  )
}
