'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Code, Key, Copy, Check, BookOpen, Zap, Shield, ChevronDown, ChevronUp } from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  description: string
  category: string
}

const ENDPOINTS: Endpoint[] = [
  { method: 'GET', path: '/api/ai/consensus', description: 'إجماع مجلس الذكاء الاصطناعي', category: 'AI' },
  { method: 'POST', path: '/api/ai/consensus', description: 'طلب تحليل إجماع جديد', category: 'AI' },
  { method: 'GET', path: '/api/ai/status', description: 'حالة خدمات AI', category: 'AI' },
  { method: 'POST', path: '/api/ai/chat', description: 'محادثة مع AI', category: 'AI' },
  { method: 'GET', path: '/api/signals/smart', description: 'الإشارات الذكية', category: 'إشارات' },
  { method: 'GET', path: '/api/signals/active', description: 'الإشارات النشطة', category: 'إشارات' },
  { method: 'GET', path: '/api/scanner/scan', description: 'مسح الأسواق', category: 'سكانر' },
  { method: 'GET', path: '/api/scanner/overview', description: 'نظرة عامة على الأسواق', category: 'سكانر' },
  { method: 'GET', path: '/api/correlation', description: 'مصفوفة الارتباط', category: 'تحليلات' },
  { method: 'GET', path: '/api/calendar', description: 'التقويم الاقتصادي', category: 'تحليلات' },
  { method: 'GET', path: '/api/news/latest', description: 'آخر الأخبار', category: 'أخبار' },
  { method: 'POST', path: '/api/neural/backtest', description: 'اختبار رجعي', category: 'مختبر' },
  { method: 'GET', path: '/api/neural/models', description: 'النماذج العصبية المتاحة', category: 'مختبر' },
  { method: 'GET', path: '/api/prediction-market/events', description: 'أحداث سوق التوقعات', category: 'توقعات' },
  { method: 'GET', path: '/api/portfolio/summary', description: 'ملخص المحفظة', category: 'محفظة' },
  { method: 'GET', path: '/api/trading/account', description: 'حساب التداول', category: 'تداول' },
  { method: 'POST', path: '/api/trading/orders', description: 'إرسال أمر تداول', category: 'تداول' },
  { method: 'GET', path: '/api/health', description: 'فحص صحة النظام', category: 'نظام' },
]

const METHOD_COLORS: Record<string, string> = {
  GET: C.success,
  POST: C.accent,
  PUT: C.amber,
  DELETE: C.danger,
}

const SDK_EXAMPLES = [
  {
    title: 'جلب إجماع AI',
    lang: 'JavaScript',
    code: `const res = await fetch('/api/ai/consensus?symbol=BTC/USD');
const data = await res.json();
console.log(data.data.recommendation);
// "BUY" | "SELL" | "HOLD"`,
  },
  {
    title: 'الحصول على إشارات ذكية',
    lang: 'JavaScript',
    code: `const res = await fetch('/api/signals/smart?limit=5');
const data = await res.json();
data.data.forEach(signal => {
  console.log(signal.pair, signal.type, signal.conf);
});`,
  },
  {
    title: 'إرسال أمر تداول',
    lang: 'JavaScript',
    code: `const res = await fetch('/api/trading/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    credentialId: 'YOUR_CRED_ID',
    symbol: 'BTC/USD',
    side: 'BUY',
    type: 'MARKET',
    quantity: 0.01,
  }),
});
const order = await res.json();`,
  },
]

