'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  CreditCard, Crown, Zap, Star, CheckCircle2, ArrowUpRight,
  Calendar, Receipt, TrendingUp, Gift,
} from 'lucide-react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { useAuthStore } from '@/lib/auth-store'

/* ─── Design Tokens ─── */
const C = {
  accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757',
  amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8',
  bg: '#1A1D29', border: 'rgba(255,255,255,0.06)',
}
const FONT_AR = "'Cairo', sans-serif"
const FONT_MONO = "'JetBrains Mono', monospace"

/* ─── Plan Data ─── */
const PLANS = [
  {
    id: 'free', name: 'مجاني', price: 0, color: C.text2, icon: Star,
    features: ['3 بورصات مرتبطة', '5 تنبيهات أسعار', 'بيانات أسواق أساسية', 'دعم مجتمعي'],
  },
  {
    id: 'starter', name: 'مبتدئ', price: 29, color: C.accent, icon: Zap, popular: true,
    features: ['10 بورصات', 'تنبيهات غير محدودة', 'تحليلات متقدمة', 'وكيل تداول ورقي', 'دعم أولوية'],
  },
  {
    id: 'pro', name: 'احترافي', price: 99, color: C.amber, icon: Crown,
    features: ['بورصات غير محدودة', 'وكيل تداول مباشر', 'مجلس AI كامل', 'API وصول كامل', 'تقارير متقدمة', 'دعم VIP'],
  },
]

/* ─── Mock Payment History ─── */
const PAYMENT_HISTORY = [
  { id: '1', date: '2026-05-01', amount: 29, plan: 'مبتدئ', status: 'paid' },
  { id: '2', date: '2026-04-01', amount: 29, plan: 'مبتدئ', status: 'paid' },
  { id: '3', date: '2026-03-01', amount: 0, plan: 'مجاني', status: 'paid' },
]

/* ─── Usage Data ─── */
const USAGE = [
  { label: 'البورصات المرتبطة', current: 2, max: 10, color: C.accent },
  { label: 'تنبيهات الأسعار', current: 12, max: 100, color: C.amber },
  { label: 'صفقات البوت/يوم', current: 8, max: 50, color: C.success },
  { label: 'استعلامات AI/يوم', current: 45, max: 200, color: '#A259FF' },
]

