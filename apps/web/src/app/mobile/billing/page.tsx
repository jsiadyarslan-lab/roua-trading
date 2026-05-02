'use client'

import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  ChevronLeft, Crown, Check, Star, Zap, ArrowUpRight,
  CreditCard, Calendar, Loader2, Shield, Sparkles
} from 'lucide-react'

/* ─── Design Tokens ─── */
const c = {
  accent: '#00D4FF',
  success: '#32D74B',
  danger: '#FF453A',
  amber: '#FFB800',
  text: '#F0F2F5',
  text2: 'rgba(235,235,245,0.5)',
  bg: '#1C1C1E',
  border: 'rgba(255,255,255,0.08)',
}

/* ─── Plans Data ─── */
const PLANS = [
  {
    id: 'FREE',
    name: 'مجاني',
    price: 0,
    priceLabel: 'مجاني',
    color: '#8B92A8',
    icon: Star,
    features: ['3 إشارات يومياً', 'محفظة أساسية', 'سكانر محدود', 'بدون بوت آلي'],
  },
  {
    id: 'PRO',
    name: 'محترف',
    price: 29,
    priceLabel: '$29/شهر',
    color: c.accent,
    icon: Zap,
    features: ['إشارات غير محدودة', 'بوت آلي', 'سكانر متقدم', 'تحليلات AI', '10 استراتيجيات'],
  },
  {
    id: 'PLUS',
    name: 'بلس',
    price: 79,
    priceLabel: '$79/شهر',
    color: c.amber,
    icon: Crown,
    features: ['كل ميزات المحترف', 'تداول اجتماعي', 'نسخ الصفقات', '30 استراتيجية', 'أولوية الدعم'],
  },
  {
    id: 'PREMIUM',
    name: 'بريميوم',
    price: 149,
    priceLabel: '$149/شهر',
    color: c.success,
    icon: Sparkles,
    features: ['كل ميزات بلس', 'مجلس AI حصري', 'استراتيجيات مخصصة', 'مدير حساب', 'API متقدم'],
  },
]

/* ─── iOS Card ─── */
function IOSCard({ children, highlight = false }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{
        background: highlight
          ? 'linear-gradient(165deg, rgba(35,35,45,0.9) 0%, rgba(20,20,25,0.9) 100%)'
          : 'rgba(28,28,30,0.65)',
        backdropFilter: 'blur(40px) saturate(190%)',
        WebkitBackdropFilter: 'blur(40px) saturate(190%)',
        borderRadius: 28,
        padding: 20,
        margin: '0 20px 16px',
        border: '0.5px solid rgba(255,255,255,0.1)',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: highlight
          ? '0 12px 32px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.08)'
          : '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.05)',
      }}
    >
      {highlight && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
          background: `linear-gradient(90deg, transparent, ${c.accent}66, transparent)`,
          zIndex: 10,
        }} />
      )}
      {children}
    </motion.div>
  )
}

