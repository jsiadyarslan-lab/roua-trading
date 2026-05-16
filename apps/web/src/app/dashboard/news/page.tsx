'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
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
  BarChart2,
  FileText,
} from 'lucide-react'
import { safeStr } from '@/lib/utils'

// ── Design Tokens (canonical from unified-tokens) ──
import { TExtended as T } from '@/lib/unified-tokens'
import { useScopedStyle } from '@/hooks/useScopedStyle'

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
  fullContent?: string;
  keyTakeaways?: string[];
  imageUrl?: string | null;
  url?: string | null;
  sentiment?: number;
  sentimentLabel?: string;
  impactLevel?: string;
  affectedAssets?: string[];
  category?: string;
  categoryAr?: string;
  aiAnalysis?: string;
  publishedAt?: string;
  newsType?: string;
};

export default function NewsPage() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'reports' ? 'reports' : searchParams.get('tab') === 'agent' ? 'agent' : 'news';
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
  const [activeTab, setActiveTab] = useState<'news' | 'reports' | 'agent'>(initialTab);

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

  return (
    <div style={{ direction: 'rtl', fontFamily: FONT_AR, minHeight: '100dvh', background: T.bg, color: T.text }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 44, height: 44, borderRadius: 14,
            background: 'linear-gradient(135deg, #0A84FF, #00C8FF)',
            boxShadow: '0 4px 16px rgba(0,212,255,0.25)',
          }}>
            <Newspaper size={22} color="white" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: T.text }}>غرفة الأخبار</h1>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '3px 10px', borderRadius: 20,
                background: `${T.red}14`, border: `0.5px solid ${T.red}33`,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.red, animation: 'live-dot 1.8s ease-in-out infinite' }} />
                <span style={{ fontSize: 10, color: T.red, fontFamily: FONT_MONO, fontWeight: 800 }}>LIVE</span>
              </div>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: T.text3 }}>
              أخبار مالية مترجمة من رؤى للأخبار — مشاعر السوق، التأثير المتوقع، والأصول المتأثرة
            </p>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{
        display: 'flex',
        gap: 0,
        borderBottom: `0.5px solid ${T.border}`,
        marginBottom: 20,
      }}>
        <button
          onClick={() => setActiveTab('news')}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '12px 22px',
            fontFamily: FONT_AR, fontSize: 13,
            fontWeight: activeTab === 'news' ? 800 : 500,
            color: activeTab === 'news' ? T.cyan : T.text2,
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'news' ? `2.5px solid ${T.cyan}` : '2.5px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <Newspaper size={16} />
          الأخبار
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '12px 22px',
            fontFamily: FONT_AR, fontSize: 13,
            fontWeight: activeTab === 'reports' ? 800 : 500,
            color: activeTab === 'reports' ? T.amber : T.text2,
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'reports' ? `2.5px solid ${T.amber}` : '2.5px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <BarChart2 size={16} />
          التقارير
        </button>
        <button
          onClick={() => setActiveTab('agent')}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '12px 22px',
            fontFamily: FONT_AR, fontSize: 13,
            fontWeight: activeTab === 'agent' ? 800 : 500,
            color: activeTab === 'agent' ? T.purple : T.text2,
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'agent' ? '2.5px solid #B388FF' : '2.5px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <PenLine size={16} />
          وكيل المحتوى
          <Sparkles size={12} style={{ opacity: 0.6 }} />
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'agent' ? (
        <ContentAgentPage />
      ) : activeTab === 'reports' ? (
        <ReportsTab />
      ) : (
      <>

      {/* Stats Pills */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { icon: Globe, label: `${stats.total} خبر`, color: T.cyan, bg: `${T.cyan}0D` },
          { icon: TrendingUp, label: `${stats.positive} إيجابي`, color: T.green, bg: `${T.green}0D` },
          { icon: TrendingDown, label: `${stats.negative} سلبي`, color: T.red, bg: `${T.red}0D` },
          { icon: Zap, label: `${stats.high} عالي الأثر`, color: T.amber, bg: `${T.amber}0D` },
        ].map((f, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: f.bg, border: `1px solid ${f.color}22`,
            borderRadius: 12, padding: '8px 14px',
          }}>
            <f.icon size={16} color={f.color} />
            <span style={{ fontSize: 12, fontWeight: 700, color: f.color, fontFamily: FONT_AR }}>{f.label}</span>
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
          <p style={{ fontSize: 14, fontFamily: FONT_AR }}>جارٍ تحميل الأخبار من رؤى...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={{
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: 20, padding: '40px 32px', textAlign: 'center',
        }}>
          <Newspaper size={34} color={T.cyan} style={{ marginBottom: 14 }} />
          <h2 style={{ color: T.text, fontSize: 18, fontWeight: 800, margin: '0 0 8px', fontFamily: FONT_AR }}>
            لا توجد أخبار مطابقة
          </h2>
          <p style={{ color: T.text2, fontSize: 13, margin: 0, fontFamily: FONT_AR }}>
            غيّر الفلتر أو انتظر التحديث القادم
          </p>
        </div>
      ) : (
        <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filteredItems.slice(0, displayCount).map((item, index) => {
            const sentiment = getSentimentBadge(item.sentimentLabel);
            const impact = getImpactBadge(item.impactLevel);
            const SentimentIcon = sentiment.icon;
            const isExpanded = expandedId === item.id;
            const displayTitle = item.translatedTitle || item.title;
            const hasFullContent = item.fullContent && item.fullContent.length > 10;

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
                {/* Hero Image */}
                {item.imageUrl && (
                  <div style={{
                    width: '100%', maxHeight: 220, overflow: 'hidden',
                    borderBottom: `1px solid ${T.border}`,
                  }}>
                    <img
                      src={item.imageUrl}
                      alt={safeStr(displayTitle)}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      loading="lazy"
                    />
                  </div>
                )}

                <div style={{ padding: '20px 22px' }}>
                  {/* Top: badges row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                    {item.categoryAr && (
                      <span style={{
                        fontSize: 10, padding: '3px 9px', borderRadius: 8,
                        background: `${T.cyan}12`, color: T.cyan, fontWeight: 800,
                        border: `0.5px solid ${T.cyan}22`, fontFamily: FONT_AR,
                      }}>
                        {item.categoryAr}
                      </span>
                    )}
                    <span style={{
                      fontSize: 10, padding: '3px 9px', borderRadius: 8,
                      background: sentiment.bg, color: sentiment.color, fontWeight: 800,
                      display: 'flex', alignItems: 'center', gap: 3, fontFamily: FONT_AR,
                    }}>
                      <SentimentIcon size={10} />
                      {sentiment.text}
                    </span>
                    <span style={{
                      fontSize: 10, padding: '3px 9px', borderRadius: 8,
                      background: impact.bg, color: impact.color, fontWeight: 800,
                      fontFamily: FONT_AR,
                    }}>
                      {impact.text}
                    </span>
                    {Array.isArray(item.affectedAssets) && item.affectedAssets.length > 0 && item.affectedAssets.map((asset, i) => (
                      <span key={i} style={{
                        fontSize: 9, padding: '2px 7px', borderRadius: 6,
                        background: `${T.amber}12`, color: T.amber, fontWeight: 800,
                        fontFamily: FONT_MONO, border: `0.5px solid ${T.amber}22`,
                      }}>
                        {safeStr(asset)}
                      </span>
                    ))}
                    <span style={{ fontSize: 10, color: T.text3, marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontFamily: FONT_AR }}>
                      <Clock size={10} />
                      {timeAgo(item.publishedAt)}
                    </span>
                  </div>

                  {/* Arabic Title (hero) */}
                  <h3 style={{
                    color: T.text, fontSize: 17, fontWeight: 800, margin: '0 0 8px',
                    lineHeight: 1.65, fontFamily: FONT_AR,
                  }}>
                    {displayTitle}
                  </h3>

                  {/* Original English title (subtle, if different) */}
                  {item.translatedTitle && item.translatedTitle !== item.title && (
                    <p style={{
                      color: T.text3, fontSize: 11.5, margin: '0 0 12px',
                      direction: 'ltr', textAlign: 'left',
                      fontFamily: FONT_MONO, opacity: 0.7,
                    }}>
                      {item.title}
                    </p>
                  )}

                  {/* Arabic Summary */}
                  {item.summary && (
                    <div style={{
                      color: T.text2, fontSize: 13, margin: '0 0 14px',
                      lineHeight: 1.75, padding: '10px 14px',
                      background: `${T.cyan}06`, borderRadius: 10,
                      borderRight: `2.5px solid ${sentiment.color}55`,
                      fontFamily: FONT_AR,
                    }}>
                      {item.summary}
                    </div>
                  )}

                  {/* Key Takeaways */}
                  {Array.isArray(item.keyTakeaways) && item.keyTakeaways.length > 0 && (
                    <div style={{
                      margin: '0 0 14px', padding: '10px 14px',
                      background: `${T.green}06`, borderRadius: 10,
                      border: `0.5px solid ${T.green}15`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <Zap size={12} color={T.green} />
                        <span style={{ fontSize: 11, fontWeight: 800, color: T.green, fontFamily: FONT_AR }}>النقاط الرئيسية</span>
                      </div>
                      {item.keyTakeaways.map((point, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'flex-start' }}>
                          <span style={{ fontSize: 10, color: T.green, marginTop: 3, flexShrink: 0 }}>●</span>
                          <span style={{ fontSize: 12, color: T.text2, lineHeight: 1.65, fontFamily: FONT_AR }}>{point}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Expandable Full Content */}
                  {hasFullContent && (
                    <div style={{ marginBottom: 14 }}>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '6px 14px', borderRadius: 10,
                          background: `${T.cyan}10`, border: `1px solid ${T.cyan}22`,
                          color: T.cyan, cursor: 'pointer', fontSize: 11,
                          fontWeight: 800, fontFamily: FONT_AR,
                          transition: 'all 0.15s',
                        }}
                      >
                        <FileText size={13} />
                        التحليل الكامل
                        {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    </div>
                  )}

                  {/* Bottom bar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 11, color: T.text3, display: 'flex', alignItems: 'center', gap: 4, fontFamily: FONT_AR }}>
                        <Globe size={11} />
                        {item.source || 'غير معروف'}
                      </span>
                      <span style={{ fontSize: 10, color: T.text3, fontFamily: FONT_AR }}>
                        {formatTime(item.publishedAt)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            color: T.text3, fontSize: 10, fontWeight: 700,
                            textDecoration: 'none', fontFamily: FONT_AR,
                            padding: '5px 10px', borderRadius: 8,
                            background: T.glass, border: `1px solid ${T.border}`,
                            transition: 'color 0.15s',
                          }}
                        >
                          المصدر <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Full Arabic Content */}
                {isExpanded && hasFullContent && (
                  <div style={{
                    padding: '18px 22px',
                    borderTop: `1px solid ${T.border}`,
                    background: `${T.cyan}04`,
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      marginBottom: 12,
                    }}>
                      <FileText size={16} color={T.cyan} />
                      <span style={{ fontSize: 13, fontWeight: 800, color: T.cyan, fontFamily: FONT_AR }}>
                        التحليل التفصيلي
                      </span>
                    </div>
                    <FullContentRenderer content={item.fullContent!} />
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

/**
 * Reports Tab — fetches content articles of report types from the NestJS API
 */
function ReportsTab() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReports = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/agent/content/feed?type=MARKET_REPORT&type=ANALYSIS&type=WEEKLY_REVIEW&type=HOURLY_UPDATE&type=PAIR_ANALYSIS&status=published&limit=20', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setReports(Array.isArray(data) ? data : (data.items || data.data || []));
        } else {
          // If the API is not available, show empty state
          setReports([]);
        }
      } catch {
        setReports([]);
        setError('تعذر تحميل التقارير. حاول مرة أخرى لاحقاً.');
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, []);

  if (loading) {
    return (
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: '32px', textAlign: 'center', color: T.text2 }}>
        <RefreshCw size={28} color={T.amber} style={{ marginBottom: 14, animation: 'spin 1s linear infinite' }} />
        <p style={{ fontSize: 14 }}>جارٍ تحميل التقارير...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: `${T.red}08`, border: `1px solid ${T.red}22`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <AlertTriangle size={14} style={{ color: T.red, flexShrink: 0 }} />
        <span style={{ fontFamily: FONT_AR, fontSize: 11, color: T.red }}>{error}</span>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: '40px 32px', textAlign: 'center' }}>
        <BarChart2 size={34} color={T.amber} style={{ marginBottom: 14 }} />
        <h2 style={{ color: T.text, fontSize: 18, fontWeight: 800, margin: '0 0 8px' }}>لا توجد تقارير حالياً</h2>
        <p style={{ color: T.text2, fontSize: 13, margin: 0 }}>ستظهر التقارير المحللة هنا عند توفرها. يمكنك توليدها من تاب وكيل المحتوى.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {reports.map((report: any, index: number) => (
        <article key={report.id || index} className="news-article-card" style={{
          background: T.card, border: `1px solid ${T.border}`,
          borderRight: `3px solid ${T.amber}`, borderRadius: 16,
          overflow: 'hidden', animation: `fade-in 0.25s ease-out ${index * 30}ms both`,
        }}>
          <div style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 99, background: `${T.amber}14`, color: T.amber, fontWeight: 800 }}>
                <FileText size={10} style={{ verticalAlign: 'middle', marginInlineEnd: 4 }} />
                تقرير
              </span>
              {report.type && (
                <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 99, background: `${T.cyan}14`, color: T.cyan, fontWeight: 800 }}>
                  {safeStr(report.type)}
                </span>
              )}
              {report.category && (
                <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 99, background: `${T.green}14`, color: T.green, fontWeight: 800 }}>
                  {safeStr(report.category)}
                </span>
              )}
              <span style={{ fontSize: 10, color: T.text3, marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={10} />
                {report.publishedAt || report.createdAt ? new Date(report.publishedAt || report.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }) : ''}
              </span>
            </div>
            <h3 style={{ color: T.text, fontSize: 16, fontWeight: 800, margin: '0 0 8px', lineHeight: 1.6 }}>
              {safeStr(report.titleAr || report.title || 'تقرير')}
            </h3>
            {(report.summaryAr || report.summary) && (
              <p style={{ color: T.text2, fontSize: 13, margin: 0, lineHeight: 1.7, padding: '8px 12px', background: 'rgba(255,184,0,0.06)', borderRadius: 10, borderRight: `2px solid ${T.amber}44` }}>
                {safeStr(report.summaryAr || report.summary)}
              </p>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

/**
 * Full Content Renderer
 * Renders the rich Arabic analysis content from rouatradingnews
 * Content format uses [N] Section Title markers
 */
function FullContentRenderer({ content }: { content: string }) {
  // Split content by section markers like [1] ..., [2] ..., etc.
  const sectionRegex = /\[(\d+)\]\s*([^\[]+)/g;
  const sections: { num: string; title: string; body: string }[] = [];
  let match;
  let lastEnd = 0;

  while ((match = sectionRegex.exec(content)) !== null) {
    // If there's text before the first section, capture it as intro
    if (sections.length === 0 && match.index > 0) {
      const intro = content.slice(0, match.index).trim();
      if (intro) {
        sections.push({ num: '0', title: '', body: intro });
      }
    }
    // Text between this section title and the next section
    const sectionEnd = content.indexOf('[', match.index + match[0].length);
    const bodyText = sectionEnd > -1
      ? content.slice(match.index + match[0].length, sectionEnd).trim()
      : content.slice(match.index + match[0].length).trim();

    sections.push({
      num: match[1],
      title: match[2].trim(),
      body: bodyText,
    });
    lastEnd = sectionEnd > -1 ? sectionEnd : content.length;
  }

  // If no sections found, render as plain text
  if (sections.length === 0) {
    return (
      <div style={{ color: T.text2, fontSize: 13, lineHeight: 1.85, fontFamily: FONT_AR, whiteSpace: 'pre-wrap' }}>
        {content}
      </div>
    );
  }

  const sectionColors: Record<string, string> = {
    '1': T.cyan,    // ماذا جرى
    '2': T.amber,   // لماذا يهم
    '3': T.green,   // الأصول المتأثرة
    '4': T.purple,  // ما يجب مراقبته
    '5': T.red,     // للمتداول
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {sections.filter(s => s.num !== '0').map((section) => {
        const color = sectionColors[section.num] || T.cyan;
        return (
          <div key={section.num} style={{
            padding: '12px 14px', borderRadius: 10,
            background: `${color}06`,
            borderRight: `2.5px solid ${color}55`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 6,
                background: `${color}14`, color, fontWeight: 800,
                fontFamily: FONT_AR,
              }}>
                {section.num}
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color, fontFamily: FONT_AR }}>
                {section.title}
              </span>
            </div>
            <p style={{ color: T.text2, fontSize: 12.5, lineHeight: 1.8, margin: 0, fontFamily: FONT_AR, whiteSpace: 'pre-wrap' }}>
              {section.body}
            </p>
          </div>
        );
      })}
    </div>
  );
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
