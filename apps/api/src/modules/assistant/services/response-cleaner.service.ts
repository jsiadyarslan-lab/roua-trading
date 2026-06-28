// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Response Cleaner Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "المنقّب" — ينظّف رد الـ LLM من:
//   1. التكرار (نفس الفقرة مكررة)
//   2. leaked metadata (JSON، tool calls، tags)
//   3. أحرف غير عربية في الردود العربية
//   4. رموز زائدة
//
// مستوحى من مساعد رؤى المالي
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';
import MarkdownIt from 'markdown-it';

// V575: markdown-it (CommonJS نقي) بدل marked (ESM فقط، يفشل على Railway)
const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: false,
});

/**
 * V574: Preprocessor — يحمي عناصر Markdown قبل فصل الأسطر
 * المشكلة: الـ LLM يخرج --- ### | على نفس السطر، و |---|---| يحوي --- التي تُطابق كـ horizontal rule
 * الحل: نضع placeholders لـ table separators و table rows قبل أي معالجة، ثم نستعيدها
 */
function preprocessMarkdown(text: string): string {
  let out = text;

  // 1. حماية table separators (|---|---|)
  const tableSeparators: string[] = [];
  out = out.replace(/\|[-:\s|]+\|/g, (match) => {
    tableSeparators.push(match);
    return `__TABLE_SEP_${tableSeparators.length - 1}__`;
  });

  // 2. حماية table rows كاملة (|...|...|...|)
  const tableRows: string[] = [];
  out = out.replace(/\|[^\n]+\|/g, (match) => {
    // فقط لو يحوي 3+ | (أي row جدول حقيقي: |col1|col2|col3|)
    if ((match.match(/\|/g) || []).length >= 3) {
      tableRows.push(match);
      return `__TABLE_ROW_${tableRows.length - 1}__`;
    }
    return match;
  });

  // 3. فصل --- (horizontal rule)
  out = out.replace(/(\S)\s+---\s+/g, '$1\n---\n');
  out = out.replace(/\s+---\s+(\S)/g, '\n---\n$1');
  out = out.replace(/([^\n\s])\s+---/g, '$1\n---');

  // 4. فصل ## ### headings
  out = out.replace(/([^\n])\s+###\s+/g, '$1\n### ');
  out = out.replace(/([^\n])\s+##\s+/g, '$1\n## ');
  out = out.replace(/([^\n])\s+#\s+/g, '$1\n# ');

  // 4.5. فصل heading الملتصق بـ table row placeholder
  out = out.replace(/(#{1,4}\s+[^\n]+?)\s+(__TABLE_ROW_\d+__)/g, '$1\n$2');

  // 5. استعادة table rows و separators
  out = out.replace(/__TABLE_ROW_(\d+)__/g, (_match, idx) => tableRows[parseInt(idx, 10)]);
  out = out.replace(/__TABLE_SEP_(\d+)__/g, (_match, idx) => tableSeparators[parseInt(idx, 10)]);

  // 6. تنظيف
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

/**
 * V575: يحول Markdown إلى HTML نظيف باستخدام markdown-it + preprocessor
 * markdown-it هو CommonJS نقي (يعمل مع require() على Railway)
 */
function markdownToHtml(markdown: string): string {
  try {
    const preprocessed = preprocessMarkdown(markdown);
    const html = md.render(preprocessed);
    return html;
  } catch (e: any) {
    // fallback: ارجع النص مع <br> للأسطر الجديدة
    return `<p>${markdown.replace(/\n/g, '<br>')}</p>`;
  }
}

@Injectable()
export class ResponseCleanerService {
  private readonly logger = new Logger(ResponseCleanerService.name);

  constructor() {
    this.logger.log('🧹 ResponseCleanerService initialized');
  }

  /**
   * ينظّف رد الـ LLM
   */
  clean(text: string, language: string = 'ar'): string {
    if (!text) return '';

    let cleaned = text;

    // BUG-1: استبدل عبارات "بيانات غير متاحة" و null/undefined بـ "-"
    // الـ LLM أحياناً يولّد هذه العبارات حين يرى null في JSON data
    // هذا يكسر تنسيق الجداول (مثل: "0.0[بيانات غير متاحة]2")
    // BE-1: تقوية الـ regex ليشمل كل variations محتملة
    cleaned = cleaned
      // كل variations من "بيانات غير متاحة"
      .replace(/\[بيانات غير متاحة\]/gi, '-')
      .replace(/\[بيانات غير متوفرة\]/gi, '-')
      .replace(/\[غير متاح\]/gi, '-')
      .replace(/\[غير متوفر\]/gi, '-')
      .replace(/\[لا توجد بيانات\]/gi, '-')
      .replace(/\[لا تتوفر بيانات\]/gi, '-')
      .replace(/\[not available\]/gi, '-')
      .replace(/\[no data\]/gi, '-')
      .replace(/\[data not available\]/gi, '-')
      .replace(/\[N\/A\]/gi, '-')
      // bare null/undefined (لكن ليس داخل JSON)
      .replace(/\bnull\b/gi, '-')
      .replace(/\bundefined\b/gi, '-')
      // أصلح الأرقام المكسورة مثل "0.0-2" → "0.0" (احتفظ بالرقم الصحيح)
      .replace(/(\d+\.\d+)-(\d+)/g, '$1')
      .replace(/(\d+)-(\d+\.\d+)/g, '$2')
      // أصلح "-$" أو "+$" بدون رقم (نتيجة استبدال null قبل $)
      .replace(/([+\-])\$\s/g, '$1$ ')
      // أصلح الأرقام المتقطعة مثل "+3.-$" → "+3.00$"
      .replace(/(\d+\.)-\$/g, '$100$')
      .replace(/(\d+\.)-\s/g, '$10 ');

    // UI-FIX: تطبيع الأسطر — الـ LLM أحياناً يضع --- و ### في وسط السطر
    // بدل سطر منفصل. هذا يكسر react-markdown (يتطلبها على سطر منفصل).
    // V573.4: regex دقيق + فصل header row الملتصق بـ ### heading
    cleaned = cleaned
      // ── فصل --- (horizontal rule) ──
      .replace(/(\S)\s+---\s+/g, '$1\n---\n')
      .replace(/\s+---\s+(\S)/g, '\n---\n$1')
      .replace(/([^\n\s])\s+---/g, '$1\n---')
      // ── فصل ### (headings) ──
      .replace(/([^\n])\s+###\s+/g, '$1\n### ')
      .replace(/([^\n])\s+##\s+/g, '$1\n## ')
      // ── فصل | header row الملتصق بـ heading أو نص ──
      // لو سطر يبدأ بـ ### ويحتوي على | (جدول header ملتصق بالعنوان)
      // مثال: "### 1️⃣ جدول الصفقات | الأصل | النوع |" → افصل عند أول |
      .replace(/^(#{1,4}\s+[^\n|]+?)\s+(\|[^|\n]+\|[^|\n]+\|)/gm, '$1\n$2')
      // إزالة الأسطر الفارغة الزائدة بعد التطبيع
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // 1. إزالة tool call tags
    cleaned = cleaned
      .replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/g, '')
      .replace(/\[\/?TOOL_CALL\]/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/```/g, '')
      .replace(/\[Tool:\s*\w+\]/g, '');

    // 2. إزالة leaked metadata tags
    cleaned = cleaned
      .replace(/\s*\((en|fr|tr|es|de|it|pt|ru|zh|ja|ko|ar)\)\s*/g, ' ')
      .replace(/\s*\[(neutral|positive|negative|bullish|bearish)\]\s*/g, ' ')
      .replace(/\s*\[غير عربي[^\]]*\]\s*/g, ' ')
      .replace(/\s*\[(Strategic|Technical|Economy|Earnings|Daily|Weekly|Monthly)\]\s*/g, ' ')
      .replace(/\s*تأثير:\s*(low|medium|high|منخفض|متوسط|عالي)\s*/g, ' ')
      .replace(/\s*impact:\s*(low|medium|high)\s*/gi, ' ');

    // 3. إزالة JSON objects التي تتسرب أحيانًا
    cleaned = cleaned
      .replace(/\{[^{}]*"[a-zA-Z_]+"[\s\S]*?:[\s\S]*?[^{}]*\}/g, '')
      .replace(/\{[\s\S]*?"articles"[\s\S]*?\}/g, '')
      .replace(/\{[\s\S]*?"tool"[\s\S]*?\}/g, '')
      .replace(/\{[\s\S]*?"symbol"[\s\S]*?\}/g, '')
      .replace(/\{[\s\S]*?"error"[\s\S]*?\}/g, '')
      .replace(/\{[\s\S]*?"data"[\s\S]*?\}/g, '')
      .replace(/\{[\s\S]*?"results"[\s\S]*?\}/g, '');

    // 4. إزالة undefined
    cleaned = cleaned.replace(/\bundefined\b/g, '');

    // 5. تنظيف الأسطر الفارغة الزائدة
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

    // 6. كشف وإزالة حلقات التكرار
    cleaned = this._removeRepetitionLoops(cleaned);

    // 7. للغة العربية: إزالة الأحرف غير العربية (Thai, CJK, Cyrillic, etc.)
    if (language === 'ar') {
      cleaned = cleaned
        .replace(/[\u0E00-\u0E7F]/g, '')   // Thai
        .replace(/[\u4E00-\u9FFF]/g, '')   // CJK
        .replace(/[\u3040-\u309F]/g, '')   // Hiragana
        .replace(/[\u30A0-\u30FF]/g, '')   // Katakana
        .replace(/[\uAC00-\uD7AF]/g, '')   // Korean
        .replace(/[\u1100-\u11FF]/g, '')   // Hangul
        .replace(/[\u0400-\u04FF]/g, '')   // Cyrillic
        .replace(/\s{2,}/g, ' ')
        .trim();

      // إزالة الأسطر التي تحتوي كلمات لاتينية كثيرة (تسرب لغات أخرى)
      cleaned = cleaned
        .split('\n')
        .filter((line) => {
          const trimmed = line.trim();
          if (!trimmed) return true;
          // احتفظ بالأسطر العربية
          if (/[\u0600-\u06FF]/.test(trimmed)) return true;
          // احتفظ بالأسطر التي هي فقط رموز/أرقام/إيموجي
          if (/^[\s#*\-•>🔗🟢🔴🟡📊📰🎯📈📋⚠️\d.,:%$€£¥]+$/.test(trimmed)) return true;
          // احتفظ بالأسطر التي تذكر رموز أصول معروفة
          if (/\b(BTC|ETH|XAU|XAG|SOL|DOGE|XRP|EUR|GBP|USD|JPY|WTI|SPX|NDX|DXY|AAPL|TSLA|NVDA|MSFT|EURUSD|GBPUSD|USDJPY)\b/i.test(trimmed)) return true;
          // احتفظ بالأسطر القصيرة
          if (trimmed.length < 30) return true;
          // احذف الأسطر التي تحتوي 3+ كلمات لاتينية طويلة
          const latinWords = trimmed.match(/[a-zA-Z]{3,}/g);
          if ((latinWords?.length ?? 0) >= 3) return false;
          return true;
        })
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    // V574: تحويل Markdown إلى HTML على الـ backend
    // الـ frontend سيعرض HTML مباشرة بدل محاولة parse Markdown
    const html = markdownToHtml(cleaned);
    return html;
  }

  /**
   * يكشف ويزيل حلقات التكرار (نفس المحتوى مكرر)
   */
  private _removeRepetitionLoops(text: string): string {
    // قسّم حسب العناوين أو الأسطر الفارغة
    const sections = text.split(/\n(?=#{1,3}\s)|\n{2,}/);

    if (sections.length < 3) return text;

    const normalize = (s: string): string => {
      return s
        .replace(/[\u{1F000}-\u{1FFFF}]/gu, '') // إيموجي
        .replace(/[#*\-•>|]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
        .slice(0, 300);
    };

    const seen = new Map<string, number>();
    const keptSections: string[] = [];

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      if (!section.trim()) {
        keptSections.push(section);
        continue;
      }

      const normalized = normalize(section);
      if (normalized.length < 20) {
        keptSections.push(section);
        continue;
      }

      let isDuplicate = false;
      for (const [seenNorm] of seen) {
        const words = new Set(normalized.split(' ').filter((w) => w.length > 3));
        const seenWords = new Set(seenNorm.split(' ').filter((w) => w.length > 3));

        if (words.size < 3 || seenWords.size < 3) continue;

        let overlap = 0;
        for (const w of words) {
          if (seenWords.has(w)) overlap++;
        }

        const overlapRatio = overlap / Math.max(words.size, seenWords.size);
        if (overlapRatio > 0.65) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        seen.set(normalized, i);
        keptSections.push(section);
      }
    }

    const result = keptSections.join('\n\n');

    if (result.length < text.length * 0.8) {
      const removedPercent = Math.round((1 - result.length / text.length) * 100);
      this.logger.debug(
        `🧹 Removed ${removedPercent}% repetition (${text.length} → ${result.length} chars)`,
      );
    }

    return result;
  }
}
