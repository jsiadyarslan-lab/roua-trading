'use client'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState, useCallback } from 'react'
import { Link2, ChevronLeft, Check, AlertCircle } from 'lucide-react'

interface Exchange { id: string; name: string; connected: boolean }

export default function KYCPage() {
  const router = useRouter()
  const tc = useTranslations('common')
  const tk = useTranslations('mobile.kyc')
  const tm = useTranslations('mobile.more')
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchExchanges() {
      try { const res = await fetch('/api/exchanges'); if (res.ok) { const data = await res.json(); if (data.exchanges) setExchanges(data.exchanges) } } catch {} finally { setLoading(false) }
    }
    fetchExchanges()
  }, [])

  return (
    <div className="m-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={() => router.back()} style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronLeft size={18} color="rgba(255,255,255,0.6)" /></button>
        <span style={{ fontSize: 20, fontWeight: 900, color: '#FFF', fontFamily: 'var(--cairo)' }}>{tm('linkAccounts')}</span>
      </div>
      <div className="m-card" style={{ marginBottom: 12, padding: '14px', background: 'rgba(0,212,255,0.04)', border: '0.5px solid rgba(0,212,255,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link2 size={18} color="#00D4FF" />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#00D4FF', fontFamily: 'var(--cairo)' }}>{tk('linkDesc')}</span>
        </div>
      </div>
      {loading && <div style={{ color: '#8B92A8', fontSize: 12, fontFamily: 'var(--cairo)' }}>{tc('loading')}</div>}
      {!loading && exchanges.length === 0 && (
        <div className="m-card" style={{ textAlign: 'center', padding: 40 }}>
          <AlertCircle size={32} color="rgba(255,255,255,0.2)" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 14, fontWeight: 800, color: '#8B92A8', fontFamily: 'var(--cairo)' }}>{tk('noAccounts')}</div>
        </div>
      )}
      {exchanges.map(ex => (
        <div key={ex.id} className="m-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: ex.connected ? 'rgba(0,255,163,0.1)' : 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Link2 size={16} color={ex.connected ? '#00FFA3' : '#8B92A8'} /></div>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: 'var(--cairo)' }}>{ex.name}</span>
          </div>
          {ex.connected ? <Check size={16} color="#00FFA3" /> : <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--cairo)' }}>{tk('notLinked')}</span>}
        </div>
      ))}
    </div>
  )
}
