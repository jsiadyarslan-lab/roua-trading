// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Template Manager
// Save/load chart templates with indicators, settings, drawings
// In multi-chart mode: also supports Grid Templates that
// capture ALL charts in the grid (layout + per-cell state)
// ═══════════════════════════════════════════════════════════

'use client';

import { useState, useEffect } from 'react';
import type { ChartTemplate } from '@/lib/charts/types';
import { ChartTemplateManager } from '@/lib/charts/ChartTemplate';
import { GridTemplateManager, type GridTemplate } from '@/lib/charts/GridTemplate';
import { useLocale, useTranslations } from 'next-intl'

interface TemplateManagerProps {
  onLoadTemplate: (id: string) => void;
  onSaveTemplate: (name: string) => void;
  onClose: () => void;
  // ── Grid template support (multi-chart mode) ──
  isMultiChart?: boolean;
  onLoadGridTemplate?: (id: string) => void;
  onSaveGridTemplate?: (name: string) => void;
}

export function TemplateManager({
  onLoadTemplate, onSaveTemplate, onClose,
  isMultiChart = false,
  onLoadGridTemplate, onSaveGridTemplate,
}: TemplateManagerProps) {
  const locale = useLocale();
  const tc = useTranslations('dashboard.chart');
  const dateLocale = locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : locale === 'tr' ? 'tr-TR' : 'en-US';
  const [templates, setTemplates] = useState<ChartTemplate[]>([]);
  const [gridTemplates, setGridTemplates] = useState<GridTemplate[]>([]);
  const [newName, setNewName] = useState('');
  const [importJson, setImportJson] = useState('');
  const [showImport, setShowImport] = useState(false);
  // Tab: 'single' | 'grid' — only relevant in multi-chart mode
  const [activeTab, setActiveTab] = useState<'single' | 'grid'>('grid');

  // Load templates
  useEffect(() => {
    setTemplates(ChartTemplateManager.getAll());
    if (isMultiChart) {
      setGridTemplates(GridTemplateManager.getAll());
    }
  }, [isMultiChart]);

  const refreshTemplates = () => {
    setTemplates(ChartTemplateManager.getAll());
    if (isMultiChart) {
      setGridTemplates(GridTemplateManager.getAll());
    }
  };

  // ── Single-chart template handlers ──
  const handleSave = () => {
    if (!newName.trim()) return;
    if (isMultiChart && activeTab === 'grid' && onSaveGridTemplate) {
      onSaveGridTemplate(newName.trim());
    } else {
      onSaveTemplate(newName.trim());
    }
    setNewName('');
    refreshTemplates();
  };

  const handleDeleteSingle = (id: string) => {
    ChartTemplateManager.delete(id);
    refreshTemplates();
  };

  const handleDeleteGrid = (id: string) => {
    GridTemplateManager.delete(id);
    refreshTemplates();
  };

  const handleExportSingle = (id: string) => {
    const json = ChartTemplateManager.exportTemplate(id);
    if (!json) return;
    downloadJson(json, `roua-template-${id}.json`);
  };

  const handleExportGrid = (id: string) => {
    const json = GridTemplateManager.exportTemplate(id);
    if (!json) return;
    downloadJson(json, `roua-grid-template-${id}.json`);
  };

  const downloadJson = (json: string, filename: string) => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    if (!importJson.trim()) return;
    // Try grid template first (if in multi-chart mode)
    if (isMultiChart) {
      try {
        const parsed = JSON.parse(importJson);
        if (parsed.cells && Array.isArray(parsed.cells)) {
          const result = GridTemplateManager.importTemplate(importJson);
          if (result) {
            refreshTemplates();
            setImportJson('');
            setShowImport(false);
            return;
          }
        }
      } catch { /* not a grid template */ }
    }
    // Fall back to single-chart template
    const template = ChartTemplateManager.importTemplate(importJson);
    if (template) {
      refreshTemplates();
      setImportJson('');
      setShowImport(false);
    }
  };

  const COLORS = {
    card: '#151A22',
    border: 'rgba(42,49,60,0.9)',
    cyan: '#00D4FF',
    text: '#F0F2F5',
    textSecondary: '#9CA3B5',
    textMuted: '#9CA3B5',
    success: '#00FFA3',
    danger: '#FF4757',
    warning: '#FFB800',
    bg: '#0B0E14',
    purple: '#B388FF',
  };

  return (
    <div style={{
      background: COLORS.card,
      border: '1px solid rgba(0,212,255,0.2)',
      borderRadius: 'var(--radius-lg)',
      padding: 12,
      zIndex: 500,
      boxShadow: '0 15px 45px rgba(0,0,0,0.85)',
      backdropFilter: 'blur(10px)',
      width: '100%',
    }}>
      {/* Header */}
      <div data-drag-handle style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, cursor: 'grab' }}>
        <span style={{ fontSize: 11, color: COLORS.text, fontWeight: 700, fontFamily: "var(--font-ar)" }}>
          💾 {tc('templateManager')}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: 15 }}>✕</button>
      </div>

      {/* Tab Switcher (multi-chart mode only) */}
      {isMultiChart && (
        <div style={{ display: 'flex', gap: 2, marginBottom: 10, background: COLORS.bg, borderRadius: 'var(--radius-sm)', padding: 2 }}>
          <button
            onClick={() => setActiveTab('grid')}
            style={{
              flex: 1, padding: '4px 6px', borderRadius: 'var(--radius-xs)', cursor: 'pointer',
              fontFamily: "var(--font-ar)", fontSize: 11, fontWeight: 600,
              background: activeTab === 'grid' ? 'rgba(168,85,247,0.2)' : 'transparent',
              color: activeTab === 'grid' ? COLORS.purple : COLORS.textMuted,
              border: activeTab === 'grid' ? '1px solid rgba(168,85,247,0.3)' : '1px solid transparent',
            }}
          >
            🏗️ {locale === 'ar' ? 'قالب الشبكة' : 'Grid Template'}
          </button>
          <button
            onClick={() => setActiveTab('single')}
            style={{
              flex: 1, padding: '4px 6px', borderRadius: 'var(--radius-xs)', cursor: 'pointer',
              fontFamily: "var(--font-ar)", fontSize: 11, fontWeight: 600,
              background: activeTab === 'single' ? 'rgba(0,212,255,0.15)' : 'transparent',
              color: activeTab === 'single' ? COLORS.cyan : COLORS.textMuted,
              border: activeTab === 'single' ? '1px solid rgba(0,212,255,0.2)' : '1px solid transparent',
            }}
          >
            📊 {locale === 'ar' ? 'قالب شارت واحد' : 'Single Chart'}
          </button>
        </div>
      )}

      {/* Grid Templates Section */}
      {isMultiChart && activeTab === 'grid' ? (
        <>
          {/* Info badge */}
          <div style={{
            background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.15)',
            borderRadius: 'var(--radius-sm)', padding: '5px 8px', marginBottom: 8,
          }}>
            <span style={{ fontSize: 11, color: COLORS.purple, fontFamily: "var(--font-ar)" }}>
              {locale === 'ar'
                ? '✨ يحفظ ويستعيد حالة جميع الشارتات في الشبكة (المؤشرات + الرسومات + الإعدادات)'
                : '✨ Saves & restores ALL charts state (indicators + drawings + settings)'}
            </span>
          </div>

          {/* Save New Grid Template */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder={locale === 'ar' ? 'اسم قالب الشبكة...' : 'Grid template name...'}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              style={{
                flex: 1,
                padding: '5px 8px',
                background: COLORS.bg,
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 'var(--radius-sm)',
                color: COLORS.text,
                fontSize: 11,
                fontFamily: "var(--font-ar)",
                outline: 'none',
              }}
            />
            <button
              onClick={handleSave}
              disabled={!newName.trim() || !onSaveGridTemplate}
              style={{
                padding: '5px 10px',
                background: COLORS.purple,
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                cursor: newName.trim() && onSaveGridTemplate ? 'pointer' : 'default',
                fontFamily: "var(--font-ar)",
                opacity: newName.trim() && onSaveGridTemplate ? 1 : 0.5,
              }}
            >
              {tc('save')}
            </button>
          </div>

          {/* Grid Templates List */}
          <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 8 }}>
            {gridTemplates.length === 0 ? (
              <div style={{ textAlign: 'center', color: COLORS.textMuted, fontSize: 11, padding: '10px 0', fontFamily: "var(--font-ar)" }}>
                {locale === 'ar' ? 'لا توجد قوالب شبكة محفوظة' : 'No grid templates saved'}
              </div>
            ) : (
              gridTemplates.map(tpl => (
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
                    <div style={{ fontSize: 11, color: COLORS.text, fontWeight: 600, fontFamily: "var(--font-ar)" }}>
                      🏗️ {tpl.name}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: "var(--font-mono)" }}>
                      {tpl.layout} • {tpl.cells.length} {locale === 'ar' ? 'شارتات' : 'charts'} • {new Date(tpl.updatedAt).toLocaleDateString(dateLocale)}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.purple, fontFamily: "var(--font-mono)", marginTop: 1 }}>
                      {tpl.cells.map((c, i) => `${c.symbol}:${c.timeframe}${c.indicators.length > 0 ? ` (${c.indicators.length})` : ''}`).join(' • ')}
                    </div>
                  </div>

                  {/* Load */}
                  <button
                    onClick={() => { onLoadGridTemplate?.(tpl.id); onClose(); }}
                    style={{
                      background: 'rgba(168,85,247,0.1)',
                      border: '1px solid rgba(168,85,247,0.2)',
                      borderRadius: 'var(--radius-sm)',
                      color: COLORS.purple,
                      fontSize: 11,
                      padding: '3px 6px',
                      cursor: 'pointer',
                      fontFamily: "var(--font-ar)",
                    }}
                  >
                    {tc('load')}
                  </button>

                  {/* Export */}
                  <button
                    onClick={() => handleExportGrid(tpl.id)}
                    style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: 11 }}
                    title={tc('export')}
                  >
                    📤
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDeleteGrid(tpl.id)}
                    style={{ background: 'none', border: 'none', color: COLORS.danger, cursor: 'pointer', fontSize: 11 }}
                    title={tc('delete')}
                  >
                    🗑
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <>
          {/* Single-chart Templates Section */}
          {/* Save New Template */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder={tc('templateName')}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              style={{
                flex: 1,
                padding: '5px 8px',
                background: COLORS.bg,
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 'var(--radius-sm)',
                color: COLORS.text,
                fontSize: 11,
                fontFamily: "var(--font-ar)",
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
                borderRadius: 'var(--radius-sm)',
                color: '#000',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: "var(--font-ar)",
                opacity: newName.trim() ? 1 : 0.5,
              }}
            >
              {tc('save')}
            </button>
          </div>

          {/* Templates List */}
          <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 8 }}>
            {templates.length === 0 ? (
              <div style={{ textAlign: 'center', color: COLORS.textMuted, fontSize: 11, padding: '10px 0', fontFamily: "var(--font-ar)" }}>
                {tc('noTemplates')}
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
                    <div style={{ fontSize: 11, color: COLORS.text, fontWeight: 600, fontFamily: "var(--font-ar)" }}>
                      {tpl.name}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: "var(--font-mono)" }}>
                      {tpl.indicators.length} {tc('indicatorsCount')} • {new Date(tpl.updatedAt).toLocaleDateString(dateLocale)}
                    </div>
                  </div>

                  {/* Load */}
                  <button
                    onClick={() => { onLoadTemplate(tpl.id); onClose(); }}
                    style={{
                      background: 'rgba(0,212,255,0.1)',
                      border: '1px solid rgba(0,212,255,0.2)',
                      borderRadius: 'var(--radius-sm)',
                      color: COLORS.cyan,
                      fontSize: 11,
                      padding: '3px 6px',
                      cursor: 'pointer',
                      fontFamily: "var(--font-ar)",
                    }}
                  >
                    {tc('load')}
                  </button>

                  {/* Export */}
                  <button
                    onClick={() => handleExportSingle(tpl.id)}
                    style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: 11 }}
                    title={tc('export')}
                  >
                    📤
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDeleteSingle(tpl.id)}
                    style={{ background: 'none', border: 'none', color: COLORS.danger, cursor: 'pointer', fontSize: 11 }}
                    title={tc('delete')}
                  >
                    🗑
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Import */}
      {!showImport ? (
        <button
          onClick={() => setShowImport(true)}
          style={{
            width: '100%',
            padding: '5px 0',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 'var(--radius-sm)',
            color: COLORS.textMuted,
            fontSize: 11,
            cursor: 'pointer',
            fontFamily: "var(--font-ar)",
          }}
        >
          📥 {tc('importTemplate')}
        </button>
      ) : (
        <div>
          <textarea
            value={importJson}
            onChange={e => setImportJson(e.target.value)}
            placeholder={tc('pasteJson')}
            rows={3}
            style={{
              width: '100%',
              padding: '5px 8px',
              background: COLORS.bg,
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 'var(--radius-sm)',
              color: COLORS.text,
              fontSize: 11,
              fontFamily: "var(--font-mono)",
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
                borderRadius: 'var(--radius-sm)',
                color: '#000',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "var(--font-ar)",
              }}
            >
              {tc('import')}
            </button>
            <button
              onClick={() => { setShowImport(false); setImportJson(''); }}
              style={{
                flex: 1,
                padding: '4px 0',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 'var(--radius-sm)',
                color: COLORS.textMuted,
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: "var(--font-ar)",
              }}
            >
              {tc('cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
