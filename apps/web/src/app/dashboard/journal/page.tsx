'use client'

import { useMemo, useState, useRef } from 'react'
import { usePaperTradesStore, type ClosedPaperTrade } from '@/hooks/usePaperTradesStore'
import {
  BookOpen, Search, Filter, Trash2, TrendingUp, TrendingDown,
  Tag, MessageSquare, CheckCircle2, Clock
} from 'lucide-react'

const T = {
  bg:     '#0B0E14',
  card:   '#1A1D29',
  border: 'rgba(255,255,255,0.06)',
  cyan:   '#00D4FF',
  green:  '#00FFA3',
  red:    '#FF4757',
  amber:  '#FFB800',
  purple: '#B388FF',
  text:   '#F0F2F5',
  text2:  '#8B92A8',
  mono:   "'JetBrains Mono', monospace",
  ar:     "'Cairo', sans-serif",
}

const TAGS = ['انتكاسة', 'اتجاه', 'اختراق', 'أخبار', 'RSI', 'MACD', 'تحليل', 'خطأ', 'نجاح', 'تجريبي'] as const

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
}
function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
}
function duration(entry: number, exit: number) {
  const diff = exit - entry
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return h > 0 ? `${h}س ${m}د` : `${m}د`
}

// Local notes stored in memory per session (can persist to localStorage later)
const notesStore: Record<string, string> = {}
const tagsStore: Record<string, string[]> = {}

