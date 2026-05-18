'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Wallet, DollarSign, TrendingUp, TrendingDown, Shield, Link2, ChevronLeft, AlertCircle } from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

export default function MobileWalletPage() {
  const router = useRouter()
  const account = usePositionsStore(s => s.account)
  const exchangeBalances = usePositionsStore(s => s.exchangeBalances)
  const positions = usePositionsStore(s => s.positions)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)

  useEffect(() => { fetchAccount() }, [fetchAccount])

  const equity = account?.equity ? Number(account.equity) : 0
  const cash = account?.cash ? Number(account.cash) : 0
  const buyingPower = account?.buying_power ? Number(account.buying_power) : 0
  const unrealizedPnl = account?.unrealizedPnl ? Number(account.unrealizedPnl) : 0
  const unrealizedPnlPct = account?.unrealizedPnlPct ? Number(account.unrealizedPnlPct) : 0
  const initialMargin = account?.initialMargin ? Number(account.initialMargin) : 0
  const isPaper = account?.isPaperTrading

  const pnlColor = unrealizedPnl >= 0 ? C.success : C.danger

  const fmt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="m-page">
      <MobilePageHeader title="المحفظة" subtitle="منصة ربط حسابات" />

      {/* Equity Card */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <IOSCard highlight>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: `linear-gradient(135deg, ${C.accent}, #0088CC)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Wallet size={20} color="#FFF" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>إجمالي الأسهم</div>
                {isPaper && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 5, background: 'rgba(0,212,255,0.1)', color: C.accent, border: '0.5px solid rgba(0,212,255,0.2)', fontFamily: "'Cairo', sans-serif" }}>تداول ورقي</span>}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 28, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace", marginBottom: 8, direction: 'ltr' }}>
            ${fmt(equity)}
          </div>

          {/* P&L */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 12, background: `${pnlColor}08`, border: `0.5px solid ${pnlColor}18` }}>
            {unrealizedPnl >= 0 ? <TrendingUp size={16} color={C.success} /> : <TrendingDown size={16} color={C.danger} />}
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: pnlColor, fontFamily: "'JetBrains Mono', monospace", direction: 'ltr' }}>
                {unrealizedPnl >= 0 ? '+' : ''}${fmt(unrealizedPnl)}
              </div>
              <div style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>
                ربح/خسارة غير محقق ({unrealizedPnl >= 0 ? '+' : ''}{unrealizedPnlPct.toFixed(2)}%)
              </div>
            </div>
          </div>
        </IOSCard>
      </div>

      {/* Stats Grid */}
      <div style={{ padding: '0 16px', marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <IOSCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <DollarSign size={14} color={C.accent} />
            <span style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>قوة الشراء</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace", direction: 'ltr' }}>${fmt(buyingPower)}</div>
        </IOSCard>

        <IOSCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Shield size={14} color={C.amber} />
            <span style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>الهامش المستخدم</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace", direction: 'ltr' }}>${fmt(initialMargin)}</div>
        </IOSCard>

        <IOSCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Wallet size={14} color={C.success} />
            <span style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>الرصيد المتاح</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace", direction: 'ltr' }}>${fmt(cash)}</div>
        </IOSCard>

        <IOSCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <TrendingUp size={14} color={C.accent} />
            <span style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>المراكز المفتوحة</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{positions.length}</div>
        </IOSCard>
      </div>

      {/* Notice: Not a broker */}
      <div style={{ padding: '0 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, background: 'rgba(0,212,255,0.04)', border: '0.5px solid rgba(0,212,255,0.12)' }}>
          <AlertCircle size={16} color={C.accent} />
          <div style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.5 }}>
            رؤى منصة ربط حسابات — لا تُجري عمليات إيداع أو سحب. أموالك في بورصتك.
          </div>
        </div>
      </div>

      {/* Linked Accounts */}
      <div className="m-section">
        <div className="m-section__title">الحسابات المرتبطة</div>
      </div>

      {exchangeBalances.length > 0 ? (
        exchangeBalances.map((ex, i) => (
          <div key={i} style={{ padding: '0 16px', marginBottom: 8 }}>
            <IOSCard>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,255,163,0.08)', border: '0.5px solid rgba(0,255,163,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Link2 size={16} color={C.success} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>
                      {ex.exchange === 'paper-trading' ? 'تداول ورقي' : ex.label || ex.exchange}
                    </div>
                    <div style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>
                      {ex.isTestnet ? 'شبكة اختبار' : ex.exchange}
                      {ex.error && <span style={{ color: C.danger, marginRight: 4 }}>⚠ {ex.error}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'left', direction: 'ltr' }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>
                    ${(ex.equity || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>
                    متاح: ${(ex.available || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </IOSCard>
          </div>
        ))
      ) : (
        <div style={{ padding: '0 16px', marginBottom: 12 }}>
          <IOSCard>
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <Link2 size={32} color={C.text2} style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>لا توجد حسابات مرتبطة</div>
              <button onClick={() => router.push('/mobile/kyc')} style={{ padding: '8px 20px', borderRadius: 10, background: C.accent, color: '#000', fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif", border: 'none', cursor: 'pointer' }}>
                ربط حساب بورصة
              </button>
            </div>
          </IOSCard>
        </div>
      )}

      <div style={{ height: 16 }} />
    </div>
  )
}
