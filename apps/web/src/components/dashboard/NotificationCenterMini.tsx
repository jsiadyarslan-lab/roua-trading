'use client'

import React from 'react'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { Bell, CheckCircle2, Zap, AlertTriangle, XCircle, BrainCircuit } from 'lucide-react'

export function NotificationCenterMini() {
  const { notifications, clearAll, markAsRead } = useNotificationStore()

  const getIcon = (type: string) => {
    switch (type) {
      case 'trade': return <Zap size={14} color="var(--success)" />
      case 'ai':    return <BrainCircuit size={14} color="var(--accent)" />
      case 'success': return <CheckCircle2 size={14} color="var(--success)" />
      case 'warning': return <AlertTriangle size={14} color="var(--amber)" />
      case 'error':   return <XCircle size={14} color="var(--danger)" />
      default:      return <Bell size={14} color="var(--text3)" />
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)',
      overflow: 'hidden', fontFamily: "'Cairo', sans-serif"
    }}>
      <div style={{
        padding: '12px 16px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bell size={15} color="var(--accent)" />
          <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>مركز التنبيهات</span>
        </div>
        <button 
          onClick={clearAll}
          style={{ 
            fontSize: 10, background: 'transparent', border: 'none', 
            color: 'var(--text3)', cursor: 'pointer', fontWeight: 700 
          }}
        >مسح الكل</button>
      </div>

      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {notifications.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', opacity: 0.3, fontSize: 11 }}>لا توجد تنبيهات جديدة</div>
        ) : (
          notifications.map((n) => (
            <div 
              key={n.id} 
              onClick={() => markAsRead(n.id)}
              style={{
                padding: '10px', borderRadius: 8, 
                background: n.read ? 'rgba(255,255,255,0.01)' : 'rgba(0, 229, 255, 0.04)',
                border: `1px solid ${n.read ? 'transparent' : 'rgba(0, 229, 255, 0.1)'}`,
                cursor: 'pointer', transition: 'all 0.2s',
                display: 'flex', gap: 10
              }}
            >
              <div style={{ marginTop: 2 }}>{getIcon(n.type)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: n.read ? 'var(--text2)' : '#fff', marginBottom: 2 }}>{n.title}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.4 }}>{n.message}</div>
                <div style={{ fontSize: 8, color: 'var(--text4)', marginTop: 4, textAlign: 'left' }}>
                  {new Date(n.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
