'use client'

import { useState, useEffect, useCallback } from 'react'
import { useVisibleInterval } from '@/hooks/useVisibleInterval'
import { useTranslations } from 'next-intl'

const T = {
  bg: '#0B0E14',
  bg2: '#1A1D29',
  card: '#1A1D29',
  border: 'rgba(255,255,255,0.06)',
  accent: '#FF6B35',   // لون اللاسع — برتقالي ناري كالدبور
  green: '#00FFA3',
  red: '#FF4757',
  amber: '#FFB800',
  text: '#F0F2F5',
  text2: '#8B92A8',
  text3: '#5A6178',
}

interface LasicSettings {
  obiThreshold: number
  maxSpreadMultiplier: number
  maxDailyTrades: number
  maxOpenPositions: number
  cooldownMs: number
  riskPerTradePct: number
}

interface LasicMetrics {
  success: number
  fail: number
  lastReason: string
  lastAt: number
}

interface LazicStatus {
  enabled: boolean
  dailyTrades: number
  activeSymbols: string[]
  lastOBIs: Record<string, number>
  settings?: LasicSettings
  metrics?: LasicMetrics
}

const DEFAULT_SETTINGS: LasicSettings = {
  obiThreshold: 0.4,
  maxSpreadMultiplier: 1.5,
  maxDailyTrades: 20,
  maxOpenPositions: 2,
  cooldownMs: 30000,
  riskPerTradePct: 0.5,
}

function OBIBar({ value, symbol, threshold }: { value: number; symbol: string; threshold: number }) {
  const pct = Math.round(Math.abs(value) * 100)
  const isBuy = value > 0
  const color = value > threshold ? T.green : value < -threshold ? T.red : T.amber

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
      <span style={{ fontSize: 9, color: T.text3, fontFamily: 'monospace', width: 60, textAlign: 'right' }}>
        {symbol.split('/')[0]}
      </span>
      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, position: 'relative' }}>
        {/* المنتصف */}
        <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: 'rgba(255,255,255,0.1)' }} />
        {/* علامة العتبة */}
        <div style={{
          position: 'absolute',
          left: `${50 + (threshold * 50 / 2)}%`,
          top: -2, width: 1, height: 8,
          background: T.accent,
          opacity: 0.5,
        }} />
        <div style={{
          position: 'absolute',
          left: `${50 - (threshold * 50 / 2)}%`,
          top: -2, width: 1, height: 8,
          background: T.accent,
          opacity: 0.5,
        }} />
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

function SliderRow({
  label, value, min, max, step, unit, color, onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  color: string
  onChange: (v: number) => void
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 9, color: T.text2, fontFamily: "var(--font-ar)" }}>{label}</span>
        <span style={{ fontSize: 9, color, fontFamily: 'monospace', fontWeight: 700 }}>
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{
          width: '100%',
          height: 4,
          appearance: 'none',
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 2,
          outline: 'none',
          cursor: 'pointer',
        }}
      />
    </div>
  )
}

