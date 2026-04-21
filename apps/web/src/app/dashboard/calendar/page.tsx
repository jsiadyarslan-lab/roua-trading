import { CalendarDays, Clock, AlertTriangle, ArrowUpRight } from 'lucide-react'

const T = {
  blue: '#0A84FF', cyan: '#00C8FF', green: '#00FFC6', red: '#FF4D4D', amber: '#FFB800',
  text: '#E6EBF5', text2: '#8090A8', border: 'rgba(10,132,255,0.14)',
  card: 'rgba(13,21,32,0.9)',
}

const UPCOMING = [
  { time: '15:30', event: 'مبيعات التجزئة الأمريكية',     impact: 'high',   currency: 'USD' },
  { time: '17:00', event: 'قرار الفائدة الأوروبية',        impact: 'high',   currency: 'EUR' },
  { time: '19:00', event: 'طلبات الإعانة الأسبوعية (US)',  impact: 'medium', currency: 'USD' },
  { time: 'غداً',  event: 'تضخم المملكة المتحدة CPI',     impact: 'high',   currency: 'GBP' },
  { time: 'غداً',  event: 'مؤشر تصنيع PMI الصيني',        impact: 'medium', currency: 'CNY' },
]

const impactColor = (i: string) => i === 'high' ? T.red : i === 'medium' ? T.amber : T.text2

export default function CalendarPage() {
  return (
    <div style={{ padding: '32px 24px', direction: 'rtl', fontFamily: "'Cairo', sans-serif" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <CalendarDays size={20} color={T.amber} />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text }}>الأجندة الاقتصادية</h1>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 20,
            background: `${T.amber}18`, color: T.amber,
            fontFamily: "'JetBrains Mono', monospace",
          }}>ECONOMIC CALENDAR</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: T.text2 }}>
          الأحداث الاقتصادية القادمة وتأثيرها المتوقع على الأسواق
        </p>
      </div>

      {/* Upcoming events preview */}
      <div style={{
        background: T.card, border: `0.5px solid ${T.border}`,
        borderRadius: 16, overflow: 'hidden', marginBottom: 20,
      }}>
        <div style={{
          padding: '12px 18px', borderBottom: `0.5px solid ${T.border}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Clock size={13} color={T.amber} />
          <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>الأحداث القادمة اليوم</span>
        </div>
        {UPCOMING.map((e, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '12px 18px',
            borderBottom: i < UPCOMING.length - 1 ? `0.5px solid ${T.border}` : 'none',
          }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
              color: T.text2, minWidth: 45,
            }}>{e.time}</span>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: impactColor(e.impact),
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 13, color: T.text, flex: 1 }}>{e.event}</span>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
              color: impactColor(e.impact), padding: '2px 8px',
              borderRadius: 10, background: `${impactColor(e.impact)}14`,
              border: `0.5px solid ${impactColor(e.impact)}33`,
            }}>{e.currency}</span>
          </div>
        ))}
      </div>

      <div style={{
        background: T.card, border: `0.5px solid ${T.border}`,
        borderRadius: 20, padding: '40px 40px', textAlign: 'center',
      }}>
        <AlertTriangle size={28} color={T.amber} style={{ marginBottom: 12 }} />
        <h2 style={{ color: T.text, fontSize: 16, fontWeight: 800, margin: '0 0 8px' }}>
          تكامل الأجندة الكامل قيد البناء
        </h2>
        <p style={{ color: T.text2, fontSize: 12, lineHeight: 1.8, maxWidth: 380, marginInline: 'auto', margin: '0 0 16px' }}>
          سيتضمن تنبيهات قبل الأحداث، تحليل AI للتأثير المتوقع، وربط مباشر مع اقتراحات التداول.
        </p>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 20px', borderRadius: 20,
          background: `${T.amber}18`, border: `0.5px solid ${T.amber}44`,
          color: T.amber, fontSize: 12, fontWeight: 700,
        }}>
          <ArrowUpRight size={13} />قريباً جداً
        </div>
      </div>
    </div>
  )
}