export default function MobileAPIDocsPage() {
  const router = useRouter()
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string>('')

  const categories = [...new Set(ENDPOINTS.map(e => e.category))]
  const filtered = categoryFilter ? ENDPOINTS.filter(e => e.category === categoryFilter) : ENDPOINTS

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(id)
      setTimeout(() => setCopiedCode(null), 2000)
    }).catch(() => {})
  }

  return (
    <div className="m-page">
      <MobilePageHeader
        title="توثيق API"
        subtitle="واجهة برمجة التطبيقات"
        onBack={() => router.back()}
      />

      {/* API Key Info */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Key size={16} color={C.accent} />
          <span style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>مفاتيح API</span>
        </div>
        <p style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.6, margin: '0 0 8px' }}>
          استخدم مفاتيح API للوصول البرمجي إلى منصة رؤى. كل طلب يجب أن يحتوي على مفتاح مصادقة صالح.
        </p>
        <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `0.5px solid ${C.border}`, direction: 'ltr' }}>
          <span style={{ fontSize: 9, color: C.text2, fontFamily: "'JetBrains Mono', monospace" }}>Authorization: Bearer {'<YOUR_API_KEY>'}</span>
        </div>
      </IOSCard>

      {/* Category Filter */}
      <div style={{ padding: '0 16px', marginBottom: 8, overflowX: 'auto' }} className="m-no-scroll">
        <div style={{ display: 'flex', gap: 4, minWidth: 'max-content' }}>
          <button onClick={() => setCategoryFilter('')} style={{ padding: '4px 10px', borderRadius: 6, background: !categoryFilter ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.03)', border: `0.5px solid ${!categoryFilter ? 'rgba(0,212,255,0.25)' : 'rgba(255,255,255,0.04)'}`, color: !categoryFilter ? C.accent : C.text2, fontSize: 9, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>الكل</button>
          {categories.map(cat => (
            <button key={cat} onClick={() => setCategoryFilter(cat)} style={{ padding: '4px 10px', borderRadius: 6, background: categoryFilter === cat ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.03)', border: `0.5px solid ${categoryFilter === cat ? 'rgba(0,212,255,0.25)' : 'rgba(255,255,255,0.04)'}`, color: categoryFilter === cat ? C.accent : C.text2, fontSize: 9, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>{cat}</button>
          ))}
        </div>
      </div>

      {/* Endpoints */}
      <div className="m-section">
        <div className="m-section__title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <BookOpen size={14} color={C.accent} />
          نقاط النهاية
        </div>
      </div>

      {filtered.map((ep) => {
        const mc = METHOD_COLORS[ep.method]
        const isExpanded = expandedEndpoint === ep.path
        return (
          <IOSCard key={ep.path} onClick={() => setExpandedEndpoint(isExpanded ? null : ep.path)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ padding: '2px 8px', borderRadius: 4, background: `${mc}12`, border: `0.5px solid ${mc}25`, fontSize: 9, fontWeight: 900, color: mc, fontFamily: "'JetBrains Mono', monospace" }}>{ep.method}</span>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono', monospace", direction: 'ltr' }}>{ep.path}</div>
                  <div style={{ fontSize: 9, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{ep.description}</div>
                </div>
              </div>
              {isExpanded ? <ChevronUp size={12} color={C.text2} /> : <ChevronDown size={12} color={C.text2} />}
            </div>
            {isExpanded && (
              <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.2)', direction: 'ltr' }}>
                <div style={{ fontSize: 8, color: C.text2, fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 }}>
                  {ep.method} {ep.path}
                </div>
                <div style={{ fontSize: 8, color: C.text2, fontFamily: "'JetBrains Mono', monospace" }}>
                  Content-Type: application/json
                </div>
                {ep.method === 'GET' && (
                  <div style={{ fontSize: 8, color: C.accent, fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>
                    Example: curl {ep.path}
                  </div>
                )}
              </div>
            )}
          </IOSCard>
        )
      })}

      {/* SDK Examples */}
      <div className="m-section" style={{ marginTop: 16 }}>
        <div className="m-section__title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Code size={14} color={C.accent} />
          أمثلة SDK
        </div>
      </div>

      {SDK_EXAMPLES.map((example, i) => (
        <IOSCard key={i}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>{example.title}</span>
            <button onClick={() => copyCode(example.code, `ex-${i}`)} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, cursor: 'pointer' }}>
              {copiedCode === `ex-${i}` ? <Check size={10} color={C.success} /> : <Copy size={10} color={C.text2} />}
              <span style={{ fontSize: 8, fontWeight: 700, color: copiedCode === `ex-${i}` ? C.success : C.text2, fontFamily: "'Cairo', sans-serif" }}>{copiedCode === `ex-${i}` ? 'تم' : 'نسخ'}</span>
            </button>
          </div>
          <pre style={{ margin: 0, padding: '8px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.3)', direction: 'ltr', overflowX: 'auto', fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: C.text, lineHeight: 1.6 }}>
            {example.code}
          </pre>
        </IOSCard>
      ))}

      {/* Rate Limits */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Shield size={14} color={C.amber} />
          <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>حدود الاستخدام</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <div style={{ padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
            <span style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>الطلبات/دقيقة</span>
            <div style={{ fontSize: 14, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>60</div>
          </div>
          <div style={{ padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
            <span style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>AI/ساعة</span>
            <div style={{ fontSize: 14, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>30</div>
          </div>
        </div>
      </IOSCard>

      <div style={{ height: 20 }} />
    </div>
  )
}
