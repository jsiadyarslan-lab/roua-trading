'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import {
  Newspaper,
  Globe,
  Filter,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  Brain,
  Search,
  Zap,
  Clock,
  AlertTriangle,
  PenLine,
  Sparkles,
  FileText,
  BarChart3,
  Eye,
  ThumbsUp,
  Share2,
  Calendar,
} from 'lucide-react'
import { safeStr } from '@/lib/utils'

// ── Design Tokens (canonical from unified-tokens) ──
import { TExtended as T } from '@/lib/unified-tokens'
import { useScopedStyle } from '@/hooks/useScopedStyle'
import {
  useContentAgentStore,
  ContentAgentStatus,
  ContentStatus,
  ContentType,
  ContentCategory,
} from '@/hooks/useContentAgentStore'

const FONT_AR = 'var(--font-ar)'
const FONT_MONO = 'var(--font-mono)'

// Lazy-load ContentAgentPage to avoid SSR issues and reduce initial bundle
const ContentAgentPage = dynamic(
  () => import('@/app/dashboard/content-agent/page'),
  { ssr: false, loading: () => <div style={{ padding: 40, textAlign: 'center', color: T.text2, fontFamily: FONT_AR }}>جارٍ تحميل وكيل المحتوى...</div> }
)

type NewsItem = {
  id: string;
  source: string;
  title: string;
  translatedTitle?: string;
  content: string;
  translatedContent?: string;
  summary?: string;
  url?: string | null;
  sentiment?: number;
  sentimentLabel?: string;
  impactLevel?: string;
  affectedAssets?: string[];
  category?: string;
  categoryAr?: string;
  aiAnalysis?: string;
  publishedAt?: string;
};

type MainTab = 'news' | 'reports' | 'agent'

