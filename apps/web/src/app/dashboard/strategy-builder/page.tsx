'use client'

import { Play, Plus, Settings2, Shield, Activity, GitBranch, Save } from 'lucide-react'

const T = {
  blue: '#0A84FF', green: '#00FFC6', amber: '#FFB800', cyan: '#00C8FF', purple: '#B388FF',
  text: '#E6EBF5', text2: '#8090A8', border: 'rgba(10,132,255,0.14)',
  card: 'rgba(13,21,32,0.9)', surface: 'rgba(255,255,255,0.03)'
}

export default function StrategyBuilderPage() {
  return (
    <div className="custom-scrollbar" style={{ padding: '32px 24px', direction: 'rtl', fontFamily: "'Cairo', sans-serif", height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <GitBranch size={20} color={T.cyan} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text }}>محرر الاستراتيجيات البصري</h1>
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 20,
              background: `${T.cyan}18`, color: T.cyan,
              fontFamily: "'JetBrains Mono', monospace",
            }}>NO-CODE BUILDER</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: T.text2 }}>
            صمم خوارزميات التداول الخاصة بك باستخدام واجهة السحب والإفلات بدون كتابة سطر كود واحد.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn-cyan-active" style={{ background: T.surface, color: T.text, padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Save size={16} /> حفظ المسودة
          </button>
          <button className="btn-cyan-active" style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Play size={16} /> اختبار (Backtest)
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, height: 'calc(100vh - 160px)' }}>
        {/* Left Toolbar - Nodes */}
        <div style={{ width: 260, background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: T.text, margin: 0 }}>المكونات (Nodes)</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: T.text2, fontWeight: 700, marginTop: 8 }}>شروط (Conditions)</div>
            <div style={{ padding: 12, background: `${T.blue}15`, border: `1px solid ${T.blue}40`, borderRadius: 8, color: T.blue, fontSize: 12, fontWeight: 700, cursor: 'grab', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={14} /> تقاطع مؤشرات (Crossover)
            </div>
            <div style={{ padding: 12, background: `${T.blue}15`, border: `1px solid ${T.blue}40`, borderRadius: 8, color: T.blue, fontSize: 12, fontWeight: 700, cursor: 'grab', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={14} /> مستوى سعري (Price Level)
            </div>

            <div style={{ fontSize: 11, color: T.text2, fontWeight: 700, marginTop: 8 }}>إجراءات (Actions)</div>
            <div style={{ padding: 12, background: `${T.green}15`, border: `1px solid ${T.green}40`, borderRadius: 8, color: T.green, fontSize: 12, fontWeight: 700, cursor: 'grab', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Plus size={14} /> شراء (Buy Market)
            </div>
            <div style={{ padding: 12, background: `${T.amber}15`, border: `1px solid ${T.amber}40`, borderRadius: 8, color: T.amber, fontSize: 12, fontWeight: 700, cursor: 'grab', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Plus size={14} /> بيع (Sell Market)
            </div>

            <div style={{ fontSize: 11, color: T.text2, fontWeight: 700, marginTop: 8 }}>إدارة مخاطر (Risk)</div>
            <div style={{ padding: 12, background: `${T.purple}15`, border: `1px solid ${T.purple}40`, borderRadius: 8, color: T.purple, fontSize: 12, fontWeight: 700, cursor: 'grab', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={14} /> إيقاف خسارة (Stop Loss)
            </div>
            <div style={{ padding: 12, background: `${T.purple}15`, border: `1px solid ${T.purple}40`, borderRadius: 8, color: T.purple, fontSize: 12, fontWeight: 700, cursor: 'grab', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={14} /> جني أرباح (Take Profit)
            </div>
          </div>
        </div>

        {/* Canvas Area (Mock) */}
        <div style={{ flex: 1, background: '#02040a', border: `1px solid ${T.border}`, borderRadius: 16, position: 'relative', overflow: 'hidden' }}>
          {/* Grid Background */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundImage: `radial-gradient(${T.border} 1px, transparent 1px)`,
            backgroundSize: '24px 24px', opacity: 0.5
          }} />

          {/* Canvas placeholder node */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
            <Settings2 size={48} color={T.border} style={{ marginBottom: 16 }} />
            <div style={{ color: T.text2, fontSize: 14, fontWeight: 700 }}>
              اسحب المكونات هنا لبناء استراتيجيتك
            </div>
            <div style={{ color: T.text2, fontSize: 12, marginTop: 8 }}>
              قريباً سيتم دعم ربط العقد بصرياً
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
