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

/* ═══════════════════════════════════════════════════════
   Design Tokens
═══════════════════════════════════════════════════════ */
const T = {
  bg: '#04050C', bg2: '#0D1117', card: '#08090F', cardHover: '#0B0F19',
  surface: '#1A1D29', cyan: '#00D4FF', green: '#00FFA3', greenDim: '#00CC82',
  red: '#FF4757', redDim: '#FF3344', amber: '#FFB800', purple: '#B388FF',
  blue: '#0A84FF', pink: '#f472b6',
  text: '#F0F2F5', text2: '#94a3b8', text3: '#8B92A8', text4: '#475569',
  border: 'rgba(255,255,255,0.06)', border2: 'rgba(0,212,255,0.16)',
}

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

const PLANS: PlanData[] = [
  {
    id: 'FREE',
    name: 'مجاني',
    price: 0,
    period: 'شهر',
    description: 'ابدأ بربط حسابك الأول واستكشف تحليلات السوق الأساسية. مثالي للمبتدئين الذين يريدون متابعة أداء استثماراتهم مع رؤى ذكاء اصطناعي محدودة.',
    color: T.text2,
    gradient: 'linear-gradient(135deg, #94a3b8, #64748b)',
    icon: <Crown size={22} />,
    features: [
      { icon: <Link2 size={13} />, label: 'ربط حساب واحد', included: true },
      { icon: <BarChart3 size={13} />, label: 'تحليلات أساسية', included: true },
      { icon: <Radio size={13} />, label: 'إشارات محدودة', included: true },
      { icon: <Brain size={13} />, label: 'رؤى AI أساسية', included: true },
      { icon: <Users size={13} />, label: 'ربط حسابات متعددة', included: false },
      { icon: <BarChart3 size={13} />, label: 'تحليل محفظة متقدم', included: false },
      { icon: <Code2 size={13} />, label: 'وصول API', included: false },
      { icon: <Globe size={13} />, label: 'بيانات حية مباشرة', included: false },
    ],
  },
  {
    id: 'PRO',
    name: 'برو',
    price: 29,
    period: 'شهر',
    description: 'اربط حساباتك المتعددة واحصل على تحليلات AI متقدمة مع بيانات حية مباشرة. صُمم للمتداولين الذين يريدون رؤية شاملة لأداء محافظهم عبر جميع البورصات.',
    color: T.cyan,
    gradient: 'linear-gradient(135deg, #00D4FF, #0A84FF)',
    icon: <Star size={22} />,
    popular: true,
    features: [
      { icon: <Link2 size={13} />, label: 'ربط حتى 3 حسابات', included: true },
      { icon: <Brain size={13} />, label: 'AI متقدم مع توصيات', included: true },
      { icon: <Globe size={13} />, label: 'بيانات حية مباشرة', included: true },
      { icon: <BarChart3 size={13} />, label: 'تحليلات غير محدودة', included: true },
      { icon: <Radio size={13} />, label: 'ماسح ذكي للأسواق', included: true },
      { icon: <Bell size={13} />, label: 'إشعارات فورية', included: true },
      { icon: <BarChart3 size={13} />, label: 'تحليل محفظة متقدم', included: false },
      { icon: <Code2 size={13} />, label: 'وصول API', included: false },
    ],
  },
  {
    id: 'PREMIUM',
    name: 'متميز',
    price: 79,
    period: 'شهر',
    description: 'الخطة المثالية للمتداولين المحترفين مع محافظ متعددة عبر بورصات مختلفة. تحليل شامل لأداء جميع حساباتك مع نماذج AI متقدمة وتقارير مفصلة.',
    color: T.amber,
    gradient: 'linear-gradient(135deg, #FFB800, #FF8C00)',
    icon: <Sparkles size={22} />,
    badge: 'الأكثر قيمة',
    features: [
      { icon: <Link2 size={13} />, label: 'ربط حتى 10 حسابات', included: true },
      { icon: <Brain size={13} />, label: 'نماذج AI متقدمة', included: true },
      { icon: <Code2 size={13} />, label: 'وصول API كامل', included: true },
      { icon: <Globe size={13} />, label: 'بيانات حية وتاريخية', included: true },
      { icon: <BarChart3 size={13} />, label: 'تحليل محفظة متقدم', included: true },
      { icon: <TrendingUp size={13} />, label: 'تتبع أداء متعدد', included: true },
      { icon: <Bell size={13} />, label: 'تنبيهات ذكية مخصصة', included: true },
      { icon: <FileText size={13} />, label: 'تصدير التقارير', included: true },
    ],
  },
  {
    id: 'INSTITUTIONAL',
    name: 'مؤسسي',
    price: 299,
    period: 'شهر',
    description: 'الحل الشامل للمؤسسات والصناديق الاستثمارية التي تدير حسابات متعددة عبر بورصات عديدة. تكامل كامل مع أنظمتكم الداخلية ودعم مخصص على مدار الساعة.',
    color: T.green,
    gradient: 'linear-gradient(135deg, #00FFA3, #00CC82)',
    icon: <Building2 size={22} />,
    features: [
      { icon: <Infinity size={13} />, label: 'ربط غير محدود', included: true },
      { icon: <Headphones size={13} />, label: 'دعم مخصص 24/7', included: true },
      { icon: <Server size={13} />, label: 'Webhooks للتكامل', included: true },
      { icon: <Code2 size={13} />, label: 'API كامل + أولوية', included: true },
      { icon: <Users size={13} />, label: 'حسابات فرعية', included: true },
      { icon: <TrendingUp size={13} />, label: 'استراتيجيات مخصصة', included: true },
      { icon: <Brain size={13} />, label: 'كل نماذج AI المتقدمة', included: true },
      { icon: <Shield size={13} />, label: 'SLA ضمان وقت التشغيل', included: true },
    ],
  },
]

