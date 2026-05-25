// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Template Manager
// Save/load chart templates with indicators, settings, drawings
// ═══════════════════════════════════════════════════════════

'use client';

import { useState, useEffect } from 'react';
import type { ChartTemplate } from '@/lib/charts/types';
import { ChartTemplateManager } from '@/lib/charts/ChartTemplate';
import { useLocale } from 'next-intl';

interface TemplateManagerProps {
  onLoadTemplate: (id: string) => void;
  onSaveTemplate: (name: string) => void;
  onClose: () => void;
}

export function TemplateManager({ onLoadTemplate, onSaveTemplate, onClose }: TemplateManagerProps) {
  const locale = useLocale();
  const dateLocale = locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-US';
  const [templates, setTemplates] = useState<ChartTemplate[]>([]);
  const [newName, setNewName] = useState('');
  const [importJson, setImportJson] = useState('');
  const [showImport, setShowImport] = useState(false);

  // Load templates
  useEffect(() => {
    setTemplates(ChartTemplateManager.getAll());
  }, []);

  const handleSave = () => {
    if (!newName.trim()) return;
    onSaveTemplate(newName.trim());
    setNewName('');
    setTemplates(ChartTemplateManager.getAll());
  };

  const handleDelete = (id: string) => {
    ChartTemplateManager.delete(id);
    setTemplates(ChartTemplateManager.getAll());
  };

  const handleExport = (id: string) => {
    const json = ChartTemplateManager.exportTemplate(id);
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `roua-template-${id}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    if (!importJson.trim()) return;
    const template = ChartTemplateManager.importTemplate(importJson);
    if (template) {
      setTemplates(ChartTemplateManager.getAll());
      setImportJson('');
      setShowImport(false);
    }
  };

  const COLORS = {
    card: '#151A22',
    border: 'rgba(42,49,60,0.9)',
    cyan: '#00D4FF',
    text: '#F0F2F5',
    textSecondary: '#8B92A8',
    textMuted: '#8B92A8',
    success: '#00FFA3',
    danger: '#FF4757',
    warning: '#fbbf24',
    bg: '#0B0E14',
  };

  return (
    <div style={{
      background: COLORS.card,
      border: '1px solid rgba(0,212,255,0.2)',
      borderRadius: 10,
      padding: 12,
      zIndex: 500,
      boxShadow: '0 15px 45px rgba(0,0,0,0.85)',
      backdropFilter: 'blur(10px)',
      width: 280,
    }}>
      {/* Header */}
      <div data-drag-handle style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, cursor: 'grab' }}>
        <span style={{ fontSize: 11, color: COLORS.text, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>
          💾 إدارة القوالب
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* Save New Template */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="اسم القالب..."
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          style={{
            flex: 1,
            padding: '5px 8px',
            background: COLORS.bg,
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 4,
            color: COLORS.text,
            fontSize: 10,
            fontFamily: "'Cairo', sans-serif",
            outline: 'none',
          }}
        />
        <button
          onClick={handleSave}
          disabled={!newName.trim()}
          style={{
            padding: '5px 10px',
            background: COLORS.cyan,
            border: 'none',
            borderRadius: 4,
            color: '#000',
            fontSize: 10,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: "'Cairo', sans-serif",
            opacity: newName.trim() ? 1 : 0.5,
          }}
        >
          حفظ
        </button>
      </div>

      {/* Templates List */}
      <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 8 }}>
        {templates.length === 0 ? (
          <div style={{ textAlign: 'center', color: COLORS.textMuted, fontSize: 9, padding: '10px 0', fontFamily: "'Cairo', sans-serif" }}>
            لا توجد قوالب محفوظة
          </div>
        ) : (
          templates.map(tpl => (
            <div
              key={tpl.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 4px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: COLORS.text, fontWeight: 600, fontFamily: "'Cairo', sans-serif" }}>
                  {tpl.name}
                </div>
                <div style={{ fontSize: 8, color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
                  {tpl.indicators.length} {locale === 'ar' ? 'مؤشرات' : 'indicators'} • {new Date(tpl.updatedAt).toLocaleDateString(dateLocale)}
                </div>
              </div>

              {/* Load */}
              <button
                onClick={() => { onLoadTemplate(tpl.id); onClose(); }}
                style={{
                  background: 'rgba(0,212,255,0.1)',
                  border: '1px solid rgba(0,212,255,0.2)',
                  borderRadius: 4,
                  color: COLORS.cyan,
                  fontSize: 8,
                  padding: '3px 6px',
                  cursor: 'pointer',
                  fontFamily: "'Cairo', sans-serif",
                }}
              >
                تحميل
              </button>

              {/* Export */}
              <button
                onClick={() => handleExport(tpl.id)}
                style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: 10 }}
                title="تصدير"
              >
                📤
              </button>

              {/* Delete */}
              <button
                onClick={() => handleDelete(tpl.id)}
                style={{ background: 'none', border: 'none', color: COLORS.danger, cursor: 'pointer', fontSize: 10 }}
                title="حذف"
              >
                🗑
              </button>
            </div>
          ))
        )}
      </div>

      {/* Import */}
      {!showImport ? (
        <button
          onClick={() => setShowImport(true)}
          style={{
            width: '100%',
            padding: '5px 0',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 4,
            color: COLORS.textMuted,
            fontSize: 9,
            cursor: 'pointer',
            fontFamily: "'Cairo', sans-serif",
          }}
        >
          📥 استيراد قالب
        </button>
      ) : (
        <div>
          <textarea
            value={importJson}
            onChange={e => setImportJson(e.target.value)}
            placeholder="الصق JSON القالب هنا..."
            rows={3}
            style={{
              width: '100%',
              padding: '5px 8px',
              background: COLORS.bg,
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 4,
              color: COLORS.text,
              fontSize: 9,
              fontFamily: "'JetBrains Mono', monospace",
              outline: 'none',
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            <button
              onClick={handleImport}
              style={{
                flex: 1,
                padding: '4px 0',
                background: COLORS.success,
                border: 'none',
                borderRadius: 4,
                color: '#000',
                fontSize: 9,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'Cairo', sans-serif",
              }}
            >
              استيراد
            </button>
            <button
              onClick={() => { setShowImport(false); setImportJson(''); }}
              style={{
                flex: 1,
                padding: '4px 0',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 4,
                color: COLORS.textMuted,
                fontSize: 9,
                cursor: 'pointer',
                fontFamily: "'Cairo', sans-serif",
              }}
            >
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
