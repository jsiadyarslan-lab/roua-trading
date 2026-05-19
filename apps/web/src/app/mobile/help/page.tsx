'use client'

import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { HelpCircle, MessageCircle, ChevronLeft, Mail, Shield, BookOpen } from 'lucide-react'

const FAQ = [
  { q: 'كيف أربط حسابي في البورصة؟', a: 'اذهب إلى صفحة ربط الحسابات وأدخل مفاتيح API الخاصة بك. نستخدم مفاتيح للقراءة فقط والتداول فقط، ولا يمكن سحب الأموال.' },
  { q: 'هل أموالي آمنة؟', a: 'نعم! رؤى منصة ربط حسابات — أموالك تبقى في بورصتك. لا نحتفظ بأي أرصدة ولا نطلب صلاحيات السحب.' },
  { q: 'كيف يعمل المنفذ الذكي؟', a: 'المنفذ الذكي يحلل السوق باستخدام 6 نماذج AI وينفذ صفقات تلقائياً بناءً على الاستراتيجية المحددة مع إدارة مخاطر متقدمة.' },
  { q: 'هل يمكنني إيقاف التداول التلقائي؟', a: 'نعم، يمكنك إيقاف المنفذ الذكي في أي وقت من صفحة الوكيل. كما يمكنك تحديد حد خسارة يومي وإيقاف طارئ.' },
  { q: 'ما هي خطة الأسعار؟', a: 'الخطة المجانية تتيح ربط حساب واحد وتداول يدوي. الخطة الاحترافية تفتح المنفذ الذكي وتحليلات AI المتقدمة.' },
]

export default function MobileHelpPage() {
  return (
    <div className="m-page">
      <MobilePageHeader title="المساعدة" subtitle="مركز الدعم" />

      {/* Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 16px', marginBottom: 10 }}>
        <IOSCard noMargin><div style={{ textAlign: 'center', padding: '12px 4px' }}><MessageCircle size={18} color="#00D4FF" style={{ margin: '0 auto 4px' }} /><div style={{ fontSize: 10, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>دردشة مباشرة</div></div></IOSCard>
        <IOSCard noMargin><div style={{ textAlign: 'center', padding: '12px 4px' }}><Mail size={18} color="#d4af37" style={{ margin: '0 auto 4px' }} /><div style={{ fontSize: 10, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>بريد إلكتروني</div></div></IOSCard>
      </div>

      {/* FAQ */}
      <div style={{ padding: '0 16px', marginBottom: 6 }}><span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>الأسئلة الشائعة</span></div>
      {FAQ.map((item, i) => (
        <IOSCard key={i}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <HelpCircle size={16} color="#00D4FF" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>{item.q}</div>
              <div style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", lineHeight: 1.6 }}>{item.a}</div>
            </div>
          </div>
        </IOSCard>
      ))}

      {/* Resources */}
      <div style={{ padding: '0 16px', marginBottom: 6, marginTop: 6 }}><span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>مصادر مفيدة</span></div>
      <IOSCard><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><BookOpen size={18} color="#B388FF" /><div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>دليل المستخدم</div><div style={{ fontSize: 10, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>خطوة بخطوة لكل ميزة</div></div><ChevronLeft size={14} color="rgba(255,255,255,0.15)" /></div></IOSCard>
      <IOSCard><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Shield size={18} color="#32D74B" /><div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>سياسة الأمان</div><div style={{ fontSize: 10, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>كيف نحمي بياناتك</div></div><ChevronLeft size={14} color="rgba(255,255,255,0.15)" /></div></IOSCard>
      <div style={{ height: 16 }} />
    </div>
  )
}
