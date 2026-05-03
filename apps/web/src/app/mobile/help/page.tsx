'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  ChevronLeft, HelpCircle, MessageSquare, Send, BookOpen,
  ExternalLink, ChevronDown, ChevronUp, Mail, Phone,
  Info, Shield, FileText, Loader2, CheckCircle
} from 'lucide-react'

/* ─── Design Tokens ─── */
const c = {
  accent: '#00D4FF',
  success: '#32D74B',
  danger: '#FF453A',
  amber: '#FFB800',
  text: '#F0F2F5',
  text2: 'rgba(235,235,245,0.5)',
  bg: '#1C1C1E',
  border: 'rgba(255,255,255,0.08)',
}

/* ─── FAQ Data ─── */
const FAQS = [
  {
    q: 'كيف أربط حساب التداول الخاص بي؟',
    a: 'انتقل إلى صفحة "ربط الحسابات" من القائمة، اختر المنصة المطلوبة (مثل Binance أو Alpaca)، أدخل مفتاح API والمفتاح السري الخاص بك. مفاتيحك مشفرة بالكامل ولا نحتفظ بالمفاتيح السرية على خوادمنا.',
  },
  {
    q: 'هل منصتكم آمنة؟',
    a: 'نعم، نستخدم تشفير AES-256 لحماية البيانات، ومصادقة ثنائية (2FA)، ولا نحتفظ بأموالك أبداً. نحن نقرأ فقط بيانات السوق وننفذ الصفقات عبر API الخاص بك.',
  },
  {
    q: 'ما هي خطط الاشتراك المتاحة؟',
    a: 'نوفر 4 خطط: مجاني (3 إشارات يومياً)، محترف ($29/شهر - إشارات غير محدودة + بوت آلي)، بلس ($79/شهر - تداول اجتماعي)، وبريميوم ($149/شهر - مجلس AI حصري + مدير حساب).',
  },
  {
    q: 'كيف تعمل الاستراتيجيات الآلية؟',
    a: 'استراتيجياتنا مدعومة بالذكاء الاصطناعي وتحلل السوق على مدار الساعة. عند تفعيل استراتيجية، يقوم البوت بتنفيذ الصفقات تلقائياً حسب المعايير المحددة. يمكنك إيقافها في أي وقت.',
  },
  {
    q: 'هل يمكنني سحب أموالي من المنصة؟',
    a: 'رؤى لا تحتفظ بأموالك أبداً. أموالك تبقى في حسابك على المنصة المربوطة (مثل Binance). نحن نوفر فقط أدوات التحليل والتنفيذ عبر API.',
  },
]

/* ─── iOS Card ─── */
function IOSCard({ children, highlight = false }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{
        background: highlight
          ? 'linear-gradient(165deg, rgba(35,35,45,0.9) 0%, rgba(20,20,25,0.9) 100%)'
          : 'rgba(28,28,30,0.65)',
        backdropFilter: 'blur(40px) saturate(190%)',
        WebkitBackdropFilter: 'blur(40px) saturate(190%)',
        borderRadius: 28,
        padding: 20,
        margin: '0 20px 16px',
        border: '0.5px solid rgba(255,255,255,0.1)',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: highlight
          ? '0 12px 32px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.08)'
          : '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.05)',
      }}
    >
      {highlight && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
          background: `linear-gradient(90deg, transparent, ${c.accent}66, transparent)`,
          zIndex: 10,
        }} />
      )}
      {children}
    </motion.div>
  )
}