export default function NewsPage() {
  useScopedStyle(`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes live-dot { 0%, 100% { transform: scale(1); opacity: 0.65; } 50% { transform: scale(1.35); opacity: 1; } }
    @keyframes fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .news-article-card { transition: background 0.2s, border-color 0.2s; }
    .news-article-card:hover { background: ${T.cardHover} !important; }`)

  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [symbolFilter, setSymbolFilter] = useState('all');
  const [sentimentFilter, setSentimentFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [displayCount, setDisplayCount] = useState(50);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MainTab>('news');

  const fetchNews = useCallback(async () => {
    setFetchError(null);
    try {
      const params = new URLSearchParams();
      if (symbolFilter !== 'all') params.set('symbol', symbolFilter);
      if (sentimentFilter !== 'all') params.set('sentiment', sentimentFilter);
      params.set('limit', '50');

      const res = await fetch(`/api/news/latest?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setItems(data.data);
      } else {
        setItems([]);
        setFetchError('لم يتم العثور على أخبار. جرّب تغيير الفلتر.');
      }
    } catch {
      setItems([]);
      setFetchError('تعذر الاتصال بخادم الأخبار. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [symbolFilter, sentimentFilter]);

  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNews]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchNews();
  };

  const filteredItems = useMemo(() => {
    let filtered = items;
    // Filter out articles with AI fallback error messages
    const errorPatterns = [
      '⚠️ جميع نماذج الذكاء الاصطناعي غير متاحة',
      'التحليل غير متاح حالياً',
      'يرجى التحقق من مفاتيح API',
      'يرجى المحاولة لاحقاً',
    ];
    filtered = filtered.filter((item) => {
      const title = (item.translatedTitle || '') + (item.title || '');
      const content = (item.translatedContent || '') + (item.content || '');
      return !errorPatterns.some(pattern => title.includes(pattern) || content.includes(pattern));
    });
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.title?.toLowerCase().includes(q) ||
          item.translatedTitle?.toLowerCase().includes(q) ||
          item.content?.toLowerCase().includes(q) ||
          item.summary?.toLowerCase().includes(q),
      );
    }
    return filtered;
  }, [items, searchQuery]);

  const stats = useMemo(() => {
    const positive = items.filter((i) => i.sentimentLabel === 'positive').length;
    const negative = items.filter((i) => i.sentimentLabel === 'negative').length;
    const high = items.filter((i) => i.impactLevel === 'high').length;
    return { total: items.length, positive, negative, high };
  }, [items]);

  const getSentimentBadge = (label?: string) => {
    switch (label) {
      case 'positive':
        return { bg: `${T.green}14`, color: T.green, text: 'إيجابي', icon: TrendingUp };
      case 'negative':
        return { bg: `${T.red}14`, color: T.red, text: 'سلبي', icon: TrendingDown };
      default:
        return { bg: `${T.text3}14`, color: T.text3, text: 'محايد', icon: Minus };
    }
  };

  const getImpactBadge = (level?: string) => {
    switch (level) {
      case 'high':
        return { bg: `${T.red}14`, color: T.red, text: 'تأثير عالي' };
      case 'low':
        return { bg: `${T.text3}14`, color: T.text3, text: 'تأثير منخفض' };
      default:
        return { bg: `${T.amber}14`, color: T.amber, text: 'تأثير متوسط' };
    }
  };

  const formatTime = (value?: string | null) => {
    if (!value) return 'غير متاح';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'غير متاح';
    return date.toLocaleString('ar-SA', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const timeAgo = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    return `منذ ${days} يوم`;
  };

  // ── Main Tab Config ──
  const MAIN_TABS: { id: MainTab; label: string; icon: React.ReactNode; color: string }[] = [
    { id: 'news', label: 'الأخبار', icon: <Newspaper size={15} />, color: T.cyan },
    { id: 'reports', label: 'التقارير', icon: <BarChart3 size={15} />, color: '#d4af37' },
    { id: 'agent', label: 'وكيل المحتوى', icon: <PenLine size={15} />, color: T.purple },
  ]

  return (
    <div style={{ direction: 'rtl', fontFamily: FONT_AR, minHeight: '100dvh', background: T.bg, color: T.text }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg, #0A84FF, #00C8FF)',
          }}>
            <Newspaper size={20} color="white" />
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text }}>غرفة الأخبار</h1>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 10px', borderRadius: 20,
            background: `${T.red}14`, border: `0.5px solid ${T.red}33`,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.red, animation: 'live-dot 1.8s ease-in-out infinite' }} />
            <span style={{ fontSize: 10, color: T.red, fontFamily: FONT_MONO }}>LIVE</span>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: T.text2 }}>
          أخبار مالية مترجمة مع تحليل AI، تقارير السوق، ووكيل محتوى ذكي
        </p>
      </div>

      {/* Main Tab Bar */}
      <div style={{
        display: 'flex',
        gap: 0,
        borderBottom: `0.5px solid ${T.border}`,
        marginBottom: 20,
      }}>
        {MAIN_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '12px 22px',
              fontFamily: FONT_AR, fontSize: 13,
              fontWeight: activeTab === tab.id ? 800 : 500,
              color: activeTab === tab.id ? tab.color : T.text2,
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? `2.5px solid ${tab.color}` : '2.5px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {tab.icon}
            {tab.label}
            {tab.id === 'agent' && <Sparkles size={12} style={{ opacity: 0.6 }} />}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'agent' ? (
        <ContentAgentPage />
      ) : activeTab === 'reports' ? (
        <ReportsTab />
      ) : (
      <>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { icon: Globe, label: `${stats.total} خبر`, color: T.cyan },
          { icon: TrendingUp, label: `${stats.positive} إيجابي`, color: T.green },
          { icon: TrendingDown, label: `${stats.negative} سلبي`, color: T.red },
          { icon: Zap, label: `${stats.high} عالي الأثر`, color: T.amber },
        ].map((f, i) => (
          <div key={i} style={{
            background: T.card, border: `1px solid ${T.border}`,
            borderRadius: 14, padding: '16px', textAlign: 'center',
          }}>
            <f.icon size={24} color={f.color} style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{f.label}</div>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`,
        borderRadius: 14, padding: '14px 18px', marginBottom: 20,
        display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
      }}>
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: T.bg2, borderRadius: 10, padding: '6px 12px', flex: '1 1 200px',
          border: `1px solid ${T.border}`,
        }}>
          <Search size={14} color={T.text3} />
          <input
            type="text"
            placeholder="بحث في الأخبار..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="بحث في الأخبار"
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              color: T.text, fontSize: 12, width: '100%', fontFamily: FONT_AR,
            }}
          />
        </div>

        {/* Symbol Filter */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Filter size={14} color={T.text3} />
          <select
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value)}
            aria-label="تصفية حسب الأصل"
            style={{
              padding: '6px 12px', borderRadius: 10, border: `1px solid ${T.border}`,
              background: T.bg2, color: T.text, fontSize: 12,
              fontFamily: FONT_AR, cursor: 'pointer',
            }}
          >
            <option value="all">كل الأصول</option>
            <option value="BTC">BTC</option>
            <option value="ETH">ETH</option>
            <option value="SOL">SOL</option>
            <option value="XRP">XRP</option>
            <option value="BNB">BNB</option>
            <option value="ADA">ADA</option>
          </select>
        </div>

        {/* Sentiment Filter */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { id: 'all', label: 'الكل', color: T.text3 },
            { id: 'positive', label: 'إيجابي', color: T.green },
            { id: 'negative', label: 'سلبي', color: T.red },
            { id: 'neutral', label: 'محايد', color: T.text3 },
          ].map((filter) => (
            <button
              key={filter.id}
              onClick={() => setSentimentFilter(filter.id)}
              aria-label={`تصفية حسب المشاعر: ${filter.label}`}
              style={{
                padding: '6px 14px', borderRadius: 999,
                border: `1px solid ${sentimentFilter === filter.id ? filter.color : T.border}`,
                background: sentimentFilter === filter.id ? `${filter.color}18` : T.bg2,
                color: sentimentFilter === filter.id ? filter.color : T.text2,
                cursor: 'pointer', fontSize: 11, fontWeight: 700,
                fontFamily: FONT_AR, transition: 'all 0.2s',
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Refresh */}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="تحديث الأخبار"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 10,
            border: `1px solid ${T.border}`, background: T.bg2,
            color: T.text2, cursor: 'pointer', fontSize: 11,
            fontFamily: FONT_AR, fontWeight: 700,
          }}
        >
          <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          تحديث
        </button>
      </div>

      {/* Error Banner */}
      {fetchError && (
        <div style={{
          background: `${T.red}08`, border: `1px solid ${T.red}22`,
          borderRadius: 10, padding: '10px 14px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertTriangle size={14} style={{ color: T.red, flexShrink: 0 }} />
          <span style={{ fontFamily: FONT_AR, fontSize: 11, color: T.red, flex: 1 }}>{fetchError}</span>
          <button onClick={handleRefresh} style={{
            padding: '3px 10px', borderRadius: 5,
            background: `${T.red}18`, color: T.red,
            border: `1px solid ${T.red}44`,
            fontFamily: FONT_AR, fontSize: 9.5, cursor: 'pointer',
          }}>إعادة المحاولة</button>
        </div>
      )}

      {/* News List */}
      {loading ? (
        <div style={{
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: 20, padding: '32px', textAlign: 'center', color: T.text2,
        }}>
          <RefreshCw size={28} color={T.cyan} style={{ marginBottom: 14, animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: 14 }}>جارٍ تحميل الأخبار مع تحليل AI...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={{
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: 20, padding: '40px 32px', textAlign: 'center',
        }}>
          <Newspaper size={34} color={T.cyan} style={{ marginBottom: 14 }} />
          <h2 style={{ color: T.text, fontSize: 18, fontWeight: 800, margin: '0 0 8px' }}>
            لا توجد أخبار مطابقة
          </h2>
          <p style={{ color: T.text2, fontSize: 13, margin: 0 }}>
            غيّر الفلتر أو انتظر التحديث القادم
          </p>
        </div>
      ) : (
        <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredItems.slice(0, displayCount).map((item, index) => {
            const sentiment = getSentimentBadge(item.sentimentLabel);
            const impact = getImpactBadge(item.impactLevel);
            const SentimentIcon = sentiment.icon;
            const isExpanded = expandedId === item.id;

            return (
              <article
                key={item.id || index}
                className="news-article-card"
                style={{
                  background: T.card,
                  border: `1px solid ${T.border}`,
                  borderRight: `3px solid ${sentiment.color}`,
                  borderRadius: 16,
                  overflow: 'hidden',
                  animation: `fade-in 0.25s ease-out ${index * 30}ms both`,
                }}
              >
                <div style={{ padding: '18px 20px' }}>
                  {/* Top bar: badges and time */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    {item.categoryAr && (
                      <span style={{
                        fontSize: 10, padding: '3px 8px', borderRadius: 99,
                        background: `${T.cyan}14`, color: T.cyan, fontWeight: 800,
                      }}>
                        {item.categoryAr}
                      </span>
                    )}
                    <span style={{
                      fontSize: 10, padding: '3px 8px', borderRadius: 99,
                      background: sentiment.bg, color: sentiment.color, fontWeight: 800,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <SentimentIcon size={10} />
                      {sentiment.text}
                    </span>
                    <span style={{
                      fontSize: 10, padding: '3px 8px', borderRadius: 99,
                      background: impact.bg, color: impact.color, fontWeight: 800,
                    }}>
                      {impact.text}
                    </span>
                    {/* FIX React Error #31: AI may return objects instead of strings */}
                    {Array.isArray(item.affectedAssets) && item.affectedAssets.length > 0 && item.affectedAssets.map((asset, i) => (
                      <span key={i} style={{
                        fontSize: 9, padding: '2px 6px', borderRadius: 6,
                        background: `${T.cyan}14`, color: T.cyan, fontWeight: 800,
                        fontFamily: FONT_MONO,
                      }}>
                        {safeStr(asset)}
                      </span>
                    ))}
                    <span style={{ fontSize: 10, color: T.text3, marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={10} />
                      {timeAgo(item.publishedAt)}
                    </span>
                  </div>

                  {/* Translated Title (Arabic - main) */}
                  {item.translatedTitle && item.translatedTitle !== item.title && (
                    <h3 style={{
                      color: T.text, fontSize: 16, fontWeight: 800, margin: '0 0 6px',
                      lineHeight: 1.6,
                    }}>
                      {item.translatedTitle}
                    </h3>
                  )}

                  {/* Original Title */}
                  <p style={{
                    color: T.text3, fontSize: 12, margin: '0 0 10px',
                    direction: 'ltr', textAlign: 'left',
                    fontFamily: FONT_MONO,
                  }}>
                    {item.title}
                  </p>

                  {/* Summary */}
                  {item.summary && (
                    <p style={{
                      color: T.text2, fontSize: 13, margin: '0 0 12px',
                      lineHeight: 1.7, padding: '8px 12px',
                      background: 'rgba(10,132,255,0.06)', borderRadius: 10,
                      borderRight: `2px solid ${T.cyan}44`,
                    }}>
                      {item.summary}
                    </p>
                  )}

                  {/* Bottom bar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: T.text3 }}>
                        المصدر: {item.source || 'غير معروف'}
                      </span>
                      <span style={{ fontSize: 10, color: T.text3 }}>
                        {formatTime(item.publishedAt)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {item.aiAnalysis && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', borderRadius: 8,
                            background: `${T.cyan}14`, border: `1px solid ${T.cyan}33`,
                            color: T.cyan, cursor: 'pointer', fontSize: 10,
                            fontWeight: 800, fontFamily: FONT_AR,
                          }}
                        >
                          <Brain size={12} />
                          اقرأ التحليل الكامل
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                      )}
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            color: T.cyan, fontSize: 10, fontWeight: 800,
                            textDecoration: 'none', fontFamily: FONT_AR,
                          }}
                        >
                          المصدر <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded AI Analysis */}
                {isExpanded && item.aiAnalysis && (
                  <div style={{
                    padding: '16px 20px',
                    borderTop: `1px solid ${T.border}`,
                    background: 'rgba(10,132,255,0.03)',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      marginBottom: 10,
                    }}>
                      <Brain size={16} color={T.cyan} />
                      <span style={{ fontSize: 13, fontWeight: 800, color: T.cyan }}>
                        تحليل AI Council
                      </span>
                    </div>
                    <AIAnalysisRenderer analysis={item.aiAnalysis} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
        {filteredItems.length > displayCount && (
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <button
              onClick={() => setDisplayCount(prev => prev + 50)}
              style={{
                padding: '10px 32px', borderRadius: 12,
                border: `1px solid ${T.border}`, background: T.card,
                color: T.text2, fontSize: 12, fontWeight: 800,
                fontFamily: FONT_AR, cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              تحميل المزيد ({filteredItems.length - displayCount} متبقي)
            </button>
          </div>
        )}
        </>
      )}
      </>
      )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Reports Tab — Fetches ContentArticle of type MARKET_REPORT / ANALYSIS
   ═══════════════════════════════════════════════════ */
function ReportsTab() {
  const { articles, fetchFeed, loading } = useContentAgentStore()
  const [filterCategory, setFilterCategory] = useState<ContentCategory | ''>('')
  const [reportSearch, setReportSearch] = useState('')

  useEffect(() => {
    // Fetch content feed, then filter for report types
    fetchFeed()
  }, [fetchFeed])

  // Only show reports and analysis
  const reports = useMemo(() => {
    return articles
      .filter(a =>
        a.type === ContentType.MARKET_REPORT ||
        a.type === ContentType.ANALYSIS ||
        a.type === ContentType.WEEKLY_REVIEW ||
        a.type === ContentType.HOURLY_UPDATE ||
        a.type === ContentType.PAIR_ANALYSIS
      )
      .filter(a => {
        if (filterCategory && a.category !== filterCategory) return false
        if (reportSearch.trim()) {
          const q = reportSearch.toLowerCase()
          return (
            (a.titleAr || '').toLowerCase().includes(q) ||
            (a.titleEn || '').toLowerCase().includes(q) ||
            (a.summaryAr || '').toLowerCase().includes(q) ||
            (a.summaryEn || '').toLowerCase().includes(q)
          )
        }
        return true
      })
  }, [articles, filterCategory, reportSearch])

  const T = {
    bg: '#0B0E14', card: '#1A1D29', border: 'rgba(255,255,255,0.06)',
    text: '#F0F2F5', text2: '#8B92A8', text3: '#5A6178',
    cyan: '#00D4FF', green: '#00FFA3', red: '#FF4757',
    amber: '#FFB800', purple: '#B388FF', gold: '#d4af37',
  }

  function getCategoryLabel(c: ContentCategory): string {
    const map: Record<ContentCategory, string> = {
      [ContentCategory.CRYPTO]: 'كريبتو',
      [ContentCategory.FOREX]: 'فوركس',
      [ContentCategory.STOCKS]: 'أسهم',
      [ContentCategory.COMMODITIES]: 'سلع',
      [ContentCategory.ECONOMY]: 'اقتصاد',
      [ContentCategory.REGULATION]: 'تشريعات',
      [ContentCategory.TECHNOLOGY]: 'تقنية',
      [ContentCategory.EDUCATION]: 'تعليم',
      [ContentCategory.GEOPOLITICS]: 'جيوسياسة',
      [ContentCategory.DEFI]: 'ديفاي',
      [ContentCategory.NFT]: 'NFT',
    }
    return map[c] || c
  }

  function getCategoryColor(c: ContentCategory): string {
    const map: Record<ContentCategory, string> = {
      [ContentCategory.CRYPTO]: '#FFB800',
      [ContentCategory.FOREX]: '#00D4FF',
      [ContentCategory.STOCKS]: '#00FFA3',
      [ContentCategory.COMMODITIES]: '#FF8C42',
      [ContentCategory.ECONOMY]: '#B388FF',
      [ContentCategory.REGULATION]: '#FF4757',
      [ContentCategory.TECHNOLOGY]: '#00D4FF',
      [ContentCategory.EDUCATION]: '#10B981',
      [ContentCategory.GEOPOLITICS]: '#FF6B81',
      [ContentCategory.DEFI]: '#A78BFA',
      [ContentCategory.NFT]: '#F472B6',
    }
    return map[c] || T.text3
  }

  function getTypeLabel(t: ContentType): string {
    const map: Record<ContentType, string> = {
      [ContentType.ARTICLE]: 'مقال',
      [ContentType.ANALYSIS]: 'تحليل',
      [ContentType.NEWS_DIGEST]: 'ملخص أخبار',
      [ContentType.MARKET_REPORT]: 'تقرير سوق',
      [ContentType.EDUCATIONAL]: 'تعليمي',
      [ContentType.OPINION]: 'رأي',
      [ContentType.BREAKING]: 'عاجل',
      [ContentType.HOURLY_UPDATE]: 'تحديث ساعي',
      [ContentType.WEEKLY_REVIEW]: 'مراجعة أسبوعية',
      [ContentType.PAIR_ANALYSIS]: 'تحليل زوج',
    }
    return map[t] || t
  }

  function timeAgo(dateStr: string | undefined): string {
    if (!dateStr) return '—'
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'الآن'
    if (mins < 60) return `منذ ${mins} دقيقة`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `منذ ${hrs} ساعة`
    const days = Math.floor(hrs / 24)
    return `منذ ${days} يوم`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Reports Header + Filters */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`,
        borderRadius: 14, padding: '14px 18px',
        display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#0B0E14', borderRadius: 10, padding: '6px 12px', flex: '1 1 200px',
          border: `1px solid ${T.border}`,
        }}>
          <Search size={14} color={T.text3} />
          <input
            type="text"
            placeholder="بحث في التقارير..."
            value={reportSearch}
            onChange={(e) => setReportSearch(e.target.value)}
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              color: T.text, fontSize: 12, width: '100%',
              fontFamily: 'var(--font-ar)',
            }}
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as ContentCategory | '')}
          style={{
            padding: '6px 12px', borderRadius: 10, border: `1px solid ${T.border}`,
            background: '#0B0E14', color: T.text, fontSize: 12,
            fontFamily: 'var(--font-ar)', cursor: 'pointer',
          }}
        >
          <option value="">كل الفئات</option>
          {Object.values(ContentCategory).map(c => (
            <option key={c} value={c} style={{ background: '#1A1D29' }}>{getCategoryLabel(c)}</option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: T.text3 }}>{reports.length} تقرير</span>
      </div>

      {/* Reports List */}
      {loading ? (
        <div style={{
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: 20, padding: '32px', textAlign: 'center', color: T.text2,
        }}>
          <RefreshCw size={28} color={T.gold} style={{ marginBottom: 14, animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: 14 }}>جارٍ تحميل التقارير...</p>
        </div>
      ) : reports.length === 0 ? (
        <div style={{
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: 20, padding: '40px 32px', textAlign: 'center',
        }}>
          <BarChart3 size={34} color={T.gold} style={{ marginBottom: 14 }} />
          <h2 style={{ color: T.text, fontSize: 18, fontWeight: 800, margin: '0 0 8px' }}>
            لا توجد تقارير حالياً
          </h2>
          <p style={{ color: T.text2, fontSize: 13, margin: 0 }}>
            يمكنك توليد تقارير من تاب وكيل المحتوى
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reports.map((report, index) => {
            const catColor = getCategoryColor(report.category)
            return (
              <article
                key={report.id}
                style={{
                  background: T.card,
                  border: `1px solid ${T.border}`,
                  borderRight: `3px solid ${catColor}`,
                  borderRadius: 16,
                  padding: '18px 20px',
                  animation: `fade-in 0.25s ease-out ${index * 30}ms both`,
                }}
              >
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 99,
                    background: `${catColor}14`, color: catColor, fontWeight: 800,
                  }}>
                    {getCategoryLabel(report.category)}
                  </span>
                  <span style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 99,
                    background: `${T.gold}14`, color: T.gold, fontWeight: 800,
                  }}>
                    {getTypeLabel(report.type)}
                  </span>
                  <span style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 99,
                    background: report.status === ContentStatus.PUBLISHED ? `${T.green}14` : `${T.text3}14`,
                    color: report.status === ContentStatus.PUBLISHED ? T.green : T.text3,
                    fontWeight: 800,
                  }}>
                    {report.status === ContentStatus.PUBLISHED ? 'منشور' : report.status === ContentStatus.DRAFT ? 'مسودة' : report.status === ContentStatus.SCHEDULED ? 'مجدول' : report.status}
                  </span>
                  {/* Quality Score */}
                  {report.qualityScore > 0 && (
                    <span style={{
                      fontSize: 10, padding: '3px 8px', borderRadius: 99,
                      background: `${T.cyan}14`, color: T.cyan, fontWeight: 800,
                      fontFamily: 'var(--font-mono)',
                    }}>
                      جودة {report.qualityScore}%
                    </span>
                  )}
                  {/* Related Symbols */}
                  {report.relatedSymbols.length > 0 && report.relatedSymbols.slice(0, 4).map((sym, i) => (
                    <span key={i} style={{
                      fontSize: 9, padding: '2px 6px', borderRadius: 6,
                      background: `${T.amber}14`, color: T.amber, fontWeight: 800,
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {safeStr(sym)}
                    </span>
                  ))}
                  <span style={{ fontSize: 10, color: T.text3, marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={10} />
                    {timeAgo(report.publishedAt || report.createdAt)}
                  </span>
                </div>

                {/* Title */}
                <h3 style={{
                  color: T.text, fontSize: 16, fontWeight: 800, margin: '0 0 6px',
                  lineHeight: 1.6,
                }}>
                  {report.titleAr || report.titleEn}
                </h3>
                {report.titleEn && report.titleAr && (
                  <p style={{
                    color: T.text3, fontSize: 12, margin: '0 0 10px',
                    direction: 'ltr', textAlign: 'left',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {report.titleEn}
                  </p>
                )}

                {/* Summary */}
                {report.summaryAr && (
                  <p style={{
                    color: T.text2, fontSize: 13, margin: '0 0 12px',
                    lineHeight: 1.7, padding: '8px 12px',
                    background: 'rgba(212,175,55,0.06)', borderRadius: 10,
                    borderRight: `2px solid ${T.gold}44`,
                  }}>
                    {report.summaryAr}
                  </p>
                )}

                {/* Bottom row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 11, color: T.text3, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Eye size={12} /> {report.views}
                    </span>
                    <span style={{ fontSize: 11, color: T.text3, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ThumbsUp size={12} /> {report.likes}
                    </span>
                    <span style={{ fontSize: 11, color: T.text3, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Share2 size={12} /> {report.shares}
                    </span>
                    <span style={{ fontSize: 11, color: T.text3, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Calendar size={12} /> {report.readingTimeMinutes} دق
                    </span>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * AI Analysis Renderer
 * Parses JSON analysis from multiple models and renders them
 */
function AIAnalysisRenderer({ analysis }: { analysis: string }) {
  try {
    const parsed = JSON.parse(analysis);

    if (Array.isArray(parsed)) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {parsed.map((item: any, i: number) => {
            const modelColors: Record<string, string> = {
              'Groq': T.amber,
              'GLM': T.green,
              'Gemini': T.cyan,
            };
            const color = modelColors[item.model] || T.cyan;

            return (
              <div key={i} style={{
                padding: '12px', borderRadius: 10,
                background: 'rgba(255,255,255,0.02)',
                borderRight: `2px solid ${color}44`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 6,
                    background: `${color}14`, color, fontWeight: 800,
                  }}>
                    {safeStr(item.model)}
                  </span>
                  {item.confidence > 0 && (
                    <span style={{ fontSize: 10, color: T.text2 }}>
                      ثقة: {Math.round(item.confidence * 100)}%
                    </span>
                  )}
                </div>
                <p style={{ color: T.text2, fontSize: 12, lineHeight: 1.7, margin: 0 }}>
                  {safeStr(item.content) || 'لا يوجد تحليل متاح'}
                </p>
              </div>
            );
          })}
        </div>
      );
    }
  } catch {
    // Not JSON, render as plain text
  }

  return (
    <p style={{ color: T.text2, fontSize: 12, lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>
      {analysis}
    </p>
  );
}
