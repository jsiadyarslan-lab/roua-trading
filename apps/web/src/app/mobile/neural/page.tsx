'use client'

import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Brain, Cpu, Activity, TrendingUp, TrendingDown, Zap, BarChart3 } from 'lucide-react'

const MOCK_MODELS = [
  { id: 1, name: 'Roua-GPT', type: 'لغوي', accuracy: 74, lastPred: 'صعود BTC', status: 'active', color: '#B388FF' },
  { id: 2, name: 'Neural-V7', type: 'شبكة عصبية', accuracy: 68, lastPred: 'هبوط XAU', status: 'active', color: '#00D4FF' },
  { id: 3, name: 'LSTM-Pro', type: 'متسلسل', accuracy: 71, lastPred: 'صعود ETH', status: 'training', color: '#00FFA3' },
  { id: 4, name: 'Transformer-X', type: 'انتباه', accuracy: 62, lastPred: 'محايد EUR', status: 'active', color: '#FFB800' },
]

const MOCK_EXPERIMENTS = [
  { id: 1, name: 'تحسين نموذج BTC', progress: 85, status: 'جارٍ التدريب' },
  { id: 2, name: 'اختبار استراتيجية جديدة', progress: 42, status: 'جارٍ الاختبار' },
]

export default function MobileNeuralPage() {
  return (
    <div className="m-page">
      <MobilePageHeader title="AI Lab" subtitle="مختبر الذكاء الاصطناعي" />

      {/* Lab Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '0 16px', marginBottom: 10 }}>
        <IOSCard noMargin><div style={{ textAlign: 'center' }}><Cpu size={14} color="#B388FF" style={{ margin: '0 auto 3px' }} /><div style={{ fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>4</div><div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>نماذج نشطة</div></div></IOSCard>
        <IOSCard noMargin><div style={{ textAlign: 'center' }}><Activity size={14} color="#00FFA3" style={{ margin: '0 auto 3px' }} /><div style={{ fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>71%</div><div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>متوسط الدقة</div></div></IOSCard>
        <IOSCard noMargin><div style={{ textAlign: 'center' }}><Zap size={14} color="#FFB800" style={{ margin: '0 auto 3px' }} /><div style={{ fontSize: 16, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>2</div><div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>تجارب جارية</div></div></IOSCard>
      </div>

      {/* Models */}
      <div style={{ padding: '0 16px', marginBottom: 6 }}><span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>النماذج</span></div>
      {MOCK_MODELS.map(model => (
        <IOSCard key={model.id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${model.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `0.5px solid ${model.color}30` }}><Brain size={18} color={model.color} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>{model.name}</div>
              <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>{model.type}</div>
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: model.status === 'active' ? 'rgba(0,255,163,0.08)' : 'rgba(255,184,0,0.08)', color: model.status === 'active' ? '#00FFA3' : '#FFB800', fontFamily: "'Cairo', sans-serif" }}>{model.status === 'active' ? 'نشط' : 'يتدرب'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>آخر توقع: <span style={{ color: '#FFF', fontWeight: 700 }}>{model.lastPred}</span></span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ fontSize: 9, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>الدقة</span><span style={{ fontSize: 12, fontWeight: 900, color: model.accuracy >= 70 ? '#00FFA3' : '#FFB800', fontFamily: "'JetBrains Mono', monospace" }}>{model.accuracy}%</span></div>
          </div>
        </IOSCard>
      ))}

      {/* Experiments */}
      <div style={{ padding: '0 16px', marginBottom: 6, marginTop: 6 }}><span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>التجارب الجارية</span></div>
      {MOCK_EXPERIMENTS.map(exp => (
        <IOSCard key={exp.id}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>{exp.name}</span>
            <span style={{ fontSize: 9, color: '#FFB800', fontFamily: "'Cairo', sans-serif" }}>{exp.status}</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', direction: 'ltr' }}><div style={{ height: 4, borderRadius: 2, background: 'linear-gradient(90deg, #B388FF, #00D4FF)', width: `${exp.progress}%`, transition: 'width 0.3s' }} /></div>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#8B92A8', fontFamily: "'JetBrains Mono', monospace", marginTop: 2, textAlign: 'left', direction: 'ltr' }}>{exp.progress}%</div>
        </IOSCard>
      ))}
      <div style={{ height: 16 }} />
    </div>
  )
}
