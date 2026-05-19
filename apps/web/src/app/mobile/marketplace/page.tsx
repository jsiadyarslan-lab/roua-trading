'use client'

import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Store, Star, Download, Users, Zap, Tag } from 'lucide-react'

const MOCK_ITEMS = [
  { id: 1, name: 'اختراق الزخم المحسن', author: 'أحمد التداولي', price: 'مجاني', rating: 4.7, downloads: 1234, type: 'استراتيجية', color: '#B388FF' },
  { id: 2, name: 'شبكة DCA الذكية', author: 'فريق رؤى', price: '$9.99', rating: 4.9, downloads: 2341, type: 'استراتيجية', color: '#00FFA3', isNew: true },
  { id: 3, name: 'قالب التداول اليومي', author: 'سارة المستثمرة', price: 'مجاني', rating: 4.3, downloads: 567, type: 'قالب', color: '#00D4FF' },
  { id: 4, name: 'مؤشر VWAP مخصص', author: 'خالد المحلل', price: '$4.99', rating: 4.5, downloads: 890, type: 'مؤشر', color: '#FFB800' },
]

export default function MobileMarketplacePage() {
  return (
    <div className="m-page">
      <MobilePageHeader title="المتجر" subtitle="استراتيجيات وقوالب ومؤشرات" />

      {/* Featured */}
      <IOSCard highlight>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #00FFA3, #00D4FF)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Store size={22} color="#000" /></div>
          <div><div style={{ fontSize: 15, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>مميز هذا الأسبوع</div><div style={{ fontSize: 10, color: '#00D4FF', fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>شبكة DCA الذكية — الأكثر مبيعاً</div></div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Star size={10} color="#FFB800" /><span style={{ fontSize: 10, fontWeight: 800, color: '#FFB800', fontFamily: "'JetBrains Mono', monospace" }}>4.9</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Download size={10} color="#8B92A8" /><span style={{ fontSize: 10, color: '#8B92A8', fontFamily: "'JetBrains Mono', monospace" }}>2,341</span></div>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#00FFA3', fontFamily: "'JetBrains Mono', monospace" }}>$9.99</span>
        </div>
      </IOSCard>

      {/* Items */}
      {MOCK_ITEMS.map(item => (
        <IOSCard key={item.id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: `${item.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `0.5px solid ${item.color}30`, position: 'relative' }}>
              {item.isNew && <div style={{ position: 'absolute', top: -2, insetInlineEnd: -2, width: 8, height: 8, borderRadius: 4, background: item.color, boxShadow: `0 0 6px ${item.color}` }} />}
              <Zap size={18} color={item.color} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>{item.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>{item.author}</span>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: `${item.color}10`, color: item.color, fontFamily: "'Cairo', sans-serif" }}>{item.type}</span>
              </div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 900, color: item.price === 'مجاني' ? '#00FFA3' : '#FFB800', fontFamily: "'JetBrains Mono', monospace" }}>{item.price}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Star size={10} color="#FFB800" /><span style={{ fontSize: 10, fontWeight: 700, color: '#FFB800', fontFamily: "'JetBrains Mono', monospace" }}>{item.rating}</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Download size={10} color="#8B92A8" /><span style={{ fontSize: 10, color: '#8B92A8', fontFamily: "'JetBrains Mono', monospace" }}>{item.downloads.toLocaleString()}</span></div>
            </div>
            <button style={{ padding: '4px 14px', borderRadius: 8, background: item.price === 'مجاني' ? 'rgba(0,255,163,0.1)' : 'rgba(0,212,255,0.1)', border: `0.5px solid ${item.price === 'مجاني' ? 'rgba(0,255,163,0.2)' : 'rgba(0,212,255,0.2)'}`, color: item.price === 'مجاني' ? '#00FFA3' : '#00D4FF', fontSize: 10, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', touchAction: 'manipulation' }}>
              {item.price === 'مجاني' ? 'تثبيت' : 'شراء'}
            </button>
          </div>
        </IOSCard>
      ))}
      <div style={{ height: 16 }} />
    </div>
  )
}
