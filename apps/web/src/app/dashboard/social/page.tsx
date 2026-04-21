import { Users, MessageCircle, ThumbsUp, ArrowUpRight } from 'lucide-react'

const T = {
  blue: '#0A84FF', cyan: '#00C8FF', green: '#00FFC6', amber: '#FFB800',
  text: '#E6EBF5', text2: '#8090A8', border: 'rgba(10,132,255,0.14)',
  card: 'rgba(13,21,32,0.9)',
}

export default function SocialPage() {
  return (
    <div style={{ padding: '32px 24px', direction: 'rtl', fontFamily: "'Cairo', sans-serif" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Users size={20} color={T.cyan} />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text }}>التداول الاجتماعي</h1>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 20,
            background: `${T.cyan}18`, color: T.cyan,
            fontFamily: "'JetBrains Mono', monospace",
          }}>SOCIAL TRADING</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: T.text2 }}>
          تواصل مع مجتمع المتداولين العرب، شارك التحليلات، وتعلم من الخبراء
        </p>
      </div>

      <div style={{
        background: T.card, border: `0.5px solid ${T.border}`,
        borderRadius: 20, padding: '60px 40px', textAlign: 'center',
      }}>
        <Users size={36} color={T.cyan} style={{ marginBottom: 16 }} />
        <h2 style={{ color: T.text, fontSize: 18, fontWeight: 800, margin: '0 0 10px' }}>
          منصة التداول الاجتماعي
        </h2>
        <p style={{ color: T.text2, fontSize: 13, lineHeight: 1.8, maxWidth: 420, marginInline: 'auto', margin: '0 0 20px' }}>
          أول منصة تداول اجتماعي عربية — شارك تحليلاتك، ناقش السوق،
          وابني سمعتك كمتداول محترف.
        </p>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 20px', borderRadius: 20,
          background: `${T.cyan}18`, border: `0.5px solid ${T.cyan}44`,
          color: T.cyan, fontSize: 12, fontWeight: 700,
        }}>
          <ArrowUpRight size={13} />قريباً جداً
        </div>
      </div>
    </div>
  )
}
