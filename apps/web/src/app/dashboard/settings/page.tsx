'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Settings, Shield, Key, Bell, User, Palette, Moon, Sun, ArrowUpRight, Mail, Eye, Volume2, Bot, Brain, Radar, BarChart3, ChevronLeft } from 'lucide-react'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useAuth } from '@/hooks/useAuth'

const T = {
  bg: '#04050C', bg2: '#0D1117', card: '#08090F', cardHover: '#0B0F19',
  surface: '#1A1D29', cyan: '#00D4FF', green: '#00FFA3', greenDim: '#00CC82',
  red: '#FF4757', redDim: '#FF3344', amber: '#FFB800', purple: '#B388FF',
  blue: '#0A84FF',
  text: '#F0F2F5', text2: '#94a3b8', text3: '#8B92A8',
  border: 'rgba(255,255,255,0.06)', border2: 'rgba(0,212,255,0.16)',
}

function Toggle({ checked, onChange, color }: { checked: boolean; onChange: () => void; color: string }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
        background: checked ? `${color}30` : T.surface,
        position: 'relative', transition: 'all 0.3s',
        boxShadow: checked ? `0 0 8px ${color}30` : 'none',
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: 8, background: checked ? color : T.text3,
        position: 'absolute', top: 3,
        right: checked ? 3 : 'auto', left: checked ? 'auto' : 3,
        transition: 'all 0.3s',
      }} />
    </button>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { settings, updateSettings } = useNotificationStore()
  const [isDark, setIsDark] = useState(true)

  return (
    <div className="custom-scrollbar" style={{ padding: '32px 24px', direction: 'rtl', fontFamily: "'Cairo', sans-serif", height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Settings size={20} color={T.text2} />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text }}>الإعدادات</h1>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 20,
            background: 'rgba(255,255,255,0.06)', color: T.text2,
            fontFamily: "'JetBrains Mono', monospace",
          }}>SETTINGS</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: T.text2 }}>
          تخصيص منصة رؤى وفق تفضيلاتك
        </p>
      </div>

      {/* Profile Section */}
      <div style={{
        background: T.card, border: `1px solid ${T.border}`,
        borderRadius: 16, padding: 24, marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 20,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: `linear-gradient(135deg, ${T.cyan}, ${T.blue})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 900, color: '#fff',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {user?.displayName?.[0] || user?.email?.[0] || 'م'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 4 }}>
            {user?.displayName || 'مستخدم رؤى'}
          </div>
          <div style={{ fontSize: 12, color: T.text2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Mail size={12} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{user?.email || 'user@roua.io'}</span>
          </div>
          <div style={{ fontSize: 11, color: T.text3, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              padding: '2px 8px', borderRadius: 10, background: `${T.amber}15`, color: T.amber,
              fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
            }}>
              {user?.tier?.toUpperCase() || 'BETA'}
            </span>
            <span>الخطة الحالية</span>
          </div>
        </div>
      </div>

      {/* Settings Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>

        {/* API Keys - Links to Exchange Page */}
        <div
          onClick={() => router.push('/dashboard/settings/exchange')}
          style={{
            background: T.card, border: `1px solid ${T.border}`,
            borderRadius: 14, padding: '20px',
            display: 'flex', alignItems: 'center', gap: 16,
            cursor: 'pointer', transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = `${T.amber}40`; e.currentTarget.style.background = T.cardHover }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.card }}
        >
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${T.amber}14`, border: `0.5px solid ${T.amber}30`,
            flexShrink: 0,
          }}>
            <Key size={18} color={T.amber} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>مفاتيح API</div>
            <div style={{ fontSize: 11, color: T.text2 }}>ربط منصات التداول وإدارة المفاتيح المشفرة</div>
          </div>
          <ChevronLeft size={16} color={T.text3} style={{ transform: 'scaleX(-1)' }} />
        </div>

        {/* Notifications Section */}
        <div style={{
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: 14, padding: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `${T.cyan}14`, border: `0.5px solid ${T.cyan}30`,
              flexShrink: 0,
            }}>
              <Bell size={18} color={T.cyan} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>الإشعارات</div>
              <div style={{ fontSize: 11, color: T.text2 }}>تخصيص التنبيهات والتحذيرات</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 60 }}>
            {/* Main Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Eye size={14} color={T.text2} />
                <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>تفعيل الإشعارات</span>
              </div>
              <Toggle checked={settings.enabled} onChange={() => updateSettings({ enabled: !settings.enabled })} color={T.cyan} />
            </div>

            {/* Sound Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Volume2 size={14} color={T.text2} />
                <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>الأصوات</span>
              </div>
              <Toggle checked={settings.soundEnabled} onChange={() => updateSettings({ soundEnabled: !settings.soundEnabled })} color={T.green} />
            </div>

            <div style={{ height: 1, background: T.border, margin: '4px 0' }} />

            {/* Source Toggles */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Bot size={14} color={T.text2} />
                <span style={{ fontSize: 12, color: T.text2 }}>تنبيهات البوت</span>
              </div>
              <Toggle checked={settings.botAlerts} onChange={() => updateSettings({ botAlerts: !settings.botAlerts })} color={T.purple} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Brain size={14} color={T.text2} />
                <span style={{ fontSize: 12, color: T.text2 }}>تنبيهات الذكاء الاصطناعي</span>
              </div>
              <Toggle checked={settings.aiAlerts} onChange={() => updateSettings({ aiAlerts: !settings.aiAlerts })} color={T.cyan} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Radar size={14} color={T.text2} />
                <span style={{ fontSize: 12, color: T.text2 }}>تنبيهات الماسح</span>
              </div>
              <Toggle checked={settings.scannerAlerts} onChange={() => updateSettings({ scannerAlerts: !settings.scannerAlerts })} color={T.amber} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChart3 size={14} color={T.text2} />
                <span style={{ fontSize: 12, color: T.text2 }}>تنبيهات التداول</span>
              </div>
              <Toggle checked={settings.tradeAlerts} onChange={() => updateSettings({ tradeAlerts: !settings.tradeAlerts })} color={T.green} />
            </div>

            {/* Confidence Slider */}
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: T.text2 }}>الحد الأدنى للثقة</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.cyan, fontFamily: "'JetBrains Mono', monospace" }}>
                  {settings.minConfidence}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={settings.minConfidence}
                onChange={e => updateSettings({ minConfidence: Number(e.target.value) })}
                style={{ width: '100%', accentColor: T.cyan, height: 4 }}
              />
            </div>
          </div>
        </div>

        {/* Appearance Section */}
        <div style={{
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: 14, padding: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `${T.blue}14`, border: `0.5px solid ${T.blue}30`,
              flexShrink: 0,
            }}>
              <Palette size={18} color={T.blue} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>المظهر واللغة</div>
              <div style={{ fontSize: 11, color: T.text2 }}>ثيم المنصة وإعدادات RTL</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 60 }}>
            {/* Dark/Light Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isDark ? <Moon size={14} color={T.text2} /> : <Sun size={14} color={T.amber} />}
                <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>الوضع الداكن</span>
              </div>
              <Toggle checked={isDark} onChange={() => setIsDark(!isDark)} color={T.blue} />
            </div>

            {/* Language (read-only info) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14 }}>🌍</span>
                <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>اللغة</span>
              </div>
              <span style={{ fontSize: 12, color: T.text2, fontFamily: "'JetBrains Mono', monospace" }}>
                العربية (AR)
              </span>
            </div>

            {/* Direction */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14 }}>↔️</span>
                <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>اتجاه النص</span>
              </div>
              <span style={{ fontSize: 12, color: T.text2, fontFamily: "'JetBrains Mono', monospace" }}>
                RTL
              </span>
            </div>
          </div>
        </div>

        {/* Security Section */}
        <div style={{
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: 14, padding: '20px',
          display: 'flex', alignItems: 'center', gap: 16,
          opacity: 0.6,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${T.green}14`, border: `0.5px solid ${T.green}30`,
            flexShrink: 0,
          }}>
            <Shield size={18} color={T.green} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>الأمان والمصادقة</div>
            <div style={{ fontSize: 11, color: T.text2 }}>Passkeys وإعدادات WebAuthn</div>
          </div>
          <span style={{
            fontSize: 10, padding: '3px 8px', borderRadius: 10,
            background: 'rgba(255,255,255,0.04)', color: T.text3,
            fontFamily: "'JetBrains Mono', monospace",
          }}>قريباً</span>
        </div>

        {/* Trading Settings Section */}
        <div style={{
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: 14, padding: '20px',
          display: 'flex', alignItems: 'center', gap: 16,
          opacity: 0.6,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${T.amber}14`, border: `0.5px solid ${T.amber}30`,
            flexShrink: 0,
          }}>
            <Settings size={18} color={T.amber} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>التداول</div>
            <div style={{ fontSize: 11, color: T.text2 }}>الرافعة الافتراضية وحجم الأوامر</div>
          </div>
          <span style={{
            fontSize: 10, padding: '3px 8px', borderRadius: 10,
            background: 'rgba(255,255,255,0.04)', color: T.text3,
            fontFamily: "'JetBrains Mono', monospace",
          }}>قريباً</span>
        </div>
      </div>
    </div>
  )
}
