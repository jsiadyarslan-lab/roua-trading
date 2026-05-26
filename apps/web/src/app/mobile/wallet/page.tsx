'use client'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useEffect, useMemo } from 'react'
import { Wallet, ChevronLeft } from 'lucide-react'

export default function WalletPage() {
  const router = useRouter()
  const t = useTranslations('mobile.wallet')
  const { account, fetchAccount } = usePositionsStore()
  useEffect(() => { fetchAccount() }, [fetchAccount])
  const balance = useMemo(() => account?.buying_power ? Number(account.buying_power) : 0, [account?.buying_power])
  const equity = useMemo(() => account?.equity ? Number(account.equity) : 0, [account?.equity])

  return (
    <div className="m-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={() => router.back()} style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronLeft size={18} color="rgba(255,255,255,0.6)" /></button>
        <span style={{ fontSize: 20, fontWeight: 900, color: '#FFF', fontFamily: 'var(--cairo)' }}>{t('title')}</span>
      </div>
      <div className="m-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Wallet size={20} color="#00D4FF" />
          <span style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: 'var(--cairo)' }}>{t('account')}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ padding: '12px', borderRadius: 12, background: 'rgba(0,212,255,0.05)', border: '0.5px solid rgba(0,212,255,0.1)' }}>
            <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--cairo)', marginBottom: 4 }}>{t('buyingPower')}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#FFF', fontFamily: 'var(--mono)' }}>${balance.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div style={{ padding: '12px', borderRadius: 12, background: 'rgba(0,255,163,0.05)', border: '0.5px solid rgba(0,255,163,0.1)' }}>
            <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--cairo)', marginBottom: 4 }}>{t('equity')}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#FFF', fontFamily: 'var(--mono)' }}>${equity.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
