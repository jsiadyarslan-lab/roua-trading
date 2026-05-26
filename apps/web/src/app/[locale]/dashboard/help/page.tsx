'use client'

import { useState, useMemo, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import {
  HelpCircle, Search, BookOpen, Brain, ShieldCheck, TrendingUp,
  ChevronDown, Mail, MessageSquare, FileText, Send, Star,
  CheckCircle2, AlertCircle, Clock, Users, Lock, CreditCard,
  Zap, Globe, RefreshCw, ExternalLink, Sparkles, X, Link2, Bell, Eye
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { T as SharedT } from '@/lib/unified-tokens'
import { useScopedStyle } from '@/hooks/useScopedStyle'

/* ── Design Tokens (canonical + local extensions) ── */
const T = { ...SharedT, pink: '#f472b6', text4: '#475569' }

/* ── FAQ Data Types ── */
interface FAQItem {
  id: string
  question: string
  answer: string
}

interface FAQCategory {
  id: string
  title: string
  icon: React.ReactNode
  iconColor: string
  iconBg: string
  items: FAQItem[]
}

/* ── Translation function type for prop passing ── */
type TFunction = (key: string, params?: Record<string, string | number>) => string

/* ── FAQ Accordion Item ── */
function FAQAccordion({ item, isOpen, onToggle }: { item: FAQItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div style={{
      borderBottom: `1px solid ${T.border}`,
      overflow: 'hidden',
    }}>
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 0', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'right' as const,
          color: isOpen ? T.text : T.text2,
          fontSize: 13, fontWeight: isOpen ? 700 : 500,
          fontFamily: "'Cairo', sans-serif",
          transition: 'color 0.2s',
        }}
      >
        <div style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isOpen ? `${T.cyan}14` : T.surface,
          transition: 'all 0.3s',
        }}>
          <ChevronDown
            size={13}
            color={isOpen ? T.cyan : T.text4}
            style={{
              transition: 'transform 0.3s',
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </div>
        <span style={{ flex: 1, minWidth: 0 }}>{item.question}</span>
      </button>
      <div style={{
        maxHeight: isOpen ? 500 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.35s ease-in-out, opacity 0.3s',
        opacity: isOpen ? 1 : 0,
      }}>
        <div style={{
          padding: '0 34px 16px 0', fontSize: 12.5, lineHeight: 1.9,
          color: T.text3, fontFamily: "'Cairo', sans-serif",
        }}>
          {item.answer}
        </div>
      </div>
    </div>
  )
}

/* ── FAQ Category Section ── */
function FAQCategorySection({
  category,
  openItems,
  onToggleItem,
  t,
}: {
  category: FAQCategory
  openItems: Set<string>
  onToggleItem: (id: string) => void
  t: TFunction
}) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`,
      borderRadius: 16, overflow: 'hidden',
    }}>
      {/* Category Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px 20px', borderBottom: `1px solid ${T.border}`,
        background: `${category.iconBg}08`,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: category.iconBg, flexShrink: 0,
          color: category.iconColor,
        }}>
          {category.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
            {category.title}
          </div>
          <div style={{ fontSize: 10, color: T.text4, marginTop: 1, fontFamily: "'Cairo', sans-serif" }}>
            {t('faqItemsCount', { count: category.items.length })}
          </div>
        </div>
        <span style={{
          fontSize: 9, padding: '3px 8px', borderRadius: 10,
          background: `${category.iconColor}10`, color: category.iconColor,
          fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
        }}>
          {category.items.length}
        </span>
      </div>
      {/* Category Items */}
      <div style={{ padding: '0 20px' }}>
        {category.items.map(item => (
          <FAQAccordion
            key={item.id}
            item={item}
            isOpen={openItems.has(item.id)}
            onToggle={() => onToggleItem(item.id)}
          />
        ))}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   Main Help Center Page
══════════════════════════════════════════════════════ */
export default function HelpCenterPage() {
  const t = useTranslations('dashboard.help')

  useScopedStyle(`@media (max-width: 767px) {
          .help-quick-grid { grid-template-columns: 1fr !important; }
          .help-contact-grid { grid-template-columns: 1fr !important; }
          .help-content { padding: 12px !important; }
          .help-header-inner { flex-direction: column !important; align-items: flex-start !important; }
          .help-search-box { width: 100% !important; }
        }
        @media (min-width: 768px) and (max-width: 1024px) {
          .help-quick-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.2); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        @keyframes help-fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .help-fade-in { animation: help-fade-in 0.4s ease-out; }
        @keyframes help-pulse-glow {
          0%, 100% { box-shadow: 0 0 8px ${T.cyan}20; }
          50% { box-shadow: 0 0 20px ${T.cyan}40; }
        }
@keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }`)

  const [searchQuery, setSearchQuery] = useState('')
  const [openItems, setOpenItems] = useState<Set<string>>(new Set())
  const [activeContactTab, setActiveContactTab] = useState<'email' | 'chat' | 'docs'>('email')
  const [feedbackName, setFeedbackName] = useState('')
  const [feedbackEmail, setFeedbackEmail] = useState('')
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [feedbackSubject, setFeedbackSubject] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  /* ── FAQ Categories Data (inside component for t() access) ── */
  const faqCategories: FAQCategory[] = useMemo(() => [
    {
      id: 'basics',
      title: t('catBasics'),
      icon: <BookOpen size={18} />,
      iconColor: T.cyan,
      iconBg: `${T.cyan}14`,
      items: [
        { id: 'b1', question: t('faqB1Q'), answer: t('faqB1A') },
        { id: 'b2', question: t('faqB2Q'), answer: t('faqB2A') },
        { id: 'b3', question: t('faqB3Q'), answer: t('faqB3A') },
        { id: 'b4', question: t('faqB4Q'), answer: t('faqB4A') },
      ],
    },
    {
      id: 'trading',
      title: t('catTrading'),
      icon: <Link2 size={18} />,
      iconColor: T.green,
      iconBg: `${T.green}14`,
      items: [
        { id: 't1', question: t('faqT1Q'), answer: t('faqT1A') },
        { id: 't2', question: t('faqT2Q'), answer: t('faqT2A') },
        { id: 't3', question: t('faqT3Q'), answer: t('faqT3A') },
        { id: 't4', question: t('faqT4Q'), answer: t('faqT4A') },
      ],
    },
    {
      id: 'ai',
      title: t('catAi'),
      icon: <Brain size={18} />,
      iconColor: T.purple,
      iconBg: `${T.purple}14`,
      items: [
        { id: 'a1', question: t('faqA1Q'), answer: t('faqA1A') },
        { id: 'a2', question: t('faqA2Q'), answer: t('faqA2A') },
        { id: 'a3', question: t('faqA3Q'), answer: t('faqA3A') },
        { id: 'a4', question: t('faqA4Q'), answer: t('faqA4A') },
      ],
    },
    {
      id: 'security',
      title: t('catSecurity'),
      icon: <ShieldCheck size={18} />,
      iconColor: T.green,
      iconBg: `${T.green}14`,
      items: [
        { id: 's1', question: t('faqS1Q'), answer: t('faqS1A') },
        { id: 's2', question: t('faqS2Q'), answer: t('faqS2A') },
        { id: 's3', question: t('faqS3Q'), answer: t('faqS3A') },
        { id: 's4', question: t('faqS4Q'), answer: t('faqS4A') },
      ],
    },
    {
      id: 'billing',
      title: t('catBilling'),
      icon: <CreditCard size={18} />,
      iconColor: T.amber,
      iconBg: `${T.amber}14`,
      items: [
        { id: 'p1', question: t('faqP1Q'), answer: t('faqP1A') },
        { id: 'p2', question: t('faqP2Q'), answer: t('faqP2A') },
        { id: 'p3', question: t('faqP3Q'), answer: t('faqP3A') },
      ],
    },
  ], [t])

  /* ── Quick Links Data (inside component for t() access) ── */
  const quickLinks = useMemo(() => [
    {
      id: 'beginner',
      title: t('beginnerGuide'),
      description: t('beginnerGuideDesc'),
      icon: <BookOpen size={22} />,
      color: T.cyan,
      bg: `${T.cyan}14`,
    },
    {
      id: 'ai-guide',
      title: t('aiGuide'),
      description: t('aiGuideDesc'),
      icon: <Brain size={22} />,
      color: T.purple,
      bg: `${T.purple}14`,
    },
    {
      id: 'security',
      title: t('securityPolicy'),
      description: t('securityPolicyDesc'),
      icon: <ShieldCheck size={22} />,
      color: T.green,
      bg: `${T.green}14`,
    },
    {
      id: 'account-linking-guide',
      title: t('accountLinkingGuide'),
      description: t('accountLinkingGuideDesc'),
      icon: <Link2 size={22} />,
      color: T.amber,
      bg: `${T.amber}14`,
    },
  ], [t])

  /* ── Search Filtering ── */
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return faqCategories
    const q = searchQuery.trim().toLowerCase()
    return faqCategories
      .map(cat => ({
        ...cat,
        items: cat.items.filter(
          item =>
            item.question.toLowerCase().includes(q) ||
            item.answer.toLowerCase().includes(q)
        ),
      }))
      .filter(cat => cat.items.length > 0)
  }, [searchQuery, faqCategories])

  const totalResults = useMemo(
    () => filteredCategories.reduce((sum, cat) => sum + cat.items.length, 0),
    [filteredCategories]
  )

  /* ── Toggle FAQ Item ── */
  const toggleItem = useCallback((id: string) => {
    setOpenItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /* ── Submit Feedback Form ── */
  const handleSubmitFeedback = useCallback(async () => {
    if (!feedbackName.trim() || !feedbackEmail.trim() || !feedbackMessage.trim()) {
      toast({
        title: t('feedbackRequired'),
        description: t('feedbackRequiredDesc'),
        variant: 'destructive',
      })
      return
    }
    setIsSubmitting(true)
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1200))
    setIsSubmitting(false)
    toast({
      title: t('feedbackSent'),
      description: t('feedbackSentDesc'),
    })
    setFeedbackName('')
    setFeedbackEmail('')
    setFeedbackMessage('')
    setFeedbackSubject('')
  }, [feedbackName, feedbackEmail, feedbackMessage, feedbackSubject, t])

  return (
    <div
      className="custom-scrollbar"
      style={{
        direction: 'inherit',
        fontFamily: "'Cairo', sans-serif",
        height: '100%',
        overflowY: 'auto',
        background: T.bg,
      }}
    >
      {/* Scoped styles via useScopedStyle */}{/* ═══ Header ═══ */}
      <div style={{
        padding: '28px 24px 20px',
        borderBottom: `1px solid ${T.border}`,
        background: `linear-gradient(180deg, ${T.bg2}, ${T.bg})`,
      }}>
        <div className="help-header-inner" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, #00D4FF, #0A84FF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 20px ${T.cyan}30`,
            flexShrink: 0,
          }}>
            <HelpCircle size={22} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
              {t('title')}
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>
              {t('subtitle')}
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative', maxWidth: 560 }}>
          <Search
            size={16}
            color={T.text4}
            style={{
              position: 'absolute', insetInlineEnd: 14, top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchAriaLabel')}
            className="help-search-box"
            style={{
              width: '100%', background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: 12, padding: '12px 42px 12px 16px',
              color: T.text, fontFamily: "'Cairo', sans-serif", fontSize: 13,
              outline: 'none', transition: 'border-color 0.2s',
            }}
            onFocus={e => { e.target.style.borderColor = T.cyan; e.target.style.boxShadow = `0 0 0 3px ${T.cyan}15` }}
            onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none' }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label={t('clearSearch')}
              style={{
                position: 'absolute', insetInlineStart: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: T.text4, display: 'flex', alignItems: 'center',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
        {searchQuery.trim() && (
          <div style={{ marginTop: 8, fontSize: 11, color: T.text4, fontFamily: "'Cairo', sans-serif" }}>
            {totalResults > 0
              ? t('resultsFound', { count: totalResults, query: searchQuery.trim() })
              : t('noResults', { query: searchQuery.trim() })}
          </div>
        )}
      </div>

      {/* ═══ Content ═══ */}
      <div className="help-content" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>

        {/* ═══ Quick Links Grid ═══ */}
        {!searchQuery.trim() && (
          <section aria-labelledby="quick-links-heading" className="help-fade-in">
            <h2 id="quick-links-heading" style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 14, fontFamily: "'Cairo', sans-serif" }}>
              {t('quickLinks')}
            </h2>
            <div className="help-quick-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {quickLinks.map(link => (
                <button
                  key={link.id}
                  style={{
                    background: T.card, border: `1px solid ${T.border}`,
                    borderRadius: 14, padding: '20px 16px', cursor: 'pointer',
                    textAlign: 'right' as const, transition: 'all 0.25s',
                    display: 'flex', flexDirection: 'column', gap: 12,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = `${link.color}30`
                    e.currentTarget.style.background = `${link.color}06`
                    e.currentTarget.style.boxShadow = `0 0 20px ${link.color}10`
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = T.border
                    e.currentTarget.style.background = T.card
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: link.bg, color: link.color, flexShrink: 0,
                  }}>
                    {link.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>
                      {link.title}
                    </div>
                    <div style={{ fontSize: 10.5, color: T.text3, lineHeight: 1.7, fontFamily: "'Cairo', sans-serif" }}>
                      {link.description}
                    </div>
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 10, color: link.color, fontWeight: 700,
                    fontFamily: "'Cairo', sans-serif", marginTop: 'auto',
                  }}>
                    {t('readMore')}
                    <ExternalLink size={10} />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ═══ FAQ Sections ═══ */}
        <section aria-labelledby="faq-heading" className="help-fade-in">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 id="faq-heading" style={{ fontSize: 15, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif", margin: 0 }}>
              {t('faqTitle')}
            </h2>
            {!searchQuery.trim() && (
              <span style={{
                fontSize: 10, color: T.text4, fontFamily: "'JetBrains Mono', monospace",
                padding: '3px 10px', borderRadius: 10, background: T.surface,
                border: `1px solid ${T.border}`,
              }}>
                {t('faqCount', { count: faqCategories.reduce((s, c) => s + c.items.length, 0) })}
              </span>
            )}
          </div>

          {filteredCategories.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {filteredCategories.map(cat => (
                <FAQCategorySection
                  key={cat.id}
                  category={cat}
                  openItems={openItems}
                  onToggleItem={toggleItem}
                  t={t}
                />
              ))}
            </div>
          ) : (
            <div style={{
              background: T.card, border: `1px solid ${T.border}`,
              borderRadius: 16, padding: '40px 24px', textAlign: 'center',
            }}>
              <AlertCircle size={36} color={T.text4} style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text2, marginBottom: 6, fontFamily: "'Cairo', sans-serif" }}>
                {t('noFaqResults')}
              </div>
              <div style={{ fontSize: 12, color: T.text4, fontFamily: "'Cairo', sans-serif", lineHeight: 1.7 }}>
                {t('noFaqResultsDesc')}
              </div>
            </div>
          )}
        </section>

        {/* ═══ Contact & Support Section ═══ */}
        <section aria-labelledby="contact-heading" className="help-fade-in">
          <h2 id="contact-heading" style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 14, fontFamily: "'Cairo', sans-serif" }}>
            {t('contactTitle')}
          </h2>

          <div className="help-contact-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

            {/* ── Contact Methods (Tabs) ── */}
            <div style={{
              background: T.card, border: `1px solid ${T.border}`,
              borderRadius: 16, overflow: 'hidden',
            }}>
              {/* Tab Header */}
              <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}` }}>
                {[
                  { id: 'email' as const, label: t('emailTab'), icon: <Mail size={14} /> },
                  { id: 'chat' as const, label: t('chatTab'), icon: <MessageSquare size={14} /> },
                  { id: 'docs' as const, label: t('docsTab'), icon: <FileText size={14} /> },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveContactTab(tab.id)}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      gap: 6, padding: '14px 8px', border: 'none', cursor: 'pointer',
                      background: activeContactTab === tab.id ? `${T.cyan}08` : 'transparent',
                      color: activeContactTab === tab.id ? T.cyan : T.text3,
                      fontSize: 11, fontWeight: activeContactTab === tab.id ? 800 : 500,
                      fontFamily: "'Cairo', sans-serif",
                      borderBottom: activeContactTab === tab.id ? `2px solid ${T.cyan}` : '2px solid transparent',
                      transition: 'all 0.2s',
                    }}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div style={{ padding: '20px' }}>
                {activeContactTab === 'email' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: `${T.cyan}14`, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <Mail size={18} color={T.cyan} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
                          {t('emailTitle')}
                        </div>
                        <div style={{ fontSize: 11, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
                          support@roua.io
                        </div>
                      </div>
                    </div>
                    <div style={{
                      padding: '12px 14px', borderRadius: 10,
                      background: `${T.cyan}06`, border: `1px solid ${T.cyan}12`,
                      fontSize: 11, color: T.text3, lineHeight: 1.8,
                      fontFamily: "'Cairo', sans-serif",
                    }}>
                      {t('emailDesc')}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {[
                        { icon: <Clock size={11} />, text: t('emailFeature1') },
                        { icon: <Globe size={11} />, text: t('emailFeature2') },
                        { icon: <CheckCircle2 size={11} />, text: t('emailFeature3') },
                      ].map((f, i) => (
                        <span key={i} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '4px 10px', borderRadius: 6,
                          background: T.surface, border: `1px solid ${T.border}`,
                          fontSize: 10, color: T.text2, fontWeight: 600,
                          fontFamily: "'Cairo', sans-serif",
                        }}>
                          {f.icon} {f.text}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {activeContactTab === 'chat' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: `${T.green}14`, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <MessageSquare size={18} color={T.green} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
                          {t('chatTitle')}
                        </div>
                        <div style={{ fontSize: 11, color: T.green, fontFamily: "'Cairo', sans-serif", display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: 3, background: T.green, boxShadow: `0 0 6px ${T.green}60` }} />
                          {t('availableNow')}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      padding: '12px 14px', borderRadius: 10,
                      background: `${T.green}06`, border: `1px solid ${T.green}12`,
                      fontSize: 11, color: T.text3, lineHeight: 1.8,
                      fontFamily: "'Cairo', sans-serif",
                    }}>
                      {t('chatDesc')}
                    </div>
                    <button
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '10px 20px', borderRadius: 10, border: 'none',
                        background: `linear-gradient(135deg, ${T.green}, ${T.greenDim})`,
                        color: '#000', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                        fontFamily: "'Cairo', sans-serif", transition: 'all 0.2s',
                      }}
                    >
                      <MessageSquare size={14} />
                      {t('startChat')}
                    </button>
                  </div>
                )}

                {activeContactTab === 'docs' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: `${T.purple}14`, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <FileText size={18} color={T.purple} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
                          {t('docsTitle')}
                        </div>
                        <div style={{ fontSize: 11, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>
                          docs.roua.io
                        </div>
                      </div>
                    </div>
                    <div style={{
                      padding: '12px 14px', borderRadius: 10,
                      background: `${T.purple}06`, border: `1px solid ${T.purple}12`,
                      fontSize: 11, color: T.text3, lineHeight: 1.8,
                      fontFamily: "'Cairo', sans-serif",
                    }}>
                      {t('docsDesc')}
                    </div>
                    {[
                      { label: t('apiReference'), icon: <Zap size={12} /> },
                      { label: t('integrationGuides'), icon: <RefreshCw size={12} /> },
                      { label: t('videoTutorials'), icon: <Star size={12} /> },
                      { label: t('browseDocs'), icon: <FileText size={12} /> },
                    ].map((doc, i) => (
                      <button
                        key={i}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px', borderRadius: 8, width: '100%',
                          background: T.surface, border: `1px solid ${T.border}`,
                          color: T.text2, fontSize: 12, fontWeight: 600,
                          cursor: 'pointer', fontFamily: "'Cairo', sans-serif",
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = `${T.purple}30`; e.currentTarget.style.color = T.purple }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.text2 }}
                      >
                        <span style={{ color: T.purple }}>{doc.icon}</span>
                        {doc.label}
                        <ExternalLink size={10} style={{ marginRight: 'auto' }} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Feedback Form ── */}
            <div style={{
              background: T.card, border: `1px solid ${T.border}`,
              borderRadius: 16, overflow: 'hidden',
            }}>
              {/* Form Header */}
              <div style={{
                padding: '16px 20px', borderBottom: `1px solid ${T.border}`,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: `${T.amber}14`, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Sparkles size={16} color={T.amber} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: T.text, fontFamily: "'Cairo', sans-serif" }}>
                    {t('feedbackTitle')}
                  </div>
                  <div style={{ fontSize: 10, color: T.text4, fontFamily: "'Cairo', sans-serif" }}>
                    {t('feedbackDesc')}
                  </div>
                </div>
              </div>

              {/* Form Body */}
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Name & Email Row */}
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 4, display: 'block', fontFamily: "'Cairo', sans-serif" }}>
                      {t('feedbackName')}
                    </label>
                    <input
                      type="text"
                      value={feedbackName}
                      onChange={e => setFeedbackName(e.target.value)}
                      placeholder={t('feedbackNamePlaceholder')}
                      aria-label={t('feedbackName')}
                      style={{
                        width: '100%', background: T.surface, border: `1px solid ${T.border}`,
                        borderRadius: 8, padding: '10px 12px',
                        color: T.text, fontFamily: "'Cairo', sans-serif", fontSize: 12,
                        outline: 'none', transition: 'border-color 0.2s',
                      }}
                      onFocus={e => e.target.style.borderColor = T.cyan}
                      onBlur={e => e.target.style.borderColor = T.border}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 4, display: 'block', fontFamily: "'Cairo', sans-serif" }}>
                      {t('feedbackEmail')}
                    </label>
                    <input
                      type="email"
                      value={feedbackEmail}
                      onChange={e => setFeedbackEmail(e.target.value)}
                      placeholder={t('feedbackEmailPlaceholder')}
                      dir="ltr"
                      aria-label={t('feedbackEmail')}
                      style={{
                        width: '100%', background: T.surface, border: `1px solid ${T.border}`,
                        borderRadius: 8, padding: '10px 12px',
                        color: T.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                        outline: 'none', transition: 'border-color 0.2s',
                        textAlign: 'right',
                      }}
                      onFocus={e => e.target.style.borderColor = T.cyan}
                      onBlur={e => e.target.style.borderColor = T.border}
                    />
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 4, display: 'block', fontFamily: "'Cairo', sans-serif" }}>
                    {t('feedbackSubject')}
                  </label>
                  <select
                    value={feedbackSubject}
                    onChange={e => setFeedbackSubject(e.target.value)}
                    aria-label={t('feedbackSubject')}
                    style={{
                      width: '100%', background: T.surface, border: `1px solid ${T.border}`,
                      borderRadius: 8, padding: '10px 12px',
                      color: T.text, fontFamily: "'Cairo', sans-serif", fontSize: 12,
                      outline: 'none', cursor: 'pointer', direction: 'inherit',
                      appearance: 'none',
                    }}
                  >
                    <option value="">{t('feedbackSubjectPlaceholder')}</option>
                    <option value="bug">{t('subjectBug')}</option>
                    <option value="feature">{t('subjectFeature')}</option>
                    <option value="account">{t('subjectAccount')}</option>
                    <option value="billing">{t('subjectBilling')}</option>
                    <option value="other">{t('subjectOther')}</option>
                  </select>
                </div>

                {/* Message */}
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 4, display: 'block', fontFamily: "'Cairo', sans-serif" }}>
                    {t('feedbackMessage')}
                  </label>
                  <textarea
                    value={feedbackMessage}
                    onChange={e => setFeedbackMessage(e.target.value)}
                    placeholder={t('feedbackMessagePlaceholder')}
                    rows={4}
                    aria-label={t('feedbackMessage')}
                    style={{
                      width: '100%', background: T.surface, border: `1px solid ${T.border}`,
                      borderRadius: 8, padding: '10px 12px',
                      color: T.text, fontFamily: "'Cairo', sans-serif", fontSize: 12,
                      outline: 'none', resize: 'vertical', minHeight: 80,
                      transition: 'border-color 0.2s', lineHeight: 1.7,
                    }}
                    onFocus={e => e.target.style.borderColor = T.cyan}
                    onBlur={e => e.target.style.borderColor = T.border}
                  />
                </div>

                {/* Submit */}
                <button
                  onClick={handleSubmitFeedback}
                  disabled={isSubmitting}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '12px 24px', borderRadius: 10, border: 'none',
                    background: isSubmitting ? T.surface : `linear-gradient(135deg, ${T.cyan}, ${T.blue})`,
                    color: isSubmitting ? T.text3 : '#000',
                    fontSize: 13, fontWeight: 800, cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    fontFamily: "'Cairo', sans-serif", transition: 'all 0.2s',
                    opacity: isSubmitting ? 0.6 : 1,
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                      {t('feedbackSending')}
                    </>
                  ) : (
                    <>
                      <Send size={14} style={{ transform: 'rotate(180deg)' }} />
                      {t('feedbackSend')}
                    </>
                  )}
                </button>

                {/* Trust indicators */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderRadius: 8,
                  background: `${T.green}04`, border: `1px solid ${T.green}10`,
                }}>
                  <Lock size={12} color={T.green} />
                  <span style={{ fontSize: 10, color: T.text4, fontFamily: "'Cairo', sans-serif", lineHeight: 1.6 }}>
                    {t('feedbackInfoSecureDesc')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ Bottom Stats Bar ═══ */}
        {!searchQuery.trim() && (
          <div style={{
            display: 'flex', gap: 10, flexWrap: 'wrap',
          }}>
            {[
              { icon: <Users size={14} />, label: t('feedbackInfoTitle'), color: T.cyan },
              { icon: <Clock size={14} />, label: t('feedbackInfoDesc'), color: T.green },
              { icon: <Star size={14} />, label: t('feedbackInfoSecure'), color: T.amber },
              { icon: <Globe size={14} />, label: t('emailFeature2'), color: T.purple },
            ].map((stat, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 10,
                background: T.card, border: `1px solid ${T.border}`,
                fontSize: 10.5, color: T.text2, fontWeight: 600,
                fontFamily: "'Cairo', sans-serif",
              }}>
                <span style={{ color: stat.color }}>{stat.icon}</span>
                {stat.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Spinning animation for submit button */}
      {/* Scoped styles via useScopedStyle */}</div>
  )
}
