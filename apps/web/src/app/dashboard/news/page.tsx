import { Newspaper, Globe, Filter, ArrowUpRight } from 'lucide-react'

const T = {
  blue: '#0A84FF', cyan: '#00C8FF', green: '#00FFC6', red: '#FF4D4D', amber: '#FFB800',
  text: '#E6EBF5', text2: '#8090A8', border: 'rgba(10,132,255,0.14)',
  card: 'rgba(13,21,32,0.9)',
}

export default function NewsPage() {
  return (
    <div style={{ padding: '32px 24px', direction: 'rtl', fontFamily: "'Cairo', sans-serif" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Newspaper size={20} color={T.blue} />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text }}>الأخبار</h1>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 20,
            background: `${T.blue}18`, color: T.blue,
            fontFamily: "'JetBrains Mono', monospace",
          }}>NEWS ROOM</span>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 10px', borderRadius: 20,
            background: `${T.red}14`, border: `0.5px solid ${T.red}33`,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.red, animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: 10, color: T.red, fontFamily: "'JetBrains Mono', monospace" }}>LIVE</span>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: T.text2 }}>
          غرفة أخبار آلية — تحليل فوري لكل خبر من حيث الأثر على محفظتك
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { icon: Globe,  label: '+50 مصدر خبري',      color: T.blue },
          { icon: Filter, label: 'فلترة بالأصول',       color: T.green },
          { icon: Newspaper, label: 'تحليل AI للأخبار', color: T.amber },
        ].map((f, i) => (
          <div key={i} style={{
            background: T.card, border: `0.5px solid ${T.border}`,
            borderRadius: 14, padding: '20px', textAlign: 'center',
          }}>
            <f.icon size={28} color={f.color} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{f.label}</div>
          </div>
        ))}
      </div>

      <div style={{
        background: T.card, border: `0.5px solid ${T.border}`,
        borderRadius: 20, padding: '60px 40px', textAlign: 'center',
      }}>
        <Newspaper size={36} color={T.blue} style={{ marginBottom: 16 }} />
        <h2 style={{ color: T.text, fontSize: 18, fontWeight: 800, margin: '0 0 10px' }}>
          غرفة الأخبار الآلية
        </h2>
        <p style={{ color: T.text2, fontSize: 13, lineHeight: 1.8, maxWidth: 420, marginInline: 'auto', margin: '0 0 20px' }}>
          تيار أخباري حي مدمج مع تحليل AI — كل خبر يُقيَّم فورياً لتأثيره
          على أصولك وأسواقك المتابَعة.
        </p>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 20px', borderRadius: 20,
          background: `${T.blue}18`, border: `0.5px solid ${T.blue}44`,
          color: T.blue, fontSize: 12, fontWeight: 700,
        }}>
          <ArrowUpRight size={13} />قريباً جداً
        </div>
      </div>
    </div>
  )
}
