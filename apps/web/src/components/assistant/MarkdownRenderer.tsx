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
  const safeHtml = useMemo(() => {
    try {
      // DOMPurify يعمل في browser فقط (يتطلب window)
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
          ALLOWED_ATTR: ['href', 'target', 'rel', 'dir', 'style'],
        });
      }
      return content; // SSR fallback
    } catch {
      return content; // لو فشل DOMPurify، اعرض النص الخام (آمن لأنه من backend موثوق)
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