/* ─── FAQ Item ─── */
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{
      borderBottom: `0.5px solid ${c.border}`,
      padding: '14px 0',
    }}>
      <motion.button
        whileTap={{ scale: 0.99 }}
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'right',
        }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: `${c.accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <HelpCircle size={14} color={c.accent} />
        </div>
        <p style={{ flex: 1, fontSize: 13, fontWeight: 700, color: c.text, fontFamily: "'Cairo', sans-serif", textAlign: 'start' }}>{q}</p>
        {open ? <ChevronUp size={16} color={c.text2} /> : <ChevronDown size={16} color={c.text2} />}
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <p style={{
              fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif",
              lineHeight: 1.8, marginTop: 10, paddingInlineEnd: 38,
            }}>
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Main Page ─── */
export default function HelpPage() {
  const router = useRouter()
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSend = () => {
    if (!subject || !message) return
    setSending(true)
    setTimeout(() => {
      setSending(false)
      setSent(true)
      setSubject('')
      setMessage('')
      setTimeout(() => setSent(false), 3000)
    }, 1500)
  }

  const quickLinks = [
    { label: 'دليل البدء السريع', icon: BookOpen, color: c.accent },
    { label: 'توثيق API', icon: FileText, color: c.success },
    { label: 'سياسة الخصوصية', icon: Shield, color: c.amber },
    { label: 'شروط الاستخدام', icon: FileText, color: c.text2 },
  ]

  return (
    <div style={{ minHeight: '100%', background: '#000', direction: 'rtl', paddingBottom: 20, overflowX: 'hidden', width: '100%', maxWidth: '100vw' }}>

      {/* ── Header ── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top) + 16px) 20px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'linear-gradient(180deg, rgba(255,184,0,0.06), transparent)',
      }}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => router.back()}
          style={{
            width: 40, height: 40, borderRadius: 14,
            background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `0.5px solid ${c.border}`,
          }}
        >
          <ChevronLeft size={20} color={c.text} />
        </motion.button>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif", flex: 1 }}>المساعدة والدعم</h1>
      </div>

      {/* ── Quick Links ── */}
      <div style={{ display: 'flex', gap: 10, margin: '0 20px 16px', overflowX: 'auto', direction: 'rtl' }}>
        {quickLinks.map((link, i) => {
          const LinkIcon = link.icon
          return (
            <motion.button
              key={i}
              whileTap={{ scale: 0.95 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 16,
                background: `${link.color}08`, border: `0.5px solid ${link.color}20`,
                whiteSpace: 'nowrap', cursor: 'pointer',
              }}
            >
              <LinkIcon size={14} color={link.color} />
              <span style={{ fontSize: 11, fontWeight: 700, color: link.color, fontFamily: "'Cairo', sans-serif" }}>{link.label}</span>
              <ExternalLink size={10} color={link.color} style={{ opacity: 0.5 }} />
            </motion.button>
          )
        })}
      </div>

      {/* ── FAQ ── */}
      <div style={{ padding: '0 20px', marginBottom: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>الأسئلة الشائعة</h2>
      </div>

      <IOSCard>
        {FAQS.map((faq, i) => (
          <FAQItem key={i} q={faq.q} a={faq.a} />
        ))}
      </IOSCard>

      {/* ── Contact Support Form ── */}
      <div style={{ padding: '0 20px', marginBottom: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: c.text, fontFamily: "'Cairo', sans-serif" }}>تواصل مع الدعم</h2>
      </div>

      <IOSCard>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700, display: 'block', marginBottom: 6 }}>الموضوع</label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="مثال: مشكلة في ربط حساب Binance"
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 14,
                background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${c.border}`,
                color: c.text, fontSize: 13, fontFamily: "'Cairo', sans-serif",
                outline: 'none', direction: 'rtl',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: c.text2, fontFamily: "'Cairo', sans-serif", fontWeight: 700, display: 'block', marginBottom: 6 }}>الرسالة</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="اكتب رسالتك هنا..."
              rows={4}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 14,
                background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${c.border}`,
                color: c.text, fontSize: 13, fontFamily: "'Cairo', sans-serif",
                outline: 'none', direction: 'rtl', resize: 'none',
              }}
            />
          </div>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSend}
            disabled={!subject || !message || sending}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 16,
              background: (!subject || !message) ? 'rgba(255,255,255,0.05)' : c.accent,
              color: (!subject || !message) ? c.text2 : '#000',
              fontSize: 14, fontWeight: 800, fontFamily: "'Cairo', sans-serif",
              border: 'none', cursor: (!subject || !message) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {sending ? (
              <><Loader2 size={16} className="animate-spin" /> جاري الإرسال...</>
            ) : sent ? (
              <><CheckCircle size={16} /> تم الإرسال بنجاح!</>
            ) : (
              <><Send size={16} /> إرسال الرسالة</>
            )}
          </motion.button>
        </div>
      </IOSCard>

      {/* ── App Version ── */}
      <div style={{ textAlign: 'center', padding: '20px 0 0', margin: '0 20px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '10px 20px', borderRadius: 14,
          background: 'rgba(255,255,255,0.03)', border: `0.5px solid ${c.border}`,
        }}>
          <Info size={14} color={c.text2} />
          <span style={{ fontSize: 11, color: c.text2, fontFamily: "'Cairo', sans-serif" }}>
            رؤى للتداول — الإصدار 2.1.0
          </span>
        </div>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: "'Cairo', sans-serif", marginTop: 8 }}>
          © 2026 Roua Trading. جميع الحقوق محفوظة.
        </p>
      </div>

    </div>
  )
}
