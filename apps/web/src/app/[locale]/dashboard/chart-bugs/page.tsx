'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';

interface BugResult {
  id: string;
  title: string;
  severity: string;
  registeredStatus: string;
  actualStatus: 'PRESENT' | 'FIXED' | 'REGRESSED' | 'UNKNOWN';
  file: string;
  detail: string;
  matchedFiles: string[];
  description: string;
  impact?: string;
  fix?: string;
}

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'TIMEOUT' | 'ERROR';
  output?: string;
  error?: string;
}

interface ApiResponse {
  success: boolean;
  timestamp: string;
  summary: {
    total: number;
    fixed: number;
    present: number;
    regressed: number;
    unknown: number;
    testsPassed: number;
    testsFailed: number;
    testsTotal: number;
  };
  bugs: BugResult[];
  tests: TestResult[];
  error?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: '#ff4757',
  HIGH: '#ff8c42',
  MEDIUM: '#ffb700',
  LOW: '#5b9bd5',
};

const STATUS_CONFIG: Record<string, { emoji: string; color: string; bg: string; label: string }> = {
  FIXED: { emoji: '✅', color: '#00ffa3', bg: 'rgba(0,255,163,0.10)', label: 'مُصلَح' },
  PRESENT: { emoji: '🔴', color: '#ff4757', bg: 'rgba(255,71,87,0.10)', label: 'موجود' },
  REGRESSED: { emoji: '🚨', color: '#ff8c42', bg: 'rgba(255,140,66,0.15)', label: 'انتكس!' },
  UNKNOWN: { emoji: '⚪', color: '#8b92a8', bg: 'rgba(139,146,168,0.10)', label: 'غير معروف' },
};

const TEST_STATUS_CONFIG: Record<string, { emoji: string; color: string }> = {
  PASS: { emoji: '✅', color: '#00ffa3' },
  FAIL: { emoji: '❌', color: '#ff4757' },
  TIMEOUT: { emoji: '⏱️', color: '#ff8c42' },
  ERROR: { emoji: '💥', color: '#ff4757' },
};

