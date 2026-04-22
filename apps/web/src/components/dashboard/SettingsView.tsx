'use client'

import React, { useState, useEffect } from 'react'
import { 
  User, Shield, Link as LinkIcon, Activity,
  Terminal, Globe, CheckCircle2, AlertTriangle,
  Cpu, Zap, Lock, Key, Eye, Server, Radio
} from 'lucide-react'

// Constants & Tokens
const T = {
  bg: 'var(--bg)',
  surface: 'var(--surface)',
  border: 'var(--card-border)',
  cyan: 'var(--accent)',
  blue: 'var(--primary)',
  green: '#00FFC6',
  red: '#FF4D4D',
  amber: '#FFB800',
  text: 'var(--foreground)',
  textDim: 'var(--muted)',
  mono: "'JetBrains Mono', monospace",
  sans: "'Cairo', sans-serif"
}

const GLOW = `0 0 12px ${T.cyan}33`

export function SettingsView() {
  const [activeTab, setActiveTab] = useState('integrations')
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const TABS = [
    { id: 'integrations', label: 'الربط الخارجي', icon: Server, code: 'INT-01' },
    { id: 'profile', label: 'هوية المتداول', icon: User, code: 'ID-02' },
    { id: 'security', label: 'أمان النظام', icon: Shield, code: 'SEC-03' },
    { id: 'system', label: 'النواة والتفضيلات', icon: Cpu, code: 'SYS-04' },
  ]

  if (!mounted) return null

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: '#010205', color: T.text, fontFamily: T.sans,
      position: 'relative', overflow: 'hidden'
    }}>
      {/* Background Decor */}
      <div style={{
        position: 'absolute', top: '-20%', right: '-10%', width: '50%', height: '50%',
        background: `radial-gradient(circle, ${T.cyan}11 0%, transparent 70%)`,
        pointerEvents: 'none', zIndex: 0
      }} />
      
      {/* Cyber Header */}
      <div style={{
        padding: '24px 32px',
        borderBottom: `1px solid ${T.border}`,
        background: 'linear-gradient(180deg, rgba(0,242,255,0.03) 0%, transparent 100%)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        position: 'relative', zIndex: 1
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Terminal size={20} color={T.cyan} />
            <span style={{ fontFamily: T.mono, fontSize: 11, color: T.cyan, letterSpacing: '0.2em' }}>
              SYS_CONFIG // ROOT
            </span>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.02em', margin: 0, textShadow: GLOW }}>
            مركز تحكم المنصة
          </h1>
        </div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textDim }}>SYSTEM STATUS</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.green }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, boxShadow: `0 0 8px ${T.green}` }} />
            <span style={{ fontSize: 12, fontWeight: 700 }}>OPTIMAL</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative', zIndex: 1 }}>
        {/* Cyber Sidebar */}
        <div style={{
          width: 260, borderLeft: `1px solid ${T.border}`,
          background: 'rgba(5, 8, 15, 0.4)', backdropFilter: 'blur(10px)',
          display: 'flex', flexDirection: 'column', gap: 8, padding: '24px 16px'
        }}>
          {TABS.map(tab => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                  borderRadius: 6, border: `1px solid ${active ? T.cyan + '55' : 'transparent'}`,
                  background: active ? `linear-gradient(90deg, ${T.cyan}15 0%, transparent 100%)` : 'transparent',
                  color: active ? '#fff' : T.textDim,
                  cursor: 'pointer', transition: 'all 0.2s',
                  position: 'relative', overflow: 'hidden', textAlign: 'right'
                }}
              >
                {active && (
                  <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 2, background: T.cyan, boxShadow: GLOW }} />
                )}
                <tab.icon size={18} color={active ? T.cyan : T.textDim} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 14, fontWeight: active ? 800 : 600 }}>{tab.label}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 9, opacity: 0.6 }}>{tab.code}</span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Dynamic Content Area */}
        <div className="custom-scrollbar" style={{ flex: 1, padding: 32, overflowY: 'auto' }}>
          {activeTab === 'integrations' && <IntegrationsTab />}
          {activeTab === 'profile' && <ProfileTab />}
          {activeTab === 'security' && <SecurityTab />}
          {activeTab === 'system' && (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textDim, fontFamily: T.mono, flexDirection: 'column', gap: 16 }}>
              <Cpu size={48} opacity={0.2} />
              <div>MODULE_NOT_INITIALIZED</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── INTEGRATIONS COMMAND CENTER ─── */