export default function JournalPage() {
  const closedTrades = usePaperTradesStore(s => s.closedTrades)
  const clearClosedTrades = usePaperTradesStore(s => s.clearClosedTrades)
  const [search, setSearch] = useState('')
  const [filterSide, setFilterSide] = useState<'all' | 'long' | 'short'>('all')
  const [filterResult, setFilterResult] = useState<'all' | 'win' | 'loss'>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [savedNotes, setSavedNotes] = useState<Record<string, string>>({})
  const [savedTags, setSavedTags] = useState<Record<string, string[]>>({})
  const noteRef = useRef<HTMLTextAreaElement>(null)

  const filtered = useMemo(() => {
    return closedTrades.filter(t => {
      const matchSearch = !search || t.symbol.toLowerCase().includes(search.toLowerCase())
      const matchSide = filterSide === 'all' || t.side === filterSide
      const matchResult = filterResult === 'all' || (filterResult === 'win' ? t.realizedPnl >= 0 : t.realizedPnl < 0)
      return matchSearch && matchSide && matchResult
    })
  }, [closedTrades, search, filterSide, filterResult])

  const selectedTrade = selected ? closedTrades.find(t => t.id === selected) || null : null

  const openTrade = (t: ClosedPaperTrade) => {
    setSelected(t.id)
    setNote(savedNotes[t.id] || '')
    setSelectedTags(savedTags[t.id] || [])
    setTimeout(() => noteRef.current?.focus(), 100)
  }

  const saveNote = () => {
    if (!selected) return
    setSavedNotes(prev => ({ ...prev, [selected]: note }))
    setSavedTags(prev => ({ ...prev, [selected]: selectedTags }))
  }

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  const totalPnl = closedTrades.reduce((s, t) => s + t.realizedPnl, 0)
  const wins = closedTrades.filter(t => t.realizedPnl >= 0).length
  const losses = closedTrades.filter(t => t.realizedPnl < 0).length

  return (
    <div style={{
      minHeight: 'calc(100dvh - 108px)',
      background: T.bg,
      direction: 'rtl',
      fontFamily: T.ar,
      color: T.text,
      display: 'flex',
      height: 'calc(100dvh - 108px)',
      overflow: 'hidden',
    }}>
      {/* Sidebar List */}
      <div style={{
        width: 320, flexShrink: 0,
        borderLeft: `1px solid ${T.border}`,
        display: 'flex', flexDirection: 'column',
        background: 'rgba(26,29,41,0.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BookOpen size={16} color={T.cyan} />
              <span style={{ fontSize: 14, fontWeight: 800 }}>سجل التداول</span>
            </div>
            {closedTrades.length > 0 && (
              <button onClick={() => { if (confirm('هل تريد حذف كل السجلات؟')) clearClosedTrades() }} style={{
                padding: '4px 8px', borderRadius: 6, border: `1px solid ${T.red}25`,
                background: `${T.red}08`, color: T.red, cursor: 'pointer', fontSize: 10,
              }}>
                <Trash2 size={11} />
              </button>
            )}
          </div>
          {/* Stats strip */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {[
              { label: 'إجمالي', value: `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}$`, color: totalPnl >= 0 ? T.green : T.red },
              { label: 'ربح', value: String(wins), color: T.green },
              { label: 'خسارة', value: String(losses), color: T.red },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                flex: 1, padding: '6px 8px', borderRadius: 8,
                background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}`, textAlign: 'center',
              }}>
                <div style={{ fontSize: 9, color: T.text2 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.mono, color }}>{value}</div>
              </div>
            ))}
          </div>
          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={12} color={T.text2} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث برمز..."
              style={{
                width: '100%', padding: '8px 32px 8px 10px',
                borderRadius: 8, border: `1px solid ${T.border}`,
                background: 'rgba(255,255,255,0.04)', color: T.text,
                fontFamily: T.ar, fontSize: 12, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'long', 'short'] as const).map(f => (
              <button key={f} onClick={() => setFilterSide(f)} style={{
                flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10,
                border: `1px solid ${filterSide === f ? T.cyan + '40' : T.border}`,
                background: filterSide === f ? `${T.cyan}10` : 'transparent',
                color: filterSide === f ? T.cyan : T.text2, cursor: 'pointer', fontFamily: T.ar,
              }}>
                {f === 'all' ? 'الكل' : f === 'long' ? '↑ شراء' : '↓ بيع'}
              </button>
            ))}
            {(['all', 'win', 'loss'] as const).map(f => (
              <button key={f} onClick={() => setFilterResult(f)} style={{
                flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10,
                border: `1px solid ${filterResult === f ? (f === 'win' ? T.green : f === 'loss' ? T.red : T.cyan) + '40' : T.border}`,
                background: filterResult === f ? `${f === 'win' ? T.green : f === 'loss' ? T.red : T.cyan}10` : 'transparent',
                color: filterResult === f ? (f === 'win' ? T.green : f === 'loss' ? T.red : T.cyan) : T.text2,
                cursor: 'pointer', fontFamily: T.ar,
              }}>
                {f === 'all' ? 'الكل' : f === 'win' ? '✅ ربح' : '❌ خسارة'}
              </button>
            ))}
          </div>
        </div>

        {/* Trade List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: T.text2, fontSize: 12 }}>
              لا توجد صفقات مطابقة
            </div>
          ) : (
            filtered.map(t => {
              const isWin = t.realizedPnl >= 0
              const isActive = selected === t.id
              const hasNote = !!savedNotes[t.id]
              return (
                <div key={t.id} onClick={() => openTrade(t)} style={{
                  padding: '12px 16px', cursor: 'pointer',
                  borderBottom: `1px solid ${T.border}`,
                  background: isActive ? `${T.cyan}08` : 'transparent',
                  borderRight: isActive ? `3px solid ${T.cyan}` : '3px solid transparent',
                  transition: 'all 0.15s',
                }}
                  onMouseEnter={e => !isActive && (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => !isActive && (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 800, fontSize: 13, fontFamily: T.mono, color: T.text }}>{t.symbol}</span>
                      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: t.side === 'long' ? `${T.green}18` : `${T.red}18`, color: t.side === 'long' ? T.green : T.red, fontWeight: 700 }}>
                        {t.side === 'long' ? '↑' : '↓'}
                      </span>
                      {hasNote && <MessageSquare size={10} color={T.amber} />}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, fontFamily: T.mono, color: isWin ? T.green : T.red }}>
                      {isWin ? '+' : ''}{t.realizedPnl.toFixed(2)}$
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.text2 }}>
                    <span>
                      <Clock size={9} style={{ verticalAlign: 'middle', marginLeft: 3 }} />
                      {duration(t.entryTime, t.closeTime)}
                    </span>
                    <span>{fmtDate(t.closeTime)}</span>
                  </div>
                  {savedTags[t.id]?.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                      {savedTags[t.id].map(tag => (
                        <span key={tag} style={{ fontSize: 8, padding: '2px 6px', borderRadius: 4, background: `${T.purple}18`, color: T.purple }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Detail Panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selectedTrade ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: T.text2 }}>
            <BookOpen size={48} style={{ opacity: 0.2 }} />
            <div style={{ fontSize: 16, fontWeight: 700 }}>اختر صفقة لعرض تفاصيلها</div>
            <div style={{ fontSize: 12 }}>سجّل ملاحظاتك وأضف وسوماً لكل صفقة</div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
            {/* Trade Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 28, fontWeight: 900, fontFamily: T.mono, color: T.text }}>{selectedTrade.symbol}</span>
                  <span style={{ padding: '4px 12px', borderRadius: 8, background: selectedTrade.side === 'long' ? `${T.green}18` : `${T.red}18`, color: selectedTrade.side === 'long' ? T.green : T.red, fontWeight: 700, fontSize: 13 }}>
                    {selectedTrade.side === 'long' ? '↑ شراء' : '↓ بيع'}
                  </span>
                  <span style={{ padding: '4px 12px', borderRadius: 8, background: selectedTrade.realizedPnl >= 0 ? `${T.green}18` : `${T.red}18`, color: selectedTrade.realizedPnl >= 0 ? T.green : T.red, fontWeight: 800, fontSize: 14, fontFamily: T.mono }}>
                    {selectedTrade.realizedPnl >= 0 ? '+' : ''}{selectedTrade.realizedPnl.toFixed(2)}$
                  </span>
                </div>
                <div style={{ fontSize: 11, color: T.text2, marginTop: 6 }}>
                  {fmtDate(selectedTrade.closeTime)} • {fmtTime(selectedTrade.closeTime)} • مدة: {duration(selectedTrade.entryTime, selectedTrade.closeTime)}
                </div>
              </div>
              {selectedTrade.source === 'bot' && (
                <div style={{ padding: '6px 14px', borderRadius: 8, background: `${T.cyan}10`, border: `1px solid ${T.cyan}25`, color: T.cyan, fontSize: 11, fontWeight: 700 }}>
                  🤖 بوت: {selectedTrade.strategy || 'auto'}
                </div>
              )}
            </div>

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
              {[
                { label: 'سعر الدخول', value: `$${selectedTrade.entryPrice.toFixed(4)}` },
                { label: 'سعر الخروج', value: `$${selectedTrade.exitPrice.toFixed(4)}` },
                { label: 'الكمية', value: selectedTrade.qty.toFixed(4) },
                { label: 'العائد %', value: `${selectedTrade.realizedPct >= 0 ? '+' : ''}${selectedTrade.realizedPct.toFixed(2)}%`, color: selectedTrade.realizedPct >= 0 ? T.green : T.red },
                { label: 'TP', value: selectedTrade.tp ? `$${selectedTrade.tp.toFixed(4)}` : '—' },
                { label: 'SL', value: selectedTrade.sl ? `$${selectedTrade.sl.toFixed(4)}` : '—' },
                { label: 'المصدر', value: selectedTrade.source === 'bot' ? '🤖 بوت' : '✋ يدوي' },
                { label: 'تاريخ الدخول', value: fmtDate(selectedTrade.entryTime) },
              ].map(({ label, value, color }) => (
                <div key={label} style={{
                  padding: '10px 12px', borderRadius: 10,
                  background: 'rgba(26,29,41,0.6)', border: `1px solid ${T.border}`,
                }}>
                  <div style={{ fontSize: 9, color: T.text2, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.mono, color: color || T.text }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Tags */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text2, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Tag size={12} /> الوسوم
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {TAGS.map(tag => {
                  const active = selectedTags.includes(tag)
                  return (
                    <button key={tag} onClick={() => toggleTag(tag)} style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 11,
                      border: `1px solid ${active ? T.purple + '60' : T.border}`,
                      background: active ? `${T.purple}15` : 'rgba(255,255,255,0.03)',
                      color: active ? T.purple : T.text2, cursor: 'pointer', transition: 'all 0.15s',
                    }}>
                      {tag}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Notes */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text2, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <MessageSquare size={12} /> ملاحظاتي
              </div>
              <textarea
                ref={noteRef}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="سجّل ملاحظاتك هنا: ماذا تعلمت؟ ما سبب الدخول؟ ما الخطأ؟"
                style={{
                  width: '100%', minHeight: 140, padding: 14,
                  borderRadius: 10, border: `1px solid ${T.border}`,
                  background: 'rgba(26,29,41,0.6)', color: T.text,
                  fontFamily: T.ar, fontSize: 13, resize: 'vertical', outline: 'none',
                  lineHeight: 1.7, boxSizing: 'border-box',
                }}
                onFocus={e => (e.target.style.borderColor = `${T.cyan}50`)}
                onBlur={e => (e.target.style.borderColor = T.border)}
              />
              <button onClick={saveNote} style={{
                marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px',
                borderRadius: 9, border: `1px solid ${T.green}30`,
                background: `${T.green}10`, color: T.green,
                fontFamily: T.ar, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>
                <CheckCircle2 size={14} /> حفظ الملاحظات والوسوم
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
