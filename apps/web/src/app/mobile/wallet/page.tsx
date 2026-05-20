'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { Header, Card, SkelCard } from '@/components/mobile/FluxComponents'
import {
  Wallet, DollarSign, TrendingUp, TrendingDown, Shield,
  CreditCard, AlertTriangle, Link2, ArrowUpDown, Eye,
} from 'lucide-react'

/* ═══ تنسيق الأرقام ═══ */
function fmtUsd(n: number): string {
  return n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/* ═══ صفحة المحفظة ═══ */
export default function WalletPage() {
  const router = useRouter()
  const { account, positions, exchangeBalances, loading, fetchAccount, fetchPositions } = usePositionsStore()

  // جلب البيانات عند تحميل الصفحة
  useEffect(() => {
    fetchAccount()
    fetchPositions()
  }, [fetchAccount, fetchPositions])

  // حساب القيم من الحساب
  const equity = useMemo(() => Number(account?.equity ?? 0), [account?.equity])
  const cash = useMemo(() => Number(account?.cash ?? 0), [account?.cash])
  const buyingPower = useMemo(() => Number(account?.buying_power ?? 0), [account?.buying_power])
  const initialMargin = useMemo(() => Number(account?.initialMargin ?? 0), [account?.initialMargin])
  const unrealizedPnl = useMemo(() => Number(account?.unrealizedPnl ?? 0), [account?.unrealizedPnl])
  const unrealizedPnlPct = useMemo(() => Number(account?.unrealizedPnlPct ?? 0), [account?.unrealizedPnlPct])
  const openPositions = positions.length
  const isPnlPositive = unrealizedPnl >= 0

  // حالة التحميل
  if (loading && !account) {
    return (
      <div style={{ direction: 'rtl' }}>
        <Header title="المحفظة" subtitle="إدارة الأرصدة" />
        <div className="f-page f-stagger">
          <SkelCard lines={3} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '0 var(--s4)' }}>
            <SkelCard lines={2} />
            <SkelCard lines={2} />
            <SkelCard lines={2} />
            <SkelCard lines={2} />
          </div>
          <SkelCard lines={4} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ direction: 'rtl' }}>
      <Header title="المحفظة" subtitle="إدارة الأرصدة" />

      <div className="f-page f-stagger">
        {/* ═══ بطاقة إجمالي حقوق الملكية ═══ */}
        <Card highlight>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 12,
                background: 'linear-gradient(135deg, #00D4FF, #5B21B6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Wallet size={18} color="#FFF" />
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--c-text2)', fontFamily: 'var(--f-cairo)', fontWeight: 700 }}>إجمالي حقوق الملكية</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-mono)', lineHeight: 1.1 }}>
                  ${fmtUsd(equity)}
                </div>
              </div>
            </div>
          </div>

          {unrealizedPnl !== 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', borderRadius: 10,
              background: isPnlPositive ? 'rgba(0,255,163,0.06)' : 'rgba(255,71,87,0.06)',
              border: `0.5px solid ${isPnlPositive ? 'rgba(0,255,163,0.15)' : 'rgba(255,71,87,0.15)'}`,
            }}>
              {isPnlPositive ? <TrendingUp size={14} color="#00FFA3" /> : <TrendingDown size={14} color="#FF4757" />}
              <span style={{ fontSize: 12, fontWeight: 900, color: isPnlPositive ? '#00FFA3' : '#FF4757', fontFamily: 'var(--f-mono)' }}>
                {isPnlPositive ? '+' : ''}{fmtUsd(unrealizedPnl)}
              </span>
              <span style={{ fontSize: 10, fontWeight: 800, color: isPnlPositive ? '#00FFA3' : '#FF4757', fontFamily: 'var(--f-mono)' }}>
                ({isPnlPositive ? '+' : ''}{unrealizedPnlPct.toFixed(2)}%)
              </span>
              <span style={{ fontSize: 9, color: 'var(--c-text2)', fontFamily: 'var(--f-cairo)', marginRight: 'auto' }}>P&L غير محقق</span>
            </div>
          )}
        </Card>

        {/* ═══ شبكة 4 بطاقات ═══ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '0 var(--s4) var(--s3)' }}>
          <StatCard
            icon={DollarSign}
            iconBg="rgba(0,212,255,0.1)"
            iconColor="#00D4FF"
            label="قوة الشراء"
            value={`$${fmtUsd(buyingPower)}`}
          />
          <StatCard
            icon={Shield}
            iconBg="rgba(255,184,0,0.1)"
            iconColor="#FFB800"
            label="الهامش الأولي"
            value={`$${fmtUsd(initialMargin)}`}
          />
          <StatCard
            icon={CreditCard}
            iconBg="rgba(0,255,163,0.1)"
            iconColor="#00FFA3"
            label="الرصيد النقدي"
            value={`$${fmtUsd(cash)}`}
          />
          <StatCard
            icon={ArrowUpDown}
            iconBg="rgba(179,136,255,0.1)"
            iconColor="#B388FF"
            label="مراكز مفتوحة"
            value={String(openPositions)}
          />
        </div>

        {/* ═══ بطاقة تحذير السلامة ═══ */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10, flexShrink: 0,
              background: 'rgba(255,184,0,0.1)', border: '0.5px solid rgba(255,184,0,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <AlertTriangle size={16} color="#FFB800" />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#FFB800', fontFamily: 'var(--f-cairo)', marginBottom: 4 }}>تنبيه المخاطر</div>
              <div style={{ fontSize: 10, color: 'var(--c-text2)', fontFamily: 'var(--f-cairo)', lineHeight: 1.6 }}>
                التداول على الهامش ينطوي على مخاطر عالية. قد تخسر أكثر من استثمارك الأولي. تأكد من فهمك للمخاطر قبل التداول. لا تستخدم أموالاً لا تستطيع تحمل خسارتها.
              </div>
            </div>
          </div>
        </Card>

        {/* ═══ حسابات البورصات المرتبطة ═══ */}
        <div style={{ padding: '0 var(--s4)', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>الحسابات المرتبطة</span>
            <button
              onClick={() => router.push('/mobile/kyc')}
              style={{ fontSize: 11, fontWeight: 800, color: 'var(--c-accent)', fontFamily: 'var(--f-cairo)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              + ربط حساب
            </button>
          </div>
        </div>

        {exchangeBalances.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {exchangeBalances.map((ex, i) => {
              const isPaper = ex.exchange === 'paper-trading'
              const hasError = !!ex.error
              const exchangeLabel = isPaper ? 'تداول ورقي' : ex.exchange.charAt(0).toUpperCase() + ex.exchange.slice(1)
              const exchangeColor = isPaper ? '#00D4FF' : hasError ? '#FF4757' : '#00FFA3'

              return (
                <Card key={i}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: `${exchangeColor}10`, border: `0.5px solid ${exchangeColor}25`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <CreditCard size={16} color={exchangeColor} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>{exchangeLabel}</span>
                          {ex.isTestnet && (
                            <span style={{
                              fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 5,
                              background: 'rgba(255,184,0,0.1)', color: '#FFB800',
                              border: '0.5px solid rgba(255,184,0,0.2)', fontFamily: 'var(--f-cairo)',
                            }}>
                              تجريبي
                            </span>
                          )}
                          {hasError && (
                            <span style={{
                              fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 5,
                              background: 'rgba(255,71,87,0.1)', color: '#FF4757',
                              border: '0.5px solid rgba(255,71,87,0.2)', fontFamily: 'var(--f-cairo)',
                            }}>
                              خطأ
                            </span>
                          )}
                        </div>
                        {ex.label && (
                          <div style={{ fontSize: 9, color: 'var(--c-text3)', fontFamily: 'var(--f-cairo)' }}>{ex.label}</div>
                        )}
                        {hasError && (
                          <div style={{ fontSize: 9, color: '#FF4757', fontFamily: 'var(--f-cairo)', marginTop: 2 }}>{ex.error}</div>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-mono)' }}>
                        ${fmtUsd(ex.equity)}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--c-text3)', fontFamily: 'var(--f-cairo)' }}>
                        متاح: ${fmtUsd(ex.available)}
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        ) : (
          /* ═══ حالة فارغة ═══ */
          <Card>
            <div className="f-empty" style={{ padding: '24px 16px' }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: 'rgba(0,212,255,0.06)', border: '0.5px solid rgba(0,212,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px',
              }}>
                <Link2 size={24} color="#00D4FF" />
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--c-text2)', fontFamily: 'var(--f-cairo)', marginBottom: 6 }}>
                لا توجد حسابات مرتبطة
              </div>
              <div style={{ fontSize: 11, color: 'var(--c-text3)', fontFamily: 'var(--f-cairo)', marginBottom: 14, lineHeight: 1.5 }}>
                اربط حساب البورصة الخاص بك لبدء التداول الحقيقي
              </div>
              <button
                onClick={() => router.push('/mobile/kyc')}
                style={{
                  padding: '10px 24px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #00D4FF, #5B21B6)',
                  color: '#FFF', fontSize: 12, fontWeight: 800, fontFamily: 'var(--f-cairo)',
                }}
              >
                ربط حساب الآن
              </button>
            </div>
          </Card>
        )}

        {/* مسافة أسفل شريط التنقل */}
        <div style={{ height: 80 }} />
      </div>
    </div>
  )
}

/* ═══ بطاقة إحصائية ═══ */
function StatCard({ icon: Icon, iconBg, iconColor, label, value }: {
  icon: any; iconBg: string; iconColor: string; label: string; value: string
}) {
  return (
    <div style={{
      background: 'rgba(26,29,41,0.65)', backdropFilter: 'blur(30px) saturate(180%)',
      borderRadius: 'var(--r3)', padding: 'var(--s3)',
      border: '0.5px solid var(--c-border)', boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8, background: iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 8,
      }}>
        <Icon size={14} color={iconColor} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-mono)', marginBottom: 2 }}>
        {value}
      </div>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--c-text2)', fontFamily: 'var(--f-cairo)' }}>
        {label}
      </div>
    </div>
  )
}
