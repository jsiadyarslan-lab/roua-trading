#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════
 * سكريبت التحقق من سلامة نظام التداول الآلي
 * Trading System Integrity Verification Script
 * ═══════════════════════════════════════════════════════════════════
 *
 * الهدف: فحص الكود الفعلي والتأكد أن الثغرات الحرجة مغلقة.
 * هذا السكريبت لا يعتمد على أي أداة AI — يقرأ الملفات مباشرة.
 *
 * كيفية التشغيل:
 *   cd apps/api
 *   node src/scripts/verify-system-integrity.js
 *
 * أو من جذر المشروع:
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
// الفحوصات
// ═══════════════════════════════════════════════════════════════════

console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}`);
console.log(`${BOLD}${CYAN}  سكريبت التحقق من سلامة نظام التداول الآلي${RESET}`);
console.log(`${BOLD}${CYAN}  Trading System Integrity Verification${RESET}`);
console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}\n`);

// ───────────────────────────────────────────────────────────────
// الفحص #1: هل RiskGatekeeper يتحقق من حجم الصفقة للحسابات الورقية؟
// ───────────────────────────────────────────────────────────────
console.log(`${BOLD}── الفحص #1: RiskGatekeeper — فحص حجم الصفقة للورقي ──${RESET}`);

check('V01', 'RiskGatekeeper لا يرجع allowed:true بدون فحص الحجم للورقي',
  'modules/trading/services/risk-gatekeeper.service.ts',
  (content) => {
    // البحث عن النمط: if (isPaperByFlag || isSimulatedByCredential) { ... return { allowed: true }
    // يجب ألا يكون هناك return { allowed: true } داخل بلوك الـ isSimulated بدون فحص positionPercent

    const lines = content.split('\n');
    let insideSimulatedBlock = false;
    let braceDepth = 0;
    let blockStartLine = 0;
    let hasPositionPercentCheck = false;
    let hasEarlyAllowedTrue = false;
    let earlyReturnLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // كشف بداية بلوك isPaper/isSimulated
      if (line.includes('isPaperByFlag') || line.includes('isSimulatedByCredential') || line.includes('isSimulated')) {
        if (line.includes('if') && line.includes('{')) {
          insideSimulatedBlock = true;
          braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
          blockStartLine = lineNum;
          hasPositionPercentCheck = false;
          hasEarlyAllowedTrue = false;
          continue;
        }
      }

      if (insideSimulatedBlock) {
        braceDepth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;

        // هل يفحص positionPercent أو maxPositionSizePercent داخل هذا البلوك؟
        if (line.includes('positionPercent') || line.includes('maxPositionSizePercent') || line.includes('positionPercent >')) {
          hasPositionPercentCheck = true;
        }

        // هل يرجع allowed: true بدون فحص الحجم؟
        if (line.includes('allowed: true') || line.includes("allowed: 'true'")) {
          hasEarlyAllowedTrue = true;
          earlyReturnLine = lineNum;
        }

        // انتهى البلوك
        if (braceDepth <= 0) {
          if (hasEarlyAllowedTrue && !hasPositionPercentCheck) {
            return {
              pass: false,
              detail: `السطر ${earlyReturnLine}: return { allowed: true } بدون فحص positionPercent داخل بلوك isSimulated (يبدأ سطر ${blockStartLine}). هذا يعني الحسابات الورقية تتجاوز فحص حجم الصفقة بالكامل!`
            };
          }
          insideSimulatedBlock = false;
        }
      }
    }

    // فحص إضافي: هل توجد checkPositionSizeLimit أصلاً؟
    if (!content.includes('checkPositionSizeLimit') && !content.includes('positionPercent')) {
      return {
        pass: false,
        detail: 'لا توجد دالة checkPositionSizeLimit أو فحص positionPercent في الملف أصلاً!'
      };
    }

    return { pass: true, detail: 'RiskGatekeeper يفحص حجم الصفقة لجميع الحسابات (ورقي وحقيقي)' };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #2: هل RiskManager يتحقق من حجم الصفقة للحسابات الورقية؟
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #2: RiskManager — فحص حجم الصفقة للورقي ──${RESET}`);

check('V02', 'RiskManager لا يرجع allowed:true بدون فحص الحجم للورقي',
  'modules/trading/risk-manager.service.ts',
  (content) => {
    const lines = content.split('\n');
    let insideSimulatedBlock = false;
    let braceDepth = 0;
    let blockStartLine = 0;
    let hasPositionPercentCheck = false;
    let hasEarlyAllowedTrue = false;
    let earlyReturnLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      if (line.includes('isSimulated') && line.includes('if')) {
        insideSimulatedBlock = true;
        braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        blockStartLine = lineNum;
        hasPositionPercentCheck = false;
        hasEarlyAllowedTrue = false;
        continue;
      }

      if (insideSimulatedBlock) {
        braceDepth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;

        if (line.includes('positionPercent') || line.includes('maxPositionSizePercent')) {
          hasPositionPercentCheck = true;
        }

        if (line.includes('allowed: true')) {
          hasEarlyAllowedTrue = true;
          earlyReturnLine = lineNum;
        }

        if (braceDepth <= 0) {
          if (hasEarlyAllowedTrue && !hasPositionPercentCheck) {
            return {
              pass: false,
              detail: `السطر ${earlyReturnLine}: return { allowed: true } بدون فحص positionPercent داخل بلوك isSimulated (سطر ${blockStartLine}). الحسابات الورقية تتجاوز فحص الحجم!`
            };
          }
          insideSimulatedBlock = false;
        }
      }
    }

    // فحص إضافي: هل يتجاوز المستخدمين الذين لديهم فقط simulated credentials؟
    if (content.includes('hasOnlySimulatedCredentials') || content.includes('realCredential')) {
      const simCredBlock = content.match(/hasOnlySimulatedCredentials[\s\S]*?allowed:\s*true/);
      if (simCredBlock && !simCredBlock[0].includes('positionPercent')) {
        return {
          pass: false,
          detail: 'hasOnlySimulatedCredentials block يرجع allowed:true بدون فحص positionPercent'
        };
      }
    }

    return { pass: true, detail: 'RiskManager يفحص حجم الصفقة لجميع الحسابات' };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #3: هل Smart Executor يحد حجم الصفقة بـ 2% كحد أقصى؟
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #3: Smart Executor — حد حجم الصفقة ──${RESET}`);

check('V03', 'Smart Executor maxOrderValue للورقي ≤ 2% من المحفظة',
  'modules/ai/smart-executor/smart-executor.service.ts',
  (content) => {
    // البحث عن maxOrderValue
    const maxOrderMatch = content.match(/maxOrderValue\s*=\s*isSimulatedExecution\s*\n?\s*:\s*[\s\S]*?:\s*([\s\S]*?);/);

    if (!maxOrderMatch) {
      // نمط بديل
      const altMatch = content.match(/const\s+maxOrderValue[\s\S]*?portfolioValue\s*\*\s*0\.(\d+)/g);
      if (altMatch) {
        const paperMatch = altMatch.join('\n').match(/isSimulated[\s\S]*?0\.(\d+)/);
        const realMatch = altMatch.join('\n').match(/isSimulated[\s\S]*?0\.(\d+)/g);

        // فحص بسيط: هل النسبة للورقي ≤ 0.02 (2%)؟
        const paperLine = content.match(/isSimulatedExecution[\s\S]*?portfolioValue\s*\*\s*0\.(\d+)/);
        if (paperLine) {
          const paperPercent = parseInt(paperLine[1]);
          if (paperPercent > 2) {
            return {
              pass: false,
              detail: `حد الورقي = ${paperPercent}% من المحفظة. يجب أن يكون ≤ 2%. حالياً صفقات تصل لـ 86% من المحفظة!`
            };
          }
          return { pass: true, detail: `حد الورقي = ${paperPercent}% من المحفظة` };
        }
      }

      return {
        pass: false,
        detail: 'لم أجد maxOrderValue في Smart Executor. هل تم حذفه؟'
      };
    }

    // فحص مباشر: هل الرقم للورقي أكبر من 0.02؟
    const paperPercentMatch = content.match(/isSimulatedExecution\s*\n?\s*\?[\s\S]*?portfolioValue\s*\*\s*0\.(\d+)/);
    if (paperPercentMatch) {
      const paperPercent = parseInt(paperPercentMatch[1]);
      if (paperPercent > 2) {
        return {
          pass: false,
          detail: `حد الورقي = ${paperPercent}% من المحفظة (${paperPercent}%). يجب أن يكون ≤ 2%.`
        };
      }
      return { pass: true, detail: `حد الورقي = ${paperPercent}% — ضمن الحد المطلوب (≤2%)` };
    }

    // فحص آخر: ابحث عن أي نسبة
    const allPercents = [...content.matchAll(/portfolioValue\s*\*\s*0\.(\d+)/g)];
    for (const match of allPercents) {
      const pct = parseInt(match[1]);
      if (pct > 5) {
        return {
          pass: false,
          detail: `وجدت portfolioValue * 0.${pct} (= ${pct}%) في Smart Executor. أكبر من 2%!`
        };
      }
    }

    return { warn: true, detail: 'لم أستطع تحديد النسبة بدقة. تحقق يدوياً من maxOrderValue' };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #4: هل يوجد حد أدنى لمسافة Stop Loss؟
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #4: حد أدنى لمسافة Stop Loss ──${RESET}`);

check('V04', 'يوجد حد أدنى لمسافة Stop Loss (≥ 0.3%)',
  'modules/ai/smart-executor/smart-executor.service.ts',
  (content) => {
    // ابحث عن أي فحص لمسافة SL
    const slDistPatterns = [
      /slDistance/i,
      /MIN_SL_DISTANCE/i,
      /minSlDistance/i,
      /stopLoss.*distance/i,
      /priceRisk.*<.*0\./,
      /sl.*too.*close/i,
      /stop.*loss.*too/i,
      /MIN_STOP_LOSS/i,
      /stopLossMinDistance/i,
    ];

    for (const pattern of slDistPatterns) {
      if (pattern.test(content)) {
        // وجد فحص — لكن هل يمنع فعلاً؟
        const match = content.match(pattern);
        const lineNum = content.substring(0, match.index).split('\n').length;
        return { pass: true, detail: `وجدت فحص مسافة SL عند السطر ~${lineNum}: ${match[0]}` };
      }
    }

    // فحص بديل: هل priceRisk يُفحص بأي حد أدنى؟
    const priceRiskChecks = content.match(/priceRisk\s*[<>]\s*[^=]/g);
    if (priceRiskChecks) {
      // يوجد فحص لـ priceRisk — لكن هل هو حد أدنى كافٍ؟
      const onlyZeroCheck = content.match(/priceRisk\s*===?\s*0/);
      if (onlyZeroCheck && !content.match(/priceRisk\s*<\s*[1-9]/)) {
        return {
          pass: false,
          detail: 'يوجد فقط فحص priceRisk === 0 (SL = entry). لا يوجد حد أدنى لنسبة المسافة. SL قريب جداً = حجم صفقة ضخم!'
        };
      }
    }

    return {
      pass: false,
      detail: 'لا يوجد أي حد أدنى لمسافة Stop Loss! بدون هذا، SL القريب ينتج كميات ضخمة (مثال: DOGE 98,361 وحدة مع SL بعده 0.55%)'
    };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #5: هل processedKey يُحذف فوراً بعد إغلاق الصفقة؟ (حلقة مفرغة)
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #5: processedKey — حلقة افتح-أغلق-افتح ──${RESET}`);

check('V05', 'processedKey لا يُحذف فوراً بعد إغلاق الصفقة (يمنع حلقة مفرغة)',
  'modules/ai/smart-executor/smart-executor.service.ts',
  (content) => {
    // ابحث عن نمط حذف processedKey عند إغلاق الصفقة
    const deletePatterns = [
      /\.del\(processedKey\)/,
      /redis\.del\(processedKey\)/,
      /await.*\.del\(processedKey\)/,
    ];

    for (const pattern of deletePatterns) {
      if (pattern.test(content)) {
        const match = content.match(pattern);
        const lineNum = content.substring(0, match.index).split('\n').length;

        // هل يوجد تأخير قبل الحذف؟
        const surroundingCode = content.substring(Math.max(0, match.index - 300), match.index + 100);

        // ابحث عن أي إشارة لتأخير أو cooldown
        if (surroundingCode.includes('delay') || surroundingCode.includes('COOLDOWN') ||
            surroundingCode.includes('5 * 60') || surroundingCode.includes('expire') ||
            surroundingCode.includes('setex') || surroundingCode.includes('SET EX')) {
          return { pass: true, detail: `processedKey يُحذف مع تأخير/cooldown (سطر ~${lineNum})` };
        }

        // هل يوجد cooldown منفصل يمنع إعادة الفتح؟
        if (content.includes('cooldown:') && content.includes('redis.get(cooldownKey)')) {
          return {
            warn: true,
            detail: `processedKey يُحذف فوراً (سطر ~${lineNum}) لكن يوجد cooldown check. تحقق: هل cooldown يُطبق بعد كل أسباب الإغلاق (بما فيه TP)؟`
          };
        }

        return {
          pass: false,
          detail: `processedKey يُحذف فوراً عند إغلاق الصفقة (سطر ~${lineNum}) بدون تأخير! هذا يسمح للـ SmartExecutor بإعادة فتح الصفقة في الـ tick التالي (كل 10 ثوانٍ). النتيجة: صفقات مدتها 20-30 ثانية في حلقة لا نهائية.`
        };
      }
    }

    // لم يجد حذف processedKey — ربما تم إصلاحه بطريقة أخرى
    return { warn: true, detail: 'لم أجد redis.del(processedKey). إما تم إصلاحه أو النمط تغير. تحقق يدوياً.' };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #6: هل PaperTradingAdapter يحد حجم الصفقة؟
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #6: PaperTradingAdapter — حدود الحجم ──${RESET}`);

check('V06', 'PaperTradingAdapter يحد حجم الصفقة أو يفحصها',
  'modules/execution/adapters/paper-trading.adapter.ts',
  (content) => {
    // هل يوجد تعليق "REMOVED order value limit"؟
    if (content.includes('REMOVED order value limit') || content.includes('REMOVED') && content.includes('limit')) {
      return {
        pass: false,
        detail: 'PaperTradingAdapter أزال كل حدود حجم الصفقة صراحةً! تعليق الكود: "REMOVED order value limit for paper trading entirely". هذا آخر خط دفاعي — أي حجم يمر منه!'
      };
    }

    // هل يوجد فحص notional أو positionPercent أو maxOrderValue؟
    const hasLimit = content.includes('maxNotional') || content.includes('maxOrderValue') ||
                     content.includes('positionPercent') || content.includes('orderValue') &&
                     content.includes('max');

    if (hasLimit) {
      return { pass: true, detail: 'PaperTradingAdapter يفحص حجم الصفقة' };
    }

    return {
      pass: false,
      detail: 'PaperTradingAdapter لا يفحص حجم الصفقة أبداً. أي كمية تُنفذ بدون قيود.'
    };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #7: هل _executePaperTrade في TradingService يفحص الحجم؟
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #7: TradingService._executePaperTrade — فحص الحجم ──${RESET}`);

check('V07', 'TradingService._executePaperTrade يفحص حجم الصفقة',
  'modules/trading/trading.service.ts',
  (content) => {
    // ابحث عن _executePaperTrade
    const paperTradeMatch = content.match(/_executePaperTrade[\s\S]*?\{[\s\S]*?\n\s*\}/);
    if (!paperTradeMatch) {
      return { warn: true, detail: 'لم أجد _executePaperTrade. ربما تم تغيير اسمه.' };
    }

    const paperTradeCode = paperTradeMatch[0];

    // هل يفحص حجم الصفقة؟
    const hasSizeCheck = paperTradeCode.includes('maxNotional') ||
                         paperTradeCode.includes('maxOrderValue') ||
                         paperTradeCode.includes('positionPercent') ||
                         paperTradeCode.includes('maxPositionSize') ||
                         paperTradeCode.includes('quantity >') ||
                         paperTradeCode.includes('orderValue >');

    if (hasSizeCheck) {
      return { pass: true, detail: '_executePaperTrade يفحص حجم الصفقة' };
    }

    return {
      pass: false,
      detail: '_executePaperTrade لا يفحص حجم الصفقة أبداً! يحسب فقط slippage و fee ويرجع النتيجة. هذا يعني أي كمية تمر حتى لو كانت 86% من المحفظة.'
    };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #8: هل TradeCoordinationService يستخدم SET NX ذري؟
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #8: TradeCoordinationService — قفل ذري ──${RESET}`);

check('V08', 'TradeCoordinationService.acquireTradeLock يستخدم SET NX (ذري)',
  'modules/trading/services/trade-coordination.service.ts',
  (content) => {
    // ابحث عن acquireTradeLock
    if (!content.includes('acquireTradeLock')) {
      return { warn: true, detail: 'لم أجد acquireTradeLock. ربما تم تغيير البنية.' };
    }

    // هل يستخدم SET NX؟
    if (content.includes('SET') && content.includes('NX')) {
      return { pass: true, detail: 'acquireTradeLock يستخدم SET NX ذري' };
    }

    // هل يستخدم setnx أو setIfNotExist؟
    if (content.includes('setnx') || content.includes('setIfNotExist') || content.includes('setnx')) {
      return { pass: true, detail: 'acquireTradeLock يستخدم setnx ذري' };
    }

    // هل يستخدم GET ثم SET؟ (race condition!)
    const acquireSection = content.match(/acquireTradeLock[\s\S]{0,500}/);
    if (acquireSection) {
      const code = acquireSection[0];
      if (code.includes('.get(') && code.includes('.set(')) {
        return {
          pass: false,
          detail: 'acquireTradeLock يستخدم GET ثم SET (غير ذري!). بين GET و SET يمكن لعملية أخرى أن تمر. يجب استخدام SET NX بدلاً من ذلك.'
        };
      }
    }

    return { warn: true, detail: 'لم أستطع تحديد طريقة القفل. تحقق يدوياً.' };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #9: هل Cooldown يُطبق بعد كل أسباب الإغلاق؟
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #9: Cooldown — بعد كل أسباب الإغلاق ──${RESET}`);

check('V09', 'Cooldown يُطبق بعد TAKE_PROFIT أيضاً (ليس فقط SL/TIME_EXPIRED)',
  'modules/engine/services/position-monitor.service.ts',
  (content) => {
    // ابحث عن cooldown
    if (!content.includes('cooldown')) {
      return {
        pass: false,
        detail: 'لا يوجد أي cooldown في PositionMonitor! الصفقات يمكن إعادة فتحها فوراً بعد أي إغلاق.'
      };
    }

    // ابحث عن مكان تعيين cooldown
    const cooldownSetLines = [];
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('cooldown') && (lines[i].includes('set') || lines[i].includes('setex'))) {
        cooldownSetLines.push({ line: i + 1, text: lines[i].trim() });
      }
    }

    if (cooldownSetLines.length === 0) {
      return { warn: true, detail: 'يوجد ذكر cooldown لكن لم أجد مكان تعيينه بوضوح' };
    }

    // هل cooldown يُعين بعد TAKE_PROFIT؟
    let cooldownAfterTP = false;
    let cooldownAfterSL = false;
    let cooldownAfterTE = false;

    for (const cl of cooldownSetLines) {
      // خذ 10 أسطر قبل كل تعيين cooldown لمعرفة السياق
      const contextStart = Math.max(0, cl.line - 11);
      const context = lines.slice(contextStart, cl.line).join('\n');

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

    return {
      pass: false,
      detail: `Cooldown لا يُطبق بعد: ${missing.join(', ')}. الصفقات المغلقة بـ ${missing.join('/')} يمكن إعادة فتحها فوراً — حلقة مفرغة!`
    };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #10: هل OrderDispatcher يمنع التكرار بين المصادر؟
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #10: OrderDispatcher — منع التكرار بين المصادر ──${RESET}`);

check('V10', 'OrderDispatcher يمنع نفس الرمز+الاتجاه من مصادر مختلفة خلال 60 ثانية',
  'modules/trading/services/order-dispatcher.service.ts',
  (content) => {
    // هل يسمح صراحةً بنفس الاتجاه من مصدر مختلف؟
    if (content.includes('Different source') && content.includes('ALLOW') ||
        content.includes('existing.source !== request.source') && content.includes('ALLOW')) {
      return {
        pass: false,
        detail: 'OrderDispatcher يسمح صراحةً بنفس الرمز + نفس الاتجاه من مصدر مختلف! هذا يفسر صفقات DOGE/USDT الثلاث المتكررة من Smart و Agent خلال دقيقتين.'
      };
    }

    // هل يوجد فحص cross-source dedup؟
    const hasCrossSourceCheck = content.includes('cross-source') ||
                                content.includes('crossSource') ||
                                (content.includes('source') && content.includes('sameDirection') && content.includes('block'));

    if (hasCrossSourceCheck) {
      return { pass: true, detail: 'OrderDispatcher يفحص التكرار بين المصادر' };
    }

    return { warn: true, detail: 'لم أجد منع تكرار واضح بين المصادر. تحقق يدوياً هل يمكن لـ Smart و Agent فتح نفس الرمز بنفس الاتجاه.' };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #11: هل _getPaperPortfolioValue يستخدم lockedMargin بحذر؟
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #11: _getPaperPortfolioValue — تأثير lockedMargin ──${RESET}`);

check('V11', '_getPaperPortfolioValue لا يُضخّم equity بـ lockedMargin للكريبتو',
  'modules/ai/smart-executor/smart-executor.service.ts',
  (content) => {
    if (!content.includes('_getPaperPortfolioValue')) {
      return { warn: true, detail: 'لم أجد _getPaperPortfolioValue' };
    }

    // هل يستخدم equity = freeCash + lockedMargin + unrealizedPnl؟
    if (content.includes('freeCash + lockedMargin') || content.includes('equity = freeCash')) {
      // هل يفحص أن lockedMargin لا يُضخّم القيمة؟
      const methodMatch = content.match(/_getPaperPortfolioValue[\s\S]*?freeCash[\s\S]*?lockedMargin[\s\S]*?return/);
      if (methodMatch) {
        const code = methodMatch[0];
        if (code.includes('lockedMargin') && !code.includes('cap') && !code.includes('Math.min')) {
          return {
            pass: false,
            detail: '_getPaperPortfolioValue يستخدم equity = freeCash + lockedMargin + PnL. للكريبتو (leverage 1:1), lockedMargin = القيمة الاسمية الكاملة. صفقة DOGE بـ $8,000 تضيف $8,000 لـ equity = محفظة مُضخّمة = أحجام أكبر!'
          };
        }
      }
    }

    // هل يستخدم freeCash فقط؟
    if (content.includes('_getPaperPortfolioValue') && !content.includes('lockedMargin')) {
      return { pass: true, detail: '_getPaperPortfolioValue يستخدم freeCash فقط (بدون تضخيم)' };
    }

    return { warn: true, detail: 'لم أستطع تحديد طريقة الحساب بدقة. تحقق يدوياً.' };
  }
);

// ───────────────────────────────────────────────────────────────
// الفحص #12: هل TradingService.placeOrder يفحص الحجم للورقي؟
// ───────────────────────────────────────────────────────────────
console.log(`\n${BOLD}── الفحص #12: TradingService.placeOrder — فحص الحجم الكلي ──${RESET}`);

check('V12', 'TradingService.placeOrder يفحص حجم الصفقة (notional/portfolio%)',
  'modules/trading/trading.service.ts',
  (content) => {
    // هل placeOrder يفحص حجم الصفقة نسبة للمحفظة؟
    const placeOrderSection = content.match(/async placeOrder[\s\S]{0,2000}/);
    if (!placeOrderSection) {
      return { warn: true, detail: 'لم أجد placeOrder' };
    }

    const code = placeOrderSection[0];

    // هل يفحص positionPercent أو maxPositionSize؟
    if (code.includes('positionPercent') || code.includes('maxPositionSize') || code.includes('maxOrderValue')) {
      return { pass: true, detail: 'placeOrder يفحص حجم الصفقة' };
    }

    // هل يفحص skipRiskCheck؟
    if (code.includes('skipRiskCheck')) {
      // skipRiskCheck = true يعني تخطى فحص المخاطر!
      // لكن هل هذا فقط من Controllers؟
      if (code.includes('skipRiskCheck === true') || code.includes("skipRiskCheck === 'true'")) {
        return {
          pass: false,
          detail: 'placeOrder يسمح بتخطي فحص المخاطر عبر skipRiskCheck === true. SmartExecutor يمرر هذا العلم عبر OrderDispatcher، مما يمنع أي فحص حجم!'
        };
      }
    }

    return { warn: true, detail: 'لم أجد فحص حجم واضح في placeOrder. قد يعتمد على RiskManager الذي يتجاوز الورقي.' };
  }
);

// ═══════════════════════════════════════════════════════════════════
// ملخص النتائج
// ═══════════════════════════════════════════════════════════════════

console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}`);
console.log(`${BOLD}${CYAN}  ملخص النتائج${RESET}`);
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
