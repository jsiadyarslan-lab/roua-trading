'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
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
} from 'lucide-react';

const T = {
  blue: '#0A84FF',
  cyan: '#00C8FF',
  green: '#00FFC6',
  red: '#FF4D4D',
  amber: '#FFB800',
  text: '#E6EBF5',
  text2: '#8090A8',
  text3: '#5A6A80',
  border: 'rgba(10,132,255,0.14)',
  card: 'rgba(13,21,32,0.9)',
  bg: '#04050C',
};

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

export default function NewsPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [symbolFilter, setSymbolFilter] = useState('all');
  const [sentimentFilter, setSentimentFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [displayCount, setDisplayCount] = useState(50);
  const [fetchError, setFetchError] = useState<string | null>(null);

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
    <div style={{ padding: '32px 24px', direction: 'rtl', fontFamily: "'Cairo', sans-serif", maxWidth: 1200, margin: '0 auto' }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes live-dot { 0%, 100% { transform: scale(1); opacity: 0.65; } 50% { transform: scale(1.35); opacity: 1; } }
        @media (max-width: 767px) {
          .news-wrapper { padding: 16px 12px !important; }
          .news-article-pad { padding: 12px 14px !important; }
        }
      `}</style>
      <div className="news-wrapper" style={{ padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg, #0A84FF, #00C8FF)',
          }}>
            <Newspaper size={20} color="white" />
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text }}>الأخبار الذكية</h1>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 20,
            background: `${T.blue}18`, color: T.blue,
            fontFamily: "'JetBrains Mono', monospace",
          }}>SMART NEWS</span>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 10px', borderRadius: 20,
            background: `${T.red}14`, border: `0.5px solid ${T.red}33`,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.red, animation: 'live-dot 1.8s ease-in-out infinite' }} />
            <span style={{ fontSize: 10, color: T.red, fontFamily: "'JetBrains Mono', monospace" }}>LIVE</span>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: T.text2 }}>
          أخبار مالية مترجمة تلقائياً مع تحليل AI Council — مشاعر السوق، التأثير المتوقع، والأصول المتأثرة
        </p>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { icon: Globe, label: `${stats.total} خبر`, color: T.blue },
          { icon: TrendingUp, label: `${stats.positive} إيجابي`, color: T.green },
          { icon: TrendingDown, label: `${stats.negative} سلبي`, color: T.red },
          { icon: Zap, label: `${stats.high} عالي الأثر`, color: T.amber },
        ].map((f, i) => (
          <div key={i} style={{
            background: T.card, border: `0.5px solid ${T.border}`,
            borderRadius: 14, padding: '16px', textAlign: 'center',
          }}>
            <f.icon size={24} color={f.color} style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{f.label}</div>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div style={{
        background: T.card, border: `0.5px solid ${T.border}`,
        borderRadius: 14, padding: '14px 18px', marginBottom: 20,
        display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
      }}>
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: `${T.bg}`, borderRadius: 10, padding: '6px 12px', flex: '1 1 200px',
          border: `0.5px solid ${T.border}`,
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
              color: T.text, fontSize: 12, width: '100%', fontFamily: "'Cairo', sans-serif",
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
              padding: '6px 12px', borderRadius: 10, border: `0.5px solid ${T.border}`,
              background: T.bg, color: T.text, fontSize: 12,
              fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
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
                border: `0.5px solid ${sentimentFilter === filter.id ? filter.color : T.border}`,
                background: sentimentFilter === filter.id ? `${filter.color}18` : T.bg,
                color: sentimentFilter === filter.id ? filter.color : T.text2,
                cursor: 'pointer', fontSize: 11, fontWeight: 700,
                fontFamily: "'Cairo', sans-serif", transition: 'all 0.2s',
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
            border: `0.5px solid ${T.border}`, background: T.bg,
            color: T.text2, cursor: 'pointer', fontSize: 11,
            fontFamily: "'Cairo', sans-serif", fontWeight: 700,
          }}
        >
          <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          تحديث
        </button>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes live-dot { 0%, 100% { transform: scale(1); opacity: 0.65; } 50% { transform: scale(1.35); opacity: 1; } }
      `}</style>

      {/* Error Banner */}
      {fetchError && (
        <div style={{
          background: `${T.red}08`, border: `0.5px solid ${T.red}22`,
          borderRadius: 10, padding: '10px 14px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertTriangle size={14} style={{ color: T.red, flexShrink: 0 }} />
          <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.red, flex: 1 }}>{fetchError}</span>
          <button onClick={handleRefresh} style={{
            padding: '3px 10px', borderRadius: 5,
            background: `${T.red}18`, color: T.red,
            border: `0.5px solid ${T.red}44`,
            fontFamily: "'Cairo', sans-serif", fontSize: 9.5, cursor: 'pointer',
          }}>إعادة المحاولة</button>
        </div>
      )}

      {/* News List */}
      {loading ? (
        <div style={{
          background: T.card, border: `0.5px solid ${T.border}`,
          borderRadius: 20, padding: '32px', textAlign: 'center', color: T.text2,
        }}>
          <RefreshCw size={28} color={T.blue} style={{ marginBottom: 14, animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: 14 }}>جارٍ تحميل الأخبار مع تحليل AI...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={{
          background: T.card, border: `0.5px solid ${T.border}`,
          borderRadius: 20, padding: '40px 32px', textAlign: 'center',
        }}>
          <Newspaper size={34} color={T.blue} style={{ marginBottom: 14 }} />
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
                style={{
                  background: T.card,
                  border: `0.5px solid ${T.border}`,
                  borderRight: `3px solid ${sentiment.color}`,
                  borderRadius: 16,
                  overflow: 'hidden',
                  transition: 'all 0.2s',
                }}
              >
                <div className="news-article-pad" style={{ padding: '18px 20px' }}>
                  {/* Top bar: badges and time */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    {item.categoryAr && (
                      <span style={{
                        fontSize: 10, padding: '3px 8px', borderRadius: 99,
                        background: `${T.blue}14`, color: T.blue, fontWeight: 800,
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
                    {Array.isArray(item.affectedAssets) && item.affectedAssets.length > 0 && item.affectedAssets.map((asset) => (
                      <span key={asset} style={{
                        fontSize: 9, padding: '2px 6px', borderRadius: 6,
                        background: `${T.cyan}14`, color: T.cyan, fontWeight: 800,
                        fontFamily: "'JetBrains Mono', monospace",
                      }}>
                        {asset}
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
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {item.title}
                  </p>

                  {/* Summary */}
                  {item.summary && (
                    <p style={{
                      color: T.text2, fontSize: 13, margin: '0 0 12px',
                      lineHeight: 1.7, padding: '8px 12px',
                      background: 'rgba(10,132,255,0.06)', borderRadius: 10,
                      borderRight: `2px solid ${T.blue}44`,
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
                            background: `${T.blue}14`, border: `0.5px solid ${T.blue}33`,
                            color: T.blue, cursor: 'pointer', fontSize: 10,
                            fontWeight: 800, fontFamily: "'Cairo', sans-serif",
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
                            color: T.blue, fontSize: 10, fontWeight: 800,
                            textDecoration: 'none', fontFamily: "'Cairo', sans-serif",
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
                    borderTop: `0.5px solid ${T.border}`,
                    background: 'rgba(10,132,255,0.03)',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      marginBottom: 10,
                    }}>
                      <Brain size={16} color={T.blue} />
                      <span style={{ fontSize: 13, fontWeight: 800, color: T.blue }}>
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
                border: `0.5px solid ${T.border}`, background: T.card,
                color: T.text2, fontSize: 12, fontWeight: 800,
                fontFamily: "'Cairo', sans-serif", cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              تحميل المزيد ({filteredItems.length - displayCount} متبقي)
            </button>
          </div>
        )}
        </>
      )}
      </div>
    </div>
  );
}

/**
 * AI Analysis Renderer
 * Parses JSON analysis from multiple models and renders them
 */
function AIAnalysisRenderer({ analysis }: { analysis: string }) {
  const T = {
    text: '#E6EBF5',
    text2: '#8090A8',
    blue: '#0A84FF',
    green: '#00FFC6',
    red: '#FF4D4D',
    amber: '#FFB800',
  };

  try {
    const parsed = JSON.parse(analysis);

    if (Array.isArray(parsed)) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {parsed.map((item: any, i: number) => {
            const modelColors: Record<string, string> = {
              'Groq': T.amber,
              'GLM': T.green,
              'Gemini': T.blue,
            };
            const color = modelColors[item.model] || T.blue;

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
                    {item.model}
                  </span>
                  {item.confidence > 0 && (
                    <span style={{ fontSize: 10, color: T.text2 }}>
                      ثقة: {Math.round(item.confidence * 100)}%
                    </span>
                  )}
                </div>
                <p style={{ color: T.text2, fontSize: 12, lineHeight: 1.7, margin: 0 }}>
                  {item.content || 'لا يوجد تحليل متاح'}
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
