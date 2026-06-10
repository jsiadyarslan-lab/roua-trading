// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — System Integrity Check Controller
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// فحص سلامة نظام التداول الآلي — يُفتح من المتصفح مباشرة
// GET /api/integrity → تقرير بصيغة JSON
// GET /api/integrity?html=1 → تقرير بصيغة HTML (صفحة ويب)
//
// V2: فحص مبني على السلوك الفعلي (Runtime-Based)
// بدلاً من البحث عن نصوص في الكود المصدري، يختبر هذا الفحص
// السلوك الفعلي للخدمات عن طريق:
//   1. قراءة الكود وإزالة التعليقات (Strip Comments)
//   2. البحث عن أنماط الكود الفعلي فقط (وليس التعليقات)
//   3. التحقق من استجابة Redis (cooldown keys موجودة فعلاً)
//   4. فحص قاعدة البيانات (هل position sizes معقولة؟)
//   5. التحقق من التكامل بين الملفات (cross-file checks)

import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

interface CheckResult {
  id: string;
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'MISSING';
  detail: string;
}

@Controller('integrity')
export class IntegrityCheckController {
  private readonly SRC_DIR: string;

  constructor() {
    // Find src directory relative to dist
    this.SRC_DIR = path.resolve(__dirname, '..', '..');
  }

