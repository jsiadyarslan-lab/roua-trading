'use client'

import { useEffect, useMemo } from 'react'
import { PageHeader, Card } from '@/components/mobile/Card'
import { SkeletonCard, SkeletonLine } from '@/components/mobile/Skeleton'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { Wallet, DollarSign, CreditCard, TrendingUp, Shield, Link2, AlertTriangle } from 'lucide-react'

export default function MobileWalletPage() {
  const account = usePositionsStore(s => s.account)
  const exchangeBalances = usePositionsStore(s => s.exchangeBalances)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)
  const positions = usePositionsStore(s => s.positions)
  const loading = usePositionsStore(s => s.loading)

  useEffect(() => { fetchAccount() }, [fetchAccount])

  const equity = useMemo(() => Number(account?.equity ?? 0) || 0, [account?.equity])
  const unrealizedPnl = useMemo(() => Number(account?.unrealizedPnl ?? 0) || 0, [account?.unrealizedPnl])
  const buyingPower = useMemo(() => Number(account?.buying_power ?? 0) || 0, [account?.buying_power])
  const initialMargin = useMemo(() => Number(account?.initialMargin ?? 0) || 0, [account?.initialMargin])
  const cash = useMemo(() => Number(account?.cash ?? 0) || 0, [account?.cash])
  const openPositions = positions.length
  const isUp = unrealizedPnl >= 0

  // Show skeleton while account data is loading
  if (loading && !account) {
    return (
      <div className="r-page">
        <PageHeader title="المحفظة" subtitle="منصة ربط حسابات" />
        <SkeletonCard lines={3} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 var(--space-lg)', marginBottom: 12 }}>
          <Card noMargin>
            <div style={{ textAlign: 'center' }}>
              <div className="r-skeleton r-skeleton--shimmer" style={{ height: 16, width: 50, margin: '0 auto 4px', borderRadius: 6 }} />
              <div className="r-skeleton r-skeleton--shimmer" style={{ height: 20, width: 80, margin: '0 auto 4px', borderRadius: 6 }} />
              <div className="r-skeleton r-skeleton--shimmer" style={{ height: 10, width: 60, margin: '0 auto', borderRadius: 4 }} />
            </div>
          </Card>
          <Card noMargin>
            <div style={{ textAlign: 'center' }}>
              <div className="r-skeleton r-skeleton--shimmer" style={{ height: 16, width: 50, margin: '0 auto 4px', borderRadius: 6 }} />
              <div className="r-skeleton r-skeleton--shimmer" style={{ height: 20, width: 80, margin: '0 auto 4px', borderRadius: 6 }} />
              <div className="r-skeleton r-skeleton--shimmer" style={{ height: 10, width: 60, margin: '0 auto', borderRadius: 4 }} />
            </div>
          </Card>
        </div>
        <SkeletonCard lines={2} />
        <div style={{ height: 80 }} />
      </div>
    )
  }

  return (
    <div className="r-page">
      <PageHeader title="المحفظة" subtitle="منصة ربط حسابات" />

      <Card highlight>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #00D4FF, #5B21B6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Wallet size={20} color="#FFF" />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#8B92A8', fontFamily: 'var(--font-cairo)', fontWeight: 700 }}>إجمالي رأس المال</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-mono)' }}>
              ${equity.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 10, background: isUp ? 'rgba(0,255,163,0.06)' : 'rgba(255,69,58,0.06)', border: `0.5px solid ${isUp ? 'rgba(0,255,163,0.15)' : 'rgba(255,69,58,0.15)'}` }}>
          <TrendingUp size={12} color={isUp ? '#00FFA3' : '#FF4757'} />
          <span style={{ fontSize: 11, fontWeight: 800, color: isUp ? '#00FFA3' : '#FF4757', fontFamily: 'var(--font-mono)' }}>
            {isUp ? '+' : ''}${unrealizedPnl.toFixed(2)} P&L
          </span>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 var(--space-lg)', marginBottom: 12 }}>
        <Card noMargin>
          <div style={{ textAlign: 'center' }}>
            <DollarSign size={16} color="#00D4FF" style={{ margin: '0 auto 4px' }} />
            <div style={{ fontSize: 14, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-mono)' }}>${buyingPower.toFixed(2)}</div>
            <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>قوة الشراء</div>
          </div>
        </Card>
        <Card noMargin>
          <div style={{ textAlign: 'center' }}>
            <CreditCard size={16} color="#FFB800" style={{ margin: '0 auto 4px' }} />
            <div style={{ fontSize: 14, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-mono)' }}>${initialMargin.toFixed(2)}</div>
            <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>الهامش المستخدم</div>
          </div>
        </Card>
        <Card noMargin>
          <div style={{ textAlign: 'center' }}>
            <Wallet size={16} color="#32D74B" style={{ margin: '0 auto 4px' }} />
            <div style={{ fontSize: 14, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-mono)' }}>${cash.toFixed(2)}</div>
            <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>الرصيد المتاح</div>
          </div>
        </Card>
        <Card noMargin>
          <div style={{ textAlign: 'center' }}>
            <TrendingUp size={16} color="#B388FF" style={{ margin: '0 auto 4px' }} />
            <div style={{ fontSize: 14, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-mono)' }}>{openPositions}</div>
            <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>مراكز مفتوحة</div>
          </div>
        </Card>
      </div>

      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Shield size={18} color="#d4af37" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 11, color: '#8B92A8', fontFamily: 'var(--font-cairo)', lineHeight: 1.6 }}>
            رؤى منصة ربط حسابات — لا تُجري عمليات إيداع أو سحب. أموالك في بورصتك.
          </div>
        </div>
      </Card>

      <div className="r-section__title" style={{ marginTop: 12 }}>الحسابات المرتبطة</div>
      {exchangeBalances && exchangeBalances.length > 0 ? (
        exchangeBalances.map((ex, i) => (
          <Card key={i}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,212,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Link2 size={16} color="#00D4FF" />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-cairo)' }}>{ex.exchange}</div>
                  {ex.label && <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--font-cairo)' }}>{ex.label}</div>}
                </div>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-mono)' }}>${Number(ex.equity).toFixed(2)}</div>
                {ex.error && <div style={{ fontSize: 9, color: '#FF453A', fontFamily: 'var(--font-cairo)' }}>غير متاح</div>}
              </div>
            </div>
          </Card>
        ))
      ) : (
        <Card>
          <div className="r-empty">
            <AlertTriangle size={32} color="#d4af37" />
            <div className="r-empty__title">لا توجد حسابات مرتبطة</div>
            <a href="/mobile/kyc" style={{ display: 'inline-block', padding: '10px 24px', borderRadius: 12, background: 'linear-gradient(135deg, #00D4FF, #5B21B6)', color: '#FFF', fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-cairo)', textDecoration: 'none' }}>ربط حساب بورصة</a>
          </div>
        </Card>
      )}
      <div style={{ height: 80 }} />
    </div>
  )
}
