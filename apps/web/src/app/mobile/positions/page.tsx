'use client'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useEffect, useMemo } from 'react'
import { Activity, ChevronLeft } from 'lucide-react'

export default function PositionsPage() {
  const router = useRouter()
  const t = useTranslations('mobile.positions')
  const tc = useTranslations('common')
  const { positions, fetchPositions } = usePositionsStore()
  useEffect(() => { fetchPositions() }, [fetchPositions])
  const openPositions = useMemo(() => positions.filter(p => p.status === 'open'), [positions])

  return (
    <div className="m-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={() => router.back()} style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronLeft size={18} color="rgba(255,255,255,0.6)" /></button>
        <span style={{ fontSize: 20, fontWeight: 900, color: '#FFF', fontFamily: 'var(--cairo)' }}>{t('title')}</span>
      </div>
      {openPositions.length === 0 ? (
        <div className="m-card" style={{ textAlign: 'center', padding: 40 }}>
          <Activity size={32} color="rgba(255,255,255,0.2)" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 14, fontWeight: 800, color: '#8B92A8', fontFamily: 'var(--cairo)' }}>{t('none')}</div>
        </div>
      ) : (
        openPositions.map(p => (
          <div key={p.id} className="m-card" onClick={() => router.push('/mobile/chart?symbol=' + p.symbol)} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: 'var(--mono)' }}>{p.symbol}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: p.side === 'long' ? '#00FFA3' : '#FF4757', fontFamily: 'var(--cairo)' }}>{p.side === 'long' ? tc('buy') : tc('sell')}</span>
            </div>
            <div style={{ fontSize: 11, color: '#8B92A8', fontFamily: 'var(--mono)' }}>{tc('quantity')}: {p.qty} | {tc('entry')}: ${typeof p.entryPrice === 'number' ? p.entryPrice.toFixed(2) : '—'}</div>
          </div>
        ))
      )}
    </div>
  )
}
