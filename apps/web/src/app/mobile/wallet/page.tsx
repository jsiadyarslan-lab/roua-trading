'use client'

import { useEffect } from 'react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { Wallet, DollarSign, CreditCard, TrendingUp, Shield, Link2, AlertTriangle } from 'lucide-react'

export default function MobileWalletPage() {
  const account = usePositionsStore(s => s.account)
  const exchangeBalances = usePositionsStore(s => s.exchangeBalances)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)
  const positions = usePositionsStore(s => s.positions)

  useEffect(() => { fetchAccount() }, [fetchAccount])

  const equity = Number(account?.equity ?? 0)
  const unrealizedPnl = Number(account?.unrealizedPnl ?? 0)
  const buyingPower = Number(account?.buying_power ?? 0)
  const initialMargin = Number(account?.initialMargin ?? 0)
  const cash = Number(account?.cash ?? 0)
  const openPositions = positions.length
  const isUp = unrealizedPnl >= 0

  return (
    <div className="m-page">
      <MobilePageHeader title="المحفظة" subtitle="منصة ربط حسابات" />

      {/* Equity Card */}
      <IOSCard highlight>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #00D4FF, #5B21B6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Wallet size={20} color="#FFF" />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>إجمالي رأس المال</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>
              ${equity.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 10, background: isUp ? 'rgba(0,255,163,0.06)' : 'rgba(255,69,58,0.06)', border: `0.5px solid ${isUp ? 'rgba(0,255,163,0.15)' : 'rgba(255,69,58,0.15)'}` }}>
          <TrendingUp size={12} color={isUp ? '#00FFA3' : '#FF453A'} />
          <span style={{ fontSize: 11, fontWeight: 800, color: isUp ? '#00FFA3' : '#FF453A', fontFamily: "'JetBrains Mono', monospace" }}>
            {isUp ? '+' : ''}${unrealizedPnl.toFixed(2)} P&L
          </span>
        </div>
      </IOSCard>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 16px', marginBottom: 12 }}>
        <IOSCard noMargin>
          <div style={{ textAlign: 'center' }}>
            <DollarSign size={16} color="#00D4FF" style={{ margin: '0 auto 4px' }} />
            <div style={{ fontSize: 14, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>${buyingPower.toFixed(2)}</div>
            <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>قوة الشراء</div>
          </div>
        </IOSCard>
        <IOSCard noMargin>
          <div style={{ textAlign: 'center' }}>
            <CreditCard size={16} color="#FFB800" style={{ margin: '0 auto 4px' }} />
            <div style={{ fontSize: 14, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>${initialMargin.toFixed(2)}</div>
            <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>الهامش المستخدم</div>
          </div>
        </IOSCard>
        <IOSCard noMargin>
          <div style={{ textAlign: 'center' }}>
            <Wallet size={16} color="#32D74B" style={{ margin: '0 auto 4px' }} />
            <div style={{ fontSize: 14, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>${cash.toFixed(2)}</div>
            <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>الرصيد المتاح</div>
          </div>
        </IOSCard>
        <IOSCard noMargin>
          <div style={{ textAlign: 'center' }}>
            <TrendingUp size={16} color="#B388FF" style={{ margin: '0 auto 4px' }} />
            <div style={{ fontSize: 14, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{openPositions}</div>
            <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>مراكز مفتوحة</div>
          </div>
        </IOSCard>
      </div>

      {/* Notice */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Shield size={18} color="#d4af37" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", lineHeight: 1.6 }}>
            رؤى منصة ربط حسابات — لا تُجري عمليات إيداع أو سحب. أموالك في بورصتك.
          </div>
        </div>
      </IOSCard>

      {/* Linked Accounts */}
      <div style={{ padding: '0 16px', marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>الحسابات المرتبطة</div>
      </div>
      {exchangeBalances && exchangeBalances.length > 0 ? (
        exchangeBalances.map((ex, i) => (
          <IOSCard key={i}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,212,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Link2 size={16} color="#00D4FF" />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>{ex.exchange}</div>
                  {ex.label && <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>{ex.label}</div>}
                </div>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>${Number(ex.equity).toFixed(2)}</div>
                {ex.error && <div style={{ fontSize: 9, color: '#FF453A', fontFamily: "'Cairo', sans-serif" }}>غير متاح</div>}
              </div>
            </div>
          </IOSCard>
        ))
      ) : (
        <IOSCard>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <AlertTriangle size={32} color="#d4af37" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: 13, fontWeight: 800, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>لا توجد حسابات مرتبطة</div>
            <a href="/mobile/kyc" style={{ display: 'inline-block', padding: '10px 24px', borderRadius: 12, background: 'linear-gradient(135deg, #00D4FF, #5B21B6)', color: '#FFF', fontSize: 12, fontWeight: 800, fontFamily: "'Cairo', sans-serif", textDecoration: 'none' }}>ربط حساب بورصة</a>
          </div>
        </IOSCard>
      )}
      <div style={{ height: 16 }} />
    </div>
  )
}
