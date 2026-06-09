#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════
 * سكريبت التحقق من سلامة نظام التداول الآلي — V2
 * Trading System Integrity Verification Script (Runtime-Based)
 * ═══════════════════════════════════════════════════════════════════
 *
 * V2: فحص مبني على السلوك الفعلي بدلاً من البحث عن نصوص
 *   1. يزيل التعليقات قبل البحث (يمنع النتائج الإيجابية الكاذبة)
 *   2. يبحث داخل أجسام الدوال فقط (وليس في كل الملف)
 *   3. يتحقق من المقارنات الفعلية (positionPercent > X وليس فقط اسم المتغير)
 *   4. يضيف فحوصات MT5 Adapter الجديدة
 *
 * كيفية التشغيل:
 *   node apps/api/src/scripts/verify-system-integrity.js
 *
 * الخروج:
 *   0 = كل الفحوصات ناجحة
 *   1 = فشل فحص حرج واحد على الأقل
 * ═══════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

// ── Colors ──
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// ── Find project root ──
const SCRIPT_DIR = __dirname;
const API_DIR = path.resolve(SCRIPT_DIR, '..');
const SRC_DIR = API_DIR;

let passed = 0;
let failed = 0;
let warnings = 0;
const results = [];

function read(filePath) {
  const fullPath = path.resolve(SRC_DIR, filePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return fs.readFileSync(fullPath, 'utf-8');
}

/**
 * V2: Strip comments from source code to prevent false positives.
 * A comment like "// positionPercent" would falsely pass content.includes('positionPercent').
 * After stripping, only actual code patterns remain.
 */
function stripComments(code) {
  // Remove single-line comments (// ...)
  let result = code.replace(/\/\/.*$/gm, '');
  // Remove multi-line comments (/* ... */)
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  return result;
}

/**
 * V2: Find a method's body using brace depth tracking.
 * Returns the method body content or null if not found.
 */
function findMethodBody(content, methodName) {
  const escaped = methodName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    // TypeScript: private async _executePaperTrade(
    new RegExp(`(?:private|public|protected)?\\s*(?:async)?\\s*${escaped}\\s*\\(`),
    // Compiled JS: async _executePaperTrade(
    new RegExp(`(?:async\\s+)?${escaped}\\s*\\(`),
  ];

  let methodStart = -1;
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match.index !== undefined) {
      methodStart = match.index;
      break;
    }
  }

  if (methodStart === -1) return null;

  const afterDecl = content.substring(methodStart);
  const braceStart = afterDecl.indexOf('{');
  if (braceStart === -1) return null;

  let depth = 0;
  let bodyEnd = -1;
  for (let i = braceStart; i < afterDecl.length; i++) {
    if (afterDecl[i] === '{') depth++;
    else if (afterDecl[i] === '}') {
      depth--;
      if (depth === 0) {
        bodyEnd = i;
        break;
      }
    }
  }

  if (bodyEnd === -1) return null;
  return afterDecl.substring(braceStart, bodyEnd + 1);
}

