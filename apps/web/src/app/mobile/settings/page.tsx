'use client'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState, useCallback } from 'react'
import { useDashboardStore, type TradingMode } from '@/lib/dashboard-store'
import { ChevronLeft } from 'lucide-react'

export default function SettingsPage() {
  const router = useRouter()
  const tc = useTranslations('common')
  const ts = useTranslations('mobile.settings')
  const { mode, setMode } = useDashboardStore()
  const [notifications, setNotifications] = useState(true)
  const [sound, setSound] = useState(true)

  return (
    <div className="m-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={() => router.back()} style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronLeft size={18} color="rgba(255,255,255,0.6)" /></button>
        <span style={{ fontSize: 20, fontWeight: 900, color: '#FFF', fontFamily: 'var(--cairo)' }}>{tc('settings')}</span>
      </div>
      <div className="m-card">
        <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: 'var(--cairo)', marginBottom: 12 }}>{ts('tradingMode')}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['trader', 'investor', 'ai'] as TradingMode[]).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: mode === m ? '0.5px solid rgba(0,212,255,0.3)' : '0.5px solid var(--border)', background: mode === m ? 'rgba(0,212,255,0.06)' : 'transparent', color: mode === m ? 'var(--accent)' : 'var(--text3)', fontSize: 11, fontWeight: 800, fontFamily: 'var(--cairo)', cursor: 'pointer' }}>
              {m === 'trader' ? tc('trader') : m === 'investor' ? tc('investor') : tc('ai')}
            </button>
          ))}
        </div>
      </div>
      <div className="m-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: 'var(--cairo)' }}>{ts('notifications')}</span>
          <button onClick={() => setNotifications(v => !v)} style={{ width: 36, height: 20, borderRadius: 10, background: notifications ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 2, width: 16, height: 16, borderRadius: 8, background: '#FFF', transition: 'left 150ms', left: notifications ? 18 : 2 }} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: 'var(--cairo)' }}>{ts('sound')}</span>
          <button onClick={() => setSound(v => !v)} style={{ width: 36, height: 20, borderRadius: 10, background: sound ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 2, width: 16, height: 16, borderRadius: 8, background: '#FFF', transition: 'left 150ms', left: sound ? 18 : 2 }} />
          </button>
        </div>
      </div>
    </div>
  )
}
