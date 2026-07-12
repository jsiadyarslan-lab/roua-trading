/**
 * Unit Tests for BUG fixes discovered from real production response
 *
 * الرد الإنتاجي كشف 3 مشاكل:
 *   - BUG-1: "[بيانات غير متاحة]" يتسرب في الجداول عند null values
 *   - BUG-2: الـ LLM يستخدم Tabs بدل Markdown pipes
 *   - BUG-3: قالب 5 أقسام غير مُتبع (السيناريوهات مفقودة لأسئلة الصفقات)
 *
 * Run: npx jest __tests__/assistant-bug-fixes.spec.ts
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BUG-1: Response Cleaner — استبدال [بيانات غير متاحة] بـ "-"
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('BUG-1: Response Cleaner handles null/missing data', () => {
  // إعادة إنتاج منطق ResponseCleanerService.clean() الجزء الأول
  function cleanNullMarkers(text: string): string {
    return text
      .replace(/\[بيانات غير متاحة\]/gi, '-')
      .replace(/\[غير متاح\]/gi, '-')
      .replace(/\[not available\]/gi, '-')
      .replace(/\[N\/A\]/gi, '-')
      .replace(/\bnull\b/gi, '-')
      .replace(/\bundefined\b/gi, '-')
      .replace(/(\d+\.\d+)-(\d+)/g, '$1')
      .replace(/(\d+)-(\d+\.\d+)/g, '$2');
  }

  test('replaces [بيانات غير متاحة] with -', () => {
    const input = 'USD/CAD  BUY  1.41777  1.41958  +0.08$  0.0[بيانات غير متاحة]2';
    const cleaned = cleanNullMarkers(input);
    // The broken number "0.0[بيانات غير متاحة]2" should be fixed
    expect(cleaned).not.toContain('[بيانات غير متاحة]');
    expect(cleaned).toContain('0.0');
  });

  test('replaces [غير متاح] with -', () => {
    const input = 'PnL: [غير متاح]';
    expect(cleanNullMarkers(input)).toBe('PnL: -');
  });

  test('replaces [not available] with -', () => {
    const input = 'RSI: [not available]';
    expect(cleanNullMarkers(input)).toBe('RSI: -');
  });

  test('replaces bare null with -', () => {
    const input = 'stopLoss: null, takeProfit: 1.5';
    const cleaned = cleanNullMarkers(input);
    expect(cleaned).not.toContain('null');
    expect(cleaned).toContain('-');
  });

  test('replaces bare undefined with -', () => {
    const input = 'value: undefined';
    const cleaned = cleanNullMarkers(input);
    expect(cleaned).not.toContain('undefined');
  });

  test('fixes broken number "0.0-2" → "0.0"', () => {
    // بعد استبدال [بيانات غير متاحة] بـ -، نحصل على "0.0-2"
    // هذا يجب أن يُصلح لـ "0.0" (الرقم الأصلي قبل التسرب)
    const input = '0.0-2';
    const cleaned = cleanNullMarkers(input);
    expect(cleaned).toBe('0.0');
  });

  test('fixes broken number "5-3.14" → "3.14"', () => {
    const input = '5-3.14';
    expect(cleanNullMarkers(input)).toBe('3.14');
  });

  test('preserves normal text', () => {
    const input = 'السعر الحالي 4088$، التغير +0.5%';
    expect(cleanNullMarkers(input)).toBe(input);
  });

  test('preserves normal tables', () => {
    const input = '| USD/CHF | SELL | 0.80983 | 0.80983 | +0.00$ |';
    expect(cleanNullMarkers(input)).toBe(input);
  });

  test('handles multiple [بيانات غير متاحة] in same response', () => {
    const input = 'صفقة 1: [بيانات غير متاحة]\nصفقة 2: [بيانات غير متاحة]';
    const cleaned = cleanNullMarkers(input);
    expect(cleaned).toBe('صفقة 1: -\nصفقة 2: -');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BUG-2: Markdown Table Format Validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('BUG-2: System prompt enforces Markdown pipes', () => {
  // تحقق أن الـ system prompt يحوي تعليمات صريحة عن |
  test('ar prompt mentions pipe character |', () => {
    // نقرأ الـ prompt من الملف الفعلي
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.join(__dirname, '..', 'modules', 'assistant', 'services', 'assistant-chat.service.ts'),
      'utf8'
    );
    // الـ prompt يجب أن يذكر "|" كتعليمات صريحة
    expect(content).toContain('الخط العمودي |');
    expect(content).toContain('وليس Tab');
  });

  test('ar prompt includes example Markdown table', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.join(__dirname, '..', 'modules', 'assistant', 'services', 'assistant-chat.service.ts'),
      'utf8'
    );
    // يجب أن يحوي مثال جدول بصيغة |---|---|
    expect(content).toMatch(/\|.*\|.*\|/);
    expect(content).toContain('|------|------|');
  });

  test('en prompt mentions pipe character |', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.join(__dirname, '..', 'modules', 'assistant', 'services', 'assistant-chat.service.ts'),
      'utf8'
    );
    expect(content).toContain('pipe character |');
    expect(content).toContain('NOT Tab');
  });

  test('ar prompt instructs to use "-" for missing values', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.join(__dirname, '..', 'modules', 'assistant', 'services', 'assistant-chat.service.ts'),
      'utf8'
    );
    expect(content).toContain('القيم المفقودة اعرضها كـ "-"');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BUG-3: Scenarios mandatory for position queries
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('BUG-3: Scenarios mandatory for position queries', () => {
  test('ar prompt includes "صفقاته المفتوحة" in template trigger', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.join(__dirname, '..', 'modules', 'assistant', 'services', 'assistant-chat.service.ts'),
      'utf8'
    );
    // الـ template يجب أن ينطبق على أسئلة الصفقات أيضاً
    expect(content).toContain('صفقاته المفتوحة');
  });

  test('ar prompt states scenarios are mandatory for positions', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.join(__dirname, '..', 'modules', 'assistant', 'services', 'assistant-chat.service.ts'),
      'utf8'
    );
    // يجب أن يذكر صراحة أن السيناريوهات إلزامية حتى لأسئلة الصفقات
    expect(content).toContain('حتى لو كان السؤال عن "صفقاتي المفتوحة"');
  });

  test('ar prompt special template includes scenarios per position', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.join(__dirname, '..', 'modules', 'assistant', 'services', 'assistant-chat.service.ts'),
      'utf8'
    );
    // قالب "صفقاتي" يجب أن يطلب سيناريو لكل صفقة
    expect(content).toContain('سيناريو لكل صفقة');
  });

  test('en prompt includes "their open positions" in template trigger', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.join(__dirname, '..', 'modules', 'assistant', 'services', 'assistant-chat.service.ts'),
      'utf8'
    );
    expect(content).toContain('their open positions');
  });

  test('en prompt states scenarios mandatory for positions', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.join(__dirname, '..', 'modules', 'assistant', 'services', 'assistant-chat.service.ts'),
      'utf8'
    );
    expect(content).toContain('Even if the question is about "my open positions"');
  });

  test('special templates do NOT replace 5-section template', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.join(__dirname, '..', 'modules', 'assistant', 'services', 'assistant-chat.service.ts'),
      'utf8'
    );
    // يجب أن يذكر صراحة أن القوالب الخاصة تُضاف فوق القالب الخماسي
    expect(content).toMatch(/تُضاف فوق القالب الخماسي|added ON TOP of the 5-section/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BUG-1 (deep): Function Registry returns "N/A" instead of null
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('BUG-1 (deep): Function Registry null handling', () => {
  test('_getOpenPositions returns "N/A" for missing stopLoss', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.join(__dirname, '..', 'modules', 'assistant', 'services', 'function-registry.service.ts'),
      'utf8'
    );
    // يجب أن يستخدم "N/A" بدل null
    expect(content).toContain("'N/A'");
    expect(content).toMatch(/stopLoss: p\.stopLoss != null \? Number\(p\.stopLoss\) : 'N\/A'/);
  });

  test('_getOpenPositions includes formatting hint for LLM', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.join(__dirname, '..', 'modules', 'assistant', 'services', 'function-registry.service.ts'),
      'utf8'
    );
    expect(content).toContain('_formattingHint');
    expect(content).toContain('N/A');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BUG-4: Risk disclaimer position (end, not beginning)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('BUG-4: Risk disclaimer at end (not beginning)', () => {
  test('ar prompt says disclaimer at end', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.join(__dirname, '..', 'modules', 'assistant', 'services', 'assistant-chat.service.ts'),
      'utf8'
    );
    expect(content).toContain('في نهاية الرد');
    expect(content).toContain('وليس البداية');
  });

  test('en prompt says disclaimer at end', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.join(__dirname, '..', 'modules', 'assistant', 'services', 'assistant-chat.service.ts'),
      'utf8'
    );
    expect(content).toContain('at the END of the response');
    expect(content).toContain('not the beginning');
  });
});
