'use client'

import { useState } from 'react'
import {
  CreditCard, Crown, Star, Sparkles, Check, CheckCircle2, Lock,
  Zap, Shield, Brain, BarChart3, Globe, Server, Users, ArrowUpRight,
  FileText, Receipt, Download, Tag, Gift, Wallet, Bitcoin,
  ChevronLeft, AlertCircle, Clock, TrendingUp, Building2,
  Radio, Code2, Headphones, Infinity, Link2, Bell, Eye, EyeOff
} from 'lucide-react'
import { useAuthStore } from '@/lib/auth-store'
import { ROLE_INFO, type Role } from '@/lib/permissions'
import { toast } from '@/hooks/use-toast'
import { T as SharedT } from '@/lib/unified-tokens'
import { useScopedStyle } from '@/hooks/useScopedStyle'
import { useTranslations } from 'next-intl'

/* ═══════════════════════════════════════════════════════
   Design Tokens (canonical + local extensions)
═══════════════════════════════════════════════════════ */
const T = { ...SharedT, pink: '#f472b6', text4: '#475569' }

/* ═══════════════════════════════════════════════════════
   Plan Data
═══════════════════════════════════════════════════════ */
interface PlanFeature {
  icon: React.ReactNode
  label: string
  included: boolean
}

interface PlanData {
  id: Role
  name: string
  price: number
  period: string
  description: string
  color: string
  gradient: string
  icon: React.ReactNode
  badge?: string
  features: PlanFeature[]
  popular?: boolean
}

// Plan data is built inside the component using translations — see getPlans() below
const PLAN_CONFIGS: { id: Role; price: number; color: string; gradient: string; icon: React.ReactNode; popular?: boolean; badgeKey?: string; featureKeys: string[]; featureIncluded: boolean[]; descKey: string }[] = [
  {
    id: 'FREE', price: 0, color: T.text2, gradient: 'linear-gradient(135deg, #8B92A8, #64748b)',
    icon: <Crown size={22} />,
    descKey: 'planFreeDesc2',
    featureKeys: ['planFreeF1','planFreeF2','planFreeF3','planFreeF4','planFreeF5','planFreeF6','planFreeF7','planFreeF8'],
    featureIncluded: [true,true,true,true,false,false,false,false],
  },
  {
    id: 'PRO', price: 29, color: T.cyan, gradient: 'linear-gradient(135deg, #00D4FF, #0A84FF)',
    icon: <Star size={22} />, popular: true,
    descKey: 'planProDesc2',
    featureKeys: ['planProF1','planProF2','planProF3','planProF4','planProF5','planProF6','planProF7','planProF8'],
    featureIncluded: [true,true,true,true,true,true,false,false],
  },
  {
    id: 'PREMIUM', price: 79, color: T.amber, gradient: 'linear-gradient(135deg, #FFB800, #FF8C00)',
    icon: <Sparkles size={22} />, badgeKey: 'bestValue',
    descKey: 'planPremiumDesc2',
    featureKeys: ['planPremiumF1','planPremiumF2','planPremiumF3','planPremiumF4','planPremiumF5','planPremiumF6','planPremiumF7','planPremiumF8'],
    featureIncluded: [true,true,true,true,true,true,true,true],
  },
  {
    id: 'INSTITUTIONAL', price: 299, color: T.green, gradient: 'linear-gradient(135deg, #00FFA3, #00CC82)',
    icon: <Building2 size={22} />,
    descKey: 'planInstDesc2',
    featureKeys: ['planInstF1','planInstF2','planInstF3','planInstF4','planInstF5','planInstF6','planInstF7','planInstF8'],
    featureIncluded: [true,true,true,true,true,true,true,true],
  },
]

const PLAN_ICONS: Record<string, React.ReactNode> = {
  FREE: <Link2 size={13} />, PRO: <Link2 size={13} />, PREMIUM: <Link2 size={13} />, INSTITUTIONAL: <Infinity size={13} />,
}
const PLAN_FEATURE_ICONS = [
  <Link2 size={13} />, <BarChart3 size={13} />, <Radio size={13} />, <Brain size={13} />,
  <Users size={13} />, <BarChart3 size={13} />, <Code2 size={13} />, <Globe size={13} />,
]

