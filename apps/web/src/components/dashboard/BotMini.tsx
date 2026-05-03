'use client';

import React, { useState } from 'react';
import { useBotStore } from '@/hooks/useBotStore';

type BotTab = 'log' | 'config';

export function BotMini() {
  const { isOn, engineState, setIsOn, logs, stats, settings, updateSettings } = useBotStore();
  const [activeTab, setActiveTab] = useState<BotTab>('log');

  // Add initial log entry if logs are empty and bot is on
  React.useEffect(() => {
    if (isOn && logs.length === 0) {
      const { addLog } = useBotStore.getState();
      addLog(`[نظام] روبوت التداول جاهز — استراتيجية: ${settings.strategy}`, 'info');
      addLog(`[نظام] المسح التلقائي نشط كل 30 ثانية — حد الثقة: ${settings.confLimit}%`, 'info');
      addLog(`[مسح] جاري فحص ${7} أصول رئيسية...`, 'info');
    }
  }, []);

  const engineStateLabel = {
    idle: 'متوقف',
    armed: 'مسلّح',
    scanning: 'يمسح السوق',
    entering: 'يدخل صفقة',
    managing: 'يدير المراكز',
    exiting: 'يغلق مركزًا',
    cooldown: 'تبريد',
  }[engineState];

  return (
    <div
      className="bot-mini-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        maxHeight: '100%',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))',
        borderRadius: 16,
        border: '1px solid rgba(0,229,255,0.08)',
        overflow: 'hidden',
        fontFamily: "'Cairo', sans-serif",
        touchAction: 'manipulation',
      }}
    >
      {/* Header */}
      <div
        className="bot-mini-header"
        style={{
          padding: '7px 10px 6px',
          background: 'linear-gradient(90deg, rgba(0,229,255,0.12), transparent)',
          borderBottom: '1px solid rgba(0,229,255,0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: isOn ? 'var(--success)' : 'var(--text3)',
              boxShadow: isOn ? '0 0 10px var(--success)' : 'none',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: 'var(--foreground)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            روبوت المتابعة الآلي
          </span>
          <span
            style={{
              fontSize: 6.5,
              padding: '1px 5px',
              borderRadius: 4,
              background: 'rgba(255,184,0,0.15)',
              color: '#FFB800',
              fontWeight: 700,
              fontFamily: 'monospace',
              flexShrink: 0,
            }}
          >
            PAPER 📄
          </span>
          <span
            style={{
              fontSize: 6.5,
              padding: '1px 5px',
              borderRadius: 4,
              background: 'rgba(0,229,255,0.12)',
              color: 'var(--accent)',
              fontWeight: 700,
              fontFamily: 'monospace',
              flexShrink: 0,
            }}
          >
            {engineStateLabel}
          </span>
        </div>

        <div className="bot-mini-header__actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => setIsOn(!isOn)}
            className={isOn ? 'btn-danger-active' : 'btn-cyan-active'}
            style={{
              fontSize: 8,
              minHeight: 26,
              minWidth: 54,
              padding: '4px 8px',
              borderRadius: 7,
              touchAction: 'manipulation',
              lineHeight: 1,
            }}
          >
            {isOn ? 'إيقاف' : 'تشغيل'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bot-mini-tabs" style={{ display: 'flex', background: '#09111a', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '3px 5px', gap: 3 }}>
        <button
          type="button"
          onClick={() => setActiveTab('log')}
          style={{
            flex: 1,
            minHeight: 20,
            padding: '3px 5px',
            fontSize: 7.5,
            background: activeTab === 'log' ? 'rgba(0,229,255,0.14)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${activeTab === 'log' ? 'rgba(0,229,255,0.32)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 6,
            color: activeTab === 'log' ? 'var(--accent)' : 'var(--text3)',
            cursor: 'pointer',
            touchAction: 'manipulation',
            lineHeight: 1,
          }}
        >
          السجل
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('config')}
          style={{
            flex: 1,
            minHeight: 20,
            padding: '3px 5px',
            fontSize: 7.5,
            background: activeTab === 'config' ? 'rgba(0,229,255,0.14)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${activeTab === 'config' ? 'rgba(0,229,255,0.32)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 6,
            color: activeTab === 'config' ? 'var(--accent)' : 'var(--text3)',
            cursor: 'pointer',
            touchAction: 'manipulation',
            lineHeight: 1,
          }}
        >
          الإعدادات
        </button>
      </div>

      {activeTab === 'log' ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* Stats */}
          <div
            className="bot-mini-stats"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 5,
              padding: 6,
              background: 'transparent',
              borderBottom: '1px solid rgba(0,229,255,0.08)',
              flexShrink: 0,
            }}
          >
            <div className="card" style={{ padding: 5, textAlign: 'center', minHeight: 30 }}>
              <div style={{ fontSize: 7, color: 'var(--text3)' }}>الصفقات</div>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)' }}>{stats.trades}</div>
            </div>
            <div className="card" style={{ padding: 5, textAlign: 'center', minHeight: 30 }}>
              <div style={{ fontSize: 7, color: 'var(--text3)' }}>الربح</div>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--success)' }}>${stats.profit}</div>
            </div>
            <div className="card" style={{ padding: 5, textAlign: 'center', minHeight: 30 }}>
              <div style={{ fontSize: 7, color: 'var(--text3)' }}>نسبة الفوز</div>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--amber)' }}>{stats.winRate}%</div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 5,
              padding: '0 6px 6px',
              background: 'transparent',
              borderBottom: '1px solid rgba(0,229,255,0.08)',
              flexShrink: 0,
            }}
          >
            <div className="card" style={{ padding: 4, textAlign: 'center', minHeight: 26 }}>
              <div style={{ fontSize: 7, color: 'var(--text3)' }}>مفتوحة</div>
              <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--accent)' }}>{stats.openPositions}</div>
            </div>
            <div className="card" style={{ padding: 4, textAlign: 'center', minHeight: 26 }}>
              <div style={{ fontSize: 7, color: 'var(--text3)' }}>فوز / خسارة</div>
              <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--foreground)' }}>{stats.wins}/{stats.losses}</div>
            </div>
            <div className="card" style={{ padding: 4, textAlign: 'center', minHeight: 26 }}>
              <div style={{ fontSize: 7, color: 'var(--text3)' }}>خسارة الجلسة</div>
              <div style={{ fontSize: 9, fontWeight: 800, color: stats.sessionLoss < 0 ? 'var(--danger)' : 'var(--text3)' }}>
                ${stats.sessionLoss}
              </div>
            </div>
          </div>

          {/* Logs */}
          <div
            className="bot-notifications-container custom-scrollbar"
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              maxHeight: '40vh',
              overflowY: 'auto',
              padding: 6,
              background: 'rgba(5,10,18,0.45)',
              scrollbarGutter: 'stable',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {logs.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', opacity: 0.3, fontSize: 9 }}>السجل فارغ</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {logs.map((log, i) => (
                  <div key={i} className="card" style={{ fontSize: 8, padding: '5px 6px', lineHeight: 1.4 }}>
                    <span style={{ color: 'var(--text4)', marginRight: 5 }}>[{log.time}]</span>
                    <span
                      style={{
                        color:
                          log.type === 'buy'
                            ? 'var(--success)'
                            : log.type === 'sell'
                              ? 'var(--danger)'
                              : log.type === 'warn'
                                ? 'var(--amber)'
                                : '#fff',
                      }}
                    >
                      {log.msg}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bot-mini-config" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 6 }}>الاستراتيجية</label>
            <select
              value={settings.strategy}
              onChange={(e) => updateSettings({ strategy: e.target.value })}
              style={{
                width: '100%',
                minHeight: 48,
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                color: '#fff',
                padding: '12px 10px',
                borderRadius: 8,
                fontSize: 12,
                touchAction: 'manipulation',
              }}
            >
              <option value="AUTO">AUTO (تلقائي — اختيار أفضل استراتيجية)</option>
              <option value="TREND_FOLLOWING">Trend Following (اتباع الاتجاه)</option>
              <option value="MEAN_REVERSION">Mean Reversion (ارتداد متوسط)</option>
              <option value="BREAKOUT">Breakout (الاختراق)</option>
              <option value="MOMENTUM">Momentum (الزخم)</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 6 }}>المخاطرة لكل صفقة (%)</label>
            <input
              type="range"
              min="1"
              max="10"
              step="0.5"
              value={settings.riskPct}
              onChange={(e) => updateSettings({ riskPct: parseFloat(e.target.value) })}
              style={{ width: '100%', minHeight: 48, touchAction: 'pan-x' }}
            />
            <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--accent)' }}>{settings.riskPct}%</div>
          </div>

          <div>
            <label style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 6 }}>حد الثقة الأدنى (%)</label>
            <input
              type="range"
              min="50"
              max="95"
              step="5"
              value={settings.confLimit}
              onChange={(e) => updateSettings({ confLimit: parseInt(e.target.value, 10) })}
              style={{ width: '100%', minHeight: 48, touchAction: 'pan-x' }}
            />
            <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--amber)' }}>{settings.confLimit}%</div>
          </div>

          <div>
            <label style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 6 }}>وضع إجماع الذكاء الاصطناعي</label>
            <div
              onClick={() => updateSettings({ useAIConsensus: !settings.useAIConsensus })}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  updateSettings({ useAIConsensus: !settings.useAIConsensus });
                }
              }}
              className="bot-mini-toggle"
              style={{
                width: '100%',
                minHeight: 48,
                padding: '10px 12px',
                background: settings.useAIConsensus ? 'rgba(0,229,255,0.1)' : 'var(--bg2)',
                border: `1px solid ${settings.useAIConsensus ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                touchAction: 'manipulation',
                textAlign: 'center',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: settings.useAIConsensus ? 'var(--accent)' : 'var(--text3)' }}>
                {settings.useAIConsensus ? '⚡ مفعل (إجماع 6 نماذج)' : 'متوقف (زخم فني فقط)'}
              </span>
            </div>
            <p style={{ fontSize: 8, color: 'var(--text4)', marginTop: 4, lineHeight: 1.4 }}>
              * عند التفعيل، سيقوم البوت باستشارة 6 نماذج ذكاء اصطناعي قبل كل صفقة.
            </p>
          </div>
        </div>
      )}

      <style>{`
        .bot-mini-shell,
        .bot-mini-shell * {
          box-sizing: border-box;
        }

        .bot-mini-shell button,
        .bot-mini-shell select,
        .bot-mini-shell input,
        .bot-mini-shell [role="button"] {
          -webkit-tap-highlight-color: transparent;
        }

        @media (max-width: 767px) {
          .bot-mini-shell {
            border-radius: 0;
          }

          .bot-mini-header {
            align-items: center;
            flex-wrap: wrap;
          }

          @media (max-width: 767px) {
            .bot-mini-header {
              align-items: flex-start;
            }
          }

          .bot-mini-header__actions {
            width: 100%;
            justify-content: flex-end;
          }

          .bot-mini-tabs button {
            min-height: 48px;
            padding-top: 14px;
            padding-bottom: 14px;
          }

          .bot-mini-stats {
            grid-template-columns: 1fr !important;
          }

          .bot-mini-config {
            padding: 12px;
            gap: 14px;
          }

          .bot-mini-shell select,
          .bot-mini-shell input[type="range"],
          .bot-mini-shell [role="button"] {
            min-height: 48px;
          }
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
