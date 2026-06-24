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

    return cleaned;
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
