'use client';

import React, { useState } from 'react';
import { useBotStore } from '@/hooks/useBotStore';

type BotTab = 'log' | 'config';

export function BotMini() {
  const { isOn, engineState, setIsOn, logs, stats, settings, updateSettings } = useBotStore();
  const [activeTab, setActiveTab] = useState<BotTab>('log');
  const [hydrated, setHydrated] = React.useState(false);

  const engineStateLabel = {
    idle: 'متوقف',
    armed: 'مسلّح',
    scanning: 'يمسح السوق',
    entering: 'يدخل صفقة',
    managing: 'يدير المراكز',
    exiting: 'يغلق مركزًا',
    cooldown: 'تبريد',
  }[engineState];

  React.useEffect(() => {
    setHydrated(true);
    // Safety timeout — always show after 1.5s
    const t = setTimeout(() => setHydrated(true), 1500);
    return () => clearTimeout(t);
  }, []);

  if (!hydrated) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            border: '2px solid var(--accent)',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>تهيئة محرك البوت...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div
      className="bot-mini-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        maxHeight: '100%',
        background: 'var(--bg)',
        borderRadius: 12,
        border: '1px solid var(--border)',
        overflow: 'hidden',
        fontFamily: "'Cairo', sans-serif",
        touchAction: 'manipulation',
      }}
    >
      {/* Header */}
      <div
        className="bot-mini-header"
        style={{
          padding: '12px 16px',
          background: 'var(--bg2)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
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
              fontSize: 13,
              fontWeight: 800,
              color: '#fff',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            روبوت التداول الآلي
          </span>
          <span
            style={{
              fontSize: 8,
              padding: '1px 6px',
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
              fontSize: 8,
              padding: '1px 6px',
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
              fontSize: 10,
              minHeight: 48,
              minWidth: 88,
              padding: '10px 14px',
              borderRadius: 8,
              touchAction: 'manipulation',
            }}
          >
            {isOn ? 'إيقاف' : 'تشغيل'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bot-mini-tabs" style={{ display: 'flex', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
        <button
          type="button"
          onClick={() => setActiveTab('log')}
          style={{
            flex: 1,
            minHeight: 48,
            padding: '12px 8px',
            fontSize: 11,
            background: 'transparent',
            border: 'none',
            color: activeTab === 'log' ? 'var(--accent)' : 'var(--text3)',
            borderBottom: activeTab === 'log' ? '2px solid var(--accent)' : 'none',
            cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          السجل
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('config')}
          style={{
            flex: 1,
            minHeight: 48,
            padding: '12px 8px',
            fontSize: 11,
            background: 'transparent',
            border: 'none',
            color: activeTab === 'config' ? 'var(--accent)' : 'var(--text3)',
            borderBottom: activeTab === 'config' ? '2px solid var(--accent)' : 'none',
            cursor: 'pointer',
            touchAction: 'manipulation',
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
              gap: 1,
              background: 'var(--border)',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}
          >
            <div style={{ background: 'var(--surface)', padding: 10, textAlign: 'center', minHeight: 48 }}>
              <div style={{ fontSize: 9, color: 'var(--text3)' }}>الصفقات</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)' }}>{stats.trades}</div>
            </div>
            <div style={{ background: 'var(--surface)', padding: 10, textAlign: 'center', minHeight: 48 }}>
              <div style={{ fontSize: 9, color: 'var(--text3)' }}>الربح</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--success)' }}>${stats.profit}</div>
            </div>
            <div style={{ background: 'var(--surface)', padding: 10, textAlign: 'center', minHeight: 48 }}>
              <div style={{ fontSize: 9, color: 'var(--text3)' }}>نسبة الفوز</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--amber)' }}>{stats.winRate}%</div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 1,
              background: 'var(--border)',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}
          >
            <div style={{ background: 'var(--surface)', padding: 8, textAlign: 'center', minHeight: 44 }}>
              <div style={{ fontSize: 9, color: 'var(--text3)' }}>مفتوحة</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>{stats.openPositions}</div>
            </div>
            <div style={{ background: 'var(--surface)', padding: 8, textAlign: 'center', minHeight: 44 }}>
              <div style={{ fontSize: 9, color: 'var(--text3)' }}>فوز / خسارة</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--foreground)' }}>{stats.wins}/{stats.losses}</div>
            </div>
            <div style={{ background: 'var(--surface)', padding: 8, textAlign: 'center', minHeight: 44 }}>
              <div style={{ fontSize: 9, color: 'var(--text3)' }}>خسارة الجلسة</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: stats.sessionLoss < 0 ? 'var(--danger)' : 'var(--text3)' }}>
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
              padding: 10,
              background: '#060b13',
              scrollbarGutter: 'stable',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {logs.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', opacity: 0.3, fontSize: 11 }}>السجل فارغ</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {logs.map((log, i) => (
                  <div key={i} style={{ fontSize: 10.5, borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: 6, lineHeight: 1.5 }}>
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
        <div className="bot-mini-config" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              <option value="Trend Follow">Trend Follow (اتباع الاتجاه)</option>
              <option value="Mean Reversion">Mean Reversion (ارتداد متوسط)</option>
              <option value="Scalping">Scalping (مضاربة سريعة)</option>
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
            flex-wrap: wrap;
            align-items: flex-start !important;
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
