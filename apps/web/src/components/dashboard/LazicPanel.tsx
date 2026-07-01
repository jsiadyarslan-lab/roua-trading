'use client'

import { useState, useEffect, useCallback } from 'react'
import { useVisibleInterval } from '@/hooks/useVisibleInterval'

const T = {
  bg: '#0B0E14',
  bg2: '#1A1D29',
  card: '#1A1D29',
  border: 'rgba(255,255,255,0.06)',
  accent: '#FF6B35',   // لون اللاذع — برتقالي ناري كالدبور
  green: '#00FFA3',
  red: '#FF4757',
  amber: '#FFB800',
  text: '#F0F2F5',
  text2: '#8B92A8',
  text3: '#5A6178',
}

interface LazicStatus {
  enabled: boolean
  dailyTrades: number
  activeSymbols: string[]
  lastOBIs: Record<string, number>
}

function OBIBar({ value, symbol }: { value: number; symbol: string }) {
  const pct = Math.round(Math.abs(value) * 100)
  const isBuy = value > 0
  const color = value > 0.6 ? T.green : value < -0.6 ? T.red : T.amber

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
      <span style={{ fontSize: 9, color: T.text3, fontFamily: 'monospace', width: 60, textAlign: 'right' }}>
        {symbol.split('/')[0]}
      </span>
      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, position: 'relative' }}>
        {/* المنتصف */}
        <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: 'rgba(255,255,255,0.1)' }} />
        {/* شريط OBI */}
        <div style={{
          position: 'absolute',
          height: '100%',
          borderRadius: 2,
          background: color,
          width: `${pct / 2}%`,
          left: isBuy ? '50%' : `${50 - pct / 2}%`,
          transition: 'all 0.3s ease',
        }} />
      </div>
      <span style={{ fontSize: 9, color, fontFamily: 'monospace', width: 36 }}>
        {value > 0 ? '+' : ''}{value.toFixed(2)}
      </span>
    </div>
  )
}

export function LazicPanel() {
  const [status, setStatus] = useState<LazicStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/lazic/status', { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      setStatus(data)
      setError(null)
    } catch {
      setError('تعذّر الاتصال')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchStatus()
  }, [fetchStatus])

  // تحديث كل 3 ثوانٍ — اللاذع سريع جداً
  useVisibleInterval(fetchStatus, 3000)

  const toggle = async () => {
    if (!status || toggling) return
    setToggling(true)
    try {
      const endpoint = status.enabled ? '/api/lazic/disable' : '/api/lazic/enable'
      await fetch(endpoint, { method: 'POST', credentials: 'include' })
      await fetchStatus()
    } catch {
      setError('فشل تغيير الحالة')
    } finally {
      setToggling(false)
    }
  }

  // أعلى 6 أزواج نشاطاً
  const topOBIs = Object.entries(status?.lastOBIs ?? {})
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 6)

  const strongSignals = topOBIs.filter(([, v]) => Math.abs(v) > 0.6).length

  return (
    <div style={{ background: T.bg, padding: '10px 12px', fontFamily: "var(--font-ar)" }}>

      {/* الصف الأول: الحالة + زر التبديل */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* مؤشر حي */}
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: status?.enabled ? T.green : T.text3,
            boxShadow: status?.enabled ? `0 0 6px ${T.green}` : 'none',
            animation: status?.enabled ? 'pulse 1.5s infinite' : 'none',
          }} />
          <span style={{ fontSize: 11, color: status?.enabled ? T.green : T.text2, fontWeight: 600 }}>
            {loading ? 'جاري التحميل...' : status?.enabled ? 'يلسع الآن' : 'متوقف'}
          </span>
        </div>

        {/* زر تفعيل/إيقاف */}
        <button
          onClick={toggle}
          disabled={toggling || loading}
          style={{
            background: status?.enabled
              ? 'rgba(255,71,87,0.15)'
              : `rgba(255,107,53,0.15)`,
            border: `1px solid ${status?.enabled ? T.red : T.accent}`,
            borderRadius: 6,
            color: status?.enabled ? T.red : T.accent,
            fontSize: 10,
            fontWeight: 700,
            padding: '4px 10px',
            cursor: toggling ? 'wait' : 'pointer',
            fontFamily: "var(--font-ar)",
            transition: 'all 0.2s',
          }}
        >
          {toggling ? '...' : status?.enabled ? 'إيقاف اللاذع' : 'تفعيل اللاذع'}
        </button>
      </div>

      {/* إحصائيات سريعة */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginBottom: 10 }}>
        {[
          { label: 'الصفقات اليوم', value: status?.dailyTrades ?? 0, color: T.text },
          { label: 'إشارات قوية', value: strongSignals, color: strongSignals > 0 ? T.amber : T.text3 },
          { label: 'أزواج نشطة', value: status?.activeSymbols?.length ?? 0, color: T.text },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: 'rgba(255,255,255,0.03)',
            border: T.border,
            borderRadius: 6,
            padding: '5px 6px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</div>
            <div style={{ fontSize: 8, color: T.text3, marginTop: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* OBI Heatbar — آخر قراءات عدم التوازن */}
      {topOBIs.length > 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: T.border,
          borderRadius: 6,
          padding: '6px 8px',
        }}>
          <div style={{ fontSize: 8, color: T.text3, marginBottom: 5, display: 'flex', justifyContent: 'space-between' }}>
            <span>توازن دفتر الأوامر (OBI)</span>
            <span style={{ color: T.accent }}>بيع ← → شراء</span>
          </div>
          {topOBIs.map(([sym, val]) => (
            <OBIBar key={sym} symbol={sym} value={val} />
          ))}
        </div>
      )}

      {status?.enabled && strongSignals === 0 && (
        <div style={{ fontSize: 9, color: T.text3, textAlign: 'center', marginTop: 6 }}>
          ينتظر إشارة OBI قوية (&gt;0.6)...
        </div>
      )}

      {error && (
        <div style={{ fontSize: 9, color: T.red, textAlign: 'center', marginTop: 4 }}>{error}</div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
