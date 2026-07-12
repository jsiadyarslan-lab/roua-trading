/**
 * ═══════════════════════════════════════════════════════════════
 * V601: Unified Markdown Preprocessor
 * ═══════════════════════════════════════════════════════════════
 * 
 * هذا هو المصدر الوحيد لمعالجة Markdown قبل تحويله لـ HTML.
 * كل المسارات (route.ts, NestJS response-cleaner, response-builder)
 * تستورد من هذا الملف. لا تكرار.
 * 
 * المعالجات (بالترتيب):
 * 1. تحويل Tab-separated tables → pipe tables
 * 2. دمج الخلايا العمودية (| cell \n | cell) في صفوف
 * 3. إزالة الأسطر الفارغة بين خلايا الجدول
 * 4. تقسيم القوائم النقطية المتصلة على سطر واحد
 * 5. فصل --- و ### الملتصقة بالـ text
 * 6. حماية table separators و rows أثناء المعالجة
 * 7. استعادة المحميات + تنظيف نهائي
 */

/**
 * المعالج الموحد — يستدعيه كل المسارات
 */
export function preprocessMarkdown(text: string): string {
  let out = text;

  // ═══ 1. تحويل Tab-separated tables → pipe tables ═══
  out = out.replace(/((?:[^\n]*\t[^\n]*(?:\n|$)){2,})/g, (block) => {
    const lines = block.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return block;
    const allHaveTabs = lines.every(l => l.includes('\t'));
    if (!allHaveTabs) return block;
    const pipeLines = lines.map(line => {
      const cells = line.split('\t').map(c => c.trim()).filter(Boolean);
      if (cells.length < 2) return null;
      return '| ' + cells.join(' | ') + ' |';
    }).filter(Boolean);
    if (pipeLines.length < 2) return block;
    const headerCells = pipeLines[0]!.split('|').filter(c => c.trim()).length - 1;
    const separator = '| ' + Array(headerCells).fill('---').join(' | ') + ' |';
    return pipeLines[0] + '\n' + separator + '\n' + pipeLines.slice(1).join('\n');
  });

  // ═══ 2. دمج الخلايا العمودية ═══
  // أولاً: إزالة الأسطر الفارغة بين خلايا | المتتالية
  out = out.replace(/(\|\s*[^\n|]+)\n\s*\n(\s*\|)/g, '$1\n$2');
  // ثم: دمج الخلايا العمودية المتتالية في صفوف
  out = out.replace(/((?:\s*\|[^\n|]+(?:\n|$)){4,})/g, (block) => {
    const cells = block.trim().split('\n')
      .map(l => l.trim().replace(/^\|/, '').replace(/\|$/, '').trim())
      .filter(Boolean);
    if (cells.length < 4) return block;
    // كشف عدد الأعمدة: جرّب الأكبر أولاً (الجداول المالية 5-8 أعمدة)
    let bestCols = 0;
    for (const cols of [8, 7, 6, 5, 4, 3, 2]) {
      if (cells.length % cols === 0 && cells.length / cols >= 2) {
        bestCols = cols;
        break;
      }
    }
    if (bestCols === 0) bestCols = 3;
    const rows: string[] = [];
    for (let i = 0; i < cells.length; i += bestCols) {
      const rowCells = cells.slice(i, i + bestCols);
      if (rowCells.length === bestCols) {
        rows.push('| ' + rowCells.join(' | ') + ' |');
      }
    }
    if (rows.length < 2) return block;
    const separator = '| ' + Array(bestCols).fill('---').join(' | ') + ' |';
    return rows[0] + '\n' + separator + '\n' + rows.slice(1).join('\n');
  });

  // ═══ 3. تقسيم القوائم النقطية المتصلة ═══
  // الـ AI أحياناً يضع كل النقاط على سطر واحد: • RSI: 29 - MACD: -2372 - EMA: 66389
  out = out.replace(/^([•\-*])\s+(.+)$/gm, (match, bullet, rest) => {
    if (rest.includes(' - ') && rest.length > 80) {
      const parts = rest.split(/\s+-\s+/);
      if (parts.length >= 3) {
        return parts.map((p, i) => (i === 0 ? `${bullet} ${p}` : `- ${p}`)).join('\n');
      }
    }
    return match;
  });

  // ═══ 4. فصل --- و ### الملتصقة ═══
  // حماية table separators و rows قبل المعالجة
  const tableSeparators: string[] = [];
  out = out.replace(/\|[-:\s|]+\|/g, (m) => {
    tableSeparators.push(m);
    return `__TS_${tableSeparators.length - 1}__`;
  });
  const tableRows: string[] = [];
  out = out.replace(/\|[^\n]+\|/g, (m) => {
    if ((m.match(/\|/g) || []).length >= 3) {
      tableRows.push(m);
      return `__TR_${tableRows.length - 1}__`;
    }
    return m;
  });

  // فصل --- و ### عن النص الملتصق
  out = out.replace(/(\S)\s+---\s+/g, '$1\n---\n');
  out = out.replace(/\s+---\s+(\S)/g, '\n---\n$1');
  out = out.replace(/([^\n\s])\s+---/g, '$1\n---');
  out = out.replace(/([^\n])\s+###\s+/g, '$1\n### ');
  out = out.replace(/([^\n])\s+##\s+/g, '$1\n## ');
  out = out.replace(/([^\n])\s+#\s+/g, '$1\n# ');
  out = out.replace(/(#{1,4}\s+[^\n]+?)\s+(__TR_\d+__)/g, '$1\n$2');

  // ═══ 5. دمج صفوف الجدول المبعثرة (V580 القديم) ═══
  out = out.replace(/(?:^[ \t]*\|[^\n]+\n?)+/gm, (block) => {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));
    if (lines.length < 2) return block;
    const merged = lines.join(' ').replace(/\|\s*\|/g, '|');
    return merged + '\n';
  });

  // إزالة الأسطر الفارغة بين صفوف الجدول
  for (let i = 0; i < 5; i++) {
    const before = out;
    out = out.replace(/([^\n]*\|[^\n]*)\n\s*\n\s*([^\n]*\|)/g, '$1\n$2');
    if (out === before) break;
  }

  // إضافة separator تلقائي للجداول الناقصة
  out = out.replace(/^(\|[^\n]+)\n(\|[^\n]+)/gm, (match: string, header: string, firstRow: string) => {
    if (header.includes('---')) return match;
    const cleanHeader = header.trim().endsWith('|') ? header : header + ' |';
    const colCount = (cleanHeader.match(/\|/g) || []).length - 1;
    if (colCount < 2) return match;
    const separator = '|' + Array(colCount).fill('---').join('|') + '|';
    return cleanHeader + '\n' + separator + '\n' + firstRow;
  });

  // ═══ 6. استعادة المحميات + تنظيف ═══
  out = out.replace(/__TR_(\d+)__/g, (_m, i) => tableRows[parseInt(i, 10)]);
  out = out.replace(/__TS_(\d+)__/g, (_m, i) => tableSeparators[parseInt(i, 10)]);
  out = out.replace(/\n{3,}/g, '\n\n').trim();

  return out;
}
