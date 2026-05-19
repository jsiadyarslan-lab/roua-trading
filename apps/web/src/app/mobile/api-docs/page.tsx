'use client'

import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Code, Key, Shield, BookOpen, Copy } from 'lucide-react'

const ENDPOINTS = [
  { category: 'التداول', color: '#00FFA3', endpoints: ['POST /api/trading/orders', 'DELETE /api/trading/orders/:id', 'GET /api/trading/positions'] },
  { category: 'البيانات', color: '#00D4FF', endpoints: ['GET /api/exchange/history/:symbol', 'GET /api/market/quotes', 'GET /api/ai/consensus'] },
  { category: 'الحساب', color: '#B388FF', endpoints: ['GET /api/portfolio/credentials', 'GET /api/portfolio/account', 'POST /api/portfolio/credentials'] },
]

const CODE_EXAMPLE = `const res = await fetch(
  '/api/trading/orders',
  {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_KEY',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      symbol: 'BTC/USD',
      side: 'BUY',
      quantity: 0.01,
      type: 'MARKET'
    })
  }
);`

export default function MobileApiDocsPage() {
  return (
    <div className="m-page">
      <MobilePageHeader title="API" subtitle="المرجع البرمجي" />

      {/* API Key Info */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,212,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Key size={18} color="#00D4FF" /></div>
          <div><div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>مفتاح API</div><div style={{ fontSize: 10, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>مطلوب لجميع الطلبات</div></div>
        </div>
        <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.3)', border: '0.5px solid rgba(255,255,255,0.06)', direction: 'ltr', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <code style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'JetBrains Mono', monospace" }}>roua_sk_••••••••••••abcd</code>
          <button style={{ padding: '4px 8px', borderRadius: 6, background: 'rgba(0,212,255,0.1)', border: 'none', color: '#00D4FF', fontSize: 9, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, touchAction: 'manipulation' }}><Copy size={10} />نسخ</button>
        </div>
      </IOSCard>

      {/* Endpoints */}
      {ENDPOINTS.map(cat => (
        <IOSCard key={cat.category}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: 3, background: cat.color }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>{cat.category}</span>
          </div>
          {cat.endpoints.map(ep => (
            <div key={ep} style={{ padding: '6px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)', direction: 'ltr' }}>
              <code style={{ fontSize: 10, color: ep.startsWith('GET') ? '#00D4FF' : ep.startsWith('POST') ? '#00FFA3' : '#FF453A', fontFamily: "'JetBrains Mono', monospace" }}>{ep}</code>
            </div>
          ))}
        </IOSCard>
      ))}

      {/* Code Example */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><Code size={16} color="#00D4FF" /><span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>مثال: إنشاء أمر</span></div>
        <pre style={{ background: 'rgba(0,0,0,0.4)', padding: 10, borderRadius: 8, overflowX: 'auto', direction: 'ltr', margin: 0, border: '0.5px solid rgba(255,255,255,0.06)' }}>
          <code style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.6, whiteSpace: 'pre' }}>{CODE_EXAMPLE}</code>
        </pre>
      </IOSCard>

      {/* Docs Link */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BookOpen size={20} color="#d4af37" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>التوثيق الكامل</div>
            <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>أمثلة مفصلة ودليل شامل</div>
          </div>
        </div>
      </IOSCard>
      <div style={{ height: 16 }} />
    </div>
  )
}
