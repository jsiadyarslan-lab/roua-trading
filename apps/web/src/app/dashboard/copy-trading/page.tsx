import { Copy, Shield, Star, TrendingUp, ArrowUpRight } from 'lucide-react'

const T = {
  blue: '#0A84FF', green: '#00FFC6', amber: '#FFB800', cyan: '#00C8FF',
  text: '#E6EBF5', text2: '#8090A8', border: 'rgba(10,132,255,0.14)',
  card: 'rgba(13,21,32,0.9)',
}

export default function CopyTradingPage() {
  return (
    <div style={{ padding: '32px 24px', direction: 'rtl', fontFamily: "'Cairo', sans-serif" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Copy size={20} color={T.green} />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text }}>نسخ الصفقات</h1>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 20,
            background: `${T.green}18`, color: T.green,
            fontFamily: "'JetBrains Mono', monospace",
          }}>COPY TRADING</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: T.text2 }}>
          تابع أفضل المتداولين وانسخ صفقاتهم تلقائياً بضوابط مخاطر ذكية
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { icon: Star,        label: 'أفضل المتداولين',  color: T.amber },
          { icon: Shield,      label: 'إدارة المخاطر',     color: T.blue },
          { icon: TrendingUp,  label: 'أداء المحفظة',      color: T.green },
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
        <Copy size={36} color={T.green} style={{ marginBottom: 16 }} />
        <h2 style={{ color: T.text, fontSize: 18, fontWeight: 800, margin: '0 0 10px' }}>
          نسخ الصفقات قيد البناء
        </h2>
        <p style={{ color: T.text2, fontSize: 13, lineHeight: 1.8, maxWidth: 400, marginInline: 'auto', margin: '0 0 20px' }}>
          ابحث عن متداولين محترفين ونسخ صفقاتهم بنسب تخصيص قابلة للضبط
          مع ضمان عدم الوصول إلى أموالك.
        </p>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 20px', borderRadius: 20,
          background: `${T.green}18`, border: `0.5px solid ${T.green}44`,
          color: T.green, fontSize: 12, fontWeight: 700,
        }}>
          <ArrowUpRight size={13} />قريباً جداً
        </div>
      </div>
    </div>
  )
}