/* ═══════════════════════════════════════════════════════
   Mock Billing History
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

const BILLING_HISTORY: BillingRecord[] = [
  { id: 'INV-2026-001', date: '2026/02/28', description: 'اشتراك خطة ربط برو — مارس 2026', amount: '$29.00', status: 'paid', statusLabel: 'مدفوع' },
  { id: 'INV-2026-002', date: '2026/01/28', description: 'اشتراك خطة ربط برو — فبراير 2026', amount: '$29.00', status: 'paid', statusLabel: 'مدفوع' },
  { id: 'INV-2025-012', date: '2025/12/28', description: 'اشتراك خطة ربط برو — يناير 2026', amount: '$29.00', status: 'paid', statusLabel: 'مدفوع' },
  { id: 'INV-2025-011', date: '2025/11/28', description: 'اشتراك خطة ربط متميز — ديسمبر 2025', amount: '$79.00', status: 'refunded', statusLabel: 'مسترد' },
  { id: 'INV-2025-010', date: '2025/10/28', description: 'اشتراك خطة ربط متميز — نوفمبر 2025', amount: '$79.00', status: 'paid', statusLabel: 'مدفوع' },
  { id: 'INV-2025-009', date: '2025/09/15', description: 'ترقية من برو إلى متميز', amount: '$50.00', status: 'paid', statusLabel: 'مدفوع' },
  { id: 'INV-2025-008', date: '2025/08/28', description: 'اشتراك خطة ربط برو — سبتمبر 2025', amount: '$29.00', status: 'failed', statusLabel: 'فشل' },
  { id: 'INV-2025-007', date: '2025/07/28', description: 'اشتراك خطة ربط برو — أغسطس 2025', amount: '$29.00', status: 'paid', statusLabel: 'مدفوع' },
]

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
  const user = useAuthStore(state => state.user)
  const userTier = (user?.tier || 'FREE') as Role
  const roleInfo = ROLE_INFO[userTier] || ROLE_INFO.FREE

  const [promoCode, setPromoCode] = useState('')
  const [promoApplying, setPromoApplying] = useState(false)
  const [showCardNumber, setShowCardNumber] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<'card' | 'crypto'>('card')
  const [upgrading, setUpgrading] = useState<string | null>(null)

  // Card form visual state
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242')
  const [cardExpiry, setCardExpiry] = useState('12/28')
  const [cardCvc, setCardCvc] = useState('***')

  const handleUpgrade = (planId: string) => {
    if (planId === userTier) {
      toast({ title: 'أنت مشترك بالفعل في هذه الخطة', description: 'لا حاجة لترقية حسابك حيث أنك تستخدم هذه الخطة حالياً.' })
      return
    }
    setUpgrading(planId)
    setTimeout(() => {
      setUpgrading(null)
      toast({ title: 'تم إرسال طلب الترقية', description: 'سيتم تفعيل خطتك الجديدة خلال لحظات بعد تأكيد الدفع.' })
    }, 1500)
  }

  const handlePromoApply = () => {
    if (!promoCode.trim()) {
      toast({ title: 'أدخل رمز الخصم', description: 'يرجى إدخال رمز الخصم قبل التطبيق.' })
      return
    }
    setPromoApplying(true)
    setTimeout(() => {
      setPromoApplying(false)
      if (promoCode.toUpperCase() === 'ROUA2026') {
        toast({ title: 'تم تطبيق الخصم بنجاح!', description: 'حصلت على خصم 20% على اشتراكك القادم. الرمز صالح لمدة 30 يوماً.' })
      } else {
        toast({ title: 'رمز الخصم غير صالح', description: 'الرمز الذي أدخلته غير صالح أو منتهي الصلاحية. حاول رمزاً آخر.' })
      }
    }, 1200)
  }

  const planOrder = ['FREE', 'PRO', 'PREMIUM', 'INSTITUTIONAL']

  return (
    <div className="custom-scrollbar" style={{
      direction: 'rtl', fontFamily: "'Cairo', sans-serif",
      height: '100%', overflowY: 'auto', background: T.bg,
    }}>
      <style>{`
        @media (max-width: 767px) {
          .billing-pricing-grid { grid-template-columns: 1fr !important; }
          .billing-header-row { flex-direction: column !important; align-items: flex-start !important; }
          .billing-payment-grid { grid-template-columns: 1fr !important; }
          .billing-table-wrap { overflow-x: auto; }
          .billing-promo-row { flex-direction: column !important; }
        }
        @media (min-width: 768px) and (max-width: 1023px) {
          .billing-pricing-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      {/* ═══════════════════════════════════════════════════
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
              المدفوعات والاشتراكات
            </h1>
            <p style={{ margin: 0, fontSize: 11, color: T.text3 }}>
              إدارة اشتراكك وطرق الدفع وعرض سجل الفواتير
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
                  خطة {roleInfo.label} الحالية
                  {userTier === 'FREE' && (
                    <span style={{
                      fontSize: 9, padding: '2px 8px', borderRadius: 10,
                      background: `${T.cyan}12`, color: T.cyan,
                      fontFamily: "'Cairo', sans-serif", fontWeight: 700,
                    }}>ترقية متاحة</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: T.text3, marginTop: 4, lineHeight: 1.6 }}>
                  {roleInfo.description} — أنت حالياً على خطة {roleInfo.label}
                  {userTier !== 'INSTITUTIONAL' && '، يمكنك الترقية في أي وقت لفتح المزيد من الإمكانيات والمزايا الحصرية.'}
                  {userTier === 'INSTITUTIONAL' && ' — أعلى مستوى من الخدمة والصلاحيات متاح لك بالكامل.'}
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
                  $ / شهر
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
                  <span style={{ fontWeight: 700, color: T.text }}>الدفع القادم:</span>
                  {' '}28 مارس 2026 — سيتم تجديد اشتراكك تلقائياً بمبلغ{' '}
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
              <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>خطط الاشتراك</div>
              <div style={{ fontSize: 11, color: T.text3 }}>اختر الخطة المناسبة لاحتياجاتك — يمكنك الترقية أو التخفيض في أي وقت</div>
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
                      الأكثر شعبية
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
                        خطتك الحالية
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
                          <>جاري المعالجة...</>
                        ) : isDowngrade ? (
                          <><ArrowUpRight size={13} style={{ transform: 'rotate(180deg)' }} /> تخفيض الخطة</>
                        ) : (
                          <><ArrowUpRight size={13} /> ترقية الآن</>
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
              <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>طرق الدفع</div>
              <div style={{ fontSize: 11, color: T.text3 }}>
                أضف أو أدر بطاقاتك الائتمانية أو ادفع عبر العملات المشفرة بسرعة وأمان تام
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
                    بطاقة ائتمان / خصم
                  </span>
                  <span style={{
                    marginRight: 'auto', fontSize: 9, padding: '2px 7px',
                    borderRadius: 10, background: `${T.green}12`, color: T.green,
                    fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    <Lock size={8} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 3 }} />
                    مشفّر
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
                        <div style={{ fontSize: 8, color: T.text4, marginBottom: 2 }}>حامل البطاقة</div>
                        <div style={{ fontSize: 11, color: T.text2, fontWeight: 600 }}>{user?.displayName || 'ROUA USER'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 8, color: T.text4, marginBottom: 2 }}>الانتهاء</div>
                        <div style={{ fontSize: 11, color: T.text2, fontFamily: "'JetBrains Mono', monospace" }}>{cardExpiry}</div>
                      </div>
                    </div>
                  </div>

                  {/* Card Form (visual only) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 10, color: T.text3, marginBottom: 4, display: 'block' }}>رقم البطاقة</label>
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
                        <label style={{ fontSize: 10, color: T.text3, marginBottom: 4, display: 'block' }}>تاريخ الانتهاء</label>
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
                    عملات مشفرة
                  </span>
                  <span style={{
                    marginRight: 'auto', fontSize: 9, padding: '2px 7px',
                    borderRadius: 10, background: `${T.amber}12`, color: T.amber,
                    fontWeight: 600,
                  }}>
                    لامركزي
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
                      ادفع باستخدام Bitcoin أو Ethereum أو USDT. المعاملة آمنة ولا تتطلب بيانات شخصية.
                      يتم تأكيد الدفع خلال 3 تأكيدات على الشبكة، وعادة ما يستغرق الأمر أقل من 15 دقيقة.
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
              <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>سجل الفواتير</div>
              <div style={{ fontSize: 11, color: T.text3 }}>
                عرض جميع المعاملات السابقة والفواتير — يمكنك تنزيل أي فاتورة كملف PDF
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
                    {['التاريخ', 'الوصف', 'المبلغ', 'الحالة', ''].map(h => (
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
                  {BILLING_HISTORY.map((record, idx) => (
                    <tr key={record.id} style={{
                      borderBottom: idx < BILLING_HISTORY.length - 1 ? `1px solid ${T.border}` : 'none',
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
                            onClick={() => toast({ title: 'جاري تنزيل الفاتورة', description: `سيتم تنزيل الفاتورة ${record.id} خلال لحظات.` })}
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
                عرض آخر {BILLING_HISTORY.length} معاملات
              </div>
              <div style={{ fontSize: 10, color: T.text3, display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={10} />
                إجمالي المدفوعات: <span style={{ color: T.text, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                  ${BILLING_HISTORY.filter(r => r.status === 'paid').reduce((sum, r) => sum + parseFloat(r.amount.replace('$', '')), 0).toFixed(2)}
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
                <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>رمز الخصم</div>
                <div style={{ fontSize: 11, color: T.text3 }}>
                  هل لديك رمز ترويجي أو قسيمة خصم؟ أدخله هنا للحصول على خصم فوري على اشتراكك القادم. الأكواد الترويجية قابلة للتطبيق على جميع الخطط المدفوعة وقد تمنحك خصماً يصل إلى 50% من قيمة الاشتراك.
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
                  placeholder="أدخل رمز الخصم هنا..."
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
                {promoApplying ? 'جاري التحقق...' : 'تطبيق الخصم'}
              </button>
            </div>

            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={12} color={T.text4} />
              <span style={{ fontSize: 10, color: T.text4 }}>
                جميع المعاملات مشفرة ومؤمنة بمعيار PCI DSS Level 1. لا نخزن بيانات بطاقتك على خوادمنا أبداً.
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
            { icon: <Shield size={14} />, color: T.green, label: 'ضمان استرداد 14 يوماً', desc: 'استرداد كامل خلال أول 14 يوماً بدون أسئلة' },
            { icon: <Zap size={14} />, color: T.cyan, label: 'تفعيل فوري', desc: 'يتم تفعيل خطتك فوراً بعد تأكيد الدفع' },
            { icon: <Lock size={14} />, color: T.amber, label: 'دفع آمن', desc: 'تشفير SSL 256-bit وحماية احتيال متقدمة' },
            { icon: <Users size={14} />, color: T.purple, label: 'دعم متواصل', desc: 'فريق الدعم متاح على مدار الساعة لجميع الخطط' },
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
