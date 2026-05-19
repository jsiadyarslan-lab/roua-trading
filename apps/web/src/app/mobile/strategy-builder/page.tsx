'use client'

import { useState } from 'react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { GitMerge, Zap, Target, ShieldAlert, TrendingUp, Plus, Play } from 'lucide-react'

const MOCK_TEMPLATES = [
  { id: 1, name: 'اختراق الزخم', blocks: 4, description: 'شراء عند اختراق المقاومة مع تأكيد الحجم', color: '#B388FF' },
  { id: 2, name: 'عودة للمتوسط', blocks: 5, description: 'بيع عند الانحراف عن المتوسط مع RSI', color: '#00D4FF' },
  { id: 3, name: 'شبكة DCA', blocks: 3, description: 'شراء تدريجي عند الهبوط مع متوسط التكلفة', color: '#00FFA3' },
]

const BLOCK_TYPES = [
  { type: 'شرط', icon: Target, color: '#00D4FF', examples: ['السعر > المتوسط المتحرك 50', 'RSI < 30', 'الحجم > المتوسط'] },
  { type: 'إجراء', icon: Zap, color: '#00FFA3', examples: ['شراء 0.01 لوت', 'بيع الكمية كلها', 'تحريك وقف الخسارة'] },
  { type: 'حماية', icon: ShieldAlert, color: '#FF453A', examples: ['وقف خسارة عند -2%', 'جني أرباح عند +5%', 'حد يومي -$100'] },
]

export default function MobileStrategyBuilderPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)

  return (
    <div className="m-page">
      <MobilePageHeader title="محرر الاستراتيجيات" subtitle="No-Code Strategy Builder" />

      {/* Building Blocks */}
      <IOSCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><GitMerge size={16} color="#B388FF" /><span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>لبنات البناء</span></div>
        <div style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", lineHeight: 1.5, marginBottom: 10 }}>ابنِ استراتيجيتك بترتيب الشروط والإجراءات والحماية بدون كتابة كود.</div>
        {BLOCK_TYPES.map(block => {
          const Icon = block.icon
          return (
            <div key={block.type} style={{ padding: '8px 10px', borderRadius: 10, background: `${block.color}06`, border: `0.5px solid ${block.color}18`, marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}><Icon size={14} color={block.color} /><span style={{ fontSize: 12, fontWeight: 800, color: block.color, fontFamily: "'Cairo', sans-serif" }}>{block.type}</span></div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {block.examples.map(ex => (
                  <span key={ex} style={{ fontSize: 8, padding: '2px 6px', borderRadius: 4, background: `${block.color}10`, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", border: `0.5px solid ${block.color}15` }}>{ex}</span>
                ))}
              </div>
            </div>
          )
        })}
      </IOSCard>

      {/* Templates */}
      <div style={{ padding: '0 16px', marginBottom: 6, marginTop: 6 }}><span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>قوالب جاهزة</span></div>
      {MOCK_TEMPLATES.map(t => (
        <IOSCard key={t.id} onClick={() => setSelectedTemplate(selectedTemplate === t.name ? null : t.name)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: selectedTemplate === t.name ? 8 : 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${t.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `0.5px solid ${t.color}30` }}><TrendingUp size={18} color={t.color} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>{t.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}><span style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>{t.blocks} لبنات</span><span style={{ fontSize: 9, color: '#8B92A8' }}>•</span><span style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>{t.description}</span></div>
            </div>
          </div>
          {selectedTemplate === t.name && (
            <button style={{ width: '100%', padding: '8px 0', borderRadius: 8, background: `${t.color}15`, border: `0.5px solid ${t.color}30`, color: t.color, fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Play size={12} />استخدام هذا القالب</button>
          )}
        </IOSCard>
      ))}

      {/* Create New */}
      <div style={{ padding: '0 16px', marginTop: 6 }}>
        <IOSCard>
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <Plus size={28} color="#B388FF" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>إنشاء استراتيجية جديدة</div>
            <div style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", marginBottom: 10 }}>ابدأ من الصفر مع المحرر البصري</div>
            <button style={{ padding: '8px 20px', borderRadius: 10, background: 'linear-gradient(135deg, #B388FF, #00D4FF)', border: 'none', color: '#000', fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', touchAction: 'manipulation' }}>ابدأ الآن</button>
          </div>
        </IOSCard>
      </div>
      <div style={{ height: 16 }} />
    </div>
  )
}
