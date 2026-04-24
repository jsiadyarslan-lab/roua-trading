'use client'

import { useEffect, useMemo, useState } from 'react'
import { Newspaper, Globe, Filter, RefreshCw, ExternalLink } from 'lucide-react'

const T = {
  blue: '#0A84FF', cyan: '#00C8FF', green: '#00FFC6', red: '#FF4D4D', amber: '#FFB800',
  text: '#E6EBF5', text2: '#8090A8', border: 'rgba(10,132,255,0.14)',
  card: 'rgba(13,21,32,0.9)',
}

type NewsItem = {
  category: string
  categoryAr: string
  color: string
  bgColor: string
  text: string
  link?: string | null
  publishedAt?: string | null
  impact: 'high' | 'medium'
  source?: string
}

export default function NewsPage() {
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<'all' | 'high' | 'medium'>('all')

  useEffect(() => {
    let cancelled = false

    async function loadNews() {
      try {
        const res = await fetch('/api/news/feed', { cache: 'no-store' })
        const data = await res.json()
        if (!cancelled && Array.isArray(data)) {
          setItems(data)
        }
      } catch {
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadNews()
    const interval = setInterval(loadNews, 5 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return items
    return items.filter(item => item.impact === activeFilter)
  }, [activeFilter, items])

  return (
    <div style={{ padding: '32px 24px', direction: 'rtl', fontFamily: "'Cairo', sans-serif" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          <Newspaper size={20} color={T.blue} />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text }}>الأخبار</h1>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 20,
            background: `${T.blue}18`, color: T.blue,
            fontFamily: "'JetBrains Mono', monospace",
          }}>NEWS ROOM</span>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 10px', borderRadius: 20,
            background: `${T.red}14`, border: `0.5px solid ${T.red}33`,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.red }} />
            <span style={{ fontSize: 10, color: T.red, fontFamily: "'JetBrains Mono', monospace" }}>LIVE FEED</span>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: T.text2 }}>
          موجز حي للأخبار مع تصنيف الأثر والمصدر ووقت النشر. عند غياب المصدر الخارجي ستظهر تغذية احتياطية واضحة.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { icon: Globe, label: `${items.length || 0} خبر`, color: T.blue },
          { icon: Filter, label: `${items.filter(item => item.impact === 'high').length} عالي الأثر`, color: T.green },
          { icon: RefreshCw, label: 'تحديث كل 5 دقائق', color: T.amber },
        ].map((f, i) => (
          <div key={i} style={{
            background: T.card, border: `0.5px solid ${T.border}`,
            borderRadius: 14, padding: '20px', textAlign: 'center',
          }}>
            <f.icon size={28} color={f.color} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{f.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {[
          { id: 'all', label: 'الكل' },
          { id: 'high', label: 'عالي الأثر' },
          { id: 'medium', label: 'متوسط الأثر' },
        ].map(filter => (
          <button
            key={filter.id}
            onClick={() => setActiveFilter(filter.id as 'all' | 'high' | 'medium')}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: `0.5px solid ${activeFilter === filter.id ? T.blue : T.border}`,
              background: activeFilter === filter.id ? `${T.blue}18` : T.card,
              color: activeFilter === filter.id ? T.blue : T.text2,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{
          background: T.card, border: `0.5px solid ${T.border}`,
          borderRadius: 20, padding: '32px', textAlign: 'center', color: T.text2,
        }}>
          جارٍ تحميل الأخبار...
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={{
          background: T.card, border: `0.5px solid ${T.border}`,
          borderRadius: 20, padding: '40px 32px', textAlign: 'center',
        }}>
          <Newspaper size={34} color={T.blue} style={{ marginBottom: 14 }} />
          <h2 style={{ color: T.text, fontSize: 18, fontWeight: 800, margin: '0 0 8px' }}>
            لا توجد أخبار مطابقة الآن
          </h2>
          <p style={{ color: T.text2, fontSize: 13, margin: 0 }}>
            غيّر الفلتر أو انتظر التحديث القادم للتغذية.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {filteredItems.map((item, index) => (
            <article
              key={`${item.text}-${index}`}
              style={{
                background: T.card,
                border: `0.5px solid ${T.border}`,
                borderRight: `3px solid ${item.color}`,
                borderRadius: 16,
                padding: '18px 18px 16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 10,
                  padding: '3px 8px',
                  borderRadius: 99,
                  background: item.bgColor,
                  color: item.color,
                  fontWeight: 800,
                }}>
                  {item.categoryAr}
                </span>
                <span style={{
                  fontSize: 10,
                  padding: '3px 8px',
                  borderRadius: 99,
                  background: item.impact === 'high' ? `${T.red}14` : `${T.amber}14`,
                  color: item.impact === 'high' ? T.red : T.amber,
                  fontWeight: 800,
                }}>
                  {item.impact === 'high' ? 'عالي الأثر' : 'متوسط الأثر'}
                </span>
                <span style={{ fontSize: 10, color: T.text2, marginInlineStart: 'auto' }}>
                  {formatPublishedAt(item.publishedAt)}
                </span>
              </div>

              <p style={{ color: T.text, fontSize: 14, lineHeight: 1.8, margin: '0 0 14px' }}>
                {item.text}
              </p>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 11, color: T.text2 }}>
                  المصدر: {item.source || 'Unknown'}
                </span>
                {item.link ? (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      color: T.blue,
                      fontSize: 11,
                      fontWeight: 800,
                      textDecoration: 'none',
                    }}
                  >
                    فتح المصدر <ExternalLink size={12} />
                  </a>
                ) : (
                  <span style={{ fontSize: 11, color: T.text2 }}>
                    تغذية احتياطية
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function formatPublishedAt(value?: string | null) {
  if (!value) return 'غير متاح'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'غير متاح'

  return date.toLocaleString('ar-SA', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
