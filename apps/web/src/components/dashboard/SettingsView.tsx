'use client'

import React, { useState } from 'react'
import { 
  User, Shield, Link as LinkIcon, Bell, Palette, 
  ChevronRight, Globe, CheckCircle2, AlertCircle,
  Plus, Trash2, Key, Settings as SettingsIcon
} from 'lucide-react'

export function SettingsView() {
  const [activeTab, setActiveTab] = useState('integrations')

  const TABS = [
    { id: 'profile', label: 'الملف الشخصي', icon: User },
    { id: 'integrations', label: 'المنصات المربوطة', icon: LinkIcon },
    { id: 'security', label: 'الأمان', icon: Shield },
    { id: 'preferences', label: 'التفضيلات', icon: Palette },
  ]

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Cairo', sans-serif",
      animation: 'fadeIn 0.3s ease'
    }}>
      {/* Header */}
      <div style={{
        padding: '24px 32px', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 4 }}>إعدادات المنصة</h1>
          <p style={{ fontSize: 13, color: 'var(--text3)' }}>إدارة حسابك، ربط المنصات العالمية وتخصيص تجربتك.</p>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Nav Sidebar */}
        <div style={{
          width: 240, borderLeft: '1px solid var(--border)', padding: 16,
          display: 'flex', flexDirection: 'column', gap: 4
        }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                borderRadius: 10, border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                background: activeTab === tab.id ? 'var(--accent)15' : 'transparent',
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--text2)',
                textAlign: 'right'
              }}
            >
              <tab.icon size={18} />
              <span style={{ fontSize: 14, fontWeight: 700 }}>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="custom-scrollbar" style={{ flex: 1, padding: 32, overflowY: 'auto' }}>
          {activeTab === 'integrations' && <IntegrationsTab />}
          {activeTab === 'profile' && <ProfileTab />}
          {activeTab === 'security' && <SecurityTab />}
          {activeTab === 'preferences' && <div style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>تفضيلات الواجهة قيد التطوير...</div>}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}

function IntegrationsTab() {
  const [connections, setConnections] = useState([
    { id: 'alpaca', name: 'Alpaca Markets', type: 'Broker', status: 'connected', icon: '🦙' },
    { id: 'binance', name: 'Binance', type: 'Exchange', status: 'disconnected', icon: '🟡' },
    { id: 'mt5', name: 'MetaTrader 5', type: 'Terminal', status: 'pending', icon: '📉' },
  ])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>الربط الخارجي (Integrations)</h2>
        <button className="btn-cyan-active" style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} /> إضافة منصة جديدة
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
        {connections.map(c => (
          <div key={c.id} style={{
            background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16,
            padding: 20, display: 'flex', flexDirection: 'column', gap: 16, transition: 'all 0.2s',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 32 }}>{c.icon}</div>
              <div style={{
                fontSize: 10, padding: '4px 8px', borderRadius: 20, fontWeight: 800,
                background: c.status === 'connected' ? 'var(--success)20' : 'var(--border)',
                color: c.status === 'connected' ? 'var(--success)' : 'var(--text3)',
                display: 'flex', alignItems: 'center', gap: 4
              }}>
                {c.status === 'connected' ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                {c.status === 'connected' ? 'متصل' : 'غير متصل'}
              </div>
            </div>
            
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 900, marginBottom: 2 }}>{c.name}</h3>
              <p style={{ fontSize: 12, color: 'var(--text3)' }}>{c.type}</p>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
              <button style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}>تعديل</button>
              <button style={{ padding: '8px', borderRadius: 8, border: '1px solid var(--danger)40', background: 'transparent', color: 'var(--danger)', cursor: 'pointer' }}><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProfileTab() {
  return (
    <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800 }}>الملف الشخصي</h2>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: 24, background: 'var(--bg2)', borderRadius: 16, border: '1px solid var(--border)' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(45deg, var(--primary), var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>👤</div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 18, fontWeight: 900 }}>جابر الصبحي</h3>
          <p style={{ fontSize: 13, color: 'var(--text3)' }}>المستوى: متداول محترف (Diamond)</p>
        </div>
        <button style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--accent)', color: 'var(--accent)', background: 'transparent', fontSize: 12 }}>تغيير الصورة</button>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 8 }}>الاسم الكامل</label>
          <input type="text" defaultValue="جابر الصبحي" style={{ width: '100%', padding: '12px', borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--border)', color: '#fff' }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 8 }}>البريد الإلكتروني</label>
          <input type="email" defaultValue="jaber@example.com" style={{ width: '100%', padding: '12px', borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--border)', color: '#fff' }} />
        </div>
      </div>

      <button className="btn-cyan-active" style={{ padding: '12px', borderRadius: 10, fontWeight: 800 }}>حفظ التغييرات</button>
    </div>
  )
}

function SecurityTab() {
  return (
    <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800 }}>الأمان والخصوصية</h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[
          { label: 'كلمة المرور', desc: 'آخر تغيير منذ 3 أشهر', action: 'تغيير' },
          { label: 'المصادقة الثنائية (2FA)', desc: 'مفعلة عبر Google Authenticator', action: 'إدارة' },
          { label: 'سجل الدخول', desc: 'رؤية آخر الأجهزة التي دخلت لحسابك', action: 'عرض' }
        ].map((item, i) => (
          <div key={i} style={{ padding: 20, background: 'var(--bg2)', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{item.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>{item.desc}</div>
            </div>
            <button style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 12 }}>{item.action}</button>
          </div>
        ))}
      </div>
    </div>
  )
}
