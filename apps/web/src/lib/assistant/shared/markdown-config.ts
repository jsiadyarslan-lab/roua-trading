/**
 * ═══════════════════════════════════════════════════════════════
 * V601: Unified Markdown-it Config + Render
 * ═══════════════════════════════════════════════════════════════
 * 
 * نسخة واحدة من markdown-it بإعدادات موحدة.
 * كل المسارات تستورد `renderMarkdown` من هنا.
 */

import MarkdownIt from 'markdown-it';
import { preprocessMarkdown } from './markdown-preprocessor';

// إعداد موحد: html:true لتمرير HTML tags من الـ AI
const md = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true,
  typographer: false,
});

/**
 * يحوّل Markdown (أو HTML المختلط بـ Markdown) إلى HTML نظيف.
 * هذا هو المصدر الوحيد لتحويل Markdown → HTML في كل المشروع.
 */
export function renderMarkdown(text: string): string {
  if (!text) return '';
  try {
    return md.render(preprocessMarkdown(text));
  } catch {
    return `<p>${text.replace(/\n/g, '<br>')}</p>`;
  }
}