/* ═══════════════════════════════════════════════════════
   Billing History — fetched from API, no mock data
═══════════════════════════════════════════════════════ */
interface BillingRecord {
  id: string
  date: string
  description: string
  amount: string
  status: 'paid' | 'pending' | 'failed' | 'refunded'
  statusLabel: string
  invoiceUrl?: string
}

/* ═══════════════════════════════════════════════════════
   Status Badge Component
═══════════════════════════════════════════════════════ */
function StatusBadge({ status, label }: { status: BillingRecord['status']; label: string }) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    paid: { bg: `${T.green}12`, text: T.green, border: `${T.green}25` },
    pending: { bg: `${T.amber}12`, text: T.amber, border: `${T.amber}25` },
    failed: { bg: `${T.red}12`, text: T.red, border: `${T.red}25` },
    refunded: { bg: `${T.purple}12`, text: T.purple, border: `${T.purple}25` },
  }
  const c = colors[status] || colors.pending
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 6,
      background: c.bg, color: c.text,
      fontSize: 10, fontWeight: 700,
      fontFamily: "'Cairo', sans-serif",
      border: `1px solid ${c.border}`,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {status === 'paid' && <CheckCircle2 size={9} />}
      {status === 'pending' && <Clock size={9} />}
      {status === 'failed' && <AlertCircle size={9} />}
      {label}
    </span>
  )
}