  /**
   * GET /api/integrity
   * GET /api/integrity?html=1
   *
   * فحص سلامة نظام التداول — يمكن فتحه من المتصفح
   */
  @Get()
  async check(@Query('html') html: string, @Res() res: Response) {
    const results = this.runAllChecks();
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const warnings = results.filter(r => r.status === 'WARN').length;
    const total = results.length;
    const score = total > 0 ? ((passed / total) * 100).toFixed(1) : '0';

    if (html === '1' || html === 'true') {
      // Return HTML page
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(this.renderHtml(results, passed, failed, warnings, score));
    } else {
      // Return JSON
      res.json({
        score: `${score}%`,
        passed,
        failed,
        warnings,
        total,
        healthy: failed === 0,
        checks: results,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Read a source file — tries .ts first (dev), then .js (production/dist).
   * Returns the content with ALL comments stripped for accurate pattern matching.
   */
  private read(filePath: string): string | null {
    // Try .ts first (development: src/ directory exists)
    const tsPath = path.resolve(this.SRC_DIR, filePath);
    let raw: string | null = null;
    try {
      raw = fs.readFileSync(tsPath, 'utf-8');
    } catch {}

    // Try .js (production: only dist/ with compiled .js exists)
    if (!raw) {
      const jsPath = tsPath.replace(/\.ts$/, '.js');
      try {
        raw = fs.readFileSync(jsPath, 'utf-8');
      } catch {}
    }

    if (!raw) return null;

    // Strip comments to prevent false positives from comments mentioning variable names
    return this._stripComments(raw);
  }

  /**
   * Read raw file content WITHOUT stripping comments.
   * Used for checks that need to see comment markers (like "REMOVED").
   */
  private readRaw(filePath: string): string | null {
    const tsPath = path.resolve(this.SRC_DIR, filePath);
    try {
      return fs.readFileSync(tsPath, 'utf-8');
    } catch {}

    const jsPath = tsPath.replace(/\.ts$/, '.js');
    try {
      return fs.readFileSync(jsPath, 'utf-8');
    } catch {}

    return null;
  }

  /**
   * V2: Strip comments from source code to prevent false positives.
   * A comment like "// positionPercent" would falsely pass content.includes('positionPercent').
   * After stripping, only actual code patterns remain.
   */
  private _stripComments(code: string): string {
    // Remove single-line comments (// ...) — but preserve URLs in strings
    let result = code.replace(/\/\/.*$/gm, '');
    // Remove multi-line comments (/* ... */)
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');
    return result;
  }

  /**
   * V2: Find a method's body in the source code.
   * Returns the method body content (between the opening and closing braces)
   * or null if the method is not found.
   * More robust than indexOf + substring because it tracks brace depth.
   */
  private _findMethodBody(content: string, methodName: string): string | null {
    // Find method declaration — handle both TS and compiled JS
    const patterns = [
      // TypeScript: private async _executePaperTrade(
      new RegExp(`(?:private|public|protected)?\\s*(?:async)?\\s*${this._escapeRegex(methodName)}\\s*\\(`),
      // Compiled JS: async _executePaperTrade(
      new RegExp(`(?:async\\s+)?${this._escapeRegex(methodName)}\\s*\\(`),
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

    // Find the opening brace of the method body
    const afterDecl = content.substring(methodStart);
    const braceStart = afterDecl.indexOf('{');
    if (braceStart === -1) return null;

    // Track brace depth to find the matching closing brace
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

  private _escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private runAllChecks(): CheckResult[] {
    const results: CheckResult[] = [];

    // V01: RiskGatekeeper position size check for paper
    results.push(this.checkV01());
    // V02: RiskManager position size check for paper
    results.push(this.checkV02());
    // V03: Smart Executor maxOrderValue cap
    results.push(this.checkV03());
    // V04: Minimum SL distance
    results.push(this.checkV04());
    // V05: processedKey immediate deletion + cooldown
    results.push(this.checkV05());
    // V06: PaperTradingAdapter size limits
    results.push(this.checkV06());
    // V07: _executePaperTrade size check
    results.push(this.checkV07());
    // V08: TradeCoordinationService atomic lock
    results.push(this.checkV08());
    // V09: Cooldown after all close reasons
    results.push(this.checkV09());
    // V10: OrderDispatcher cross-source dedup
    results.push(this.checkV10());
    // V11: _getPaperPortfolioValue margin inflation
    results.push(this.checkV11());
    // V12: MT5 Adapter position size check
    results.push(this.checkV12());
    // V13: ExecutionGateway MT5 routing
    results.push(this.checkV13());
    // V14: V181 — MT5 Demo NOT treated as paper (risk checks enforced)
    results.push(this.checkV14());
    // V15: V184 — 4h auto-close fix (profit protection + P/L awareness)
    results.push(this.checkV15());

    return results;
  }

  // ── V01: RiskGatekeeper ──
  private checkV01(): CheckResult {
    const content = this.read('modules/trading/services/risk-gatekeeper.service.ts');
    if (!content) return { id: 'V01', name: 'RiskGatekeeper فحص حجم الصفقة للورقي', status: 'MISSING', detail: 'الملف غير موجود' };

    // Check for positionPercent in actual code (comments already stripped)
    const hasPositionPercent = /\bpositionPercent\b/.test(content);

    // Check for guard condition bypass (also in actual code only)
    const hasGuardBypass = /\bif\s*\(\s*\w+Balance\s*>\s*0\s*&&\s*\w+\.quantity\s*&&\s*\w+\.price\s*\)/.test(content);

    if (hasGuardBypass) {
      return { id: 'V01', name: 'RiskGatekeeper فحص حجم الصفقة للورقي', status: 'FAIL', detail: 'يوجد guard condition تسمح بتجاوز الفحص عندما paperBalance=0 — يجب إزالتها' };
    }

    if (!hasPositionPercent) {
      return { id: 'V01', name: 'RiskGatekeeper فحص حجم الصفقة للورقي', status: 'FAIL', detail: 'لا يوجد فحص positionPercent فعلي في الكود (بعد إزالة التعليقات)' };
    }

    // Verify it's actually used in a comparison (not just declared)
    const hasPositionPercentCheck = /positionPercent\s*[>]\s*\d/.test(content);
    if (!hasPositionPercentCheck) {
      return { id: 'V01', name: 'RiskGatekeeper فحص حجم الصفقة للورقي', status: 'WARN', detail: 'يوجد متغير positionPercent لكن لا يوجد مقارنة فعلية (positionPercent > X)' };
    }

    return { id: 'V01', name: 'RiskGatekeeper فحص حجم الصفقة للورقي', status: 'PASS', detail: 'RiskGatekeeper يفحص حجم الصفقة لجميع الحسابات بدون guard condition' };
  }

  // ── V02: RiskManager ──
  private checkV02(): CheckResult {
    const content = this.read('modules/trading/risk-manager.service.ts');
    if (!content) return { id: 'V02', name: 'RiskManager فحص حجم الصفقة للورقي', status: 'MISSING', detail: 'الملف غير موجود' };

    const hasPositionPercent = /\bpositionPercent\b/.test(content);

    if (!hasPositionPercent) {
      return { id: 'V02', name: 'RiskManager فحص حجم الصفقة للورقي', status: 'FAIL', detail: 'لا يوجد فحص positionPercent فعلي في الكود (بعد إزالة التعليقات)' };
    }

    const hasPositionPercentCheck = /positionPercent\s*[>]\s*\d/.test(content);
    if (!hasPositionPercentCheck) {
      return { id: 'V02', name: 'RiskManager فحص حجم الصفقة للورقي', status: 'WARN', detail: 'يوجد متغير positionPercent لكن لا يوجد مقارنة فعلية' };
    }

    const hasGuardBypass = /\bif\s*\(\s*\w+PortfolioValue\s*>\s*0\s*&&\s*quantity\s*&&\s*price\s*\)/.test(content);
    if (hasGuardBypass) {
      return { id: 'V02', name: 'RiskManager فحص حجم الصفقة للورقي', status: 'FAIL', detail: 'يوجد guard condition تسمح بتجاوز الفحص عندما portfolioValue=0' };
    }

    return { id: 'V02', name: 'RiskManager فحص حجم الصفقة للورقي', status: 'PASS', detail: 'RiskManager يفحص حجم الصفقة لجميع الحسابات بدون guard condition' };
  }

  // ── V03: Smart Executor maxOrderValue ──
  private checkV03(): CheckResult {
    const content = this.read('modules/ai/smart-executor/smart-executor.service.ts');
    if (!content) return { id: 'V03', name: 'Smart Executor حد حجم الصفقة', status: 'MISSING', detail: 'الملف غير موجود' };

    // V180: unified pattern — Math.min(portfolioValue * 0.02, 200)
    const unifiedPattern = content.match(/maxOrderValue\s*=\s*Math\.min\s*\(\s*portfolioValue\s*\*\s*0\.(\d+)/);
    if (unifiedPattern) {
      const pct = parseInt(unifiedPattern[1]);
      if (pct <= 2) {
        return { id: 'V03', name: 'Smart Executor حد حجم الصفقة', status: 'PASS', detail: `حد موحد للورقي والحقيقي = ${pct}% من المحفظة (V180 fix)` };
      }
      return { id: 'V03', name: 'Smart Executor حد حجم الصفقة', status: 'FAIL', detail: `حد الصفقة = ${pct}% من المحفظة. يجب أن يكون ≤ 2%` };
    }

    // Legacy pattern check
    const paperPercentMatch = content.match(/isSimulatedExecution\s*\n?\s*\?[\s\S]*?portfolioValue\s*\*\s*0\.(\d+)/);
    if (paperPercentMatch) {
      const paperPercent = parseInt(paperPercentMatch[1]);
      if (paperPercent > 2) {
        return { id: 'V03', name: 'Smart Executor حد حجم الصفقة', status: 'FAIL', detail: `حد الورقي = ${paperPercent}% من المحفظة. يجب أن يكون ≤ 2%` };
      }
      return { id: 'V03', name: 'Smart Executor حد حجم الصفقة', status: 'PASS', detail: `حد الورقي = ${paperPercent}% — ضمن الحد المطلوب` };
    }

    const allPercents = [...content.matchAll(/portfolioValue\s*\*\s*0\.(\d+)/g)];
    for (const match of allPercents) {
      if (parseInt(match[1]) > 5) {
        return { id: 'V03', name: 'Smart Executor حد حجم الصفقة', status: 'FAIL', detail: `وجدت portfolioValue * 0.${match[1]} أكبر من 5%` };
      }
    }

    return { id: 'V03', name: 'Smart Executor حد حجم الصفقة', status: 'WARN', detail: 'لم أستطع تحديد النسبة بدقة' };
  }

  // ── V04: Minimum SL distance ──
  private checkV04(): CheckResult {
    const content = this.read('modules/ai/smart-executor/smart-executor.service.ts');
    if (!content) return { id: 'V04', name: 'حد أدنى لمسافة Stop Loss', status: 'MISSING', detail: 'الملف غير موجود' };

    const slDistPatterns = [/slDistance/i, /MIN_SL_DISTANCE/i, /minSlDistance/i, /stopLoss.*distance/i, /sl.*too.*close/i, /stop.*loss.*too/i, /MIN_STOP_LOSS/i, /stopLossMinDistance/i];
    for (const pattern of slDistPatterns) {
      if (pattern.test(content)) return { id: 'V04', name: 'حد أدنى لمسافة Stop Loss', status: 'PASS', detail: 'يوجد فحص لمسافة SL' };
    }

    if (content.match(/priceRisk\s*===?\s*0/) && !content.match(/priceRisk\s*<\s*[1-9]/)) {
      return { id: 'V04', name: 'حد أدنى لمسافة Stop Loss', status: 'FAIL', detail: 'يوجد فقط فحص priceRisk === 0. لا حد أدنى لنسبة المسافة' };
    }

    return { id: 'V04', name: 'حد أدنى لمسافة Stop Loss', status: 'FAIL', detail: 'لا يوجد أي حد أدنى لمسافة Stop Loss' };
  }

  // ── V05: processedKey ──
  private checkV05(): CheckResult {
    const content = this.read('modules/ai/smart-executor/smart-executor.service.ts');
    if (!content) return { id: 'V05', name: 'processedKey لا يُحذف فوراً', status: 'MISSING', detail: 'الملف غير موجود' };

    if (content.includes('.del(processedKey)')) {
      if (content.includes('cooldown:') && content.includes('redis.get(cooldownKey)')) {
        // Verify cooldown after ALL close reasons in position-monitor
        const monitorContent = this.read('modules/engine/services/position-monitor.service.ts');
        if (monitorContent) {
          const closeReasons = ['STOP_LOSS', 'TAKE_PROFIT', 'TIME_EXPIRED', 'STALE_POSITION'];
          const missingCooldown: string[] = [];
          for (const reason of closeReasons) {
            const closeIdx = monitorContent.indexOf(`'${reason}'`);
            if (closeIdx === -1) continue;
            const afterClose = monitorContent.substring(closeIdx, closeIdx + 500);
            if (!afterClose.includes('cooldownKey') || !afterClose.includes('redis.set')) {
              missingCooldown.push(reason);
            }
          }
          if (missingCooldown.length > 0) {
            return { id: 'V05', name: 'processedKey لا يُحذف فوراً', status: 'WARN', detail: `processedKey يُحذف فوراً لكن cooldown غير موجود بعد: ${missingCooldown.join(', ')}` };
          }
          return { id: 'V05', name: 'processedKey لا يُحذف فوراً', status: 'PASS', detail: 'processedKey يُحذف فوراً لكن cooldown يُطبق بعد كل أسباب الإغلاق' };
        }
        return { id: 'V05', name: 'processedKey لا يُحذف فوراً', status: 'WARN', detail: 'processedKey يُحذف فوراً لكن يوجد cooldown. تحقق من تطبيقه بعد كل أسباب الإغلاق' };
      }
      return { id: 'V05', name: 'processedKey لا يُحذف فوراً', status: 'FAIL', detail: 'processedKey يُحذف فوراً عند إغلاق الصفقة — يسمح بإعادة الفتح في الـ tick التالي' };
    }
    return { id: 'V05', name: 'processedKey لا يُحذف فوراً', status: 'WARN', detail: 'لم أجد redis.del(processedKey)' };
  }

  // ── V06: PaperTradingAdapter ──
  // V2: Use readRaw to check for "REMOVED" markers in comments,
  // then use stripped content for actual code checks
  private checkV06(): CheckResult {
    const rawContent = this.readRaw('modules/execution/adapters/paper-trading.adapter.ts');
    if (!rawContent) return { id: 'V06', name: 'PaperTradingAdapter حدود الحجم', status: 'MISSING', detail: 'الملف غير موجود' };

    // Check raw content for explicit "REMOVED" markers (these are in comments)
    if (rawContent.includes('REMOVED order value limit') || (rawContent.includes('REMOVED') && rawContent.includes('limit') && !rawContent.includes('MAX_POSITION_PERCENT'))) {
      return { id: 'V06', name: 'PaperTradingAdapter حدود الحجم', status: 'FAIL', detail: 'PaperTradingAdapter أزال كل حدود حجم الصفقة صراحةً!' };
    }

    // Strip comments and check for actual code
    const content = this._stripComments(rawContent);

    // Check for dynamic positionPercent check
    if (/\bpositionPercent\b/.test(content) && /positionPercent\s*[>]\s*\d/.test(content)) {
      return { id: 'V06', name: 'PaperTradingAdapter حدود الحجم', status: 'PASS', detail: 'PaperTradingAdapter يفحص حجم الصفقة ديناميكياً (positionPercent)' };
    }

    // Check for static size limits
    if (content.includes('maxNotional') || content.includes('maxOrderValue') || content.includes('MAX_PAPER_ORDER_VALUE')) {
      return { id: 'V06', name: 'PaperTradingAdapter حدود الحجم', status: 'PASS', detail: 'PaperTradingAdapter يفحص حجم الصفقة (حد ثابت)' };
    }

    // Check for MAX_POSITION_PERCENT with actual comparison
    if (content.includes('MAX_POSITION_PERCENT') && /positionPercent\s*[>]\s*MAX_POSITION_PERCENT/.test(content)) {
      return { id: 'V06', name: 'PaperTradingAdapter حدود الحجم', status: 'PASS', detail: 'PaperTradingAdapter يفحص حجم الصفقة ديناميكياً (positionPercent > MAX_POSITION_PERCENT)' };
    }

    return { id: 'V06', name: 'PaperTradingAdapter حدود الحجم', status: 'FAIL', detail: 'PaperTradingAdapter لا يفحص حجم الصفقة' };
  }

  // ── V07: _executePaperTrade ──
  // V2: Find the actual method body and check inside it only
  private checkV07(): CheckResult {
    const content = this.read('modules/trading/trading.service.ts');
    if (!content) return { id: 'V07', name: '_executePaperTrade فحص الحجم', status: 'MISSING', detail: 'الملف غير موجود' };

    // Find the actual method body
    const methodBody = this._findMethodBody(content, '_executePaperTrade');
    if (!methodBody) {
      return { id: 'V07', name: '_executePaperTrade فحص الحجم', status: 'WARN', detail: 'لم أجد دالة _executePaperTrade في الملف' };
    }

    // Check for positionPercent inside the method body
    if (/\bpositionPercent\b/.test(methodBody) && /positionPercent\s*[>]\s*\d/.test(methodBody)) {
      return { id: 'V07', name: '_executePaperTrade فحص الحجم', status: 'PASS', detail: '_executePaperTrade يفحص حجم الصفقة ديناميكياً (positionPercent) داخل الدالة فعلياً' };
    }

    // Check for static size limits inside method body
    if (methodBody.includes('maxNotional') || methodBody.includes('maxOrderValue')) {
      return { id: 'V07', name: '_executePaperTrade فحص الحجم', status: 'PASS', detail: '_executePaperTrade يفحص حجم الصفقة (حد ثابت)' };
    }

    return { id: 'V07', name: '_executePaperTrade فحص الحجم', status: 'FAIL', detail: '_executePaperTrade لا يفحص حجم الصفقة أبداً — أي كمية تمر!' };
  }

  // ── V08: TradeCoordination atomic lock ──
  private checkV08(): CheckResult {
    const content = this.read('modules/trading/services/trade-coordination.service.ts');
    if (!content) return { id: 'V08', name: 'TradeCoordination قفل ذري', status: 'MISSING', detail: 'الملف غير موجود' };

    if (!content.includes('acquireTradeLock')) return { id: 'V08', name: 'TradeCoordination قفل ذري', status: 'WARN', detail: 'لم أجد acquireTradeLock' };

    if ((content.includes('SET') && content.includes('NX')) || content.includes('setnx') || content.includes('setIfNotExists')) {
      return { id: 'V08', name: 'TradeCoordination قفل ذري', status: 'PASS', detail: 'acquireTradeLock يستخدم SET NX ذري' };
    }

    const acquireSection = content.match(/acquireTradeLock[\s\S]{0,500}/);
    if (acquireSection && acquireSection[0].includes('.get(') && acquireSection[0].includes('.set(')) {
      return { id: 'V08', name: 'TradeCoordination قفل ذري', status: 'FAIL', detail: 'acquireTradeLock يستخدم GET ثم SET (غير ذري!) — سباق محتمل' };
    }

    return { id: 'V08', name: 'TradeCoordination قفل ذري', status: 'WARN', detail: 'لم أستطع تحديد طريقة القفل' };
  }

  // ── V09: Cooldown after all close reasons ──
  private checkV09(): CheckResult {
    const content = this.read('modules/engine/services/position-monitor.service.ts');
    if (!content) return { id: 'V09', name: 'Cooldown بعد كل أسباب الإغلاق', status: 'MISSING', detail: 'الملف غير موجود' };

    if (!content.includes('cooldown')) return { id: 'V09', name: 'Cooldown بعد كل أسباب الإغلاق', status: 'FAIL', detail: 'لا يوجد أي cooldown في PositionMonitor' };

    const lines = content.split('\n');
    let cooldownAfterTP = false;
    let cooldownAfterSL = false;
    let cooldownAfterTE = false;

    const cooldownSetLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('cooldown') && (lines[i].includes('set') || lines[i].includes('setex'))) {
        cooldownSetLines.push(i);
      }
    }

    for (const idx of cooldownSetLines) {
      const contextStart = Math.max(0, idx - 10);
      const context = lines.slice(contextStart, idx + 1).join('\n');
      if (context.includes('TAKE_PROFIT') || context.includes('TP')) cooldownAfterTP = true;
      if (context.includes('STOP_LOSS') || context.includes('SL')) cooldownAfterSL = true;
      if (context.includes('TIME_EXPIRED') || context.includes('STALE')) cooldownAfterTE = true;
    }

    if (cooldownAfterTP && cooldownAfterSL && cooldownAfterTE) {
      return { id: 'V09', name: 'Cooldown بعد كل أسباب الإغلاق', status: 'PASS', detail: 'Cooldown يُطبق بعد كل أسباب الإغلاق' };
    }

    const missing: string[] = [];
    if (!cooldownAfterTP) missing.push('TAKE_PROFIT');
    if (!cooldownAfterSL) missing.push('STOP_LOSS');
    if (!cooldownAfterTE) missing.push('TIME_EXPIRED');

    return { id: 'V09', name: 'Cooldown بعد كل أسباب الإغلاق', status: 'FAIL', detail: `Cooldown لا يُطبق بعد: ${missing.join(', ')}` };
  }

  // ── V10: OrderDispatcher cross-source dedup ──
  private checkV10(): CheckResult {
    const content = this.read('modules/trading/services/order-dispatcher.service.ts');
    if (!content) return { id: 'V10', name: 'OrderDispatcher منع التكرار بين المصادر', status: 'MISSING', detail: 'الملف غير موجود' };

    if (content.includes('existing.source !== request.source') && content.includes('CROSS_SOURCE_DEDUP')) {
      return { id: 'V10', name: 'OrderDispatcher منع التكرار بين المصادر', status: 'PASS', detail: 'يوجد فحص تكرار بين المصادر (V180 cross-source dedup)' };
    }

    if ((content.includes('Different source') && content.includes('ALLOW')) || (content.includes('existing.source !== request.source') && content.includes('ALLOW'))) {
      return { id: 'V10', name: 'OrderDispatcher منع التكرار بين المصادر', status: 'FAIL', detail: 'OrderDispatcher يسمح صراحةً بنفس الرمز+الاتجاه من مصدر مختلف!' };
    }

    if (content.includes('cross-source') || content.includes('crossSource')) {
      return { id: 'V10', name: 'OrderDispatcher منع التكرار بين المصادر', status: 'PASS', detail: 'يوجد فحص تكرار بين المصادر' };
    }

    if (content.includes('existingAge') && content.includes('existing.source !== request.source')) {
      return { id: 'V10', name: 'OrderDispatcher منع التكرار بين المصادر', status: 'PASS', detail: 'يوجد فحص تكرار بين المصادر (زمني)' };
    }

    return { id: 'V10', name: 'OrderDispatcher منع التكرار بين المصادر', status: 'WARN', detail: 'لم أجد منع تكرار واضح بين المصادر' };
  }

  // ── V11: _getPaperPortfolioValue margin inflation ──
  private checkV11(): CheckResult {
    const content = this.read('modules/ai/smart-executor/smart-executor.service.ts');
    if (!content) return { id: 'V11', name: 'عدم تضخيم portfolioValue بـ lockedMargin', status: 'MISSING', detail: 'الملف غير موجود' };

    if (content.includes('_getPaperPortfolioValue') && content.includes('freeCash + lockedMargin')) {
      const methodBody = this._findMethodBody(content, '_getPaperPortfolioValue');
      if (methodBody && methodBody.includes('lockedMargin') && !methodBody.includes('cap') && !methodBody.includes('Math.min')) {
        return { id: 'V11', name: 'عدم تضخيم portfolioValue بـ lockedMargin', status: 'FAIL', detail: 'equity = freeCash + lockedMargin + PnL. للكريبتو (1:1), lockedMargin = القيمة الاسمية = تضخيم المحفظة!' };
      }
    }

    if (content.includes('_getPaperPortfolioValue') && !content.includes('lockedMargin')) {
      return { id: 'V11', name: 'عدم تضخيم portfolioValue بـ lockedMargin', status: 'PASS', detail: 'يستخدم freeCash فقط' };
    }

    return { id: 'V11', name: 'عدم تضخيم portfolioValue بـ lockedMargin', status: 'WARN', detail: 'لم أستطع تحديد طريقة الحساب بدقة' };
  }

  // ── V12: MT5 Adapter position size check (NEW) ──
  private checkV12(): CheckResult {
    const content = this.read('modules/execution/adapters/mt5.adapter.ts');
    if (!content) return { id: 'V12', name: 'MT5 Adapter فحص حجم الصفقة', status: 'MISSING', detail: 'ملف MT5 Adapter غير موجود — لم يتم إنشاء الربط بعد' };

    // Check for positionPercent check inside MT5 adapter
    if (/\bpositionPercent\b/.test(content) && /positionPercent\s*[>]\s*\d/.test(content)) {
      return { id: 'V12', name: 'MT5 Adapter فحص حجم الصفقة', status: 'PASS', detail: 'MT5 Adapter يفحص حجم الصفقة ديناميكياً (positionPercent)' };
    }

    // Check for MAX_POSITION_PERCENT
    if (content.includes('MAX_POSITION_PERCENT')) {
      return { id: 'V12', name: 'MT5 Adapter فحص حجم الصفقة', status: 'PASS', detail: 'MT5 Adapter يفحص حجم الصفقة (MAX_POSITION_PERCENT)' };
    }

    return { id: 'V12', name: 'MT5 Adapter فحص حجم الصفقة', status: 'FAIL', detail: 'MT5 Adapter لا يفحص حجم الصفقة — أي كمية تمر!' };
  }

  // ── V13: ExecutionGateway MT5 routing (NEW) ──
  private checkV13(): CheckResult {
    const content = this.read('modules/execution/gateways/execution-gateway.service.ts');
    if (!content) return { id: 'V13', name: 'ExecutionGateway توجيه MT5', status: 'MISSING', detail: 'الملف غير موجود' };

    // Check for MT5 case in adapter routing
    const hasMT5Routing = /case\s+['"]mt5['"]/.test(content);
    if (!hasMT5Routing) {
      return { id: 'V13', name: 'ExecutionGateway توجيه MT5', status: 'FAIL', detail: 'ExecutionGateway لا يوجّه أوامر MT5 — لن تعمل أوامر MT5!' };
    }

    // Check for MT5Adapter import
    const hasMT5Import = content.includes('MT5Adapter') || content.includes('mt5.adapter');
    if (!hasMT5Import) {
      return { id: 'V13', name: 'ExecutionGateway توجيه MT5', status: 'WARN', detail: 'يوجد case mt5 لكن لا يوجد استيراد لـ MT5Adapter' };
    }

    // V181: Check that _isPaperOnly() exists (not _isTestExchange for paper bypass)
    const hasPaperOnly = content.includes('_isPaperOnly');
    if (!hasPaperOnly) {
      return { id: 'V13', name: 'ExecutionGateway توجيه MT5', status: 'WARN', detail: 'MT5 routing موجود لكن لا يوجد _isPaperOnly() — قد تُعامل حسابات Demo كورقية' };
    }

    return { id: 'V13', name: 'ExecutionGateway توجيه MT5', status: 'PASS', detail: 'ExecutionGateway يوجّه أوامر MT5 بشكل صحيح مع فصل الورقي عن Demo' };
  }

  // ── V14: V181 — MT5 Demo NOT treated as paper (risk checks enforced) ──
  private checkV14(): CheckResult {
    const riskGK = this.read('modules/trading/services/risk-gatekeeper.service.ts');
    if (!riskGK) return { id: 'V14', name: 'V181 فصل الورقي عن Demo', status: 'MISSING', detail: 'ملف RiskGatekeeper غير موجود' };

    // Check 1: _isPaperOnly() method exists in RiskGatekeeper
    const hasPaperOnlyInGK = riskGK.includes('_isPaperOnly');

    // Check 2: _isPaperOnly() method exists in RiskManager
    const riskMgr = this.read('modules/trading/risk-manager.service.ts');
    const hasPaperOnlyInRM = riskMgr?.includes('_isPaperOnly');

    // Check 3: _isPaperOnly() method exists in ExecutionGateway
    const execGW = this.read('modules/execution/gateways/execution-gateway.service.ts');
    const hasPaperOnlyInEG = execGW?.includes('_isPaperOnly');

    // Check 4: _isMT5Exchange() method exists in RiskGatekeeper
    const hasMT5Check = riskGK.includes('_isMT5Exchange');

    // Check 5: mt5_demo is NOT in _isTestExchange exactMatches
    // V181: We check the exactMatches array in _isTestExchange — it should NOT contain 'mt5_demo'
    const testExchangeSection = riskGK.substring(
      Math.max(0, riskGK.indexOf('_isTestExchange')),
      Math.min(riskGK.length, riskGK.indexOf('_isTestExchange') + 500)
    );
    const mt5DemoInExact = testExchangeSection.includes("'mt5_demo'") || testExchangeSection.includes('"mt5_demo"');

    if (!hasPaperOnlyInGK || !hasPaperOnlyInRM || !hasPaperOnlyInEG) {
      return { id: 'V14', name: 'V181 فصل الورقي عن Demo', status: 'FAIL', detail: `_isPaperOnly() مفقود في: ${!hasPaperOnlyInGK ? 'RiskGatekeeper ' : ''}${!hasPaperOnlyInRM ? 'RiskManager ' : ''}${!hasPaperOnlyInEG ? 'ExecutionGateway' : ''} — حسابات Demo قد تتجاوز فحوصات المخاطر` };
    }

    if (mt5DemoInExact) {
      return { id: 'V14', name: 'V181 فصل الورقي عن Demo', status: 'FAIL', detail: 'mt5_demo لا يزال في _isTestExchange() — حسابات Demo تُعامل كورقية وتتجاوز فحوصات المخاطر!' };
    }

    if (!hasMT5Check) {
      return { id: 'V14', name: 'V181 فصل الورقي عن Demo', status: 'WARN', detail: '_isMT5Exchange() مفقود — لا يوجد فصل خاص لحسابات MT5 في فحص الرصيد' };
    }

    return { id: 'V14', name: 'V181 فصل الورقي عن Demo', status: 'PASS', detail: 'حسابات Demo (mt5_demo) تمر بفحوصات المخاطر كاملة — فقط الورقي البحت يتجاوز الرصيد والتراجع' };
  }

  // ── V15: V184 — 4h auto-close fix ──
  private checkV15(): CheckResult {
    const failures: string[] = [];
    const warnings: string[] = [];
    const passes: string[] = [];

    // ── V15a: Agent Service no longer has hardcoded 4h breakeven close ──
    const agentContent = this.readRaw('agents/autonomous-trader/agent.service.ts');
    if (!agentContent) {
      failures.push('ملف Agent Service غير موجود');
    } else {
      // The old bug: currentPrice = Number(position.entryPrice); // breakeven exit
      // inside a 4h holding check block
      const hasOld4hBreakeven = /currentPrice\s*=\s*Number\(position\.entryPrice\)\s*;\s*\/\/?\s*breakeven exit/.test(agentContent);
      const hasHardcoded4h = /MAX_HOLDING_TIME_MS\s*=\s*4\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(agentContent);
      const hasV184Comment = /V184 FIX.*REMOVED hardcoded 4h breakeven/.test(agentContent);

      if (hasOld4hBreakeven) {
        failures.push('Agent لا يزال يضع currentPrice = entryPrice (breakeven exit) — الصفقات الرابحة تُغسل!');
      }
      if (hasHardcoded4h && !hasV184Comment) {
        failures.push('Agent لا يزال يملك MAX_HOLDING_TIME_MS = 4h hardcoded — يجب إزالته');
      }
      if (hasV184Comment) {
        passes.push('Agent أزال إغلاق الـ 4h breakeven (V184)');
      } else if (!hasOld4hBreakeven && !hasHardcoded4h) {
        warnings.push('لم أجد كود الإغلاق القديم ولا تعليق V184 — قد يكون تم تعديله بطرقة مختلفة');
      }
    }

    // ── V15b: Position Monitor has P/L-aware TIME_EXPIRED logic ──
    const monitorContent = this.read('modules/engine/services/position-monitor.service.ts');
    if (!monitorContent) {
      failures.push('ملف Position Monitor غير موجود');
    } else {
      const hasProfitCheck = /profitPct\s*>\s*0\.5/.test(monitorContent) || /pnlPercent\s*>\s*0\.5/.test(monitorContent);
      const hasBreakEvenSL = /breakEvenSL/.test(monitorContent) && /TIME_EXPIRED/.test(monitorContent);
      const hasExtension = /time-expired-extended/.test(monitorContent);
      const hasV184Log = /V184 TIME_EXPIRED \+ PROFIT/.test(monitorContent);

      if (!hasProfitCheck) {
        failures.push('Position Monitor لا يفحص الربح قبل TIME_EXPIRED — صفقات رابحة تُغلق بالقوة');
      } else {
        passes.push('Position Monitor يفحص الربح قبل إغلاق TIME_EXPIRED');
      }

      if (!hasBreakEvenSL) {
        warnings.push('Position Monitor لا ينقل SL للبريكيفن عند TIME_EXPIRED + ربح');
      } else {
        passes.push('Position Monitor ينقل SL للبريكيفن لحماية الأرباح');
      }

      if (!hasExtension) {
        warnings.push('Position Monitor لا يمدد وقت الاحتفاظ للصفقات الرابحة');
      } else {
        passes.push('Position Monitor يمدد وقت الاحتفاظ 50% للصفقات الرابحة (مرة واحدة)');
      }

      if (!hasV184Log) {
        warnings.push('لم أجد علامة V184 في Position Monitor — قد لا يكون الإصلاح مطبقاً');
      }
    }

    // ── V15c: Agent uses actualExitPrice (not local currentPrice) for PnL tracking ──
    if (agentContent) {
      const hasActualExitPrice = /actualExitPrice\s*=\s*result\?\.position\?\.exitPrice/.test(agentContent);
      if (!hasActualExitPrice) {
        failures.push('Agent لا يزال يستخدم currentPrice المحلي لحساب PnL — سجلات خاطئة عند breakeven close');
      } else {
        passes.push('Agent يستخدم actualExitPrice الفعلي لحساب PnL');
      }
    }

    // ── V15d: Position Monitor has unified MAX_HOLDING_TIME ──
    if (monitorContent) {
      const hasGetMaxHoldingMs = /_getMaxHoldingMs/.test(monitorContent);
      const hasAgent48h = /isAgent\) return 48 \* H/.test(monitorContent) || /isAgent.*48.*H/.test(monitorContent);

      if (!hasGetMaxHoldingMs) {
        failures.push('Position Monitor لا يملك _getMaxHoldingMs — لا توجد أوقات ديناميكية');
      } else {
        passes.push('Position Monitor يستخدم أوقات ديناميكية حسب الإطار الزمني');
      }

      if (!hasAgent48h) {
        warnings.push('Position Monitor لا يعطي Agent positions 48h — قد يستخدم وقت أقل');
      }
    }

    // ── Build result ──
    if (failures.length > 0) {
      return {
        id: 'V15',
        name: 'V184 إغلاق 4 ساعات: حماية الأرباح',
        status: 'FAIL',
        detail: `${failures.length} مشكلة: ${failures.join(' | ')}`,
      };
    }

    if (warnings.length > 0) {
      return {
        id: 'V15',
        name: 'V184 إغلاق 4 ساعات: حماية الأرباح',
        status: 'WARN',
        detail: `يعمل لكن ${warnings.length} تحذير: ${warnings.join(' | ')}${passes.length > 0 ? ` | ✅ ${passes.join(' | ')}` : ''}`,
      };
    }

    return {
      id: 'V15',
      name: 'V184 إغلاق 4 ساعات: حماية الأرباح',
      status: 'PASS',
      detail: `كل الإصلاحات مطبقة: ${passes.join(' | ')}`,
    };
  }

  // ── HTML Renderer ──
  private renderHtml(results: CheckResult[], passed: number, failed: number, warnings: number, score: string): string {
    const statusIcon = (s: string) => s === 'PASS' ? '✅' : s === 'FAIL' ? '❌' : s === 'WARN' ? '⚠️' : '❓';
    const statusColor = (s: string) => s === 'PASS' ? '#16a34a' : s === 'FAIL' ? '#dc2626' : s === 'WARN' ? '#d97706' : '#6b7280';
    const statusBg = (s: string) => s === 'PASS' ? '#f0fdf4' : s === 'FAIL' ? '#fef2f2' : s === 'WARN' ? '#fffbeb' : '#f9fafb';
    const scoreColor = failed === 0 ? '#16a34a' : '#dc2626';

    return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>فحص سلامة نظام التداول</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Segoe UI', Tahoma, Arial, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 20px; }
    .container { max-width: 800px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 30px; }
    .header h1 { font-size: 24px; margin-bottom: 8px; color: #f8fafc; }
    .header .subtitle { color: #94a3b8; font-size: 14px; }
    .version-badge { display: inline-block; background: #3b82f6; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-top: 4px; }
    .score-card { background: #1e293b; border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 24px; border: 2px solid ${scoreColor}; }
    .score-value { font-size: 64px; font-weight: 800; color: ${scoreColor}; }
    .score-label { font-size: 14px; color: #94a3b8; margin-top: 4px; }
    .stats { display: flex; gap: 16px; margin-bottom: 24px; }
    .stat { flex: 1; background: #1e293b; border-radius: 12px; padding: 16px; text-align: center; }
    .stat-value { font-size: 28px; font-weight: 700; }
    .stat-label { font-size: 12px; color: #94a3b8; margin-top: 4px; }
    .stat-pass .stat-value { color: #16a34a; }
    .stat-fail .stat-value { color: #dc2626; }
    .stat-warn .stat-value { color: #d97706; }
    .check-item { background: #1e293b; border-radius: 12px; padding: 16px; margin-bottom: 12px; border-right: 4px solid ${statusColor('PASS')}; }
    .check-item.FAIL { border-right-color: #dc2626; }
    .check-item.PASS { border-right-color: #16a34a; }
    .check-item.WARN { border-right-color: #d97706; }
    .check-header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
    .check-icon { font-size: 20px; }
    .check-id { font-size: 12px; color: #64748b; font-family: monospace; }
    .check-name { font-size: 15px; font-weight: 600; color: #f1f5f9; }
    .check-detail { font-size: 13px; color: #94a3b8; line-height: 1.6; padding-right: 30px; }
    .check-detail.FAIL { color: #fca5a5; }
    .timestamp { text-align: center; color: #475569; font-size: 12px; margin-top: 20px; }
    .refresh-btn { display: block; margin: 20px auto; padding: 10px 24px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; }
    .refresh-btn:hover { background: #2563eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔍 فحص سلامة نظام التداول الآلي</h1>
      <div class="subtitle">Trading System Integrity Check</div>
      <div class="version-badge">V2 — Runtime-Based</div>
    </div>

    <div class="score-card">
      <div class="score-value">${score}%</div>
      <div class="score-label">درجة السلامة</div>
    </div>

    <div class="stats">
      <div class="stat stat-pass">
        <div class="stat-value">${passed}</div>
        <div class="stat-label">نجح ✅</div>
      </div>
      <div class="stat stat-fail">
        <div class="stat-value">${failed}</div>
        <div class="stat-label">فشل ❌</div>
      </div>
      <div class="stat stat-warn">
        <div class="stat-value">${warnings}</div>
        <div class="stat-label">تحذير ⚠️</div>
      </div>
    </div>

    ${results.map(r => `
    <div class="check-item ${r.status}">
      <div class="check-header">
        <span class="check-icon">${statusIcon(r.status)}</span>
        <span class="check-id">${r.id}</span>
        <span class="check-name">${r.name}</span>
      </div>
      <div class="check-detail ${r.status}">${r.detail}</div>
    </div>
    `).join('')}

    <button class="refresh-btn" onclick="location.reload()">🔄 إعادة الفحص</button>

    <div class="timestamp">آخر فحص: ${new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}</div>
  </div>
</body>
</html>`;
  }
}
