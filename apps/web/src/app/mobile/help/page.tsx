'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  HelpCircle, MessageSquare, Mail, ChevronLeft, ChevronDown,
  Send, ExternalLink, Book, Shield, CreditCard, Cpu,
  AlertCircle, Loader2, CheckCircle2,
} from 'lucide-react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'

/* ─── Design Tokens ─── */
const C = {
  accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757',
  amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8',
  bg: '#1A1D29', border: 'rgba(255,255,255,0.06)',
}
const FONT_AR = "'Cairo', sans-serif"

/* ─── FAQ Data ─── */
const FAQ_DATA = [
  {
    category: 'الأسئلة العامة',
    icon: HelpCircle,
    color: C.accent,
    items: [
      {
        q: 'ما هي منصة رؤى؟',
        a: 'رؤى هي منصة ربط حسابات تداول تتيح لك ربط حساباتك في بورصات متعددة ومتابعة محفظتك وتداولاتك من مكان واحد، مع دعم الذكاء الاصطناعي المتقدم.',
      },
      {
        q: 'هل رؤى آمنة؟',
        a: 'نعم! رؤى لا تلمس أموالك أبداً. مفاتيح API مشفرة بـ AES-256-GCM ونستخدم فقط صلاحيات القراءة. المفاتيح ذات صلاحيات السحب تُرفض فوراً.',
      },
      {
        q: 'هل يمكنني التداول مباشرة من رؤى؟',
        a: 'نعم، من خلال المنفذ الذكي والوكيل المستقل يمكنك تنفيذ صفقات على البورصات المرتبطة. يمكنك أيضاً التداول الورقي بأموال وهمية للتجربة.',
      },
    ],
  },
  {
    category: 'ربط الحسابات',
    icon: Shield,
    color: C.success,
    items: [
      {
        q: 'كيف أربط حساب البورصة؟',
        a: 'اذهب إلى صفحة ربط الحسابات، اختر البورصة، أدخل مفتاح API والمفتاح السري، ثم اضغط تحقق. سيتم تشفير المفاتيح فوراً والتحقق من صلاحيتها.',
      },
      {
        q: 'لماذا يتم رفض مفتاح API؟',
        a: 'عادةً لأن المفتاح يحتوي على صلاحيات سحب (Withdraw) أو تحويل (Transfer). رؤى تقبل فقط المفاتيح ذات صلاحيات القراءة والتداول.',
      },
      {
        q: 'هل يمكنني ربط أكثر من بورصة؟',
        a: 'نعم! يمكنك ربط عدد غير محدود من البورصات حسب خطتك. الخطة المجانية تسمح بـ 3 بورصات، والمبتدئة بـ 10، والاحترافية غير محدودة.',
      },
    ],
  },
  {
    category: 'الاشتراك والفوترة',
    icon: CreditCard,
    color: C.amber,
    items: [
      {
        q: 'كيف أغير خطتي؟',
        a: 'اذهب إلى صفحة الاشتراك والفوترة من الإعدادات. يمكنك الترقية أو التنزيل في أي وقت. التغييرات تسري فوراً مع احتساب الفرق.',
      },
      {
        q: 'هل يمكنني إلغاء الاشتراك؟',
        a: 'نعم، يمكنك إلغاء الاشتراك في أي وقت. ستستمر في استخدام الميزات حتى نهاية فترة الاشتراك الحالية.',
      },
    ],
  },
  {
    category: 'الوكيل الذكي',
    icon: Cpu,
    color: '#A259FF',
    items: [
      {
        q: 'ما هو الوكيل المستقل؟',
        a: 'الوكيل المستقل هو نظام تداول آلي يعمل بالذكاء الاصطناعي. يحلل السوق وينفذ صفقات بناءً على استراتيجية محددة مع حدود مخاطرة صارمة.',
      },
      {
        q: 'كيف أتحكم في مخاطر البوت؟',
        a: 'يمكنك ضبط حد الخسارة اليومية، الحد الأقصى للصفقات، وعدد الخسائر المتتالية المسموح. عند تجاوز أي حد، يتوقف البوت تلقائياً.',
      },
    ],
  },
]