/* ─── Billing Page ─── */
export default function MobileBillingPage() {
  const router = useRouter()
  const user = useAuthStore(s => s.user)
  const tier = user?.tier || 'free'

  const [showPlans, setShowPlans] = useState(false)

  const currentPlan = PLANS.find(p => p.id === tier) || PLANS[0]

  /* Format date */
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch { return dateStr }
  }

  return (
    <div className="m-page">
      <MobilePageHeader title="الاشتراك والفوترة" />

      {/* Current Plan Card */}
      <IOSCard highlight>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: `linear-gradient(135deg, ${currentPlan.color}25, ${currentPlan.color}08)`,
              border: `1px solid ${currentPlan.color}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <currentPlan.icon size={18} color={currentPlan.color} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>
                خطة {currentPlan.name}
              </div>
              <div style={{ fontSize: 10, color: C.text2, fontFamily: FONT_AR }}>
                {currentPlan.price === 0 ? 'مجاني للأبد' : `$${currentPlan.price}/شهر`}
              </div>
            </div>
          </div>
          {tier !== 'pro' && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowPlans(!showPlans)}
              style={{
                padding: '6px 14px', borderRadius: 8,
                background: `linear-gradient(135deg, ${C.accent}, #00A8CC)`,
                border: 'none', color: '#000', fontSize: 10, fontWeight: 800,
                fontFamily: FONT_AR, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              ترقية
              <ArrowUpRight size={10} />
            </motion.button>
          )}
        </div>

        {/* Next billing */}
        {currentPlan.price > 0 && (
          <div style={{
            padding: '8px 10px', borderRadius: 10,
            background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={11} color={C.text2} />
              <span style={{ fontSize: 9, color: C.text2, fontFamily: FONT_AR }}>الدفعة القادمة</span>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.text, fontFamily: FONT_AR }}>
              1 يونيو 2026
            </span>
          </div>
        )}
      </IOSCard>

      {/* Usage Section */}
      <div className="m-section">
        <div className="m-section__title">استهلاك الخطة</div>
      </div>

      <IOSCard>
        {USAGE.map((item, i) => {
          const pct = Math.min((item.current / item.max) * 100, 100)
          const isFull = pct >= 90
          return (
            <div key={item.label} style={{
              marginBottom: i < USAGE.length - 1 ? 12 : 0,
              paddingBottom: i < USAGE.length - 1 ? 12 : 0,
              borderBottom: i < USAGE.length - 1 ? `0.5px solid ${C.border}` : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: FONT_AR }}>
                  {item.label}
                </span>
                <span style={{ fontSize: 10, fontWeight: 800, color: isFull ? C.danger : C.text, fontFamily: FONT_MONO }}>
                  {item.current}/{item.max}
                </span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.05)', overflow: 'hidden', direction: 'ltr' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, delay: i * 0.1 }}
                  style={{
                    height: '100%', borderRadius: 2,
                    background: isFull
                      ? `linear-gradient(90deg, ${C.danger}, #FF6B6B)`
                      : `linear-gradient(90deg, ${item.color}, ${item.color}AA)`,
                  }}
                />
              </div>
            </div>
          )
        })}
      </IOSCard>

      {/* Plans */}
      {showPlans && (
        <>
          <div className="m-section">
            <div className="m-section__title">الخطط المتاحة</div>
          </div>

          {PLANS.map((plan, i) => {
            const isCurrent = plan.id === tier
            const PlanIcon = plan.icon
            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
              >
                <IOSCard highlight={plan.popular && !isCurrent}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 10,
                        background: `${plan.color}12`, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <PlanIcon size={15} color={plan.color} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>
                          {plan.name}
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: plan.color, fontFamily: FONT_MONO }}>
                          {plan.price === 0 ? 'مجاني' : `$${plan.price}`}
                          <span style={{ fontSize: 9, color: C.text2, fontFamily: FONT_AR }}> /شهر</span>
                        </div>
                      </div>
                    </div>
                    {isCurrent ? (
                      <div style={{
                        padding: '3px 8px', borderRadius: 6,
                        background: `${C.success}10`, border: `0.5px solid ${C.success}20`,
                        display: 'flex', alignItems: 'center', gap: 3,
                      }}>
                        <CheckCircle2 size={10} color={C.success} />
                        <span style={{ fontSize: 8, fontWeight: 700, color: C.success, fontFamily: FONT_AR }}>الحالي</span>
                      </div>
                    ) : (
                      <button
                        style={{
                          padding: '5px 14px', borderRadius: 8,
                          background: plan.popular
                            ? `linear-gradient(135deg, ${C.accent}, #00A8CC)`
                            : 'rgba(255,255,255,0.05)',
                          border: plan.popular ? 'none' : `0.5px solid ${C.border}`,
                          color: plan.popular ? '#000' : C.text2,
                          fontSize: 9, fontWeight: 800, fontFamily: FONT_AR,
                          cursor: 'pointer',
                        }}
                      >
                        {tier === 'pro' || (tier === 'starter' && plan.id === 'free') ? 'اختيار' : 'ترقية'}
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {plan.features.map(f => (
                      <span key={f} style={{
                        fontSize: 8, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                        background: 'rgba(255,255,255,0.03)', color: C.text2,
                        border: `0.5px solid ${C.border}`, fontFamily: FONT_AR,
                      }}>
                        {f}
                      </span>
                    ))}
                  </div>
                </IOSCard>
              </motion.div>
            )
          })}
        </>
      )}

      {/* Payment History */}
      <div className="m-section" style={{ marginTop: 8 }}>
        <div className="m-section__title">سجل المدفوعات</div>
      </div>

      <IOSCard>
        {PAYMENT_HISTORY.map((payment, i) => (
          <div key={payment.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 0',
            borderBottom: i < PAYMENT_HISTORY.length - 1 ? `0.5px solid ${C.border}` : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: payment.amount > 0 ? `${C.accent}08` : 'rgba(255,255,255,0.03)',
                border: `0.5px solid ${payment.amount > 0 ? `${C.accent}15` : C.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Receipt size={12} color={payment.amount > 0 ? C.accent : C.text2} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: FONT_AR }}>
                  خطة {payment.plan}
                </div>
                <div style={{ fontSize: 9, color: C.text2, fontFamily: FONT_AR, direction: 'ltr', unicodeBidi: 'embed' }}>
                  {formatDate(payment.date)}
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.text, fontFamily: FONT_MONO }}>
                {payment.amount === 0 ? 'مجاني' : `$${payment.amount}`}
              </div>
              <div style={{
                fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                background: `${C.success}08`, color: C.success,
                border: `0.5px solid ${C.success}15`, fontFamily: FONT_AR,
                display: 'inline-block',
              }}>
                مدفوع
              </div>
            </div>
          </div>
        ))}
      </IOSCard>

      {/* Promo */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: `${C.amber}12`, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Gift size={15} color={C.amber} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: FONT_AR }}>كود خصم</div>
            <div style={{ fontSize: 9, color: C.text2, fontFamily: FONT_AR }}>أدخل كود الحصول على خصم</div>
          </div>
          <button style={{
            padding: '5px 14px', borderRadius: 8,
            background: `${C.amber}10`, border: `0.5px solid ${C.amber}25`,
            color: C.amber, fontSize: 9, fontWeight: 800, fontFamily: FONT_AR,
            cursor: 'pointer',
          }}>
            تطبيق
          </button>
        </div>
      </IOSCard>

      <div style={{ height: 16 }} />
    </div>
  )
}