export default function ChartBugsPage() {
  const t = useTranslations('common');
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'fixed' | 'open' | 'regressed'>('all');
  const [verbose, setVerbose] = useState(false);
  const [expandedBug, setExpandedBug] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string>('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (verbose) params.set('verbose', '1');
      const res = await fetch(`/api/chart-bugs?${params.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل التحميل');
      setData(json);
      setLastRun(new Date().toLocaleString('ar-EG'));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [verbose]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredBugs = data?.bugs.filter(b => {
    if (filter === 'all') return true;
    if (filter === 'fixed') return b.actualStatus === 'FIXED';
    if (filter === 'open') return b.actualStatus === 'PRESENT' || b.actualStatus === 'UNKNOWN';
    if (filter === 'regressed') return b.actualStatus === 'REGRESSED';
    return true;
  }) || [];

  return (
    <div style={{ minHeight: '100vh', background: '#0b0e14', color: '#e8edf3', fontFamily: 'system-ui, sans-serif', direction: 'rtl' }}>
      {/* Header */}
      <div style={{
        padding: '24px 32px',
        borderBottom: '1px solid rgba(0,212,255,0.15)',
        background: 'linear-gradient(135deg, rgba(0,212,255,0.05) 0%, rgba(0,255,163,0.03) 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: '#00d4ff' }}>
              🐛 سجل أخطاء الشارت
            </h1>
            <p style={{ fontSize: 14, color: '#8b92a8', margin: '4px 0 0' }}>
              نظام منع الانتكاس الدائم — {data?.summary.total || 0} خطأ مسجَّل
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setVerbose(!verbose)}
              style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(0,212,255,0.3)',
                background: verbose ? 'rgba(0,212,255,0.15)' : 'transparent',
                color: verbose ? '#00d4ff' : '#8b92a8', cursor: 'pointer', fontSize: 13,
              }}
            >
              {verbose ? '✓ تفصيلي' : 'تفصيلي'}
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              style={{
                padding: '8px 20px', borderRadius: 8, border: 'none',
                background: loading ? '#333' : 'linear-gradient(135deg, #00d4ff, #00ffa3)',
                color: loading ? '#888' : '#0b0e14', cursor: loading ? 'wait' : 'pointer',
                fontWeight: 700, fontSize: 14,
              }}
            >
              {loading ? '⏳ جارٍ الفحص...' : '🔄 إعادة الفحص'}
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {data && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16, padding: '24px 32px',
        }}>
          <SummaryCard label="إجمالي الأخطاء" value={data.summary.total} color="#00d4ff" emoji="📋" />
          <SummaryCard label="مُصلَح" value={data.summary.fixed} color="#00ffa3" emoji="✅" />
          <SummaryCard label="موجود" value={data.summary.present} color="#ff4757" emoji="🔴" />
          <SummaryCard label="انتكس" value={data.summary.regressed} color="#ff8c42" emoji="🚨" highlight={data.summary.regressed > 0} />
          <SummaryCard label="غير معروف" value={data.summary.unknown} color="#8b92a8" emoji="⚪" />
          <SummaryCard label="اختبارات ناجحة" value={`${data.summary.testsPassed}/${data.summary.testsTotal}`} color="#00ffa3" emoji="🧪" />
        </div>
      )}

      {/* Last run timestamp */}
      {lastRun && (
        <div style={{ padding: '0 32px 8px', fontSize: 12, color: '#5b6577' }}>
          آخر فحص: {lastRun}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div style={{
          margin: '0 32px 16px', padding: 16, borderRadius: 12,
          background: 'rgba(255,71,87,0.10)', border: '1px solid rgba(255,71,87,0.3)',
          color: '#ff4757',
        }}>
          <strong>❌ خطأ:</strong> {error}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ padding: '0 32px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {([
          { key: 'all', label: 'الكل', count: data?.bugs.length || 0 },
          { key: 'fixed', label: '✅ مُصلَح', count: data?.bugs.filter(b => b.actualStatus === 'FIXED').length || 0 },
          { key: 'open', label: '🔴 موجود', count: data?.bugs.filter(b => b.actualStatus === 'PRESENT' || b.actualStatus === 'UNKNOWN').length || 0 },
          { key: 'regressed', label: '🚨 انتكس', count: data?.bugs.filter(b => b.actualStatus === 'REGRESSED').length || 0 },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              padding: '6px 14px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)',
              background: filter === tab.key ? 'rgba(0,212,255,0.15)' : 'transparent',
              color: filter === tab.key ? '#00d4ff' : '#8b92a8',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Bugs table */}
      <div style={{ padding: '0 32px 32px' }}>
        {loading && !data ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#5b6577' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
            <div>جارٍ فحص {`>`} 865 ملف و {data?.summary.total || 20} خطأ...</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredBugs.map(bug => {
              const cfg = STATUS_CONFIG[bug.actualStatus];
              const sevColor = SEVERITY_COLORS[bug.severity] || '#8b92a8';
              const isExpanded = expandedBug === bug.id;
              return (
                <div
                  key={bug.id}
                  style={{
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 12, overflow: 'hidden',
                    background: isExpanded ? cfg.bg : 'rgba(255,255,255,0.02)',
                    transition: 'background 0.15s',
                  }}
                >
                  <div
                    onClick={() => setExpandedBug(isExpanded ? null : bug.id)}
                    style={{
                      padding: '14px 16px', cursor: 'pointer', display: 'flex',
                      alignItems: 'center', gap: 12,
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{cfg.emoji}</span>
                    <span style={{
                      fontWeight: 800, fontSize: 13, color: '#5b6577',
                      minWidth: 70, fontFamily: 'monospace',
                    }}>{bug.id}</span>
                    <span style={{
                      padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                      background: sevColor + '22', color: sevColor, minWidth: 70, textAlign: 'center',
                    }}>{bug.severity}</span>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{bug.title}</span>
                    <span style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33`,
                    }}>{cfg.label}</span>
                    <span style={{ color: '#5b6577', fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '0 16px 16px', fontSize: 13, color: '#a8b0c0' }}>
                      <DetailRow label="الملف" value={bug.file} mono />
                      <DetailRow label="التفاصيل" value={bug.detail} />
                      {bug.description && <DetailRow label="الوصف" value={bug.description} />}
                      {bug.impact && <DetailRow label="الأثر" value={bug.impact} />}
                      {bug.fix && <DetailRow label="الإصلاح" value={bug.fix} />}
                      {bug.matchedFiles.length > 0 && (
                        <DetailRow label="مواقع المطابقة" value={bug.matchedFiles.join('\n')} mono />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tests section */}
      {data && data.tests.length > 0 && (
        <div style={{ padding: '0 32px 48px' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px', color: '#00d4ff' }}>
            🧪 اختبارات الانحدار ({data.summary.testsPassed}/{data.summary.testsTotal} ناجح)
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.tests.map(test => {
              const cfg = TEST_STATUS_CONFIG[test.status] || TEST_STATUS_CONFIG.ERROR;
              return (
                <div
                  key={test.name}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <span style={{ fontSize: 16 }}>{cfg.emoji}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 13, flex: 1 }}>{test.name}</span>
                  <span style={{ color: cfg.color, fontSize: 12, fontWeight: 700 }}>{test.status}</span>
                  {test.error && (
                    <span style={{ color: '#ff4757', fontSize: 11, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {test.error}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        padding: '16px 32px', borderTop: '1px solid rgba(255,255,255,0.05)',
        fontSize: 12, color: '#5b6577', textAlign: 'center',
      }}>
        البيانات من <code style={{ color: '#8b92a8' }}>BUGS.md</code> + فحص مباشر للكود —{' '}
        <a href="https://github.com/jsiadyarslan-lab/roua-trading/blob/main/BUGS.md" target="_blank" rel="noopener" style={{ color: '#00d4ff' }}>
          عرض على GitHub
        </a>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color, emoji, highlight }: {
  label: string; value: number | string; color: string; emoji: string; highlight?: boolean;
}) {
  return (
    <div style={{
      padding: 16, borderRadius: 12,
      background: highlight ? `rgba(255,140,66,0.10)` : 'rgba(255,255,255,0.03)',
      border: highlight ? `1px solid ${color}66` : '1px solid rgba(255,255,255,0.08)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 28, marginBottom: 4 }}>{emoji}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#8b92a8', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 6, alignItems: 'flex-start' }}>
      <span style={{ minWidth: 90, color: '#5b6577', fontSize: 12, fontWeight: 600 }}>{label}:</span>
      <span style={{
        flex: 1, fontSize: 13,
        fontFamily: mono ? 'monospace' : 'inherit',
        whiteSpace: mono ? 'pre-wrap' : 'normal',
        wordBreak: 'break-word',
      }}>{value}</span>
    </div>
  );
}
