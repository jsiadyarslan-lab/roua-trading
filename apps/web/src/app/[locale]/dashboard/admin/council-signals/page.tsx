'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { RefreshCw, Download, Filter, TrendingUp, TrendingDown, CheckCircle2, XCircle, Clock } from 'lucide-react'
import SubPageLayout from '@/components/dashboard/SubPageLayout'

interface BriefRecord {
  id: string
  userId: string | null
  pair: string
  direction: string
  entryPrice: number
  stopLoss: number
  takeProfit: number
  confidence: number
  timeframe: string
  issuedAt: string
  expiresAt: string
  reviewStatus: string
  analysisSummary?: string
  source?: string
  outcomePips?: number
  closedAt?: string
  result?: string
}

export default function AdminCouncilSignalsPage() {
  const t = useTranslations('common')
  const [briefs, setBriefs] = useState<BriefRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [filterSource, setFilterSource] = useState<string>('ALL')
  const [filterResult, setFilterResult] = useState<string>('ALL')
  const [searchPair, setSearchPair] = useState('')

  const fetchBriefs = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/strategic-council/briefs/history/all?limit=5000')
      if (!r.ok) { console.error('Failed to fetch'); return }
      const data = await r.json()
      setBriefs(data.data || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchBriefs() }, [fetchBriefs])

  const filtered = briefs.filter(b => {
    if (filterStatus !== 'ALL' && b.reviewStatus !== filterStatus) return false
    if (filterSource !== 'ALL') {
      if (filterSource === 'NONE' && b.source) return false
      if (filterSource !== 'NONE' && b.source !== filterSource) return false
    }
    if (filterResult !== 'ALL') {
      if (filterResult === 'NONE' && b.result) return false
      if (filterResult !== 'NONE' && b.result !== filterResult) return false
    }
    if (searchPair && !b.pair.toLowerCase().includes(searchPair.toLowerCase())) return false
    return true
  })

  // Stats
  const executed = briefs.filter(b => b.reviewStatus === 'EXECUTED')
  const wins = executed.filter(b => b.result === 'WIN' || (b.outcomePips !== undefined && b.outcomePips > 0))
  const losses = executed.filter(b => b.result === 'LOSS' || (b.outcomePips !== undefined && b.outcomePips < 0))
  const totalPnl = executed.reduce((sum, b) => sum + (b.outcomePips || 0), 0)

  const sourceLabel = (s?: string) => {
    if (!s || s === 'user_manual') return '—'
    if (s === 'smart_executor') return 'Smart Executor'
    if (s === 'agent') return 'Agent'
    if (s === 'lazic' || s === 'lasic') return 'Stinger'
    if (s === 'auto_paper') return 'Paper'
    if (s === 'COUNCIL' || s === 'council') return 'Council'
    return s
  }

  const sourceColor = (s?: string) => {
    if (s === 'smart_executor') return '#FFB800'
    if (s === 'agent') return '#B388FF'
    if (s === 'lazic' || s === 'lasic') return '#FF6B35'
    if (s === 'auto_paper') return '#00D4FF'
    return '#9CA3B5'
  }

  // Export functions
  const exportCSV = () => {
    const headers = ['Date', 'Pair', 'Direction', 'Timeframe', 'Entry', 'SL', 'TP', 'Confidence', 'Status', 'Executor', 'P&L', 'Result', 'User ID']
    const rows = filtered.map(b => [
      new Date(b.issuedAt).toISOString(),
      b.pair,
      b.direction,
      b.timeframe,
      b.entryPrice,
      b.stopLoss,
      b.takeProfit,
      b.confidence,
      b.reviewStatus,
      sourceLabel(b.source),
      b.outcomePips?.toFixed(2) || '',
      b.result || '',
      b.userId || '',
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `council-signals-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `council-signals-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportHTML = () => {
    const html = `
<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>Council Signals Report</title>
<style>
body { font-family: Arial; background: #0B0E14; color: #F0F2F5; padding: 20px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th { background: #151A22; padding: 8px; text-align: right; border-bottom: 2px solid #2A313C; color: #9CA3B5; }
td { padding: 6px 8px; border-bottom: 1px solid #2A313C; }
.win { color: #00FFA3; } .loss { color: #FF4757; }
</style></head><body>
<h2>Council Signals Report — ${new Date().toLocaleString()}</h2>
<p>Total: ${filtered.length} | Wins: ${wins.length} | Losses: ${losses.length} | Net P&L: $${totalPnl.toFixed(2)}</p>
<table>
<tr><th>Date</th><th>Pair</th><th>Dir</th><th>TF</th><th>Entry</th><th>Conf</th><th>Status</th><th>Executor</th><th>P&L</th><th>Result</th></tr>
${filtered.map(b => `<tr>
<td>${new Date(b.issuedAt).toLocaleString()}</td>
<td>${b.pair}</td>
<td>${b.direction}</td>
<td>${b.timeframe}</td>
<td>${b.entryPrice}</td>
<td>${b.confidence}%</td>
<td>${b.reviewStatus}</td>
<td>${sourceLabel(b.source)}</td>
<td class="${b.outcomePips && b.outcomePips > 0 ? 'win' : b.outcomePips && b.outcomePips < 0 ? 'loss' : ''}">${b.outcomePips?.toFixed(2) || '—'}</td>
<td>${b.result || '—'}</td>
</tr>`).join('')}
</table></body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `council-signals-${new Date().toISOString().slice(0,10)}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <SubPageLayout title="سجل إشارات المجلس — جميع المستخدمين">
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          <div style={{ background: '#151A22', borderRadius: 8, padding: 12, border: '1px solid #2A313C' }}>
            <div style={{ fontSize: 11, color: '#6B7280' }}>إجمالي الإشارات</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#F0F2F5' }}>{briefs.length}</div>
          </div>
          <div style={{ background: '#151A22', borderRadius: 8, padding: 12, border: '1px solid #2A313C' }}>
            <div style={{ fontSize: 11, color: '#6B7280' }}>منفذة</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#FFB800' }}>{executed.length}</div>
          </div>
          <div style={{ background: '#151A22', borderRadius: 8, padding: 12, border: '1px solid #2A313C' }}>
            <div style={{ fontSize: 11, color: '#6B7280' }}>رابحة</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#00FFA3' }}>{wins.length}</div>
          </div>
          <div style={{ background: '#151A22', borderRadius: 8, padding: 12, border: '1px solid #2A313C' }}>
            <div style={{ fontSize: 11, color: '#6B7280' }}>خاسرة</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#FF4757' }}>{losses.length}</div>
          </div>
          <div style={{ background: '#151A22', borderRadius: 8, padding: 12, border: '1px solid #2A313C' }}>
            <div style={{ fontSize: 11, color: '#6B7280' }}>صافي P&L</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: totalPnl >= 0 ? '#00FFA3' : '#FF4757' }}>${totalPnl.toFixed(2)}</div>
          </div>
        </div>

        {/* Filters + Export */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ background: '#151A22', color: '#F0F2F5', border: '1px solid #2A313C', borderRadius: 6, padding: '6px 10px', fontSize: 12 }}>
            <option value="ALL">كل الحالات</option>
            <option value="ACTIVE">نشط</option>
            <option value="EXECUTED">منفذ</option>
            <option value="CANCELLED">ملغى</option>
            <option value="MODIFIED">معدل</option>
          </select>
          <select value={filterSource} onChange={e => setFilterSource(e.target.value)} style={{ background: '#151A22', color: '#F0F2F5', border: '1px solid #2A313C', borderRadius: 6, padding: '6px 10px', fontSize: 12 }}>
            <option value="ALL">كل المنفذين</option>
            <option value="smart_executor">منفذ ذكي</option>
            <option value="agent">وكيل</option>
            <option value="lazic">Stinger</option>
            <option value="NONE">غير محدد</option>
          </select>
          <select value={filterResult} onChange={e => setFilterResult(e.target.value)} style={{ background: '#151A22', color: '#F0F2F5', border: '1px solid #2A313C', borderRadius: 6, padding: '6px 10px', fontSize: 12 }}>
            <option value="ALL">كل النتائج</option>
            <option value="WIN">ربح</option>
            <option value="LOSS">خسارة</option>
            <option value="BREAKEVEN">تعادل</option>
            <option value="NONE">بدون نتيجة</option>
          </select>
          <input type="text" placeholder="بحث بالزوج..." value={searchPair} onChange={e => setSearchPair(e.target.value)} style={{ background: '#151A22', color: '#F0F2F5', border: '1px solid #2A313C', borderRadius: 6, padding: '6px 10px', fontSize: 12, width: 120 }} />
          <button onClick={fetchBriefs} disabled={loading} style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', color: '#00D4FF', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> تحديث
          </button>
          <div style={{ display: 'flex', gap: 4, marginRight: 'auto' }}>
            <button onClick={exportCSV} style={{ background: 'rgba(0,255,163,0.1)', border: '1px solid rgba(0,255,163,0.3)', color: '#00FFA3', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Download size={12} /> CSV
            </button>
            <button onClick={exportJSON} style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', color: '#00D4FF', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Download size={12} /> JSON
            </button>
            <button onClick={exportHTML} style={{ background: 'rgba(255,184,0,0.1)', border: '1px solid rgba(255,184,0,0.3)', color: '#FFB800', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Download size={12} /> HTML
            </button>
          </div>
        </div>

        {/* Table */}
        <div style={{ background: '#151A22', borderRadius: 8, border: '1px solid #2A313C', overflow: 'auto', maxHeight: '70vh' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#151A22', zIndex: 1 }}>
              <tr style={{ borderBottom: '1px solid #2A313C' }}>
                <th style={{ padding: '8px 6px', textAlign: 'right', color: '#6B7280', fontWeight: 700, whiteSpace: 'nowrap' }}>التاريخ</th>
                <th style={{ padding: '8px 6px', textAlign: 'center', color: '#6B7280', fontWeight: 700 }}>الزوج</th>
                <th style={{ padding: '8px 6px', textAlign: 'center', color: '#6B7280', fontWeight: 700 }}>الاتجاه</th>
                <th style={{ padding: '8px 6px', textAlign: 'center', color: '#6B7280', fontWeight: 700 }}>TF</th>
                <th style={{ padding: '8px 6px', textAlign: 'center', color: '#6B7280', fontWeight: 700 }}>الدخول</th>
                <th style={{ padding: '8px 6px', textAlign: 'center', color: '#6B7280', fontWeight: 700 }}>الثقة</th>
                <th style={{ padding: '8px 6px', textAlign: 'center', color: '#6B7280', fontWeight: 700 }}>الحالة</th>
                <th style={{ padding: '8px 6px', textAlign: 'center', color: '#6B7280', fontWeight: 700 }}>المنفذ</th>
                <th style={{ padding: '8px 6px', textAlign: 'center', color: '#6B7280', fontWeight: 700 }}>P&L</th>
                <th style={{ padding: '8px 6px', textAlign: 'center', color: '#6B7280', fontWeight: 700 }}>النتيجة</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((b) => {
                const isWin = b.result === 'WIN' || (b.outcomePips !== undefined && b.outcomePips > 0)
                const isLoss = b.result === 'LOSS' || (b.outcomePips !== undefined && b.outcomePips < 0)
                const dirColor = b.direction === 'BUY' ? '#00FFA3' : '#FF4757'
                return (
                  <tr key={b.id} style={{ borderBottom: '1px solid rgba(42,49,60,0.5)' }}>
                    <td style={{ padding: '5px 6px', color: '#6B7280', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{new Date(b.issuedAt).toLocaleString('ar', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'center', color: '#F0F2F5', fontWeight: 700, fontFamily: 'monospace' }}>{b.pair}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'center', color: dirColor, fontWeight: 700 }}>{b.direction === 'BUY' ? '▲' : '▼'} {b.direction}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'center', color: '#9CA3B5', fontFamily: 'monospace' }}>{b.timeframe}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'center', color: '#E6EDF3', fontFamily: 'monospace' }}>{b.entryPrice}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'center', color: '#9CA3B5', fontFamily: 'monospace' }}>{b.confidence}%</td>
                    <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                      <span style={{ padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: b.reviewStatus === 'EXECUTED' ? 'rgba(0,255,163,0.12)' : b.reviewStatus === 'CANCELLED' ? 'rgba(255,71,87,0.12)' : 'rgba(0,212,255,0.12)', color: b.reviewStatus === 'EXECUTED' ? '#00FFA3' : b.reviewStatus === 'CANCELLED' ? '#FF4757' : '#00D4FF' }}>{b.reviewStatus}</span>
                    </td>
                    <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                      <span style={{ padding: '1px 5px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: `${sourceColor(b.source)}20`, color: sourceColor(b.source), whiteSpace: 'nowrap' }}>{sourceLabel(b.source)}</span>
                    </td>
                    <td style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 700, fontFamily: 'monospace', color: isWin ? '#00FFA3' : isLoss ? '#FF4757' : '#6B7280' }}>{b.outcomePips !== undefined ? `${b.outcomePips > 0 ? '+' : ''}${b.outcomePips.toFixed(2)}$` : '—'}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 700, color: isWin ? '#00FFA3' : isLoss ? '#FF4757' : '#6B7280' }}>{b.result === 'WIN' ? 'ربح' : b.result === 'LOSS' ? 'خسارة' : b.result === 'BREAKEVEN' ? 'تعادل' : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length > 500 && <div style={{ textAlign: 'center', padding: 12, color: '#6B7280', fontSize: 12 }}>عرض 500 من {filtered.length} — استخدم التصدير لعرض الكل</div>}
        </div>
      </div>
    </SubPageLayout>
  )
}
