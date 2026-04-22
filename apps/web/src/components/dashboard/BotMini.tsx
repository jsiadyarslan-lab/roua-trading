'use client';

import React, { useState } from 'react';
import { useBotStore } from '@/hooks/useBotStore';

export function BotMini() {
  const { isOn, setIsOn, logs, stats, settings, updateSettings } = useBotStore();
  const [activeTab, setActiveTab] = useState<'log' | 'config'>('log');
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) return null;

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

      {/* Tabs */}
      <div style={{ display: 'flex', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
        <button 
          onClick={() => setActiveTab('log')}
          style={{ 
            flex: 1, padding: '8px', fontSize: 11, background: 'transparent', border: 'none',
            color: activeTab === 'log' ? 'var(--accent)' : 'var(--text3)',
            borderBottom: activeTab === 'log' ? '2px solid var(--accent)' : 'none', cursor: 'pointer'
          }}
        >السجل</button>
        <button 
          onClick={() => setActiveTab('config')}
          style={{ 
            flex: 1, padding: '8px', fontSize: 11, background: 'transparent', border: 'none',
            color: activeTab === 'config' ? 'var(--accent)' : 'var(--text3)',
            borderBottom: activeTab === 'config' ? '2px solid var(--accent)' : 'none', cursor: 'pointer'
          }}
        >الإعدادات</button>
      </div>

      {activeTab === 'log' ? (
        <>
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
        </>
      ) : (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 6 }}>الاستراتيجية</label>
            <select 
              value={settings.strategy}
              onChange={(e) => updateSettings({ strategy: e.target.value })}
              style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', color: '#fff', padding: 8, borderRadius: 6, fontSize: 12 }}
            >
              <option value="Trend Follow">Trend Follow (اتباع الاتجاه)</option>
              <option value="Mean Reversion">Mean Reversion (ارتداد متوسط)</option>
              <option value="Scalping">Scalping (مضاربة سريعة)</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 6 }}>المخاطرة لكل صفقة (%)</label>
            <input 
              type="range" min="1" max="10" step="0.5" 
              value={settings.riskPct}
              onChange={(e) => updateSettings({ riskPct: parseFloat(e.target.value) })}
              style={{ width: '100%' }}
            />
            <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--accent)' }}>{settings.riskPct}%</div>
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 6 }}>حد الثقة الأدنى (%)</label>
            <input 
              type="range" min="50" max="95" step="5" 
              value={settings.confLimit}
              onChange={(e) => updateSettings({ confLimit: parseInt(e.target.value) })}
              style={{ width: '100%' }}
            />
            <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--amber)' }}>{settings.confLimit}%</div>
          </div>
        </div>
      )}
    </div>
  );
}
