'use client'

import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { CreditCard, CheckCircle, Zap, Crown, Building2, ArrowUpRight } from 'lucide-react'

const PLANS = [
  { name: 'مجاني', price: '$0', color: '#8B92A8', features: ['ربط حساب واحد', 'تداول يدوي', 'بيانات مباشرة'], current: true },
  { name: 'احترافي', price: '$19', color: '#00D4FF', features: ['حسابات غير محدودة', 'المنفذ الذكي', 'تحليلات AI كاملة', 'أولوية الدعم'], current: false },
  { name: 'مؤسسي', price: '$49', color: '#d4af37', features: ['كل مميزات الاحترافي', 'API كامل', 'استراتيجيات مخصصة', 'مدير حساب خاص'], current: false },
]

const MOCK_INVOICES = [
  { id: 1, date: '2025-05-01', amount: '$19.00', status: 'paid', plan: 'احترافي' },
  { id: 2, date: '2025-04-01', amount: '$19.00', status: 'paid', plan: 'احترافي' },
  { id: 3, date: '2025-03-01', amount: '$0.00', status: 'paid', plan: 'مجاني' },
]

export default function MobileBillingPage() {
  return (
    <div className="m-page">
      <MobilePageHeader title="الفواتير" subtitle="إدارة الاشتراكات" />

      {/* Plans */}
      <div style={{ padding: '0 16px', marginBottom: 6 }}><span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>الخطط</span></div>
      {PLANS.map(plan => (
        <IOSCard key={plan.name} highlight={plan.current}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${plan.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `0.5px solid ${plan.color}30` }}>
                {plan.name === 'مجاني' ? <Zap size={18} color={plan.color} /> : plan.name === 'احترافي' ? <Crown size={18} color={plan.color} /> : <Building2 size={18} color={plan.color} />}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>{plan.name}</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: plan.color, fontFamily: "'JetBrains Mono', monospace" }}>{plan.price}<span style={{ fontSize: 10, color: '#8B92A8' }}>/شهرياً</span></div>
              </div>
            </div>
            {plan.current && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(0,255,163,0.1)', color: '#00FFA3', fontFamily: "'Cairo', sans-serif" }}>الحالية</span>}
          </div>
          {plan.features.map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
              <CheckCircle size={10} color={plan.color} /><span style={{ fontSize: 11, color: '#F0F2F5', fontFamily: "'Cairo', sans-serif" }}>{f}</span>
            </div>
          ))}
          {!plan.current && (
            <button style={{ width: '100%', padding: '8px 0', borderRadius: 10, background: `${plan.color}15`, border: `0.5px solid ${plan.color}30`, color: plan.color, fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', marginTop: 8, touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <ArrowUpRight size={12} />ترقية
            </button>
          )}
        </IOSCard>
      ))}

      {/* Invoices */}
      <div style={{ padding: '0 16px', marginBottom: 6, marginTop: 6 }}><span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>سجل الفواتير</span></div>
      {MOCK_INVOICES.map(inv => (
        <IOSCard key={inv.id}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CreditCard size={16} color="#8B92A8" />
              <div><div style={{ fontSize: 11, fontWeight: 800, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{inv.date}</div><div style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>{inv.plan}</div></div>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{inv.amount}</div>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#00FFA3', fontFamily: "'Cairo', sans-serif" }}>مدفوعة</span>
            </div>
          </div>
        </IOSCard>
      ))}
      <div style={{ height: 16 }} />
    </div>
  )
}
