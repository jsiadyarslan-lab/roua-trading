'use client'

import { Search, Bell, Wifi, Database, Globe, ChevronDown } from 'lucide-react'
import { useDashboardStore } from '@/lib/dashboard-store'

export default function TopBar() {
  const { language, toggleLanguage, wsConnected } = useDashboardStore()

  return (
    <div
      className="flex items-center justify-between px-4 shrink-0"
      style={{
        height: 48,
        background: 'var(--bg2)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Left: Logo + Live indicator */}
      <div className="flex items-center gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '16px',
              fontWeight: 800,
              color: 'var(--blue)',
              letterSpacing: '0.06em',
              textShadow: '0 0 12px rgba(77,158,255,0.4)',
            }}
          >
            QUANTUM
          </span>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '16px',
              fontWeight: 400,
              color: 'var(--text2)',
              letterSpacing: '0.04em',
            }}
          >
            _AI
          </span>
        </div>

        {/* Live indicator */}
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded"
          style={{
            background: 'var(--green2)',
            border: '1px solid rgba(0,255,136,0.2)',
          }}
        >
          <div className="pulse-live" />
          <span
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--green)',
              letterSpacing: '0.06em',
            }}
          >
            مباشر
          </span>
        </div>
      </div>

      {/* Center: Search */}
      <div className="flex items-center gap-2" style={{ width: 340 }}>
        <div
          className="flex items-center gap-2 rounded-lg px-3"
          style={{
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            height: 32,
            width: '100%',
          }}
        >
          <Search size={14} style={{ color: 'var(--text3)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="بحث عن زوج، إشارة..."
            className="bg-transparent outline-none text-xs flex-1"
            style={{
              color: 'var(--text)',
              fontFamily: 'var(--font-ui)',
              direction: 'rtl',
            }}
          />
        </div>
      </div>

      {/* Right: System health + Language + Notifications + User */}
      <div className="flex items-center gap-3">
        {/* System Health */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1" title="API">
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--green)',
                boxShadow: '0 0 4px var(--green)',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                color: 'var(--text3)',
              }}
            >
              API
            </span>
          </div>
          <div className="flex items-center gap-1" title="DB">
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--green)',
                boxShadow: '0 0 4px var(--green)',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                color: 'var(--text3)',
              }}
            >
              DB
            </span>
          </div>
          <div className="flex items-center gap-1" title="WS">
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: wsConnected ? 'var(--green)' : 'var(--red)',
                boxShadow: wsConnected ? '0 0 4px var(--green)' : '0 0 4px var(--red)',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                color: 'var(--text3)',
              }}
            >
              WS
            </span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        {/* Language Toggle */}
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1 px-2 py-1 rounded cursor-pointer"
          style={{
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            color: 'var(--text2)',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            fontWeight: 700,
          }}
        >
          {language === 'ar' ? 'EN' : 'عربي'}
        </button>

        {/* Notification Bell */}
        <button
          type="button"
          aria-label="الإشعارات"
          title="الإشعارات"
          className="relative flex items-center justify-center rounded-lg cursor-pointer"
          style={{
            width: 28,
            height: 28,
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
          }}
        >
          <Bell size={13} style={{ color: 'var(--text2)' }} />
          <div
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--red)',
              boxShadow: '0 0 4px var(--red)',
            }}
          />
        </button>

        {/* User Avatar */}
        <button
          type="button"
          aria-label="الملف الشخصي"
          title="الملف الشخصي"
          className="flex items-center justify-center rounded-lg cursor-pointer"
          style={{
            width: 28,
            height: 28,
            background: 'linear-gradient(135deg, var(--blue), var(--purple))',
            border: '1px solid var(--border2)',
          }}
        >
          <span style={{ fontSize: '11px', color: '#fff', fontWeight: 700 }}>ر</span>
        </button>
      </div>
    </div>
  )
}
