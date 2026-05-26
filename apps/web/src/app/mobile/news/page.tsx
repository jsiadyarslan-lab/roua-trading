'use client'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState, useCallback } from 'react'
import { Newspaper, ChevronLeft, ExternalLink, Clock } from 'lucide-react'

interface NewsItem { title: string; summary?: string; url?: string; source?: string; publishedAt?: string; sentiment?: string }

export default function NewsPage() {
  const router = useRouter()
  const t = useTranslations('mobile.news')
  const tc = useTranslations('common')
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchNews() {
      try { const res = await fetch('/api/news'); if (res.ok) { const data = await res.json(); if (data.news) setNews(data.news) } } catch {} finally { setLoading(false) }
    }
    fetchNews()
  }, [])

  return (
    <div className="m-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={() => router.back()} style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronLeft size={18} color="rgba(255,255,255,0.6)" /></button>
        <span style={{ fontSize: 20, fontWeight: 900, color: '#FFF', fontFamily: 'var(--cairo)' }}>{t('title')}</span>
      </div>
      {loading && <div style={{ color: '#8B92A8', fontSize: 12, fontFamily: 'var(--cairo)' }}>{tc('loading')}</div>}
      {!loading && news.length === 0 && <div className="m-card" style={{ textAlign: 'center', padding: 40 }}><Newspaper size={32} color="rgba(255,255,255,0.2)" style={{ margin: '0 auto 12px' }} /><div style={{ fontSize: 14, fontWeight: 800, color: '#8B92A8', fontFamily: 'var(--cairo)' }}>{t('none')}</div></div>}
      {news.map((item, i) => (
        <div key={i} className="m-card" onClick={() => item.url && window.open(item.url, '_blank')} style={{ cursor: item.url ? 'pointer' : 'default' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: 'var(--cairo)', marginBottom: 6, lineHeight: 1.5 }}>{item.title}</div>
          {item.summary && <div style={{ fontSize: 11, color: '#8B92A8', fontFamily: 'var(--cairo)', marginBottom: 6 }}>{item.summary.slice(0, 120)}...</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {item.source && <span style={{ fontSize: 9, color: '#00D4FF', fontFamily: 'var(--cairo)', fontWeight: 700 }}>{item.source}</span>}
            {item.publishedAt && <><Clock size={10} color="rgba(255,255,255,0.3)" /><span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--cairo)' }}>{new Date(item.publishedAt).toLocaleDateString('ar')}</span></>}
            {item.url && <ExternalLink size={10} color="rgba(255,255,255,0.3)" />}
          </div>
        </div>
      ))}
    </div>
  )
}
