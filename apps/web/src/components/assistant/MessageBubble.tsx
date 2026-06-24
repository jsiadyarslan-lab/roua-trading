'use client';

import React, { useState } from 'react';
import { Locale, CHAT_TEXT, Message } from './chat-text';
import './assistant.css';

interface MessageBubbleProps {
  msg: Message;
  index: number;
  isRtl: boolean;
  locale: Locale;
  text: typeof CHAT_TEXT['ar']; // the text object
  speakingMessageIdx: number | null;
  isTTSLoading: boolean;
  isStreaming: boolean;
  onSpeak: (text: string, idx: number) => void;
  onRegenerate: (index: number) => void;
  onDeepen: (index: number) => void;
  renderContent: (content: string) => React.ReactNode;
  renderInlineChart: (msg: Message) => React.ReactNode;
}

/** Strip markdown for plain-text clipboard copy */
function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, m => m.replace(/```\w*\n?/g, '').trim())
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\n{2,}/g, '\n\n')
    .trim();
}

// V1007: Refactored to a named function + React.memo export so that
// when the parent (AssistantChatWidget) re-renders during streaming,
// already-mounted MessageBubbles whose props have NOT changed are skipped.
// Critical for streaming performance: without memo, every setMessages()
// during a stream re-renders ALL previous messages even though only the
// last assistant message content actually changed.
function MessageBubble({
  msg,
  index,
  isRtl,
  locale,
  text,
  speakingMessageIdx,
  isTTSLoading,
  isStreaming,
  onSpeak,
  onRegenerate,
  onDeepen,
  renderContent,
  renderInlineChart,
}: MessageBubbleProps) {
  const [copyFeedback, setCopyFeedback] = useState(false);
  // V1012 (Phase 3): feedback state for the new Save and Share buttons.
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [shareFeedback, setShareFeedback] = useState(false);

  const handleCopy = async () => {
    try {
      const plain = stripMarkdown(msg.content);
      await navigator.clipboard.writeText(plain);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    } catch {
      // fallback – ignore
    }
  };

  // V1012 (Phase 3): Save — copies the FULL markdown (not stripped) so the
  // user can paste it into a notes app with formatting intact. Falls back
  // to the stripped version if clipboard write fails.
  const handleSave = async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setSaveFeedback(true);
      setTimeout(() => setSaveFeedback(false), 1500);
    } catch {
      // Fallback: try the stripped version
      try {
        const plain = stripMarkdown(msg.content);
        await navigator.clipboard.writeText(plain);
        setSaveFeedback(true);
        setTimeout(() => setSaveFeedback(false), 1500);
      } catch {
        // give up silently
      }
    }
  };

  // V1012 (Phase 3): Share — uses the Web Share API if available (mobile),
  // otherwise falls back to clipboard copy with a different feedback message.
  const handleShare = async () => {
    const shareText = msg.content.length > 1500
      ? msg.content.slice(0, 1500) + '...'
      : msg.content;
    const shareTitle = locale === 'ar' ? 'رد من مساعد رؤى' : 'Rouaa Assistant response';

    // Try Web Share API (mobile + desktop browsers that support it)
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
        });
        setShareFeedback(true);
        setTimeout(() => setShareFeedback(false), 1500);
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard copy
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(shareText);
      setShareFeedback(true);
      setTimeout(() => setShareFeedback(false), 1500);
    } catch {
      // give up silently
    }
  };

  return (
    <div className={`flex flex-col msg-fade ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
      {/* Timestamp */}
      {/* Hide timestamp for empty assistant messages (placeholder while loading) */}
      {msg.timestamp && !(msg.role === 'assistant' && !msg.content) && (
        <span className={`text-[10px] mb-1 px-1 font-medium ${msg.role === 'user' ? 'timestamp-user' : 'timestamp-assistant'}`} style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
          {new Date(msg.timestamp).toLocaleTimeString(isRtl ? 'ar-SA' : locale === 'fr' ? 'fr-FR' : locale === 'tr' ? 'tr-TR' : locale === 'es' ? 'es-ES' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}

      {/* ── Image preview for user messages with images ── */}
      {msg.role === 'user' && msg.imageUrl && (
        <div className="mb-1.5 max-w-[60%]">
          <img
            src={msg.imageUrl}
            alt="Uploaded"
            className="rounded-lg max-h-24 object-cover"
            style={{ border: '1px solid var(--border2)' }}
          />
        </div>
      )}

      {/* Hide empty bubble for assistant placeholder messages (shown while loading) */}
      {!(msg.role === 'assistant' && !msg.content) && (
        <div
          className={`max-w-[88%] px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'msg-user' : 'msg-assistant'} ${isStreaming ? 'streaming-cursor' : ''}`}
          style={{
            borderRadius: msg.role === 'user'
              ? (isRtl ? '16px 4px 16px 16px' : '4px 16px 16px 16px')
              : (isRtl ? '4px 16px 16px 16px' : '16px 4px 16px 16px'),
          }}
        >
          {msg.role === 'assistant' ? renderContent(msg.content) : msg.content}
        </div>
      )}

      {/* ── Inline charts for assistant messages (hide if empty placeholder) ── */}
      {msg.role === 'assistant' && msg.content && renderInlineChart(msg)}

      {/* ── Message actions for assistant messages ── */}
      {msg.role === 'assistant' && msg.content && msg.content.length > 10 && (
        <div className="message-actions relative" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
          {/* Copy */}
          <button
            type="button"
            className="message-action-btn"
            onClick={handleCopy}
            aria-label="Copy message"
            title={locale === 'ar' ? 'نسخ' : 'Copy'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>

          {/* Listen (TTS) */}
          <button
            type="button"
            className={`message-action-btn ${speakingMessageIdx === index ? 'btn-tts-active' : ''}`}
            onClick={() => onSpeak(msg.content, index)}
            aria-label={speakingMessageIdx === index ? 'Stop reading' : 'Read aloud'}
            title={speakingMessageIdx === index
              ? (locale === 'ar' ? 'إيقاف' : 'Stop')
              : (locale === 'ar' ? 'استمع' : 'Listen')}
          >
            {isTTSLoading && speakingMessageIdx === index ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83" />
              </svg>
            ) : speakingMessageIdx === index ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            )}
          </button>

          {/* Regenerate */}
          <button
            type="button"
            className="message-action-btn"
            onClick={() => onRegenerate(index)}
            aria-label={locale === 'ar' ? 'إعادة توليد' : 'Regenerate'}
            title={locale === 'ar' ? 'إعادة توليد' : 'Regenerate'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>

          {/* Deepen */}
          <button
            type="button"
            className="message-action-btn"
            onClick={() => onDeepen(index)}
            aria-label={locale === 'ar' ? 'تحليل أعمق' : 'Analyze deeper'}
            title={locale === 'ar' ? 'تحليل أعمق' : 'Deepen'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </button>

          {/* V1012 (Phase 3): Save button — copies full markdown to clipboard */}
          <button
            type="button"
            className="message-action-btn"
            onClick={handleSave}
            aria-label={locale === 'ar' ? 'حفظ' : 'Save'}
            title={locale === 'ar' ? 'حفظ (ينسخ النص الكامل)' : 'Save (copies full text)'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>

          {/* V1012 (Phase 3): Share button — uses Web Share API on mobile, clipboard on desktop */}
          <button
            type="button"
            className="message-action-btn"
            onClick={handleShare}
            aria-label={locale === 'ar' ? 'مشاركة' : 'Share'}
            title={locale === 'ar' ? 'مشاركة' : 'Share'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </button>

          {/* Copy feedback toast */}
          {copyFeedback && (
            <span className="copy-feedback" style={{ left: isRtl ? 'auto' : 0, right: isRtl ? 0 : 'auto', top: -20 }}>
              {locale === 'ar' ? 'تم النسخ!' : 'Copied!'}
            </span>
          )}
          {/* V1012 (Phase 3): Save feedback toast */}
          {saveFeedback && (
            <span className="copy-feedback" style={{ left: isRtl ? 'auto' : 0, right: isRtl ? 0 : 'auto', top: -20, color: 'var(--bull)' }}>
              {locale === 'ar' ? '✓ تم الحفظ!' : '✓ Saved!'}
            </span>
          )}
          {/* V1012 (Phase 3): Share feedback toast */}
          {shareFeedback && (
            <span className="copy-feedback" style={{ left: isRtl ? 'auto' : 0, right: isRtl ? 0 : 'auto', top: -20, color: 'var(--cyan)' }}>
              {locale === 'ar' ? '✓ تمت المشاركة!' : '✓ Shared!'}
            </span>
          )}
        </div>
      )}

      {/* Stock Symbol Badge */}
      {msg.role === 'user' && msg.stockSymbol && (
        <span
          className="mt-1.5 text-[10px] px-2.5 py-0.5 rounded-full font-medium stock-badge"
        >
          {msg.stockSymbol}
        </span>
      )}

      {/* Sources & Tools */}
      {msg.role === 'assistant' && (msg.sources?.length || msg.toolsUsed?.length) && (
        <div
          className="mt-2 max-w-[88%] px-3 py-2 rounded-xl source-container"
        >
          {msg.toolsUsed && msg.toolsUsed.length > 0 && (
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              <span className="text-[9px] font-semibold" style={{ color: 'var(--cyan)' }}>{text.toolsUsed}:</span>
              {msg.toolsUsed
                .filter(tool => {
                  const t = tool.toLowerCase();
                  return !t.startsWith('auto-') &&
                         !t.includes('search_by') &&
                         !t.includes('get_stock') &&
                         !t.includes('get_forex') &&
                         !t.includes('get_market') &&
                         !t.includes('compare_stocks') &&
                         !t.includes('summarize_page') &&
                         !t.includes('search_articles') &&
                         t !== 'auto-fallback';
                })
                .map((tool, ti) => {
                  // V1012 (Phase 3): Color-code and iconize tool badges by category.
                  // Each category gets a distinct color so the user can see at a glance
                  // which data sources the AI used (prices vs news vs AI provider).
                  const t = tool.toLowerCase();
                  let icon = '🔧';
                  let color = 'var(--text3)';
                  let bg = 'rgba(255,255,255,0.04)';
                  if (t.includes('أسعار') || t.includes('prices') || t.includes('prix') || t.includes('fiyat')) {
                    icon = '📊'; color = 'var(--bull)'; bg = 'var(--bull2)';
                  } else if (t.includes('تحليل') || t.includes('analysis') || t.includes('analyse') || t.includes('analiz')) {
                    icon = '📈'; color = 'var(--cyan)'; bg = 'var(--cyan2)';
                  } else if (t.includes('أخبار') || t.includes('news') || t.includes('nouvelles') || t.includes('haber')) {
                    icon = '📰'; color = 'var(--gold)'; bg = 'var(--gold2)';
                  } else if (t.includes('تقارير') || t.includes('reports') || t.includes('rapports') || t.includes('rapor')) {
                    icon = '📄'; color = 'var(--gold)'; bg = 'var(--gold2)';
                  } else if (t.includes('نبض') || t.includes('pulse')) {
                    icon = '💓'; color = 'var(--bear)'; bg = 'var(--bear2)';
                  } else if (t.includes('معرفة') || t.includes('knowledge')) {
                    icon = '📚'; color = 'var(--purple)'; bg = 'var(--purple2)';
                  } else if (t.includes('بحث') || t.includes('search')) {
                    icon = '⚡'; color = 'var(--cyan)'; bg = 'var(--cyan2)';
                  } else if (t.startsWith('ai:')) {
                    icon = '🤖'; color = 'var(--purple)'; bg = 'var(--purple2)';
                  }
                  return (
                    <span
                      key={ti}
                      className="text-[9px] px-2 py-0.5 rounded-md font-medium tool-badge"
                      style={{ color, background: bg, border: `1px solid ${color}22` }}
                      title={tool}
                    >
                      <span style={{ marginLeft: '3px' }}>{icon}</span>
                      {tool.replace(/([A-Z])/g, ' $1').replace(/^ai:/i, '').trim()}
                    </span>
                  );
                })}
            </div>
          )}
          {msg.sources && msg.sources.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                  <polyline points="13,2 13,9 20,9" />
                </svg>
                <span className="text-[9px] font-semibold" style={{ color: 'var(--gold)' }}>{text.sources}</span>
              </div>
              {msg.sources.slice(0, 3).map((source, si) => (
                <div key={si} className="text-[9px] leading-relaxed" style={{ color: 'var(--text2)' }}>
                  {source}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// V1007: Export as memoized component — see comment above the function.
// Default export stays compatible with the existing import in AssistantChatWidget.
export default React.memo(MessageBubble);
