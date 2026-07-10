'use client';

/**
 * MarkdownRenderer V574 — Minimal HTML renderer
 *
 * الحل المستدام: الـ backend يولّد HTML نظيف عبر marked + preprocessor
 * الـ frontend يعرفه فقط مع DOMPurify لحماية XSS
 *
 * لا مزيد من: react-markdown + remark-gfm + useMemo + components override
 * لا مزيد من: 200 سطر regex parser مخصص
 * لا مزيد من: 440 سطر components معقدة
 *
 * الـ styling يُطبق عبر CSS classes في assistant.css
 */

import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';

interface MarkdownRendererProps {
  content: string; // HTML من الـ backend
  isRtl: boolean;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  isRtl,
}) => {
  const dir = isRtl ? 'rtl' : 'ltr';

  // V574: sanitize HTML مرة واحدة فقط (memoized)
  // BUG-066s FIX (HIGH-3): Sanitize on SSR too. Previously, SSR returned raw
  // content via dangerouslySetInnerHTML — XSS risk if AI echoes user input.
  // Also removed 'style' from ALLOWED_ATTR (clickjacking vector).
  const safeHtml = useMemo(() => {
    try {
      if (typeof window !== 'undefined') {
        return DOMPurify.sanitize(content, {
          ALLOWED_TAGS: [
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'p', 'br', 'hr',
            'ul', 'ol', 'li',
            'table', 'thead', 'tbody', 'tr', 'th', 'td',
            'blockquote', 'code', 'pre',
            'strong', 'em', 'del', 'a',
            'span', 'div',
          ],
          // BUG-066s: Removed 'style' — allows clickjacking via CSS overlays
          ALLOWED_ATTR: ['href', 'target', 'rel', 'dir', 'class'],
        });
      }
      // SSR: escape HTML to prevent XSS. The content will be sanitized
      // on the client after hydration.
      return content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    } catch {
      return '';
    }
  }, [content]);

  // V579: لف الجداول في wrapper للتمرير الأفقي على الشاشات الصغيرة
  const wrappedHtml = useMemo(() => {
    if (!safeHtml) return '';
    // لف كل <table> في <div class="md-table-wrap">
    return safeHtml.replace(/<table/g, '<div class="md-table-wrap"><table').replace(/<\/table>/g, '</table></div>');
  }, [safeHtml]);

  return (
    <div
      className="assistant-html-content"
      dir={dir}
      style={{ direction: dir }}
      dangerouslySetInnerHTML={{ __html: wrappedHtml }}
    />
  );
};

export default MarkdownRenderer;
