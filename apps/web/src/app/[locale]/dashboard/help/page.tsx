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
import { useScopedStyle } from '@/hooks/useScopedStyle'

/* ── Design Tokens (canonical + local extensions) ── */
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
      borderBottom: `1px solid ${'#2A313C'}`,
      overflow: 'hidden',
    }}>
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 0', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'right' as const,
          color: isOpen ? '#F0F2F5' : '#9CA3B5',
          fontSize: 'var(--text-sm)', fontWeight: isOpen ? 700 : 500,
          fontFamily: "var(--font-ar)",
          transition: 'color 0.2s',
        }}
      >
        <div style={{
          width: 22, height: 22, borderRadius: 'var(--radius-sm)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isOpen ? `${'#00D4FF'}14` : '#151A22',
          transition: 'all 0.3s',
        }}>
          <ChevronDown
            size={13}
            color={isOpen ? '#00D4FF' : '#6B7280'}
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
          padding: '0 34px 16px 0', fontSize: 'var(--text-sm)', lineHeight: 1.9,
          color: '#6B7280', fontFamily: "var(--font-ar)",
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
      background: '#151A22', border: `1px solid ${'#2A313C'}`,
      borderRadius: 'var(--radius-xl)', overflow: 'hidden',
    }}>
      {/* Category Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px 20px', borderBottom: `1px solid ${'#2A313C'}`,
        background: `${category.iconBg}08`,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 'var(--radius-lg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: category.iconBg, flexShrink: 0,
          color: category.iconColor,
        }}>
          {category.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 'var(--text-base)', fontWeight: 800, color: '#F0F2F5', fontFamily: "var(--font-ar)" }}>
            {category.title}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: '#6B7280', marginTop: 1, fontFamily: "var(--font-ar)" }}>
            {t('faqItemsCount', { count: category.items.length })}
          </div>
        </div>
        <span style={{
          fontSize: 'var(--text-xs)', padding: '3px 8px', borderRadius: 'var(--radius-lg)',
          background: `${category.iconColor}10`, color: category.iconColor,
          fontFamily: "var(--font-mono)", fontWeight: 700,
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
          0%, 100% { box-shadow: 0 0 8px ${'#00D4FF'}20; }
          50% { box-shadow: 0 0 20px ${'#00D4FF'}40; }
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
      iconColor: '#00D4FF',
      iconBg: `${'#00D4FF'}14`,
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
      iconColor: '#00FFA3',
      iconBg: `${'#00FFA3'}14`,
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
      iconColor: '#B388FF',
      iconBg: `${'#B388FF'}14`,
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
      iconColor: '#00FFA3',
      iconBg: `${'#00FFA3'}14`,
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
      iconColor: '#FFB800',
      iconBg: `${'#FFB800'}14`,
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
      color: '#00D4FF',
      bg: `${'#00D4FF'}14`,
    },
    {
      id: 'ai-guide',
      title: t('aiGuide'),
      description: t('aiGuideDesc'),
      icon: <Brain size={22} />,
      color: '#B388FF',
      bg: `${'#B388FF'}14`,
    },
    {
      id: 'security',
      title: t('securityPolicy'),
      description: t('securityPolicyDesc'),
      icon: <ShieldCheck size={22} />,
      color: '#00FFA3',
      bg: `${'#00FFA3'}14`,
    },
    {
      id: 'account-linking-guide',
      title: t('accountLinkingGuide'),
      description: t('accountLinkingGuideDesc'),
      icon: <Link2 size={22} />,
      color: '#FFB800',
      bg: `${'#FFB800'}14`,
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
        fontFamily: "var(--font-ar)",
        height: '100%',
        overflowY: 'auto',
        background: '#0B0E14',
      }}
    >
      {/* Scoped styles via useScopedStyle */}{/* ═══ Header ═══ */}
      <div style={{
        padding: '28px 24px 20px',
        borderBottom: `1px solid ${'#2A313C'}`,
        background: `linear-gradient(180deg, ${'#0F1117'}, ${'#0B0E14'})`,
      }}>
        <div className="help-header-inner" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 'var(--radius-lg)',
            background: 'linear-gradient(135deg, #00D4FF, #0A84FF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 20px ${'#00D4FF'}30`,
            flexShrink: 0,
          }}>
            <HelpCircle size={22} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 900, color: '#F0F2F5', fontFamily: "var(--font-ar)" }}>
              {t('title')}
            </h1>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: '#6B7280', fontFamily: "var(--font-ar)" }}>
              {t('subtitle')}
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative', maxWidth: 560 }}>
          <Search
            size={16}
            color={'#6B7280'}
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
              width: '100%', background: '#151A22', border: `1px solid ${'#2A313C'}`,
              borderRadius: 'var(--radius-lg)', padding: '12px 42px 12px 16px',
              color: '#F0F2F5', fontFamily: "var(--font-ar)", fontSize: 'var(--text-sm)',
              outline: 'none', transition: 'border-color 0.2s',
            }}
            onFocus={e => { e.target.style.borderColor = '#00D4FF'; e.target.style.boxShadow = `0 0 0 3px ${'#00D4FF'}15` }}
            onBlur={e => { e.target.style.borderColor = '#2A313C'; e.target.style.boxShadow = 'none' }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label={t('clearSearch')}
              style={{
                position: 'absolute', insetInlineStart: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#6B7280', display: 'flex', alignItems: 'center',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
        {searchQuery.trim() && (
          <div style={{ marginTop: 8, fontSize: 'var(--text-xs)', color: '#6B7280', fontFamily: "var(--font-ar)" }}>
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
            <h2 id="quick-links-heading" style={{ fontSize: 'var(--text-base)', fontWeight: 800, color: '#F0F2F5', marginBottom: 14, fontFamily: "var(--font-ar)" }}>
              {t('quickLinks')}
            </h2>
            <div className="help-quick-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {quickLinks.map(link => (
                <button
                  key={link.id}
                  style={{
                    background: '#151A22', border: `1px solid ${'#2A313C'}`,
                    borderRadius: 'var(--radius-xl)', padding: '20px 16px', cursor: 'pointer',
                    textAlign: 'right' as const, transition: 'all 0.25s',
                    display: 'flex', flexDirection: 'column', gap: 12,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = `${link.color}30`
                    e.currentTarget.style.background = `${link.color}06`
                    e.currentTarget.style.boxShadow = `0 0 20px ${link.color}10`
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#2A313C'
                    e.currentTarget.style.background = '#151A22'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 'var(--radius-lg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: link.bg, color: link.color, flexShrink: 0,
                  }}>
                    {link.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: '#F0F2F5', fontFamily: "var(--font-ar)", marginBottom: 4 }}>
                      {link.title}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: '#6B7280', lineHeight: 1.7, fontFamily: "var(--font-ar)" }}>
                      {link.description}
                    </div>
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 'var(--text-xs)', color: link.color, fontWeight: 700,
                    fontFamily: "var(--font-ar)", marginTop: 'auto',
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
            <h2 id="faq-heading" style={{ fontSize: 'var(--text-base)', fontWeight: 800, color: '#F0F2F5', fontFamily: "var(--font-ar)", margin: 0 }}>
              {t('faqTitle')}
            </h2>
            {!searchQuery.trim() && (
              <span style={{
                fontSize: 'var(--text-xs)', color: '#6B7280', fontFamily: "var(--font-mono)",
                padding: '3px 10px', borderRadius: 'var(--radius-lg)', background: '#151A22',
                border: `1px solid ${'#2A313C'}`,
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
              background: '#151A22', border: `1px solid ${'#2A313C'}`,
              borderRadius: 'var(--radius-xl)', padding: '40px 24px', textAlign: 'center',
            }}>
              <AlertCircle size={36} color={'#6B7280'} style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: '#9CA3B5', marginBottom: 6, fontFamily: "var(--font-ar)" }}>
                {t('noFaqResults')}
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: '#6B7280', fontFamily: "var(--font-ar)", lineHeight: 1.7 }}>
                {t('noFaqResultsDesc')}
              </div>
            </div>
          )}
        </section>

        {/* ═══ Contact & Support Section ═══ */}
        <section aria-labelledby="contact-heading" className="help-fade-in">
          <h2 id="contact-heading" style={{ fontSize: 'var(--text-base)', fontWeight: 800, color: '#F0F2F5', marginBottom: 14, fontFamily: "var(--font-ar)" }}>
            {t('contactTitle')}
          </h2>

          <div className="help-contact-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

            {/* ── Contact Methods (Tabs) ── */}
            <div style={{
              background: '#151A22', border: `1px solid ${'#2A313C'}`,
              borderRadius: 'var(--radius-xl)', overflow: 'hidden',
            }}>
              {/* Tab Header */}
              <div style={{ display: 'flex', borderBottom: `1px solid ${'#2A313C'}` }}>
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
                      background: activeContactTab === tab.id ? `${'#00D4FF'}08` : 'transparent',
                      color: activeContactTab === tab.id ? '#00D4FF' : '#6B7280',
                      fontSize: 'var(--text-xs)', fontWeight: activeContactTab === tab.id ? 800 : 500,
                      fontFamily: "var(--font-ar)",
                      borderBottom: activeContactTab === tab.id ? `2px solid ${'#00D4FF'}` : '2px solid transparent',
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
                        width: 40, height: 40, borderRadius: 'var(--radius-lg)',
                        background: `${'#00D4FF'}14`, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <Mail size={18} color={'#00D4FF'} />
                      </div>
                      <div>
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: '#F0F2F5', fontFamily: "var(--font-ar)" }}>
                          {t('emailTitle')}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: '#6B7280', fontFamily: "var(--font-mono)" }}>
                          support@roua.io
                        </div>
                      </div>
                    </div>
                    <div style={{
                      padding: '12px 14px', borderRadius: 'var(--radius-lg)',
                      background: `${'#00D4FF'}06`, border: `1px solid ${'#00D4FF'}12`,
                      fontSize: 'var(--text-xs)', color: '#6B7280', lineHeight: 1.8,
                      fontFamily: "var(--font-ar)",
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
                          padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                          background: '#151A22', border: `1px solid ${'#2A313C'}`,
                          fontSize: 'var(--text-xs)', color: '#9CA3B5', fontWeight: 600,
                          fontFamily: "var(--font-ar)",
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
                        width: 40, height: 40, borderRadius: 'var(--radius-lg)',
                        background: `${'#00FFA3'}14`, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <MessageSquare size={18} color={'#00FFA3'} />
                      </div>
                      <div>
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: '#F0F2F5', fontFamily: "var(--font-ar)" }}>
                          {t('chatTitle')}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: '#00FFA3', fontFamily: "var(--font-ar)", display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: 'var(--radius-xs)', background: '#00FFA3', boxShadow: `0 0 6px ${'#00FFA3'}60` }} />
                          {t('availableNow')}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      padding: '12px 14px', borderRadius: 'var(--radius-lg)',
                      background: `${'#00FFA3'}06`, border: `1px solid ${'#00FFA3'}12`,
                      fontSize: 'var(--text-xs)', color: '#6B7280', lineHeight: 1.8,
                      fontFamily: "var(--font-ar)",
                    }}>
                      {t('chatDesc')}
                    </div>
                    <button
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '10px 20px', borderRadius: 'var(--radius-lg)', border: 'none',
                        background: `linear-gradient(135deg, ${'#00FFA3'}, ${'#00CC82'})`,
                        color: '#000', fontSize: 'var(--text-sm)', fontWeight: 800, cursor: 'pointer',
                        fontFamily: "var(--font-ar)", transition: 'all 0.2s',
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
                        width: 40, height: 40, borderRadius: 'var(--radius-lg)',
                        background: `${'#B388FF'}14`, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <FileText size={18} color={'#B388FF'} />
                      </div>
                      <div>
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: '#F0F2F5', fontFamily: "var(--font-ar)" }}>
                          {t('docsTitle')}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: '#6B7280', fontFamily: "var(--font-ar)" }}>
                          docs.roua.io
                        </div>
                      </div>
                    </div>
                    <div style={{
                      padding: '12px 14px', borderRadius: 'var(--radius-lg)',
                      background: `${'#B388FF'}06`, border: `1px solid ${'#B388FF'}12`,
                      fontSize: 'var(--text-xs)', color: '#6B7280', lineHeight: 1.8,
                      fontFamily: "var(--font-ar)",
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
                          padding: '10px 12px', borderRadius: 'var(--radius-md)', width: '100%',
                          background: '#151A22', border: `1px solid ${'#2A313C'}`,
                          color: '#9CA3B5', fontSize: 'var(--text-sm)', fontWeight: 600,
                          cursor: 'pointer', fontFamily: "var(--font-ar)",
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = `${'#B388FF'}30`; e.currentTarget.style.color = '#B388FF' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#2A313C'; e.currentTarget.style.color = '#9CA3B5' }}
                      >
                        <span style={{ color: '#B388FF' }}>{doc.icon}</span>
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
              background: '#151A22', border: `1px solid ${'#2A313C'}`,
              borderRadius: 'var(--radius-xl)', overflow: 'hidden',
            }}>
              {/* Form Header */}
              <div style={{
                padding: '16px 20px', borderBottom: `1px solid ${'#2A313C'}`,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 'var(--radius-lg)',
                  background: `${'#FFB800'}14`, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Sparkles size={16} color={'#FFB800'} />
                </div>
                <div>
                  <div style={{ fontSize: 'var(--text-base)', fontWeight: 800, color: '#F0F2F5', fontFamily: "var(--font-ar)" }}>
                    {t('feedbackTitle')}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: '#6B7280', fontFamily: "var(--font-ar)" }}>
                    {t('feedbackDesc')}
                  </div>
                </div>
              </div>

              {/* Form Body */}
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Name & Email Row */}
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: '#6B7280', marginBottom: 4, display: 'block', fontFamily: "var(--font-ar)" }}>
                      {t('feedbackName')}
                    </label>
                    <input
                      type="text"
                      value={feedbackName}
                      onChange={e => setFeedbackName(e.target.value)}
                      placeholder={t('feedbackNamePlaceholder')}
                      aria-label={t('feedbackName')}
                      style={{
                        width: '100%', background: '#151A22', border: `1px solid ${'#2A313C'}`,
                        borderRadius: 'var(--radius-md)', padding: '10px 12px',
                        color: '#F0F2F5', fontFamily: "var(--font-ar)", fontSize: 'var(--text-sm)',
                        outline: 'none', transition: 'border-color 0.2s',
                      }}
                      onFocus={e => e.target.style.borderColor = '#00D4FF'}
                      onBlur={e => e.target.style.borderColor = '#2A313C'}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: '#6B7280', marginBottom: 4, display: 'block', fontFamily: "var(--font-ar)" }}>
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
                        width: '100%', background: '#151A22', border: `1px solid ${'#2A313C'}`,
                        borderRadius: 'var(--radius-md)', padding: '10px 12px',
                        color: '#F0F2F5', fontFamily: "var(--font-mono)", fontSize: 'var(--text-sm)',
                        outline: 'none', transition: 'border-color 0.2s',
                        textAlign: 'right',
                      }}
                      onFocus={e => e.target.style.borderColor = '#00D4FF'}
                      onBlur={e => e.target.style.borderColor = '#2A313C'}
                    />
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: '#6B7280', marginBottom: 4, display: 'block', fontFamily: "var(--font-ar)" }}>
                    {t('feedbackSubject')}
                  </label>
                  <select
                    value={feedbackSubject}
                    onChange={e => setFeedbackSubject(e.target.value)}
                    aria-label={t('feedbackSubject')}
                    style={{
                      width: '100%', background: '#151A22', border: `1px solid ${'#2A313C'}`,
                      borderRadius: 'var(--radius-md)', padding: '10px 12px',
                      color: '#F0F2F5', fontFamily: "var(--font-ar)", fontSize: 'var(--text-sm)',
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
                  <label style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: '#6B7280', marginBottom: 4, display: 'block', fontFamily: "var(--font-ar)" }}>
                    {t('feedbackMessage')}
                  </label>
                  <textarea
                    value={feedbackMessage}
                    onChange={e => setFeedbackMessage(e.target.value)}
                    placeholder={t('feedbackMessagePlaceholder')}
                    rows={4}
                    aria-label={t('feedbackMessage')}
                    style={{
                      width: '100%', background: '#151A22', border: `1px solid ${'#2A313C'}`,
                      borderRadius: 'var(--radius-md)', padding: '10px 12px',
                      color: '#F0F2F5', fontFamily: "var(--font-ar)", fontSize: 'var(--text-sm)',
                      outline: 'none', resize: 'vertical', minHeight: 80,
                      transition: 'border-color 0.2s', lineHeight: 1.7,
                    }}
                    onFocus={e => e.target.style.borderColor = '#00D4FF'}
                    onBlur={e => e.target.style.borderColor = '#2A313C'}
                  />
                </div>

                {/* Submit */}
                <button
                  onClick={handleSubmitFeedback}
                  disabled={isSubmitting}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '12px 24px', borderRadius: 'var(--radius-lg)', border: 'none',
                    background: isSubmitting ? '#151A22' : `linear-gradient(135deg, ${'#00D4FF'}, ${'#0A84FF'})`,
                    color: isSubmitting ? '#6B7280' : '#000',
                    fontSize: 'var(--text-sm)', fontWeight: 800, cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    fontFamily: "var(--font-ar)", transition: 'all 0.2s',
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
                  padding: '10px 12px', borderRadius: 'var(--radius-md)',
                  background: `${'#00FFA3'}04`, border: `1px solid ${'#00FFA3'}10`,
                }}>
                  <Lock size={12} color={'#00FFA3'} />
                  <span style={{ fontSize: 'var(--text-xs)', color: '#6B7280', fontFamily: "var(--font-ar)", lineHeight: 1.6 }}>
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
              { icon: <Users size={14} />, label: t('feedbackInfoTitle'), color: '#00D4FF' },
              { icon: <Clock size={14} />, label: t('feedbackInfoDesc'), color: '#00FFA3' },
              { icon: <Star size={14} />, label: t('feedbackInfoSecure'), color: '#FFB800' },
              { icon: <Globe size={14} />, label: t('emailFeature2'), color: '#B388FF' },
            ].map((stat, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 'var(--radius-lg)',
                background: '#151A22', border: `1px solid ${'#2A313C'}`,
                fontSize: 'var(--text-xs)', color: '#9CA3B5', fontWeight: 600,
                fontFamily: "var(--font-ar)",
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