function IntegrationsTab() {
  const NODES = [
    { id: 'binance', name: 'Binance API', type: 'Exchange', status: 'connected', ping: '12ms', ip: '192.168.1.44', icon: '🔶' },
    { id: 'mt5', name: 'MetaTrader 5', type: 'Trading Terminal', status: 'connected', ping: '8ms', ip: '10.0.4.22', icon: '📈' },
    { id: 'alpaca', name: 'Alpaca', type: 'Brokerage', status: 'pending', ping: '--', ip: 'WAITING_AUTH', icon: '🦙' },
  ]

  return (
    <div style={{ animation: 'fadeUp 0.4s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>العُقد المتصلة (Nodes)</h2>
          <p style={{ fontSize: 12, color: T.textDim, margin: '4px 0 0', fontFamily: T.mono }}>MANAGE API GATEWAYS & DATA FEEDS</p>
        </div>
        <button style={{
          background: `rgba(0, 242, 255, 0.1)`, border: `1px solid ${T.cyan}`, color: T.cyan,
          padding: '10px 20px', borderRadius: 4, fontFamily: T.mono, fontSize: 12, fontWeight: 700,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: GLOW
        }}>
          <Plus size={14} /> [ ADD_NODE ]
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
        {NODES.map(node => (
          <div key={node.id} style={{
            background: 'rgba(10, 14, 23, 0.6)',
            border: `1px solid ${node.status === 'connected' ? T.border : 'rgba(255,184,0,0.3)'}`,
            borderRadius: 8, overflow: 'hidden', position: 'relative'
          }}>
            {/* Top Bar */}
            <div style={{
              background: 'rgba(0,0,0,0.4)', padding: '8px 16px', display: 'flex', justifyContent: 'space-between',
              borderBottom: `1px solid ${T.border}`, fontFamily: T.mono, fontSize: 10, color: T.textDim
            }}>
              <span>ID: {node.id.toUpperCase()}_GATEWAY</span>
              <span>{node.type.toUpperCase()}</span>
            </div>
            
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 8, background: 'rgba(255,255,255,0.03)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
                    border: `1px solid ${T.border}`
                  }}>
                    {node.icon}
                  </div>
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{node.name}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: node.status === 'connected' ? T.green : T.amber,
                        boxShadow: `0 0 10px ${node.status === 'connected' ? T.green : T.amber}`
                      }} />
                      <span style={{ fontSize: 11, fontFamily: T.mono, color: node.status === 'connected' ? T.green : T.amber }}>
                        {node.status === 'connected' ? 'SECURE_LINK_ACTIVE' : 'AWAITING_HANDSHAKE'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Data Grid */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
                background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 6, border: `1px dashed ${T.border}`
              }}>
                <div>
                  <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.mono, marginBottom: 2 }}>LATENCY</div>
                  <div style={{ fontSize: 13, fontFamily: T.mono, color: '#fff' }}>{node.ping}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.mono, marginBottom: 2 }}>HOST IP</div>
                  <div style={{ fontSize: 13, fontFamily: T.mono, color: '#fff' }}>{node.ip}</div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button style={{
                  flex: 1, padding: '8px', background: 'transparent', border: `1px solid ${T.border}`,
                  color: T.text, borderRadius: 4, fontFamily: T.mono, fontSize: 11, cursor: 'pointer',
                  transition: 'background 0.2s'
                }} onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                   onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                  [ CONFIGURE ]
                </button>
                {node.status === 'connected' ? (
                  <button style={{
                    padding: '8px 16px', background: 'rgba(255, 77, 77, 0.1)', border: `1px solid ${T.red}55`,
                    color: T.red, borderRadius: 4, fontFamily: T.mono, fontSize: 11, cursor: 'pointer'
                  }}>
                    DISCONNECT
                  </button>
                ) : (
                  <button style={{
                    padding: '8px 16px', background: `rgba(0, 242, 255, 0.1)`, border: `1px solid ${T.cyan}55`,
                    color: T.cyan, borderRadius: 4, fontFamily: T.mono, fontSize: 11, cursor: 'pointer'
                  }}>
                    AUTHORIZE
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── TRADER PROFILE CARD ─── */
function ProfileTab() {
  return (
    <div style={{ animation: 'fadeUp 0.4s ease', maxWidth: 800 }}>
      <h2 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 24px 0' }}>هوية المتداول (Trader Clearance)</h2>
      
      {/* ID Badge */}
      <div style={{
        background: `linear-gradient(135deg, rgba(10, 14, 23, 0.9) 0%, rgba(5, 8, 15, 0.95) 100%)`,
        border: `1px solid ${T.cyan}44`, borderRadius: 12, padding: 32,
        position: 'relative', overflow: 'hidden', boxShadow: GLOW,
        display: 'flex', gap: 32, alignItems: 'center'
      }}>
        {/* Hologram Decor */}
        <div style={{ position: 'absolute', right: -20, top: -20, opacity: 0.05, transform: 'scale(2)', pointerEvents: 'none' }}>
          <Shield size={200} />
        </div>

        <div style={{
          width: 100, height: 100, borderRadius: 12, border: `2px solid ${T.cyan}`,
          background: 'rgba(0, 242, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `inset 0 0 20px rgba(0, 242, 255, 0.2)`, position: 'relative'
        }}>
          <User size={48} color={T.cyan} />
          {/* Scanline overlay */}
          <div style={{
            position: 'absolute', inset: 0, background: `linear-gradient(to bottom, transparent 50%, rgba(0,242,255,0.1) 51%)`,
            backgroundSize: '100% 4px'
          }} />
        </div>

        <div style={{ flex: 1, zIndex: 1 }}>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.cyan, marginBottom: 4, letterSpacing: '0.1em' }}>CLEARANCE LEVEL: DIAMOND</div>
          <h3 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 16px 0', color: '#fff' }}>جابر الصبحي</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.mono }}>TRADER_ID</div>
              <div style={{ fontFamily: T.mono, fontSize: 14 }}>RUA-9928-VX</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.mono }}>ACCOUNT_STATUS</div>
              <div style={{ fontFamily: T.mono, fontSize: 14, color: T.green }}>VERIFIED_ACTIVE</div>
            </div>
          </div>
        </div>

        <div style={{ width: 80, height: 80, border: `1px dashed ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
           <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textDim, textAlign: 'center' }}>QR<br/>AUTH</span>
        </div>
      </div>

      {/* Edit Form */}
      <div style={{ marginTop: 32, background: 'rgba(10, 14, 23, 0.6)', border: `1px solid ${T.border}`, borderRadius: 8, padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 20 }}>تحديث البيانات (Update Matrix)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
           <div>
             <label style={{ display: 'block', fontSize: 11, fontFamily: T.mono, color: T.textDim, marginBottom: 8 }}>FULL_NAME</label>
             <input type="text" defaultValue="جابر الصبحي" style={{
               width: '100%', background: 'rgba(0,0,0,0.5)', border: `1px solid ${T.border}`,
               padding: '12px 16px', borderRadius: 4, color: '#fff', fontFamily: T.sans, fontSize: 14
             }} />
           </div>
           <div>
             <label style={{ display: 'block', fontSize: 11, fontFamily: T.mono, color: T.textDim, marginBottom: 8 }}>CONTACT_EMAIL</label>
             <input type="email" defaultValue="jaber@rouatrading.com" style={{
               width: '100%', background: 'rgba(0,0,0,0.5)', border: `1px solid ${T.border}`,
               padding: '12px 16px', borderRadius: 4, color: '#fff', fontFamily: T.mono, fontSize: 14
             }} />
           </div>
        </div>
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
          <button style={{
            background: T.cyan, color: '#000', border: 'none', padding: '12px 24px',
            borderRadius: 4, fontWeight: 900, fontFamily: T.sans, cursor: 'pointer',
            boxShadow: `0 0 15px ${T.cyan}66`
          }}>
            تأكيد البصمة (SAVE)
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── SECURITY MATRIX ─── */
function SecurityTab() {
  const SEC_ITEMS = [
    { id: 'pwd', label: 'مفتاح التشفير (Password)', status: 'AES-256 ACTIVE', desc: 'تم التحديث منذ 14 يوم', icon: Key },
    { id: '2fa', label: 'المصادقة الثنائية (2FA)', status: 'ENABLED', desc: 'Google Authenticator Sync: OK', icon: Lock },
    { id: 'ip', label: 'مراقبة الشبكة (IP Logs)', status: 'MONITORING', desc: 'لم يتم رصد اتصالات مشبوهة', icon: Radio },
  ]

  return (
    <div style={{ animation: 'fadeUp 0.4s ease', maxWidth: 800 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>مصفوفة الأمان (Security Matrix)</h2>
          <p style={{ fontSize: 12, color: T.textDim, margin: '4px 0 0', fontFamily: T.mono }}>SYSTEM DEFENSE PROTOCOLS</p>
        </div>
        <div style={{ padding: '6px 12px', background: 'rgba(0,255,198,0.1)', border: `1px solid ${T.green}`, color: T.green, borderRadius: 4, fontFamily: T.mono, fontSize: 11 }}>
          DEFCON 5
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {SEC_ITEMS.map((item, i) => (
          <div key={item.id} style={{
            background: 'rgba(10, 14, 23, 0.6)', border: `1px solid ${T.border}`, borderRadius: 8,
            padding: 24, display: 'flex', alignItems: 'center', gap: 20,
            position: 'relative', overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: T.cyan }} />
            
            <div style={{ width: 48, height: 48, borderRadius: 8, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <item.icon size={24} color={T.cyan} />
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{item.label}</h3>
                <span style={{ fontSize: 10, fontFamily: T.mono, color: T.green, background: 'rgba(0,255,198,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                  {item.status}
                </span>
              </div>
              <div style={{ fontSize: 12, color: T.textDim, fontFamily: T.mono }}>{item.desc}</div>
            </div>

            <button style={{
              background: 'transparent', border: `1px solid ${T.border}`, color: '#fff',
              padding: '8px 16px', borderRadius: 4, fontFamily: T.mono, fontSize: 11, cursor: 'pointer',
              transition: 'all 0.2s'
            }} onMouseOver={e => e.currentTarget.style.borderColor = T.cyan} onMouseOut={e => e.currentTarget.style.borderColor = T.border}>
              [ CONFIGURE ]
            </button>
          </div>
        ))}
      </div>
      
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