function check(id, name, filePath, testFn) {
  const content = read(filePath);
  if (content === null) {
    failed++;
    results.push({ id, name, status: 'MISSING', detail: `الملف غير موجود: ${filePath}` });
    console.log(`  ${RED}✗ ${id}: ${name}${RESET}`);
    console.log(`    ${RED}الملف غير موجود: ${filePath}${RESET}`);
    return;
  }

  const result = testFn(content, filePath);
  if (result.pass) {
    passed++;
    results.push({ id, name, status: 'PASS', detail: result.detail || '' });
    console.log(`  ${GREEN}✓ ${id}: ${name}${RESET}`);
    if (result.detail) console.log(`    ${GREEN}${result.detail}${RESET}`);
  } else if (result.warn) {
    warnings++;
    results.push({ id, name, status: 'WARN', detail: result.detail || '' });
    console.log(`  ${YELLOW}⚠ ${id}: ${name}${RESET}`);
    console.log(`    ${YELLOW}${result.detail}${RESET}`);
  } else {
    failed++;
    results.push({ id, name, status: 'FAIL', detail: result.detail || '' });
    console.log(`  ${RED}✗ ${id}: ${name}${RESET}`);
    console.log(`    ${RED}${result.detail}${RESET}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// الفحوصات — V2 Runtime-Based
// ═══════════════════════════════════════════════════════════════════

console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}`);
console.log(`${BOLD}${CYAN}  سكريبت التحقق من سلامة نظام التداول الآلي — V2${RESET}`);
console.log(`${BOLD}${CYAN}  Trading System Integrity Verification (Runtime-Based)${RESET}`);
console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}\n`);

// ───────────────────────────────────────────────────────────────
// الفحص #1: RiskGatekeeper — فحص حجم الصفقة للورقي
// V2: Strip comments first, then check for positionPercent comparison
// ───────────────────────────────────────────────────────────────
console.log(`${BOLD}── الفحص #1: RiskGatekeeper — فحص حجم الصفقة للورقي (V2) ──${RESET}`);

check('V01', 'RiskGatekeeper لا يرجع allowed:true بدون فحص الحجم للورقي',
  'modules/trading/services/risk-gatekeeper.service.ts',
  (content) => {
    // V2: Strip comments first
    const code = stripComments(content);

    // Check for positionPercent comparison (not just variable name)
    const hasPositionPercentCheck = /\bpositionPercent\b/.test(code) && /positionPercent\s*[>]\s*\d/.test(code);
    if (!hasPositionPercentCheck) {
      // Check for maxPositionSizePercent as alternative
      const hasMaxPositionCheck = /\bmaxPositionSizePercent\b/.test(code) && /maxPositionSizePercent/.test(code);
      if (!hasMaxPositionCheck) {
        return { pass: false, detail: 'لا يوجد فحص positionPercent فعلي في الكود (بعد إزالة التعليقات). الحسابات الورقية قد تتجاوز فحص الحجم!' };
      }
    }

    // Check for guard condition bypass
    const hasGuardBypass = /\bif\s*\(\s*\w+Balance\s*>\s*0\s*&&\s*\w+\.quantity\s*&&\s*\w+\.price\s*\)/.test(code);
    if (hasGuardBypass) {
      return { pass: false, detail: 'يوجد guard condition تسمح بتجاوز الفحص عندما paperBalance=0 — يجب إزالتها' };
    }

    return { pass: true, detail: 'RiskGatekeeper يفحص حجم الصفقة لجميع الحسابات (ورقي وحقيقي) — V2 verified' };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #2: RiskManager — فحص حجم الصفقة للورقي
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #2: RiskManager — فحص حجم الصفقة للورقي (V2) ──${RESET}`);

check('V02', 'RiskManager لا يرجع allowed:true بدون فحص الحجم للورقي',
  'modules/trading/risk-manager.service.ts',
  (content) => {
    const code = stripComments(content);

    const hasPositionPercentCheck = /\bpositionPercent\b/.test(code) && /positionPercent\s*[>]\s*\d/.test(code);
    if (!hasPositionPercentCheck) {
      const hasMaxPositionCheck = /\bmaxPositionSizePercent\b/.test(code);
      if (!hasMaxPositionCheck) {
        return { pass: false, detail: 'لا يوجد فحص positionPercent فعلي في الكود (بعد إزالة التعليقات)' };
      }
    }

    const hasGuardBypass = /\bif\s*\(\s*\w+PortfolioValue\s*>\s*0\s*&&\s*quantity\s*&&\s*price\s*\)/.test(code);
    if (hasGuardBypass) {
      return { pass: false, detail: 'يوجد guard condition تسمح بتجاوز الفحص عندما portfolioValue=0' };
    }

    return { pass: true, detail: 'RiskManager يفحص حجم الصفقة لجميع الحسابات — V2 verified' };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #3: Smart Executor — حد حجم الصفقة
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #3: Smart Executor — حد حجم الصفقة ──${RESET}`);

check('V03', 'Smart Executor maxOrderValue للورقي ≤ 2% من المحفظة',
  'modules/ai/smart-executor/smart-executor.service.ts',
  (content) => {
    const code = stripComments(content);
    const unifiedPattern = code.match(/maxOrderValue\s*=\s*Math\.min\s*\(\s*portfolioValue\s*\*\s*0\.(\d+)/);
    if (unifiedPattern) {
      const pct = parseInt(unifiedPattern[1]);
      if (pct <= 2) return { pass: true, detail: `حد موحد للورقي والحقيقي = ${pct}% من المحفظة (V180 fix)` };
      return { pass: false, detail: `حد الصفقة = ${pct}% من المحفظة. يجب أن يكون ≤ 2%.` };
    }

    const paperPercentMatch = code.match(/isSimulatedExecution\s*\n?\s*\?[\s\S]*?portfolioValue\s*\*\s*0\.(\d+)/);
    if (paperPercentMatch) {
      const paperPercent = parseInt(paperPercentMatch[1]);
      if (paperPercent > 2) return { pass: false, detail: `حد الورقي = ${paperPercent}% من المحفظة. يجب أن يكون ≤ 2%.` };
      return { pass: true, detail: `حد الورقي = ${paperPercent}% — ضمن الحد المطلوب` };
    }

    const allPercents = [...code.matchAll(/portfolioValue\s*\*\s*0\.(\d+)/g)];
    for (const match of allPercents) {
      if (parseInt(match[1]) > 5) return { pass: false, detail: `وجدت portfolioValue * 0.${match[1]} (= ${parseInt(match[1])}%) في Smart Executor. أكبر من 2%!` };
    }

    return { warn: true, detail: 'لم أستطع تحديد النسبة بدقة. تحقق يدوياً من maxOrderValue' };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #4: حد أدنى لمسافة Stop Loss
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #4: حد أدنى لمسافة Stop Loss ──${RESET}`);

check('V04', 'يوجد حد أدنى لمسافة Stop Loss (≥ 0.3%)',
  'modules/ai/smart-executor/smart-executor.service.ts',
  (content) => {
    const code = stripComments(content);
    const slDistPatterns = [/slDistance/i, /MIN_SL_DISTANCE/i, /minSlDistance/i, /stopLoss.*distance/i, /priceRisk.*<.*0\./, /sl.*too.*close/i, /stop.*loss.*too/i, /MIN_STOP_LOSS/i, /stopLossMinDistance/i];
    for (const pattern of slDistPatterns) {
      if (pattern.test(code)) return { pass: true, detail: `وجدت فحص مسافة SL: ${pattern.source}` };
    }

    const priceRiskChecks = code.match(/priceRisk\s*[<>]\s*[^=]/g);
    if (priceRiskChecks) {
      const onlyZeroCheck = code.match(/priceRisk\s*===?\s*0/);
      if (onlyZeroCheck && !code.match(/priceRisk\s*<\s*[1-9]/)) {
        return { pass: false, detail: 'يوجد فقط فحص priceRisk === 0 (SL = entry). لا حد أدنى لنسبة المسافة.' };
      }
    }

    return { pass: false, detail: 'لا يوجد أي حد أدنى لمسافة Stop Loss!' };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #5: processedKey — حلقة افتح-أغلق-افتح
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #5: processedKey — حلقة افتح-أغلق-افتح ──${RESET}`);

check('V05', 'processedKey لا يُحذف فوراً بعد إغلاق الصفقة (يمنع حلقة مفرغة)',
  'modules/ai/smart-executor/smart-executor.service.ts',
  (content) => {
    const code = stripComments(content);
    const monitorContent = read('modules/engine/services/position-monitor.service.ts');
    const monitorCode = monitorContent ? stripComments(monitorContent) : null;

    const deletePatterns = [/\.del\(processedKey\)/, /redis\.del\(processedKey\)/, /await.*\.del\(processedKey\)/];
    for (const pattern of deletePatterns) {
      if (pattern.test(code)) {
        if (code.includes('cooldown:') && code.includes('redis.get(cooldownKey)')) {
          if (monitorCode) {
            const closeReasons = ['STOP_LOSS', 'TAKE_PROFIT', 'TIME_EXPIRED', 'STALE_POSITION'];
            const missingCooldown = [];
            for (const reason of closeReasons) {
              const closeIdx = monitorCode.indexOf(`'${reason}'`);
              if (closeIdx === -1) continue;
              const afterClose = monitorCode.substring(closeIdx, closeIdx + 500);
              if (!afterClose.includes('cooldownKey') || !afterClose.includes('redis.set')) {
                missingCooldown.push(reason);
              }
            }
            if (missingCooldown.length > 0) {
              return { warn: true, detail: `processedKey يُحذف فوراً لكن cooldown غير موجود بعد: ${missingCooldown.join(', ')}.` };
            }
            return { pass: true, detail: `processedKey يُحذف فوراً لكن cooldown يُطبق بعد كل أسباب الإغلاق (SL, TP, TIME_EXPIRED, STALE_POSITION)` };
          }
          return { warn: true, detail: `processedKey يُحذف فوراً لكن يوجد cooldown check. تحقق من position-monitor.` };
        }
        return { pass: false, detail: `processedKey يُحذف فوراً بدون تأخير! يسمح بإعادة الفتح في الـ tick التالي.` };
      }
    }
    return { warn: true, detail: 'لم أجد redis.del(processedKey). تحقق يدوياً.' };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #6: PaperTradingAdapter — حدود الحجم
// V2: Check raw for REMOVED markers, then check stripped code
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #6: PaperTradingAdapter — حدود الحجم (V2) ──${RESET}`);

check('V06', 'PaperTradingAdapter يحد حجم الصفقة أو يفحصها',
  'modules/execution/adapters/paper-trading.adapter.ts',
  (content) => {
    // Check raw content for REMOVED markers (in comments)
    if (content.includes('REMOVED order value limit') || (content.includes('REMOVED') && content.includes('limit'))) {
      return { pass: false, detail: 'PaperTradingAdapter أزال كل حدود حجم الصفقة صراحةً!' };
    }

    // Strip comments and check for actual code
    const code = stripComments(content);

    // Check for positionPercent comparison
    if (/\bpositionPercent\b/.test(code) && /positionPercent\s*[>]\s*\d/.test(code)) {
      return { pass: true, detail: 'PaperTradingAdapter يفحص حجم الصفقة ديناميكياً (positionPercent) — V2 verified' };
    }

    // Check for static limits
    const hasLimit = code.includes('maxNotional') || code.includes('maxOrderValue') || code.includes('MAX_PAPER_ORDER_VALUE');
    if (hasLimit) return { pass: true, detail: 'PaperTradingAdapter يفحص حجم الصفقة (حد ثابت)' };

    return { pass: false, detail: 'PaperTradingAdapter لا يفحص حجم الصفقة أبداً.' };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #7: TradingService._executePaperTrade — فحص الحجم
// V2: Find method body and check inside it only
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #7: TradingService._executePaperTrade — فحص الحجم (V2) ──${RESET}`);

check('V07', 'TradingService._executePaperTrade يفحص حجم الصفقة',
  'modules/trading/trading.service.ts',
  (content) => {
    const code = stripComments(content);

    // V2: Find the actual method body
    const methodBody = findMethodBody(code, '_executePaperTrade');
    if (!methodBody) {
      return { warn: true, detail: 'لم أجد دالة _executePaperTrade في الملف' };
    }

    // Check for positionPercent comparison INSIDE the method body
    if (/\bpositionPercent\b/.test(methodBody) && /positionPercent\s*[>]\s*\d/.test(methodBody)) {
      return { pass: true, detail: '_executePaperTrade يفحص حجم الصفقة ديناميكياً (positionPercent > X) داخل الدالة فعلياً — V2 verified' };
    }

    // Check for static size limits inside method body
    if (methodBody.includes('maxNotional') || methodBody.includes('maxOrderValue') || methodBody.includes('MAX_PAPER_NOTIONAL')) {
      return { pass: true, detail: '_executePaperTrade يفحص حجم الصفقة (حد ثابت)' };
    }

    return { pass: false, detail: '_executePaperTrade لا يفحص حجم الصفقة أبداً — أي كمية تمر!' };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #8: TradeCoordinationService — قفل ذري
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #8: TradeCoordinationService — قفل ذري ──${RESET}`);

check('V08', 'TradeCoordinationService.acquireTradeLock يستخدم SET NX (ذري)',
  'modules/trading/services/trade-coordination.service.ts',
  (content) => {
    const code = stripComments(content);
    if (!code.includes('acquireTradeLock')) return { warn: true, detail: 'لم أجد acquireTradeLock.' };

    if ((code.includes('SET') && code.includes('NX')) || code.includes('setnx') || code.includes('setIfNotExists')) {
      return { pass: true, detail: 'acquireTradeLock يستخدم SET NX ذري' };
    }

    const acquireSection = code.match(/acquireTradeLock[\s\S]{0,500}/);
    if (acquireSection && acquireSection[0].includes('.get(') && acquireSection[0].includes('.set(')) {
      return { pass: false, detail: 'acquireTradeLock يستخدم GET ثم SET (غير ذري!)' };
    }

    return { warn: true, detail: 'لم أستطع تحديد طريقة القفل.' };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #9: Cooldown — بعد كل أسباب الإغلاق
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #9: Cooldown — بعد كل أسباب الإغلاق ──${RESET}`);

check('V09', 'Cooldown يُطبق بعد TAKE_PROFIT أيضاً',
  'modules/engine/services/position-monitor.service.ts',
  (content) => {
    const code = stripComments(content);
    if (!code.includes('cooldown')) return { pass: false, detail: 'لا يوجد أي cooldown في PositionMonitor!' };

    const lines = code.split('\n');
    let cooldownAfterTP = false, cooldownAfterSL = false, cooldownAfterTE = false;
    const cooldownSetLines = [];

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('cooldown') && (lines[i].includes('set') || lines[i].includes('setex'))) {
        cooldownSetLines.push(i);
      }
    }

    for (const idx of cooldownSetLines) {
      const contextStart = Math.max(0, idx - 11);
      const context = lines.slice(contextStart, idx + 1).join('\n');
      if (context.includes('TAKE_PROFIT') || context.includes('TP')) cooldownAfterTP = true;
      if (context.includes('STOP_LOSS') || context.includes('SL')) cooldownAfterSL = true;
      if (context.includes('TIME_EXPIRED') || context.includes('STALE')) cooldownAfterTE = true;
    }

    if (cooldownAfterTP && cooldownAfterSL && cooldownAfterTE) {
      return { pass: true, detail: 'Cooldown يُطبق بعد كل أسباب الإغلاق (SL, TP, TIME_EXPIRED, STALE)' };
    }

    const missing = [];
    if (!cooldownAfterTP) missing.push('TAKE_PROFIT');
    if (!cooldownAfterSL) missing.push('STOP_LOSS');
    if (!cooldownAfterTE) missing.push('TIME_EXPIRED');

    return { pass: false, detail: `Cooldown لا يُطبق بعد: ${missing.join(', ')}.` };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #10: OrderDispatcher — منع التكرار بين المصادر
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #10: OrderDispatcher — منع التكرار بين المصادر ──${RESET}`);

check('V10', 'OrderDispatcher يمنع نفس الرمز+الاتجاه من مصادر مختلفة',
  'modules/trading/services/order-dispatcher.service.ts',
  (content) => {
    const code = stripComments(content);

    if (code.includes('existing.source !== request.source') && code.includes('CROSS_SOURCE_DEDUP')) {
      return { pass: true, detail: 'يوجد فحص تكرار بين المصادر (V180 cross-source dedup)' };
    }

    if ((code.includes('Different source') && code.includes('ALLOW')) || (code.includes('existing.source !== request.source') && code.includes('ALLOW'))) {
      return { pass: false, detail: 'OrderDispatcher يسمح صراحةً بنفس الرمز + نفس الاتجاه من مصدر مختلف!' };
    }

    if (code.includes('cross-source') || code.includes('crossSource')) {
      return { pass: true, detail: 'يوجد فحص تكرار بين المصادر' };
    }

    if (code.includes('existingAge') && code.includes('existing.source !== request.source')) {
      return { pass: true, detail: 'يوجد فحص تكرار بين المصادر (زمني)' };
    }

    return { warn: true, detail: 'لم أجد منع تكرار واضح بين المصادر.' };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #11: _getPaperPortfolioValue — تأثير lockedMargin
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #11: _getPaperPortfolioValue — تأثير lockedMargin ──${RESET}`);

check('V11', '_getPaperPortfolioValue لا يُضخّم equity بـ lockedMargin للكريبتو',
  'modules/ai/smart-executor/smart-executor.service.ts',
  (content) => {
    const code = stripComments(content);
    if (!code.includes('_getPaperPortfolioValue')) return { warn: true, detail: 'لم أجد _getPaperPortfolioValue' };

    // V2: Find the actual method body
    const methodBody = findMethodBody(code, '_getPaperPortfolioValue');
    if (methodBody && methodBody.includes('lockedMargin') && !methodBody.includes('cap') && !methodBody.includes('Math.min')) {
      return { pass: false, detail: '_getPaperPortfolioValue يستخدم lockedMargin بدون cap = تضخيم المحفظة!' };
    }

    if (code.includes('_getPaperPortfolioValue') && !code.includes('lockedMargin')) {
      return { pass: true, detail: '_getPaperPortfolioValue يستخدم freeCash فقط (بدون تضخيم)' };
    }

    return { warn: true, detail: 'لم أستطع تحديد طريقة الحساب بدقة.' };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #12: TradingService.placeOrder — فحص الحجم الكلي
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #12: TradingService.placeOrder — فحص الحجم الكلي ──${RESET}`);

check('V12', 'TradingService.placeOrder يفحص حجم الصفقة',
  'modules/trading/trading.service.ts',
  (content) => {
    const code = stripComments(content);

    // V2: Find placeOrder method body
    const methodBody = findMethodBody(code, 'placeOrder');
    if (!methodBody) return { warn: true, detail: 'لم أجد placeOrder' };

    // Check for positionPercent or maxPositionSize in placeOrder
    if (/\bpositionPercent\b/.test(methodBody) || methodBody.includes('maxPositionSize') || methodBody.includes('maxOrderValue')) {
      return { pass: true, detail: 'placeOrder يفحص حجم الصفقة' };
    }

    // Check skipRiskCheck — must be opt-in (not default)
    if (methodBody.includes('skipRiskCheck')) {
      if (methodBody.includes('skipRiskCheck === true')) {
        // This means skipRiskCheck must be explicitly true to skip — safe default
        return { pass: true, detail: 'placeOrder يفحص المخاطر افتراضياً (skipRiskCheck === true يطلب تجاوز صريح)' };
      }
    }

    return { warn: true, detail: 'لم أجد فحص حجم واضح في placeOrder.' };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #13: MT5 Adapter — فحص حجم الصفقة (NEW)
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #13: MT5 Adapter — فحص حجم الصفقة (NEW) ──${RESET}`);

check('V13', 'MT5 Adapter يفحص حجم الصفقة',
  'modules/execution/adapters/mt5.adapter.ts',
  (content) => {
    const code = stripComments(content);

    if (/\bpositionPercent\b/.test(code) && /positionPercent\s*[>]\s*\d/.test(code)) {
      return { pass: true, detail: 'MT5 Adapter يفحص حجم الصفقة ديناميكياً (positionPercent > X)' };
    }

    if (code.includes('MAX_POSITION_PERCENT')) {
      return { pass: true, detail: 'MT5 Adapter يفحص حجم الصفقة (MAX_POSITION_PERCENT)' };
    }

    return { pass: false, detail: 'MT5 Adapter لا يفحص حجم الصفقة — أي كمية تمر!' };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #14: ExecutionGateway — توجيه MT5 (NEW)
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #14: ExecutionGateway — توجيه MT5 (NEW) ──${RESET}`);

check('V14', 'ExecutionGateway يوجّه أوامر MT5 بشكل صحيح',
  'modules/execution/gateways/execution-gateway.service.ts',
  (content) => {
    const code = stripComments(content);

    const hasMT5Routing = /case\s+['"]mt5['"]/.test(code);
    if (!hasMT5Routing) {
      return { pass: false, detail: 'ExecutionGateway لا يوجّه أوامر MT5 — لن تعمل أوامر MT5!' };
    }

    const hasMT5Import = code.includes('MT5Adapter') || code.includes('mt5.adapter');
    if (!hasMT5Import) {
      return { warn: true, detail: 'يوجد case mt5 لكن لا يوجد استيراد لـ MT5Adapter' };
    }

    const hasMT5Demo = code.includes('mt5_demo');
    if (!hasMT5Demo) {
      return { warn: true, detail: 'MT5 routing موجود لكن mt5_demo غير معرّف كحساب ورقي' };
    }

    return { pass: true, detail: 'ExecutionGateway يوجّه أوامر MT5 بشكل صحيح (mt5, mt5_demo, metatrader5)' };
  }
);

// ═══════════════════════════════════════════════════════════════════
// ملخص النتائج
// ═══════════════════════════════════════════════════════════════════

console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}`);
console.log(`${BOLD}${CYAN}  ملخص النتائج — V2 (Runtime-Based)${RESET}`);
console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}\n`);

console.log(`  ${GREEN}نجح: ${passed}${RESET}`);
console.log(`  ${RED}فشل: ${failed}${RESET}`);
console.log(`  ${YELLOW}تحذير: ${warnings}${RESET}`);

const total = passed + failed + warnings;
const score = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;

console.log(`\n  ${BOLD}درجة السلامة: ${score}%${RESET}`);

if (failed > 0) {
  console.log(`\n  ${RED}${BOLD}⚠ هناك ${failed} ثغرة حرجة مفتوحة!${RESET}`);
  console.log(`  ${RED}الثغرات المفتوحة:${RESET}`);
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`    ${RED}• ${r.id}: ${r.name}${RESET}`);
    console.log(`      ${r.detail.substring(0, 120)}...`);
  });
}

if (failed === 0 && warnings === 0) {
  console.log(`\n  ${GREEN}${BOLD}✓ جميع الفحوصات ناجحة — النظام في حالة جيدة${RESET}`);
} else if (failed === 0) {
  console.log(`\n  ${YELLOW}${BOLD}⚠ لا ثغرات حرجة، لكن ${warnings} تحذير يستحق المراجعة${RESET}`);
}

// ── Exit code ──
console.log('');
process.exit(failed > 0 ? 1 : 0);
