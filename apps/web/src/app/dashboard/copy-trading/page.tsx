import { Copy, Shield, Star, TrendingUp, ArrowUpRight, Activity } from 'lucide-react'

const T = {
  blue: '#0A84FF', green: '#00FFC6', amber: '#FFB800', cyan: '#00C8FF',
  text: '#E6EBF5', text2: '#8090A8', border: 'rgba(10,132,255,0.14)',
  card: 'rgba(13,21,32,0.9)', surface: 'rgba(255,255,255,0.03)'
}

const TRADERS = [
  { name: 'Quantum Alpha', type: 'High Frequency', winRate: '87.5%', profit: '+1,420%', risk: 'عالي', aum: '$4.2M' },
  { name: 'Institutional Flow', type: 'Macro Swing', winRate: '72.1%', profit: '+310%', risk: 'متوسط', aum: '$12.5M' },
  { name: 'Crypto Sniper', type: 'Scalping', winRate: '91.2%', profit: '+840%', risk: 'مرتفع جداً', aum: '$1.1M' },
]

export default function CopyTradingPage() {
  return (
    <div className="custom-scrollbar" style={{ padding: '32px 24px', direction: 'rtl', fontFamily: "'Cairo', sans-serif", height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Copy size={20} color={T.green} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text }}>نسخ الصفقات (Copy Trading)</h1>
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 20,
              background: `${T.green}18`, color: T.green,
              fontFamily: "'JetBrains Mono', monospace",
            }}>BETA</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: T.text2 }}>
            تابع أفضل مدراء الصناديق وانسخ صفقاتهم تلقائياً بضوابط مخاطر مؤسسية.
          </p>
        </div>
        <button className="btn-cyan-active" style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 800 }}>
          إدارة المحفظة
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 30 }}>
        {[
          { icon: Star,        label: 'أفضل المتداولين هذا الأسبوع',  val: 'Quantum Alpha', color: T.amber },
          { icon: Shield,      label: 'إجمالي الأصول المدارة (AUM)',     val: '$18.4M', color: T.blue },
          { icon: TrendingUp,  label: 'متوسط العائد الشهري',      val: '+12.4%', color: T.green },
        ].map((f, i) => (
          <div key={i} style={{
            background: T.card, border: `0.5px solid ${T.border}`,
            borderRadius: 14, padding: '20px', display: 'flex', alignItems: 'center', gap: 16
          }}>
            <div style={{ padding: 12, borderRadius: 12, background: `${f.color}15` }}>
              <f.icon size={24} color={f.color} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.text2, marginBottom: 4 }}>{f.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{f.val}</div>
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 16 }}>الاستراتيجيات المتاحة للنسخ</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {TRADERS.map((trader, i) => (
          <div key={i} style={{
            background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 20,
            transition: 'transform 0.2s', cursor: 'pointer'
          }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-4px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Activity size={20} color={T.cyan} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{trader.name}</div>
                  <div style={{ fontSize: 11, color: T.text2 }}>{trader.type}</div>
                </div>
              </div>
              <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: 'rgba(255,184,0,0.1)', color: T.amber, fontWeight: 800 }}>
                {trader.risk}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div style={{ background: T.surface, padding: 12, borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: T.text2, marginBottom: 4 }}>معدل الربح (Win Rate)</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: T.green, fontFamily: "'JetBrains Mono', monospace" }}>{trader.winRate}</div>
              </div>
              <div style={{ background: T.surface, padding: 12, borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: T.text2, marginBottom: 4 }}>العائد (All-time)</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{trader.profit}</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 11, color: T.text2 }}>الأصول المدارة: <span style={{ color: T.text, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{trader.aum}</span></div>
              <button className="btn-cyan-active" style={{ padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                نسخ <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
