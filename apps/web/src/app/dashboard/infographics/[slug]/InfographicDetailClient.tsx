'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { T } from '@/lib/unified-tokens'
import { isValidImageUrl, isPollinationsUrl } from '@/lib/image-gen'
import {
  ArrowRight, Eye, Heart, Share2, Calendar, Tag, TrendingUp,
  RefreshCw, AlertTriangle, Image as ImageIcon, ExternalLink,
  Clock, Zap, ChevronRight
} from 'lucide-react'

interface InfographicData {
  id: string
  slug: string
  titleAr: string
  titleEn?: string
  contentAr: string
  contentEn?: string
  summaryAr?: string
  summaryEn?: string
  category: string
  categoryAr?: string
  tags: string[]
  relatedSymbols: string[]
  imageUrl: string | null
  imageSource: string
  imagePrompt?: string
  hasValidImage: boolean
  isPollinationsImage: boolean
  aiModel?: string
  confidence: number
  views: number
  likes: number
  publishedAt: string
  createdAt: string
}

export default function InfographicDetailClient() {
  const params = useParams()
  const slug = params?.slug as string

  const [data, setData] = useState<InfographicData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fixing, setFixing] = useState(false)
  const [fixResult, setFixResult] = useState<string | null>(null)
  const [liked, setLiked] = useState(false)

  useEffect(() => {
    if (!slug) return
    fetchInfographic()
  }, [slug])

  async function fetchInfographic() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/infographics/${slug}`)
      if (!res.ok) {
        throw new Error(res.status === 404 ? 'الإنفوغرافيك غير موجود' : 'فشل في التحميل')
      }
      const result = await res.json()
      if (result.success) {
        setData(result.data)
      } else {
        throw new Error(result.error || 'فشل في التحميل')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function fixImage() {
    if (!data || fixing) return
    setFixing(true)
    setFixResult(null)
    try {
      // Use the PUBLIC auto-fix endpoint (no admin auth needed)
      const res = await fetch('/api/infographics/auto-fix-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 1 }), // Only fix this one
      })
      const result = await res.json()
      if (result.success) {
        const fixed = result.results?.find((r: any) => r.id === data.id)
        if (fixed?.status === 'fixed') {
          setFixResult('تم إصلاح الصورة بنجاح')
          // Refetch to get updated image
          await fetchInfographic()
        } else if (fixed?.status === 'already_valid') {
          setFixResult('الصورة صالحة بالفعل')
        } else {
          // Try direct regeneration
          const regenRes = await fetch('/api/infographics/regenerate-images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [data.id], force: true }),
          })
          const regenResult = await regenRes.json()
          if (regenResult.success) {
            setFixResult('تم إعادة توليد الصورة')
            await fetchInfographic()
          } else {
            setFixResult('فشل في إصلاح الصورة')
          }
        }
      }
    } catch (err: any) {
      setFixResult(`خطأ: ${err.message}`)
    } finally {
      setFixing(false)
    }
  }

  if (loading) {
    return (
      <div style={{ width: '100%', minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg }}>
        <div style={{ textAlign: 'center' }}>
          <RefreshCw size={32} style={{ color: T.blue, margin: '0 auto', animation: 'spin 1s linear infinite' }} />
          <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: 13, color: T.text2, marginTop: 12 }}>جاري تحميل الإنفوغرافيك...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ width: '100%', minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg }}>
        <div style={{ textAlign: 'center', background: T.card, border: `0.5px solid ${T.border}`, borderRadius: 12, padding: 32, maxWidth: 400 }}>
          <AlertTriangle size={36} style={{ color: T.amber, margin: '0 auto 12px' }} />
          <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: 14, color: T.text, marginBottom: 8 }}>
            {error || 'الإنفوغرافيك غير موجود'}
          </p>
          <button
            onClick={fetchInfographic}
            style={{
              padding: '8px 20px', borderRadius: 8,
              background: T.blue, color: '#fff',
              border: 'none', fontFamily: "'Cairo', sans-serif", fontSize: 12,
              cursor: 'pointer',
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    )
  }

  const categoryLabels: Record<string, string> = {
    general: 'عام', crypto: 'عملات مشفرة', forex: 'فوركس',
    stocks: 'أسهم', economy: 'اقتصاد', education: 'تعليم',
  }

  return (
    <div style={{ width: '100%', minHeight: 'calc(100vh - 100px)', background: T.bg, padding: '16px', direction: 'rtl', fontFamily: "'Cairo', sans-serif" }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, fontSize: 11, color: T.text3 }}>
        <a href="/dashboard" style={{ color: T.text2, textDecoration: 'none' }}>الرئيسية</a>
        <ChevronRight size={12} />
        <a href="/dashboard/infographics" style={{ color: T.text2, textDecoration: 'none' }}>الإنفوغرافيك</a>
        <ChevronRight size={12} />
        <span style={{ color: T.text }}>{data.titleAr.substring(0, 30)}...</span>
      </div>

      {/* Main Card */}
      <div style={{
        maxWidth: 900, margin: '0 auto',
        background: T.card, border: `0.5px solid ${T.border}`,
        borderRadius: 14, overflow: 'hidden',
      }}>
        {/* Image Section */}
        <div style={{ position: 'relative', background: T.bgLight }}>
          {data.hasValidImage && data.imageUrl ? (
            <img
              src={data.imageUrl}
              alt={data.titleAr}
              style={{ width: '100%', maxHeight: 500, objectFit: 'cover', display: 'block' }}
              onError={(e) => {
                // Hide broken image, show placeholder
                (e.target as HTMLImageElement).style.display = 'none'
                const parent = (e.target as HTMLImageElement).parentElement
                if (parent) {
                  const placeholder = document.createElement('div')
                  placeholder.style.cssText = `width:100%;height:300px;display:flex;align-items:center;justify-content:center;background:${T.bgLight};`
                  placeholder.innerHTML = `<div style="text-align:center"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${T.text3}" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg><p style="font-family:'Cairo',sans-serif;font-size:12px;color:${T.text3};margin-top:8px">الصورة غير متوفرة</p></div>`
                  parent.appendChild(placeholder)
                }
              }}
            />
          ) : (
            <div style={{
              width: '100%', height: 300,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(135deg, ${T.bgLight}, ${T.bg})`,
            }}>
              <div style={{ textAlign: 'center' }}>
                <ImageIcon size={48} style={{ color: T.text3, opacity: 0.3 }} />
                <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: 12, color: T.text3, marginTop: 8 }}>الصورة غير متوفرة</p>
              </div>
            </div>
          )}

          {/* Image Source Badge */}
          {data.imageUrl && (
            <div style={{
              position: 'absolute', top: 12, left: 12,
              padding: '3px 10px', borderRadius: 6,
              background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: T.text2,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <Zap size={10} style={{ color: data.isPollinationsImage ? T.green : T.amber }} />
              {data.isPollinationsImage ? 'Pollinations AI' : data.imageSource === 'r2' ? 'R2 Storage' : 'صورة'}
            </div>
          )}

          {/* Fix Image Button (shown when image is invalid) */}
          {!data.hasValidImage && (
            <div style={{
              position: 'absolute', bottom: 12, right: 12,
            }}>
              <button
                onClick={fixImage}
                disabled={fixing}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 8,
                  background: T.amber, color: '#000',
                  border: 'none', fontFamily: "'Cairo', sans-serif",
                  fontSize: 11, fontWeight: 700, cursor: fixing ? 'wait' : 'pointer',
                  opacity: fixing ? 0.7 : 1,
                }}
              >
                <RefreshCw size={12} className={fixing ? 'animate-spin' : ''} />
                {fixing ? 'جاري الإصلاح...' : 'إصلاح الصورة'}
              </button>
            </div>
          )}
        </div>

        {/* Fix Result */}
        {fixResult && (
          <div style={{
            padding: '8px 16px', background: `${T.green}10`,
            borderBottom: `0.5px solid ${T.green}22`,
            fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.green,
          }}>
            {fixResult}
          </div>
        )}

        {/* Content Section */}
        <div style={{ padding: '20px 24px' }}>
          {/* Category + Date */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{
              padding: '3px 10px', borderRadius: 6,
              background: `${T.accent}18`, color: T.accent,
              fontFamily: "'Cairo', sans-serif", fontSize: 10, fontWeight: 700,
              border: `0.5px solid ${T.accent}33`,
            }}>
              {data.categoryAr || categoryLabels[data.category] || data.category}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: T.text3, fontSize: 10 }}>
              <Calendar size={10} />
              {new Date(data.publishedAt || data.createdAt).toLocaleDateString('ar-SA')}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: T.text3, fontSize: 10 }}>
              <Eye size={10} />
              {data.views} مشاهدة
            </span>
            {data.confidence > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: T.text3, fontSize: 10 }}>
                <Zap size={10} />
                ثقة: {data.confidence}%
              </span>
            )}
          </div>

          {/* Title */}
          <h1 style={{
            fontFamily: "'Cairo', sans-serif", fontWeight: 900,
            fontSize: 24, color: T.text, lineHeight: 1.6,
            marginBottom: 8,
          }}>
            {data.titleAr}
          </h1>

          {data.titleEn && (
            <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: 14, color: T.text2, marginBottom: 16 }}>
              {data.titleEn}
            </p>
          )}

          {/* Summary */}
          {data.summaryAr && (
            <div style={{
              padding: '12px 16px', background: `${T.blue}06`,
              border: `0.5px solid ${T.blue}18`, borderRadius: 10,
              marginBottom: 16,
            }}>
              <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: 13, color: T.text2, lineHeight: 1.8 }}>
                {data.summaryAr}
              </p>
            </div>
          )}

          {/* Content */}
          <div style={{
            fontFamily: "'Cairo', sans-serif", fontSize: 15, color: T.text,
            lineHeight: 2, whiteSpace: 'pre-wrap',
          }}>
            {data.contentAr}
          </div>

          {/* Related Symbols */}
          {data.relatedSymbols && data.relatedSymbols.length > 0 && (
            <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <TrendingUp size={12} style={{ color: T.accent }} />
              {data.relatedSymbols.map((symbol, i) => (
                <span key={i} style={{
                  padding: '3px 8px', borderRadius: 5,
                  background: `${T.accent}10`, color: T.accent,
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  border: `0.5px solid ${T.accent}22`,
                }}>
                  {symbol}
                </span>
              ))}
            </div>
          )}

          {/* Tags */}
          {data.tags && data.tags.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Tag size={11} style={{ color: T.text3 }} />
              {data.tags.map((tag, i) => (
                <span key={i} style={{
                  padding: '2px 7px', borderRadius: 4,
                  background: T.bgLight, color: T.text3,
                  fontFamily: "'Cairo', sans-serif", fontSize: 10,
                }}>
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Actions */}
          <div style={{
            marginTop: 20, paddingTop: 16,
            borderTop: `0.5px solid ${T.border}`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <button
              onClick={() => setLiked(!liked)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 14px', borderRadius: 8,
                background: liked ? `${T.red}18` : T.bgLight,
                border: `0.5px solid ${liked ? T.red : T.border}`,
                color: liked ? T.red : T.text2,
                fontFamily: "'Cairo', sans-serif", fontSize: 11,
                cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              <Heart size={13} fill={liked ? T.red : 'none'} />
              {data.likes + (liked ? 1 : 0)}
            </button>
            <button style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 14px', borderRadius: 8,
              background: T.bgLight, border: `0.5px solid ${T.border}`,
              color: T.text2, fontFamily: "'Cairo', sans-serif", fontSize: 11,
              cursor: 'pointer',
            }}>
              <Share2 size={13} />
              مشاركة
            </button>
            <div style={{ flex: 1 }} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: T.text3 }}>
              {data.aiModel ? `AI: ${data.aiModel}` : 'محرر بشري'}
            </span>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div style={{
        maxWidth: 900, margin: '16px auto 0',
        padding: '10px 16px', background: `${T.amber}06`,
        border: `0.5px solid ${T.amber}18`, borderRadius: 10,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <AlertTriangle size={14} style={{ color: T.amber, flexShrink: 0 }} />
        <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.amber }}>
          المحتوى التحليلي لأغراض تعليمية فقط ولا يُعد نصيحة استثمارية. تداول بمسؤولية.
        </span>
      </div>
    </div>
  )
}
