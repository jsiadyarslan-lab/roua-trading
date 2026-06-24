'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { Locale, CHAT_TEXT } from './chat-text';

interface ChatInputProps {
  isRtl: boolean;
  locale: Locale;
  text: typeof CHAT_TEXT['ar'];
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  isRecording: boolean;
  detectedSymbol: string | null;
  imagePreview: string | null;
  onStockQuickAnalysis: () => void;
  onRemoveImage: () => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onVoiceToggle: () => void;
  onDeepSearch: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

const MAX_ROWS = 4;
const LINE_HEIGHT = 24;

export default function ChatInput({
  isRtl,
  locale,
  text,
  input,
  onInputChange,
  onSubmit,
  isLoading,
  isRecording,
  detectedSymbol,
  imagePreview,
  onStockQuickAnalysis,
  onRemoveImage,
  onFileUpload,
  onVoiceToggle,
  onDeepSearch,
  inputRef,
  fileInputRef,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  // V1029: Plus menu popup
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRefLocal = useRef<HTMLInputElement>(null);

  const setTextareaRef = useCallback((el: HTMLTextAreaElement | null) => {
    textareaRef.current = el;
    if (inputRef) {
      (inputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    }
  }, [inputRef]);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = LINE_HEIGHT * MAX_ROWS;
    const newHeight = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${newHeight}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);

  // V1029: Close plus menu on outside click
  useEffect(() => {
    if (!showPlusMenu) return;
    const handler = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setShowPlusMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPlusMenu]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        onSubmit(e);
      }
    }
  };

  const canSend = input.trim() && !isLoading;

  return (
    <form
      onSubmit={onSubmit}
      className="chat-input-wrapper"
    >
      {/* ── Liquid Glass Input Container ── */}
      <div
        className={`chat-input-container ${isFocused ? 'chat-input-focused' : ''} ${isRecording ? 'chat-input-recording' : ''} ${isHovering ? 'chat-input-hovered' : ''}`}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {/* Animated gradient border glow */}
        <div className="chat-input-border-glow" />

        {/* ── Pending image preview (inside container) ── */}
        {imagePreview && (
          <div className="chat-image-preview">
            <div className="chat-image-preview-inner">
              <img src={imagePreview} alt="Preview" className="chat-image-preview-thumb" />
              <div className="chat-image-preview-info">
                <span className="chat-image-preview-label">
                  {locale === 'ar' ? 'صورة مرفقة' : 'Attached image'}
                </span>
                <span className="chat-image-preview-status">{text.imageAnalyzing}</span>
              </div>
              <button
                type="button"
                onClick={onRemoveImage}
                className="chat-image-remove-btn"
                aria-label={locale === 'ar' ? 'إزالة الصورة' : 'Remove image'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ── Stock symbol detection ── */}
        {detectedSymbol && (
          <button
            type="button"
            onClick={onStockQuickAnalysis}
            className="chat-stock-quick-btn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
            <span>{text.stockAnalysis}: <strong>{detectedSymbol}</strong></span>
          </button>
        )}

        {/* ── Main input row ──
            RTL: first DOM item = right side, last = left side
            LTR: first DOM item = left side, last = right side
            We want: Send on the END side (right in both RTL and LTR)
            Solution: Send button FIRST in DOM → right side in RTL ✓
            But for LTR: Send should be LAST → use CSS order
        */}
        <div className="chat-input-row">
          {/* ── Send Button ── */}
          <button
            type="submit"
            disabled={!canSend}
            className={`chat-send-btn ${canSend ? 'chat-send-btn-active' : ''}`}
            aria-label={text.sendButton}
          >
            {isLoading ? (
              <div className="chat-send-loading">
                <div className="chat-send-loading-dot" />
                <div className="chat-send-loading-dot" />
                <div className="chat-send-loading-dot" />
              </div>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>

          {/* V1029: Plus Button — replaces old Image Upload button. Opens popup. */}
          <div className="chat-plus-wrapper" ref={plusMenuRef}>
            <button
              type="button"
              onClick={() => setShowPlusMenu(!showPlusMenu)}
              className={`chat-plus-btn ${showPlusMenu ? 'chat-plus-btn-active' : ''}`}
              aria-label={locale === 'ar' ? 'إضافة' : 'Add'}
              disabled={isLoading}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            {showPlusMenu && (
              <div className={`chat-plus-menu ${isRtl ? 'chat-plus-menu-rtl' : ''}`}>
                <button type="button" onClick={() => { fileInputRef.current?.click(); setShowPlusMenu(false); }} className="chat-plus-menu-item">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="3" ry="3" />
                    <circle cx="9" cy="9" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span>{locale === 'ar' ? 'صورة' : 'Image'}</span>
                </button>
                <button type="button" onClick={() => { fileInputRefLocal.current?.click(); setShowPlusMenu(false); }} className="chat-plus-menu-item">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="13" x2="12" y2="17" />
                    <line x1="10" y1="15" x2="14" y2="15" />
                  </svg>
                  <span>{locale === 'ar' ? 'ملف' : 'File'}</span>
                </button>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileUpload} className="hidden" aria-hidden="true" />
            <input ref={fileInputRefLocal} type="file" accept="*/*" onChange={onFileUpload} className="hidden" aria-hidden="true" />
          </div>

          {/* ── Voice Button ── */}
          <button
            type="button"
            onClick={onVoiceToggle}
            className={`chat-action-btn chat-action-voice ${isRecording ? 'chat-action-voice-active' : ''}`}
            aria-label={locale === 'ar' ? 'تسجيل صوتي' : 'Voice input'}
            disabled={isLoading}
          >
            {isRecording ? (
              <div className="voice-waveform">
                <span className="voice-wave-bar" /><span className="voice-wave-bar" />
                <span className="voice-wave-bar" /><span className="voice-wave-bar" />
                <span className="voice-wave-bar" />
              </div>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
            <span className="chat-action-btn-label">
              {isRecording ? (locale === 'ar' ? 'يستمع...' : 'Listening...') : (locale === 'ar' ? 'صوت' : 'Voice')}
            </span>
          </button>

          {/* ── Textarea Input ── */}
          <textarea
            ref={setTextareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={isRecording ? text.voiceListening : text.inputPlaceholder}
            className="chat-textarea"
            style={{ direction: isRtl ? 'rtl' : 'ltr' }}
            disabled={isLoading}
            rows={1}
          />

          {/* ── Deep Search Button ── */}
          {input.trim() && !isLoading && (
            <button
              type="button"
              onClick={onDeepSearch}
              className="chat-action-btn chat-action-deep"
              aria-label={text.deepSearch}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="8" y1="11" x2="14" y2="11" />
                <line x1="11" y1="8" x2="11" y2="14" />
              </svg>
              <span className="chat-action-btn-label">{text.deepSearch}</span>
            </button>
          )}
        </div>

        {/* ── Recording waveform indicator ── */}
        {isRecording && (
          <div className="chat-recording-indicator">
            <div className="chat-recording-pulse" />
            <span className="chat-recording-text">{text.voiceListening}</span>
            <div className="chat-recording-wave">
              <span /><span /><span /><span /><span /><span /><span />
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
