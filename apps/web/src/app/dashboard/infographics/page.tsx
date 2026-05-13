'use client'

import { useState, useEffect, useCallback } from 'react'
import { T } from '@/lib/unified-tokens'
import {
  RefreshCw, Image as ImageIcon, AlertTriangle, Eye, Calendar,
  Zap, TrendingUp, ChevronRight, Plus
} from 'lucide-react'

interface InfographicItem {
  id: string
  slug: string
  titleAr: string
  titleEn?: string
  summaryAr?: string
  category: string
  categoryAr?: string
  imageUrl: string | null
  imageSource: string
  confidence: number
  views: number
  likes: number
  publishedAt: string
  createdAt: string
}

export default function InfographicsListPage() {
  const [infographics, setInfographics] = useState<InfographicItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [fixing, setFixing] = useState(false)

  const fetchInfographics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (categoryFilter !== 'all') params.set('category', categoryFilter)
      params.set('limit', '50')

      const res = await fetch(`/api/infographics/generate?${params}`)
      if (!res.ok) throw new Error('فشل في التحميل')
      const result = await res.json()
      if (result.success) {
        setInfographics(result.data || [])
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [categoryFilter])

  useEffect(() => { fetchInfographics() }, [fetchInfographics])

  async function handleAutoFix() {
    setFixing(true)
    try {
      const res = await fetch('/api/infographics/auto-fix-images', { method: 'POST' })
      const result = await res.json()
      if (result.success) {
        // Refetch to show updated images
        await fetchInfographics()
      }
    } catch (err: any) {
      console.error('Auto-fix failed:', err)
    } finally {
      setFixing(false)
    }
  }

  const categories = [
    { key: 'all', label: 'الكل' },
    { key: 'crypto', label: 'عملات مشفرة' },
    { key: 'forex', label: 'فوركس' },
    { key: 'stocks', label: 'أسهم' },
    { key: 'economy', label: 'اقتصاد' },
    { key: 'education', label: 'تعليم' },
  ]

  return (
    <div style={{ width: '100%', minHeight: 'calc(100vh - 100px)', background: T.bg, padding: '12px 14px', direction: 'rtl', fontFamily: "'Cairo', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{ width: 3, height: 20, borderRadius: 2, background: T.accent }} />
        <h1 style={{ fontFamily: "'Cairo', sans-serif", fontWeight: 900, fontSize: 18, color: T.text, margin: 0 }}>
          الإنفوغرافيك
        </h1>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleAutoFix}
          disabled={fixing}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', borderRadius: 7,
            border: `0.5px solid ${T.border}`, background: T.card,
            color: T.text2, fontFamily: "'Cairo', sans-serif",
            fontSize: 10, cursor: fixing ? 'wait' : 'pointer',
            opacity: fixing ? 0.5 : 1,
          }}
        >
          <RefreshCw size={11} className={fixing ? 'animate-spin' : ''} />
          {fixing ? 'جاري الإصلاح...' : 'إصلاح الصور'}
        </button>
        <button
          onClick={fetchInfographics}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', borderRadius: 7,
            border: `0.5px solid ${T.border}`, background: T.card,
            color: T.text2, fontFamily: "'Cairo', sans-serif",
            fontSize: 10, cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          تحديث
        </button>
      </div>

      {/* Category Filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {categories.map(cat => (
          <button
            key={cat.key}
            onClick={() => setCategoryFilter(cat.key)}
            style={{
              padding: '6px 14px', borderRadius: 8,
              background: categoryFilter === cat.key ? `${T.accent}18` : T.card,
              border: `0.5px solid ${categoryFilter === cat.key ? T.accent : T.border}`,
              color: categoryFilter === cat.key ? T.accent : T.text2,
              fontFamily: "'Cairo', sans-serif", fontSize: 11,
              fontWeight: categoryFilter === cat.key ? 700 : 500,
              cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s',
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: `${T.red}08`, border: `0.5px solid ${T.red}22`,
          borderRadius: 10, padding: '10px 14px', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertTriangle size={14} style={{ color: T.red }} />
          <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.red }}>{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <RefreshCw size={28} style={{ color: T.blue, margin: '0 auto', animation: 'spin 1s linear infinite' }} />
          <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: 12, color: T.text3, marginTop: 8 }}>جاري التحميل...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && infographics.length === 0 && (
        <div style={{
          padding: 48, textAlign: 'center',
          background: T.card, border: `0.5px solid ${T.border}`,
          borderRadius: 12,
        }}>
          <ImageIcon size={40} style={{ color: T.text3, opacity: 0.3, margin: '0 auto 12px' }} />
          <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: 14, color: T.text2, marginBottom: 4 }}>
            لا توجد إنفوغرافيك بعد
          </p>
          <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text3 }}>
            سيتم إنشاء إنفوغرافيك تلقائياً من التحليلات المالية
          </p>
        </div>
      )}

      {/* Infographic Grid */}
      {!loading && infographics.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {infographics.map((ig) => (
            <a
              key={ig.id}
              href={`/dashboard/infographics/${ig.slug}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div style={{
                background: T.card, border: `0.5px solid ${T.border}`,
                borderRadius: 12, overflow: 'hidden',
                transition: 'transform 0.2s, border-color 0.2s',
                cursor: 'pointer',
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.borderColor = T.accent
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.borderColor = T.border
                }}
              >
                {/* Image */}
                <div style={{ position: 'relative', height: 160, background: T.bgLight, overflow: 'hidden' }}>
                  {ig.imageUrl ? (
                    <img
                      src={ig.imageUrl}
                      alt={ig.titleAr}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      loading="lazy"
                    />
                  ) : (
                    <div style={{
                      width: '100%', height: '100%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <ImageIcon size={32} style={{ color: T.text3, opacity: 0.2 }} />
                    </div>
                  )}

                  {/* Category Badge */}
                  <div style={{
                    position: 'absolute', top: 8, right: 8,
                    padding: '2px 8px', borderRadius: 5,
                    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
                    fontFamily: "'Cairo', sans-serif", fontSize: 9, color: T.accent,
                  }}>
                    {ig.categoryAr || ig.category}
                  </div>

                  {/* Image Source Indicator */}
                  {ig.imageUrl && (
                    <div style={{
                      position: 'absolute', bottom: 8, left: 8,
                      padding: '2px 6px', borderRadius: 4,
                      background: 'rgba(0,0,0,0.6)',
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: T.text3,
                    }}>
                      {ig.imageSource === 'pollinations' ? 'AI' : ig.imageSource}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div style={{ padding: '12px 14px' }}>
                  <h3 style={{
                    fontFamily: "'Cairo', sans-serif", fontWeight: 700,
                    fontSize: 13, color: T.text, lineHeight: 1.5,
                    marginBottom: 6, overflow: 'hidden',
                    textOverflow: 'ellipsis', display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  }}>
                    {ig.titleAr}
                  </h3>

                  {ig.summaryAr && (
                    <p style={{
                      fontFamily: "'Cairo', sans-serif", fontSize: 11,
                      color: T.text3, lineHeight: 1.6,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      marginBottom: 8,
                    }}>
                      {ig.summaryAr}
                    </p>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 9, color: T.text3 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Calendar size={9} />
                      {new Date(ig.publishedAt || ig.createdAt).toLocaleDateString('ar-SA')}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Eye size={9} />
                      {ig.views}
                    </span>
                    {ig.confidence > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Zap size={9} style={{ color: T.accent }} />
                        {ig.confidence}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <div style={{
        marginTop: 20, padding: '10px 16px',
        background: `${T.amber}06`, border: `0.5px solid ${T.amber}18`,
        borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <AlertTriangle size={14} style={{ color: T.amber, flexShrink: 0 }} />
        <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.amber }}>
          المحتوى التحليلي لأغراض تعليمية فقط ولا يُعد نصيحة استثمارية.
        </span>
      </div>
    </div>
  )
}