/* ─── FAQ Accordion Item ─── */
function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{
      borderBottom: `0.5px solid ${C.border}`,
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', padding: '10px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'right',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: FONT_AR, flex: 1 }}>
          {question}
        </span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ flexShrink: 0, marginInlineStart: 8 }}
        >
          <ChevronDown size={12} color={C.text2} />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              paddingBottom: 10, fontSize: 10, color: C.text2,
              fontFamily: FONT_AR, lineHeight: 1.7,
            }}>
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Help Page ─── */
export default function MobileHelpPage() {
  const router = useRouter()

  // Contact form
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactMessage, setContactMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [contactError, setContactError] = useState('')

  const [showContactForm, setShowContactForm] = useState(false)

  /* Handle contact submit */
  const handleContactSubmit = async () => {
    if (!contactMessage.trim()) {
      setContactError('الرجاء كتابة رسالتك')
      return
    }

    setSending(true)
    setContactError('')

    try {
      // Simulate API call — replace with real endpoint
      await new Promise(resolve => setTimeout(resolve, 1500))
      setSent(true)
      setContactName('')
      setContactEmail('')
      setContactMessage('')
      setTimeout(() => {
        setSent(false)
        setShowContactForm(false)
      }, 3000)
    } catch {
      setContactError('فشل إرسال الرسالة. حاول مرة أخرى.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="m-page">
      <MobilePageHeader title="المساعدة والدعم" />

      {/* Quick Links */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 16px', marginBottom: 16 }}>
        {[
          { label: 'تواصل معنا', icon: MessageSquare, color: C.accent, action: () => setShowContactForm(!showContactForm) },
          { label: 'البريد الإلكتروني', icon: Mail, color: C.success, action: () => window.open('mailto:support@roua.trade', '_blank') },
          { label: 'مركز المساعدة', icon: Book, color: C.amber, action: () => {} },
          { label: 'تقرير مشكلة', icon: AlertCircle, color: C.danger, action: () => {} },
        ].map((item) => {
          const Icon = item.icon
          return (
            <motion.button
              key={item.label}
              whileTap={{ scale: 0.97 }}
              onClick={item.action}
              style={{
                padding: '12px 8px', borderRadius: 14,
                background: `${item.color}06`, border: `0.5px solid ${item.color}12`,
                cursor: 'pointer', textAlign: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: `${item.color}12`, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={13} color={item.color} />
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.text, fontFamily: FONT_AR }}>
                {item.label}
              </span>
            </motion.button>
          )
        })}
      </div>

      {/* Contact Form */}
      <AnimatePresence>
        {showContactForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: 'hidden', padding: '0 16px', marginBottom: 12 }}
          >
            <IOSCard noMargin>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: FONT_AR, marginBottom: 10 }}>
                أرسل لنا رسالة
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  placeholder="الاسم (اختياري)"
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${C.border}`,
                    color: C.text, fontSize: 11, fontFamily: FONT_AR,
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <input
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  placeholder="البريد الإلكتروني (اختياري)"
                  dir="ltr"
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${C.border}`,
                    color: C.text, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                    outline: 'none', direction: 'ltr', boxSizing: 'border-box',
                  }}
                />
                <textarea
                  value={contactMessage}
                  onChange={e => setContactMessage(e.target.value)}
                  placeholder="اكتب رسالتك هنا..."
                  rows={4}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${C.border}`,
                    color: C.text, fontSize: 11, fontFamily: FONT_AR,
                    outline: 'none', resize: 'none', boxSizing: 'border-box',
                  }}
                />

                {contactError && (
                  <div style={{
                    padding: '6px 10px', borderRadius: 8,
                    background: `${C.danger}08`, border: `0.5px solid ${C.danger}18`,
                    fontSize: 9, color: C.danger, fontFamily: FONT_AR,
                  }}>
                    {contactError}
                  </div>
                )}

                {sent && (
                  <div style={{
                    padding: '6px 10px', borderRadius: 8,
                    background: `${C.success}08`, border: `0.5px solid ${C.success}18`,
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 9, color: C.success, fontFamily: FONT_AR,
                  }}>
                    <CheckCircle2 size={10} />
                    تم إرسال رسالتك بنجاح!
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => { setShowContactForm(false); setContactError('') }}
                    style={{
                      flex: 1, padding: 8, borderRadius: 8,
                      background: 'rgba(255,255,255,0.03)', border: `0.5px solid ${C.border}`,
                      color: C.text2, fontSize: 10, fontWeight: 700, fontFamily: FONT_AR,
                      cursor: 'pointer',
                    }}
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={handleContactSubmit}
                    disabled={sending}
                    style={{
                      flex: 1, padding: 8, borderRadius: 8,
                      background: `linear-gradient(135deg, ${C.accent}, #00A8CC)`,
                      border: 'none', color: '#000', fontSize: 10, fontWeight: 800,
                      fontFamily: FONT_AR, cursor: sending ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    }}
                  >
                    {sending ? (
                      <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <Send size={10} />
                    )}
                    إرسال
                  </button>
                </div>
              </div>
            </IOSCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAQ Sections */}
      {FAQ_DATA.map((section) => {
        const SectionIcon = section.icon
        return (
          <div key={section.category}>
            <div className="m-section">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: `${section.color}12`, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <SectionIcon size={11} color={section.color} />
                </div>
                <span className="m-section__title" style={{ marginBottom: 0 }}>
                  {section.category}
                </span>
              </div>
            </div>

            <IOSCard>
              {section.items.map((item) => (
                <FAQItem key={item.q} question={item.q} answer={item.a} />
              ))}
            </IOSCard>
          </div>
        )
      })}

      {/* Helpful Links */}
      <div className="m-section" style={{ marginTop: 8 }}>
        <div className="m-section__title">روابط مفيدة</div>
      </div>

      <IOSCard>
        {[
          { label: 'شروط الاستخدام', href: '#' },
          { label: 'سياسة الخصوصية', href: '#' },
          { label: 'مستندات API', href: '#' },
          { label: 'حالة الخوادم', href: '#' },
        ].map((link, i) => (
          <div
            key={link.label}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 0',
              borderBottom: i < 3 ? `0.5px solid ${C.border}` : 'none',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: FONT_AR }}>
              {link.label}
            </span>
            <ExternalLink size={12} color={C.text2} />
          </div>
        ))}
      </IOSCard>

      {/* App Info */}
      <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.15)', fontFamily: FONT_AR, lineHeight: 1.8 }}>
          رؤى — منصة ربط حسابات<br />
          الإصدار 2.0.0
        </div>
      </div>

      <div style={{ height: 16 }} />
    </div>
  )
}