/* ═══════════════════════════════════════════════════════
   Main Billing Page
═══════════════════════════════════════════════════════ */
export default function BillingPage() {
  useScopedStyle(`@media (max-width: 767px) {
          .billing-pricing-grid { grid-template-columns: 1fr !important; }
          .billing-header-row { flex-direction: column !important; align-items: flex-start !important; }
          .billing-payment-grid { grid-template-columns: 1fr !important; }
          .billing-table-wrap { overflow-x: auto; }
          .billing-promo-row { flex-direction: column !important; }
        }
        @media (min-width: 768px) and (max-width: 1023px) {
          .billing-pricing-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }`)

  const t = useTranslations('dashboard.billing')
  const tc = useTranslations('common')

  const getPlans = (): PlanData[] => PLAN_CONFIGS.map(cfg => ({
    id: cfg.id,
    name: tc(cfg.id === 'INSTITUTIONAL' ? 'enterprise' : cfg.id.toLowerCase() as 'free'|'pro'|'premium'),
    price: cfg.price,
    period: tc('month'),
    description: t(cfg.descKey),
    color: cfg.color,
    gradient: cfg.gradient,
    icon: cfg.icon,
    badge: cfg.badgeKey ? tc(cfg.badgeKey) : undefined,
    popular: cfg.popular,
    features: cfg.featureKeys.map((fk, i) => ({
      icon: PLAN_FEATURE_ICONS[i] || <Check size={13} />,
      label: t(fk),
      included: cfg.featureIncluded[i],
    })),
  }))

  const PLANS = getPlans()

  const user = useAuthStore(state => state.user)
  const userTier = (user?.tier || 'FREE') as Role
  const roleInfo = ROLE_INFO[userTier] || ROLE_INFO.FREE

  const [promoCode, setPromoCode] = useState('')
  const [promoApplying, setPromoApplying] = useState(false)
  const [showCardNumber, setShowCardNumber] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<'card' | 'crypto'>('card')
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [billingHistory, setBillingHistory] = useState<BillingRecord[]>([])

  // Card form visual state — empty until user enters their own
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvc, setCardCvc] = useState('')

  const handleUpgrade = (planId: string) => {
    if (planId === userTier) {
      toast({ title: t('alreadySubscribed'), description: t('alreadySubscribedDesc') })
      return
    }
    setUpgrading(planId)
    setTimeout(() => {
      setUpgrading(null)
      toast({ title: t('upgradeRequested'), description: t('upgradeRequestedDesc') })
    }, 1500)
  }

  const handlePromoApply = () => {
  

    if (!promoCode.trim()) {
      toast({ title: t('enterPromoCode'), description: t('enterPromoDesc') })
      return
    }
    setPromoApplying(true)
    setTimeout(() => {
      setPromoApplying(false)
      if (promoCode.toUpperCase() === 'ROUA2026') {
        toast({ title: t('promoApplied'), description: t('promoAppliedDesc') })
      } else {
        toast({ title: t('promoInvalid'), description: t('promoInvalidDesc') })
      }
    }, 1200)
  }

  const planOrder = ['FREE', 'PRO', 'PREMIUM', 'INSTITUTIONAL']

  return (
    <div className="custom-scrollbar" style={{
      fontFamily: "'Cairo', sans-serif",
      height: '100%', overflowY: 'auto', background: T.bg,
    }}>
      {/* Scoped styles via useScopedStyle */}{/* ═══════════════════════════════════════════════════
          Header
      ═══════════════════════════════════════════════════ */}
      <div style={{
        padding: '24px 24px 0',
        borderBottom: `1px solid ${T.border}`,
        background: `linear-gradient(180deg, ${T.bg2}, ${T.bg})`,
      }}>
        <div className="billing-header-row" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 11,
            background: 'linear-gradient(135deg, #00D4FF, #0A84FF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <CreditCard size={18} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: T.text }}>
              {t('title')}
            </h1>
            <p style={{ margin: 0, fontSize: 11, color: T.text3 }}>
              {t('subtitleFull')}
            </p>
          </div>
          <div style={{
            padding: '6px 14px', borderRadius: 10,
            background: `${roleInfo.color}12`, border: `1px solid ${roleInfo.color}25`,
            display: 'flex', alignItems: 'center', gap: 6,
            flexShrink: 0,
          }}>
            {['PREMIUM', 'INSTITUTIONAL', 'PLUS'].includes(userTier) ? <Sparkles size={13} color={roleInfo.color} /> :
             userTier === 'PRO' ? <Star size={13} color={roleInfo.color} /> :
             <Crown size={13} color={roleInfo.color} />}
            <span style={{ fontSize: 11, fontWeight: 700, color: roleInfo.color, fontFamily: "'Cairo', sans-serif" }}>
              {roleInfo.label}
            </span>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          Content
      ═══════════════════════════════════════════════════ */}
      <div style={{ padding: '20px 24px 40px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1100 }}>

        {/* ─── Current Plan Card ─── */}
        <div style={{
          background: T.card, border: `1px solid ${roleInfo.color}25`,
          borderRadius: 16, overflow: 'hidden', position: 'relative',
        }}>
          {/* Glow Effect */}
          <div style={{
            position: 'absolute', top: -30, right: -30,
            width: 140, height: 140, borderRadius: '50%',
            background: `${roleInfo.color}08`, filter: 'blur(50px)',
            pointerEvents: 'none',
          }} />

          <div style={{ padding: '22px 24px', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: `linear-gradient(135deg, ${roleInfo.color}, ${roleInfo.color}88)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 0 24px ${roleInfo.color}25`,
                flexShrink: 0,
              }}>
                {['PREMIUM', 'INSTITUTIONAL', 'PLUS'].includes(userTier) ? <Sparkles size={24} color="#fff" /> :
                 userTier === 'PRO' ? <Star size={24} color="#fff" /> :
                 <Crown size={24} color="#fff" />}
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: T.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {t('currentPlanLabel', { plan: roleInfo.label })}
                  {userTier === 'FREE' && (
                    <span style={{
                      fontSize: 9, padding: '2px 8px', borderRadius: 10,
                      background: `${T.cyan}12`, color: T.cyan,
                      fontFamily: "'Cairo', sans-serif", fontWeight: 700,
                    }}>{tc('upgradeAvailable')}</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: T.text3, marginTop: 4, lineHeight: 1.6 }}>
                  {roleInfo.description} — {t('currentlyOnPlan', { plan: roleInfo.label })}
                  {userTier !== 'INSTITUTIONAL' && t('upgradeAnytime')}
                  {userTier === 'INSTITUTIONAL' && t('highestServiceLevel')}
                </div>
              </div>
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <div style={{
                  fontSize: 28, fontWeight: 900, color: roleInfo.color,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {PLANS.find(p => p.id === userTier)?.price || 0}
                </div>
                <div style={{ fontSize: 10, color: T.text4 }}>
                  {tc('perMonth')}
                </div>
              </div>
            </div>

            {/* Next billing date (for paid plans) */}
            {userTier !== 'FREE' && (
              <div style={{
                marginTop: 16, padding: '10px 14px', borderRadius: 10,
                background: `${roleInfo.color}06`, border: `1px solid ${roleInfo.color}12`,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <Clock size={14} color={roleInfo.color} />
                <div style={{ fontSize: 11, color: T.text2, lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 700, color: T.text }}>{t('nextPayment')}</span>
                  {' '}{t('nextPaymentDate')} — {t('autoRenewAt')}{' '}
                  <span style={{ color: roleInfo.color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                    ${PLANS.find(p => p.id === userTier)?.price || 0}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── Pricing Cards ─── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: `${T.purple}14`, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Sparkles size={14} color={T.purple} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{t('plansTitle')}</div>
              <div style={{ fontSize: 11, color: T.text3 }}>{t('plansSubtitleFull')}</div>
            </div>
          </div>

          <div className="billing-pricing-grid" style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
          }}>
            {PLANS.map(plan => {
              const isCurrentPlan = plan.id === userTier
              const currentIdx = planOrder.indexOf(userTier)
              const planIdx = planOrder.indexOf(plan.id)
              const isDowngrade = planIdx < currentIdx

              return (
                <div key={plan.id} style={{
                  background: T.card,
                  border: isCurrentPlan ? `1px solid ${plan.color}40` : `1px solid ${T.border}`,
                  borderRadius: 16, overflow: 'hidden',
                  position: 'relative',
                  transition: 'all 0.3s',
                  boxShadow: isCurrentPlan ? `0 0 20px ${plan.color}10` : 'none',
                }}>
                  {/* Popular badge */}
                  {plan.popular && (
                    <div style={{
                      position: 'absolute', top: 12, left: 12,
                      padding: '3px 10px', borderRadius: 10,
                      background: `linear-gradient(135deg, ${T.cyan}, #0A84FF)`,
                      color: '#000', fontSize: 9, fontWeight: 800,
                      fontFamily: "'Cairo', sans-serif",
                      boxShadow: `0 0 12px ${T.cyan}30`,
                    }}>
                      {tc('mostPopular')}
                    </div>
                  )}

                  {/* Value badge */}
                  {plan.badge && !plan.popular && (
                    <div style={{
                      position: 'absolute', top: 12, left: 12,
                      padding: '3px 10px', borderRadius: 10,
                      background: `linear-gradient(135deg, ${T.amber}, #FF8C00)`,
                      color: '#000', fontSize: 9, fontWeight: 800,
                      fontFamily: "'Cairo', sans-serif",
                    }}>
                      {plan.badge}
                    </div>
                  )}

                  <div style={{ padding: '20px 16px 14px' }}>
                    {/* Plan Icon & Name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: `${plan.color}15`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: plan.color,
                      }}>
                        {plan.icon}
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 900, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
                          {plan.name}
                        </div>
                      </div>
                    </div>

                    {/* Price */}
                    <div style={{ marginBottom: 12, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{
                        fontSize: 30, fontWeight: 900, color: plan.color,
                        fontFamily: "'JetBrains Mono', monospace", lineHeight: 1,
                      }}>
                        ${plan.price}
                      </span>
                      <span style={{ fontSize: 11, color: T.text4 }}>
                        /{plan.period}
                      </span>
                    </div>

                    {/* Description */}
                    <div style={{
                      fontSize: 10, color: T.text3, lineHeight: 1.7,
                      marginBottom: 14, minHeight: 55,
                    }}>
                      {plan.description.slice(0, 100)}...
                    </div>

                    {/* Features */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
                      {plan.features.map((feat, fi) => (
                        <div key={fi} style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          fontSize: 10, color: feat.included ? T.text2 : T.text4,
                          textDecoration: feat.included ? 'none' : 'line-through',
                          opacity: feat.included ? 1 : 0.5,
                        }}>
                          {feat.included ? (
                            <Check size={11} color={plan.color} style={{ flexShrink: 0 }} />
                          ) : (
                            <span style={{ width: 11, height: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>—</span>
                          )}
                          {feat.label}
                        </div>
                      ))}
                    </div>

                    {/* Action Button */}
                    {isCurrentPlan ? (
                      <div style={{
                        padding: '10px 14px', borderRadius: 10,
                        background: `${plan.color}10`, border: `1px solid ${plan.color}20`,
                        color: plan.color, fontSize: 12, fontWeight: 700,
                        textAlign: 'center', fontFamily: "'Cairo', sans-serif",
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}>
                        <CheckCircle2 size={14} />
                        {tc('currentPlan')}
                      </div>
                    ) : (
                      <button
                        onClick={() => handleUpgrade(plan.id)}
                        disabled={upgrading === plan.id}
                        style={{
                          width: '100%', padding: '10px 14px', borderRadius: 10,
                          background: isDowngrade ? T.surface : `linear-gradient(135deg, ${plan.color}, ${plan.color}cc)`,
                          border: isDowngrade ? `1px solid ${T.border2}` : 'none',
                          color: isDowngrade ? T.cyan : '#000',
                          fontSize: 12, fontWeight: 800, cursor: upgrading === plan.id ? 'wait' : 'pointer',
                          fontFamily: "'Cairo', sans-serif",
                          transition: 'all 0.2s',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          boxShadow: !isDowngrade ? `0 0 16px ${plan.color}25` : 'none',
                          opacity: upgrading === plan.id ? 0.7 : 1,
                        }}
                      >
                        {upgrading === plan.id ? (
                          <>{tc('processing')}</>
                        ) : isDowngrade ? (
                          <><ArrowUpRight size={13} style={{ transform: 'rotate(180deg)' }} /> {tc('downgrade')}</>
                        ) : (
                          <><ArrowUpRight size={13} /> {tc('upgrade')}</>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ─── Payment Methods ─── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: `${T.green}14`, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Wallet size={14} color={T.green} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{t('paymentMethods')}</div>
              <div style={{ fontSize: 11, color: T.text3 }}>
                {t('paymentMethodsSubtitle')}
              </div>
            </div>
          </div>

          <div className="billing-payment-grid" style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14,
          }}>
            {/* Credit Card */}
            <div style={{
              background: T.card, border: `1px solid ${selectedPayment === 'card' ? T.border2 : T.border}`,
              borderRadius: 16, overflow: 'hidden',
              cursor: 'pointer', transition: 'all 0.3s',
            }}
              onClick={() => setSelectedPayment('card')}
            >
              <div style={{ padding: '16px 18px', borderBottom: `1px solid ${T.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: 4,
                    background: selectedPayment === 'card' ? T.cyan : T.text4,
                    boxShadow: selectedPayment === 'card' ? `0 0 8px ${T.cyan}50` : 'none',
                    transition: 'all 0.3s',
                  }} />
                  <CreditCard size={16} color={selectedPayment === 'card' ? T.cyan : T.text3} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: selectedPayment === 'card' ? T.text : T.text3 }}>
                    {t('creditDebit')}
                  </span>
                  <span style={{
                    marginRight: 'auto', fontSize: 9, padding: '2px 7px',
                    borderRadius: 10, background: `${T.green}12`, color: T.green,
                    fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    <Lock size={8} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 3 }} />
                    {t('encryptedBadge')}
                  </span>
                </div>
              </div>

              {selectedPayment === 'card' && (
                <div style={{ padding: '14px 18px' }}>
                  {/* Card Visual */}
                  <div style={{
                    background: `linear-gradient(135deg, ${T.surface}, #242838)`,
                    borderRadius: 12, padding: '16px 18px',
                    border: `1px solid ${T.border2}`,
                    marginBottom: 14, position: 'relative', overflow: 'hidden',
                  }}>
                    <div style={{
                      position: 'absolute', top: -20, left: -20,
                      width: 80, height: 80, borderRadius: '50%',
                      background: `${T.cyan}06`, filter: 'blur(30px)',
                    }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <div style={{
                        fontSize: 11, fontWeight: 700, color: T.cyan,
                        fontFamily: "'JetBrains Mono', monospace",
                      }}>VISA</div>
                      <Lock size={12} color={T.text4} />
                    </div>
                    <div style={{
                      fontSize: 15, fontWeight: 600, color: T.text,
                      fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: 2, marginBottom: 12,
                      direction: 'ltr', textAlign: 'left',
                    }}>
                      {showCardNumber ? cardNumber : '•••• •••• •••• 4242'}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                      <div>
                        <div style={{ fontSize: 8, color: T.text4, marginBottom: 2 }}>{t('cardHolder')}</div>
                        <div style={{ fontSize: 11, color: T.text2, fontWeight: 600 }}>{user?.displayName || 'ROUA USER'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 8, color: T.text4, marginBottom: 2 }}>{t('expiry')}</div>
                        <div style={{ fontSize: 11, color: T.text2, fontFamily: "'JetBrains Mono', monospace" }}>{cardExpiry}</div>
                      </div>
                    </div>
                  </div>

                  {/* Card Form (visual only) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 10, color: T.text3, marginBottom: 4, display: 'block' }}>{t('cardNumber')}</label>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: T.surface, border: `1px solid ${T.border}`,
                        borderRadius: 8, padding: '8px 12px',
                      }}>
                        <input
                          type="text"
                          value={cardNumber}
                          onChange={e => setCardNumber(e.target.value)}
                          style={{
                            flex: 1, background: 'none', border: 'none',
                            color: T.text, fontSize: 12,
                            fontFamily: "'JetBrains Mono', monospace",
                            outline: 'none', direction: 'ltr', textAlign: 'left',
                          }}
                          dir="ltr"
                        />
                        <button
                          onClick={() => setShowCardNumber(!showCardNumber)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text3, padding: 0 }}
                        >
                          {showCardNumber ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, color: T.text3, marginBottom: 4, display: 'block' }}>{t('expiryDate')}</label>
                        <input
                          type="text"
                          value={cardExpiry}
                          onChange={e => setCardExpiry(e.target.value)}
                          style={{
                            width: '100%', background: T.surface,
                            border: `1px solid ${T.border}`, borderRadius: 8,
                            padding: '8px 12px', color: T.text, fontSize: 12,
                            fontFamily: "'JetBrains Mono', monospace",
                            outline: 'none', direction: 'ltr', textAlign: 'left',
                          }}
                          dir="ltr"
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, color: T.text3, marginBottom: 4, display: 'block' }}>CVC</label>
                        <input
                          type="text"
                          value={cardCvc}
                          onChange={e => setCardCvc(e.target.value)}
                          style={{
                            width: '100%', background: T.surface,
                            border: `1px solid ${T.border}`, borderRadius: 8,
                            padding: '8px 12px', color: T.text, fontSize: 12,
                            fontFamily: "'JetBrains Mono', monospace",
                            outline: 'none', direction: 'ltr', textAlign: 'left',
                          }}
                          dir="ltr"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Crypto Payment */}
            <div style={{
              background: T.card, border: `1px solid ${selectedPayment === 'crypto' ? T.border2 : T.border}`,
              borderRadius: 16, overflow: 'hidden',
              cursor: 'pointer', transition: 'all 0.3s',
            }}
              onClick={() => setSelectedPayment('crypto')}
            >
              <div style={{ padding: '16px 18px', borderBottom: `1px solid ${T.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: 4,
                    background: selectedPayment === 'crypto' ? T.amber : T.text4,
                    boxShadow: selectedPayment === 'crypto' ? `0 0 8px ${T.amber}50` : 'none',
                    transition: 'all 0.3s',
                  }} />
                  <Bitcoin size={16} color={selectedPayment === 'crypto' ? T.amber : T.text3} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: selectedPayment === 'crypto' ? T.text : T.text3 }}>
                    {t('cryptoPay')}
                  </span>
                  <span style={{
                    marginRight: 'auto', fontSize: 9, padding: '2px 7px',
                    borderRadius: 10, background: `${T.amber}12`, color: T.amber,
                    fontWeight: 600,
                  }}>
                    {t('decentralized')}
                  </span>
                </div>
              </div>

              {selectedPayment === 'crypto' && (
                <div style={{ padding: '14px 18px' }}>
                  <div style={{
                    padding: '12px 14px', borderRadius: 10,
                    background: `${T.amber}06`, border: `1px solid ${T.amber}12`,
                    marginBottom: 14,
                  }}>
                    <div style={{ fontSize: 11, color: T.text2, lineHeight: 1.7 }}>
                      {t('cryptoPayDesc')}
                    </div>
                  </div>

                  {/* Supported Coins */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      { symbol: 'BTC', name: 'Bitcoin', color: '#F7931A', icon: <Bitcoin size={16} /> },
                      { symbol: 'ETH', name: 'Ethereum', color: '#627EEA', icon: <Globe size={16} /> },
                      { symbol: 'USDT', name: 'Tether USD', color: '#26A17B', icon: <Shield size={16} /> },
                    ].map(coin => (
                      <div key={coin.symbol} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', borderRadius: 10,
                        background: T.surface, border: `1px solid ${T.border}`,
                        transition: 'all 0.2s', cursor: 'pointer',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = `${coin.color}30`; e.currentTarget.style.background = `${coin.color}06` }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.surface }}
                      >
                        <div style={{
                          width: 30, height: 30, borderRadius: 8,
                          background: `${coin.color}15`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: coin.color,
                        }}>
                          {coin.icon}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{coin.name}</div>
                          <div style={{ fontSize: 9, color: T.text4, fontFamily: "'JetBrains Mono', monospace" }}>{coin.symbol}</div>
                        </div>
                        <ArrowUpRight size={14} color={T.text4} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Billing History ─── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: `${T.blue}14`, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Receipt size={14} color={T.blue} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{t('invoiceHistory')}</div>
              <div style={{ fontSize: 11, color: T.text3 }}>
                {t('invoiceSubtitle')}
              </div>
            </div>
          </div>

          <div style={{
            background: T.card, border: `1px solid ${T.border}`,
            borderRadius: 16, overflow: 'hidden',
          }}>
            <div className="billing-table-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                    {[t('tableDate'), t('tableDescription'), t('tableAmount'), t('tableStatus'), ''].map(h => (
                      <th key={h} style={{
                        padding: '12px 16px', textAlign: 'right',
                        fontSize: 10, fontWeight: 700, color: T.text4,
                        fontFamily: "'Cairo', sans-serif",
                        letterSpacing: '0.05em',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {billingHistory.map((record, idx) => (
                    <tr key={record.id} style={{
                      borderBottom: idx < billingHistory.length - 1 ? `1px solid ${T.border}` : 'none',
                      transition: 'background 0.2s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = `${T.surface}50`}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: 11, color: T.text2, fontFamily: "'JetBrains Mono', monospace", direction: 'ltr', textAlign: 'right' }}>
                          {record.date}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: 11, color: T.text, fontWeight: 600 }}>{record.description}</div>
                        <div style={{ fontSize: 9, color: T.text4, fontFamily: "'JetBrains Mono', monospace", direction: 'ltr', textAlign: 'right' }}>
                          {record.id}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          fontSize: 12, fontWeight: 700, color: T.text,
                          fontFamily: "'JetBrains Mono', monospace",
                        }}>
                          {record.amount}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <StatusBadge status={record.status} label={record.statusLabel} />
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'left' }}>
                        {record.status === 'paid' && (
                          <button
                            style={{
                              background: 'none', border: `1px solid ${T.border}`,
                              borderRadius: 6, padding: '4px 8px',
                              color: T.text3, fontSize: 10, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 4,
                              fontFamily: "'Cairo', sans-serif",
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = T.border2; e.currentTarget.style.color = T.cyan }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.text3 }}
                            onClick={() => toast({ title: t('downloadingInvoice'), description: t('downloadingInvoiceDesc', { id: record.id }) })}
                          >
                            <Download size={10} />
                            PDF
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary footer */}
            <div style={{
              padding: '12px 16px', borderTop: `1px solid ${T.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: `${T.surface}30`,
            }}>
              <div style={{ fontSize: 10, color: T.text4 }}>
                {t('lastTransactions', { n: billingHistory.length })}
              </div>
              <div style={{ fontSize: 10, color: T.text3, display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={10} />
                {t('totalPayments')}: <span style={{ color: T.text, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                  ${billingHistory.filter(r => r.status === 'paid').reduce((sum, r) => sum + parseFloat(r.amount.replace('$', '')), 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Promo Code Section ─── */}
        <div style={{
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: 16, overflow: 'hidden',
        }}>
          <div style={{ padding: '18px 20px', borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `${T.pink}14`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Gift size={18} color={T.pink} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{t('promoCode')}</div>
                <div style={{ fontSize: 11, color: T.text3 }}>
                  {t('promoDesc')}
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: '16px 20px' }}>
            <div className="billing-promo-row" style={{
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center',
                background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: 10, padding: '4px 12px',
              }}>
                <Tag size={14} color={T.text4} style={{ flexShrink: 0, marginLeft: 8 }} />
                <input
                  type="text"
                  value={promoCode}
                  onChange={e => setPromoCode(e.target.value.toUpperCase())}
                  placeholder={t('promoPlaceholder')}
                  maxLength={20}
                  style={{
                    flex: 1, background: 'none', border: 'none',
                    color: T.text, fontSize: 13,
                    fontFamily: "'JetBrains Mono', monospace",
                    outline: 'none', padding: '8px 0',
                    direction: 'ltr', textAlign: 'right',
                  }}
                  dir="ltr"
                  onKeyDown={e => { if (e.key === 'Enter') handlePromoApply() }}
                />
              </div>
              <button
                onClick={handlePromoApply}
                disabled={promoApplying}
                style={{
                  padding: '10px 24px', borderRadius: 10,
                  background: `linear-gradient(135deg, ${T.pink}, ${T.purple})`,
                  border: 'none', color: '#fff',
                  fontSize: 12, fontWeight: 800, cursor: promoApplying ? 'wait' : 'pointer',
                  fontFamily: "'Cairo', sans-serif",
                  transition: 'all 0.2s',
                  boxShadow: `0 0 16px ${T.pink}20`,
                  whiteSpace: 'nowrap',
                  opacity: promoApplying ? 0.7 : 1,
                }}
              >
                {promoApplying ? t('applying') : t('applyPromo')}
              </button>
            </div>

            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={12} color={T.text4} />
              <span style={{ fontSize: 10, color: T.text4 }}>
                {t('allEncrypted')}
              </span>
            </div>
          </div>
        </div>

        {/* ─── Quick Info Footer ─── */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 10,
        }}>
          {[
            { icon: <Shield size={14} />, color: T.green, label: t('refundGuarantee'), desc: t('refundGuaranteeDesc') },
            { icon: <Zap size={14} />, color: T.cyan, label: t('instantActivation'), desc: t('instantActivationDesc') },
            { icon: <Lock size={14} />, color: T.amber, label: t('securePayment'), desc: t('securePaymentDesc') },
            { icon: <Users size={14} />, color: T.purple, label: t('continuousSupport'), desc: t('continuousSupportDesc') },
          ].map((item, i) => (
            <div key={i} style={{
              padding: '12px 14px', borderRadius: 10,
              background: T.card, border: `1px solid ${T.border}`,
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 7,
                background: `${item.color}12`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: item.color, flexShrink: 0,
              }}>
                {item.icon}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 2 }}>{item.label}</div>
                <div style={{ fontSize: 9, color: T.text4, lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
