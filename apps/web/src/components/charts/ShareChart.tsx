'use client';

import React, { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl'

interface ShareChartProps {
  symbol: string;
  timeframe: string;
  activeIndicators: string[];
  chartType: string;
  onClose: () => void;
}

const ShareChart: React.FC<ShareChartProps> = ({
  symbol,
  timeframe,
  activeIndicators,
  chartType,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const tc = useTranslations('dashboard.chart');

  const shareUrl = useMemo(() => {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const params = new URLSearchParams({
      s: symbol,
      tf: timeframe,
      ind: activeIndicators.join(','),
      type: chartType,
    });
    return `${base}/chart?${params.toString()}`;
  }, [symbol, timeframe, activeIndicators, chartType]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${symbol} Chart`,
          text: `Check out ${symbol} on ${timeframe} timeframe`,
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled or share failed — do nothing
      }
    }
  };

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div
      style={{
        position: 'absolute',
        top: 40,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 320,
        background: 'rgba(8,10,18,0.92)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(0,212,255,0.2)',
        borderRadius: 'var(--radius-lg)',
        padding: 12,
        zIndex: 500,
        pointerEvents: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 16px rgba(0,212,255,0.08)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-ar)",
            fontSize: 15,
            fontWeight: 600,
            color: '#9CA3B5',
            letterSpacing: '0.02em',
          }}
        >
          {tc('shareChart')}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.5)',
            fontSize: 17,
            cursor: 'pointer',
            padding: '2px 4px',
            lineHeight: 1,
            borderRadius: 'var(--radius-sm)',
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.9)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)';
          }}
          aria-label="Close share panel"
        >
          ✕
        </button>
      </div>

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: 'rgba(0,212,255,0.12)',
          marginBottom: 10,
        }}
      />

      {/* URL Input + Copy icon */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <input
          type="text"
          readOnly
          value={shareUrl}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(0,212,255,0.15)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 10px',
            color: '#9CA3B5',
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            outline: 'none',
            width: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          onClick={(e) => (e.target as HTMLInputElement).select()}
          aria-label="Shareable chart URL"
        />
        <button
          onClick={handleCopy}
          title="Copy URL"
          style={{
            background: 'none',
            border: '1px solid rgba(0,212,255,0.25)',
            borderRadius: 'var(--radius-sm)',
            color: copied ? '#10b981' : '#00D4FF',
            padding: '7px 8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 15,
            transition: 'all 0.15s ease',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (!copied) {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,212,255,0.5)';
            }
          }}
          onMouseLeave={(e) => {
            if (!copied) {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(0,212,255,0.25)';
            }
          }}
          aria-label="Copy URL to clipboard"
        >
          {copied ? '✓' : '📋'}
        </button>
      </div>

      {/* Action Buttons */}
      <div
        style={{
          display: 'flex',
          gap: 8,
        }}
      >
        {/* Share button (Web Share API) */}
        {canShare && (
          <button
            onClick={handleShare}
            style={{
              flex: 1,
              background: '#059669',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              color: '#F0F2F5',
              fontFamily: "var(--font-ar)",
              fontSize: 13,
              fontWeight: 600,
              padding: '8px 0',
              cursor: 'pointer',
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '0.85';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '1';
            }}
          >
            {tc('share')}
          </button>
        )}

        {/* Copy Link button */}
        <button
          onClick={handleCopy}
          style={{
            flex: 1,
            background: copied ? '#059669' : '#00D4FF',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: copied ? '#F0F2F5' : '#000000',
            fontFamily: "var(--font-ar)",
            fontSize: 13,
            fontWeight: 700,
            padding: '8px 0',
            cursor: 'pointer',
            transition: 'opacity 0.15s ease, background 0.2s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.opacity = '0.85';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.opacity = '1';
          }}
        >
          {copied ? tc('copied') : tc('copyLink')}
        </button>
      </div>
    </div>
  );
};

export default ShareChart;
