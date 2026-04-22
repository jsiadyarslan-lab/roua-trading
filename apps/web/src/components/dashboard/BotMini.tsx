'use client';

import React from 'react';
import { useBotStore } from '@/hooks/useBotStore';

export function BotMini() {
  const { isOn, setIsOn, logs, stats } = useBotStore();

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)',
      overflow: 'hidden', fontFamily: "'Cairo', sans-serif"
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ 
            width: 8, height: 8, borderRadius: '50%', 
            background: isOn ? 'var(--success)' : 'var(--text3)',
            boxShadow: isOn ? '0 0 10px var(--success)' : 'none'
          }} />
          <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>روبوت التداول الآلي</span>
        </div>
        <button 
          onClick={() => setIsOn(!isOn)}
          className={isOn ? "btn-danger-active" : "btn-cyan-active"}
          style={{ fontSize: 10, padding: '4px 12px', borderRadius: 6 }}
        >
          {isOn ? 'إيقاف' : 'تشغيل'}
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: 'var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ background: 'var(--surface)', padding: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: 'var(--text3)' }}>الصفقات</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)' }}>{stats.trades}</div>
        </div>
        <div style={{ background: 'var(--surface)', padding: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: 'var(--text3)' }}>الربح</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--success)' }}>${stats.profit}</div>
        </div>
        <div style={{ background: 'var(--surface)', padding: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: 'var(--text3)' }}>نسبة الفوز</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--amber)' }}>{stats.winRate}%</div>
        </div>
      </div>

      {/* Logs */}
      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: 10, background: '#060b13' }}>
        {logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', opacity: 0.3, fontSize: 11 }}>السجل فارغ</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {logs.map((log, i) => (
              <div key={i} style={{ fontSize: 10.5, borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: 4 }}>
                <span style={{ color: 'var(--text4)', marginRight: 5 }}>[{log.time}]</span>
                <span style={{ 
                  color: log.type === 'buy' ? 'var(--success)' : 
                         log.type === 'sell' ? 'var(--danger)' : 
                         log.type === 'warn' ? 'var(--amber)' : '#fff'
                }}>
                  {log.msg}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