export function LazicPanel() {
  const t = useTranslations('dashboard.lasicPanel')
  const [status, setStatus] = useState<LazicStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [localSettings, setLocalSettings] = useState<LasicSettings>(DEFAULT_SETTINGS)
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/lazic/status', { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      setStatus(data)
      if (data.settings && !showSettings) {
        setLocalSettings(data.settings)
      }
      setError(null)
    } catch {
      setError(t('errorConnection'))
    } finally {
      setLoading(false)
    }
  }, [showSettings, t])

  useEffect(() => {
    setLoading(true)
    fetchStatus()
  }, [fetchStatus])

  // تحديث كل 3 ثوانٍ — اللاسع سريع جداً
  useVisibleInterval(fetchStatus, 3000)

  const toggle = async () => {
    if (!status || toggling) return
    setToggling(true)
    try {
      const endpoint = status.enabled ? '/api/lazic/disable' : '/api/lazic/enable'
      await fetch(endpoint, { method: 'POST', credentials: 'include' })
      await fetchStatus()
    } catch {
      setError(t('errorToggle'))
    } finally {
      setToggling(false)
    }
  }

  const saveSettings = async () => {
    setSavingSettings(true)
    try {
      const res = await fetch('/api/lazic/settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localSettings),
      })
      if (res.ok) {
        setSettingsSaved(true)
        setTimeout(() => setSettingsSaved(false), 2000)
        await fetchStatus()
      } else {
        setError(t('errorSaveSettings'))
      }
    } catch {
      setError(t('errorSaveSettings'))
    } finally {
      setSavingSettings(false)
    }
  }

  // أعلى 6 أزواج نشاطاً
  const threshold = status?.settings?.obiThreshold ?? 0.4
  const topOBIs = Object.entries(status?.lastOBIs ?? {})
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 6)

  const strongSignals = topOBIs.filter(([, v]) => Math.abs(v) > threshold).length
  const metrics = status?.metrics
  const successRate = metrics && (metrics.success + metrics.fail) > 0
    ? Math.round((metrics.success / (metrics.success + metrics.fail)) * 100)
    : null

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
            {loading ? t('loading') : status?.enabled ? t('stinging') : t('stopped')}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          {/* زر الإعدادات */}
          <button
            onClick={() => setShowSettings(s => !s)}
            title={t('settingsTitle')}
            style={{
              background: showSettings ? `rgba(255,107,53,0.15)` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${showSettings ? T.accent : T.border}`,
              borderRadius: 6,
              color: showSettings ? T.accent : T.text3,
              fontSize: 10,
              padding: '4px 8px',
              cursor: 'pointer',
              fontFamily: "var(--font-ar)",
              transition: 'all 0.2s',
            }}
          >
            ⚙
          </button>

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
            {toggling ? '...' : status?.enabled ? t('disable') : t('enable')}
          </button>
        </div>
      </div>

      {/* إحصائيات سريعة */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginBottom: 10 }}>
        {[
          { label: t('statDailyTrades'), value: status?.dailyTrades ?? 0, color: T.text },
          { label: t('statStrongSignals'), value: strongSignals, color: strongSignals > 0 ? T.amber : T.text3 },
          { label: t('statActiveSymbols'), value: status?.activeSymbols?.length ?? 0, color: T.text },
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

      {/* Metrics — Phase 3 */}
      {metrics && (metrics.success > 0 || metrics.fail > 0) && (
        <div style={{
          display: 'flex', gap: 5, marginBottom: 10,
          background: 'rgba(255,255,255,0.02)', border: T.border,
          borderRadius: 6, padding: '5px 8px',
        }}>
          <span style={{ fontSize: 8, color: T.text3, fontFamily: "var(--font-ar)" }}>
            {t('metricSuccess')}: <span style={{ color: T.green, fontWeight: 700 }}>{metrics.success}</span>
          </span>
          <span style={{ fontSize: 8, color: T.text3, fontFamily: "var(--font-ar)" }}>
            {t('metricFail')}: <span style={{ color: T.red, fontWeight: 700 }}>{metrics.fail}</span>
          </span>
          {successRate !== null && (
            <span style={{ fontSize: 8, color: T.text3, fontFamily: "var(--font-ar)" }}>
              {t('metricRate')}: <span style={{ color: successRate > 70 ? T.green : T.amber, fontWeight: 700 }}>{successRate}%</span>
            </span>
          )}
        </div>
      )}

      {/* لوحة الإعدادات — Phase 2 */}
      {showSettings && (
        <div style={{
          background: 'rgba(255,107,53,0.03)',
          border: `1px solid ${T.accent}33`,
          borderRadius: 6,
          padding: '8px 10px',
          marginBottom: 10,
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: T.accent, marginBottom: 8, fontFamily: "var(--font-ar)" }}>
            ⚙ {t('settingsTitle')}
          </div>

          <SliderRow
            label={t('obiThresholdLabel')}
            value={localSettings.obiThreshold}
            min={0.3}
            max={0.8}
            step={0.05}
            unit=""
            color={T.accent}
            onChange={(v) => setLocalSettings(s => ({ ...s, obiThreshold: v }))}
          />
          <SliderRow
            label={t('maxSpreadLabel')}
            value={localSettings.maxSpreadMultiplier}
            min={1.0}
            max={3.0}
            step={0.1}
            unit="×"
            color={T.amber}
            onChange={(v) => setLocalSettings(s => ({ ...s, maxSpreadMultiplier: v }))}
          />
          <SliderRow
            label={t('riskPerTradeLabel')}
            value={localSettings.riskPerTradePct}
            min={0.1}
            max={3.0}
            step={0.1}
            unit="%"
            color={T.red}
            onChange={(v) => setLocalSettings(s => ({ ...s, riskPerTradePct: v }))}
          />
          <SliderRow
            label={t('maxDailyTradesLabel')}
            value={localSettings.maxDailyTrades}
            min={5}
            max={100}
            step={5}
            unit=""
            color={T.green}
            onChange={(v) => setLocalSettings(s => ({ ...s, maxDailyTrades: v }))}
          />
          <SliderRow
            label={t('maxOpenPositionsLabel')}
            value={localSettings.maxOpenPositions}
            min={1}
            max={10}
            step={1}
            unit=""
            color={T.green}
            onChange={(v) => setLocalSettings(s => ({ ...s, maxOpenPositions: v }))}
          />
          <SliderRow
            label={t('cooldownLabel')}
            value={localSettings.cooldownMs / 1000}
            min={10}
            max={300}
            step={10}
            unit="s"
            color={T.text2}
            onChange={(v) => setLocalSettings(s => ({ ...s, cooldownMs: v * 1000 }))}
          />

          <button
            onClick={saveSettings}
            disabled={savingSettings}
            style={{
              width: '100%',
              marginTop: 8,
              background: settingsSaved ? `rgba(0,255,163,0.15)` : `rgba(255,107,53,0.15)`,
              border: `1px solid ${settingsSaved ? T.green : T.accent}`,
              borderRadius: 6,
              color: settingsSaved ? T.green : T.accent,
              fontSize: 10,
              fontWeight: 700,
              padding: '6px',
              cursor: savingSettings ? 'wait' : 'pointer',
              fontFamily: "var(--font-ar)",
              transition: 'all 0.2s',
            }}
          >
            {savingSettings ? '...' : settingsSaved ? t('settingsSaved') : t('saveSettings')}
          </button>
        </div>
      )}

      {/* OBI Heatbar — آخر قراءات عدم التوازن */}
      {topOBIs.length > 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: T.border,
          borderRadius: 6,
          padding: '6px 8px',
        }}>
          <div style={{ fontSize: 8, color: T.text3, marginBottom: 5, display: 'flex', justifyContent: 'space-between' }}>
            <span>{t('obiHeatbarTitle')}</span>
            <span style={{ color: T.accent }}>{t('obiSellBuy')}</span>
          </div>
          {topOBIs.map(([sym, val]) => (
            <OBIBar key={sym} symbol={sym} value={val} threshold={threshold} />
          ))}
        </div>
      )}

      {status?.enabled && strongSignals === 0 && (
        <div style={{ fontSize: 9, color: T.text3, textAlign: 'center', marginTop: 6 }}>
          {t('waitingForSignal', { threshold: threshold.toFixed(2) })}
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
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #FF6B35;
          cursor: pointer;
          box-shadow: 0 0 4px rgba(255,107,53,0.5);
        }
        input[type="range"]::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #FF6B35;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  )
}