/* ─── Payment History Item ─── */
function PaymentItem({ date, amount, plan, status }: { date: string; amount: string; plan: string; status: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 0', borderBottom: `0.5px solid ${c.border}`,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 12,
        background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <CreditCard size={18} color={c.text2} />
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: c.text, fontFamily: "'Cairo', sans-serif" }}>خطة {plan}</p>
        <p style={{ fontSize: 11, color: c.text2, fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>{date}</p>
      </div>
      <div style={{ textAlign: 'left' }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: c.text, fontFamily: "'JetBrains Mono', monospace" }}>{amount}</p>
        <span style={{ fontSize: 10, color: status === 'paid' ? c.success : c.amber, fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>
          {status === 'paid' ? 'مدفوع' : 'معلّق'}
        </span>
      </div>
    </div>
  )
}

/* ─── Main Page ─── */
export default function BillingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [currentPlan, setCurrentPlan] = useState('PRO')
  const [expiryDate, setExpiryDate] = useState('2025-06-15')
  const [paymentHistory, setPaymentHistory] = useState<any[]>([])
  const [upgrading, setUpgrading] = useState<string | null>(null)

  useEffect(() => {
    async function fetchBilling() {
      try {
        const res = await fetch('/api/admin/subscriptions/stats')
        if (res.ok) {
          const data = await res.json()
          setCurrentPlan(data.currentPlan || data.plan || 'PRO')
          setExpiryDate(data.expiryDate || data.expiresAt || '2025-06-15')
          setPaymentHistory(data.history || data.payments || [])
        }
      } catch {
        // Use mock data
        setPaymentHistory([
          { date: '2025-05-01', amount: '$29.00', plan: 'المحترف', status: 'paid' },
          { date: '2025-04-01', amount: '$29.00', plan: 'المحترف', status: 'paid' },
          { date: '2025-03-01', amount: '$0.00', plan: 'المجاني', status: 'paid' },
        ])
      } finally {
        setLoading(false)
      }
    }
    fetchBilling()
  }, [])

  const handleUpgrade = (planId: string) => {
    setUpgrading(planId)
    setTimeout(() => {
      setCurrentPlan(planId)
      setUpgrading(null)
    }, 1500)
  }

  const currentPlanData = PLANS.find(p => p.id === currentPlan) || PLANS[0]

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', background: '#000', direction: 'rtl', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={32} className="animate-spin" color={c.accent} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#000', direction: 'rtl', paddingBottom: 100 }}>

      {/* ── Header ── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top) + 16px) 20px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'linear-gradient(180deg, rgba(0,212,255,0.06), transparent)',
      }}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => router.back()}
          style={{
            width: 40, height: 40, borderRadius: 14,
            background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `0.5px solid ${c.border}`,
          }}
        >
          <ChevronLeft size={20} color={c.text} />
        </motion.button>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif", flex: 1 }}>الاشتراك والفوترة</h1>
      </div>

      {/* ── Current Plan Card ── */}
      <IOSCard highlight>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 16,
              background: `${currentPlanData.color}15`, border: `0.5px solid ${currentPlanData.color}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {(() => { const I = currentPlanData.icon; return <I size={22} color={currentPlanData.color} /> })()}
            </div>
            <div>
              <p style={{ fontSize: 18, fontWeight: 900, color: c.text, fontFamily: "'Cairo', sans-serif" }}>خطة {currentPlanData.name}</p>
              <p style={{ fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>
                <Calendar size={12} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} />
                تنتهي في {new Date(expiryDate).toLocaleDateString('ar-SA')}
              </p>
            </div>
          </div>
          <div style={{
            padding: '6px 12px', borderRadius: 12,
            background: `${c.success}15`, border: `0.5px solid ${c.success}30`,
            fontSize: 11, fontWeight: 800, color: c.success, fontFamily: "'Cairo', sans-serif",
          }}>
            نشط ✓
          </div>
        </div>

        {/* Features List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {currentPlanData.features.map((feat, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check size={14} color={currentPlanData.color} />
              <span style={{ fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>{feat}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: `0.5px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>السعر الحالي</span>
          <span style={{ fontSize: 20, fontWeight: 900, color: c.text, fontFamily: "'JetBrains Mono', monospace" }}>{currentPlanData.priceLabel}</span>
        </div>
      </IOSCard>

      {/* ── Upgrade Plans ── */}
      <div style={{ padding: '0 20px', marginBottom: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>خطط أخرى</h2>
      </div>

      {PLANS.filter(p => p.id !== currentPlan).map((plan, i) => {
        const PlanIcon = plan.icon
        const isUpgrading = upgrading === plan.id
        return (
          <IOSCard key={plan.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: `${plan.color}15`, border: `0.5px solid ${plan.color}25`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <PlanIcon size={18} color={plan.color} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>{plan.name}</p>
                <p style={{ fontSize: 16, fontWeight: 900, color: plan.color, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>{plan.priceLabel}</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {plan.features.slice(0, 3).map((feat, fi) => (
                <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Check size={12} color={plan.color} />
                  <span style={{ fontSize: 11, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>{feat}</span>
                </div>
              ))}
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => handleUpgrade(plan.id)}
              disabled={isUpgrading}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 16,
                background: `${plan.color}15`, border: `0.5px solid ${plan.color}30`,
                color: plan.color, fontSize: 13, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
                cursor: isUpgrading ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {isUpgrading ? (
                <><Loader2 size={16} className="animate-spin" /> جاري الترقية...</>
              ) : (
                <><ArrowUpRight size={16} /> ترقية إلى {plan.name}</>
              )}
            </motion.button>
          </IOSCard>
        )
      })}

      {/* ── Payment History ── */}
      <div style={{ padding: '24px 20px 0', marginBottom: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>سجل المدفوعات</h2>
      </div>

      <IOSCard>
        {paymentHistory.length > 0 ? (
          paymentHistory.map((pay, i) => (
            <PaymentItem key={i} date={pay.date} amount={pay.amount} plan={pay.plan} status={pay.status} />
          ))
        ) : (
          <div style={{ padding: '20px 0', textAlign: 'center' }}>
            <CreditCard size={28} color={c.text2} style={{ opacity: 0.3 }} />
            <p style={{ fontSize: 13, color: c.text2, fontFamily: "'Cairo', sans-serif", marginTop: 8 }}>لا توجد مدفوعات سابقة</p>
          </div>
        )}
      </IOSCard>

    </div>
  )
}
