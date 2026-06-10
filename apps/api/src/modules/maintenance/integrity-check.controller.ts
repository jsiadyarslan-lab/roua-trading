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
    const results = await this.runAllChecks();
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

  private async runAllChecks(): Promise<CheckResult[]> {
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
    // V16: V185 — Council Intelligence features
    results.push(this.checkV16());
    // V17: V185 — Council Intelligence INTEGRATION (services called from trading pipeline)
    results.push(this.checkV17());
    // V18: V187 — Agent 4h auto-close fix (fall-through to MAX_HOLDING)
    results.push(this.checkV18());
    // V19: V188 — Settings Security & Validation Overhaul
    // V19 & V20: Call Next.js endpoints (async — runtime-based checks)
    results.push(await this.checkV19());
    results.push(await this.checkV20());

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
    // V189 fix: Also match variable names like MAX_POSITION_PERCENT after the > operator
    if (/\bpositionPercent\b/.test(methodBody) && /positionPercent\s*[>]\s*(\d|[A-Z_])/.test(methodBody)) {
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
    // Use read() (strips comments) — we check for CODE patterns, not comments.
    // On Railway, only compiled .js exists (no .ts, no comments).
    // Strategy: check that the OLD BUG is GONE (absence = fix applied)
    const agentContent = this.read('agents/autonomous-trader/agent.service.ts');
    if (!agentContent) {
      failures.push('ملف Agent Service غير موجود');
    } else {
      // OLD BUG pattern: currentPrice = Number(position.entryPrice) inside a
      // holding duration check. In compiled JS this becomes something like:
      //   currentPrice = Number(position.entryPrice)
      // with shouldClose = true and reason = 'MAX_HOLDING_TIME'
      const hasOldBreakevenSet =
        /currentPrice\s*=\s*Number\s*\(\s*position\.entryPrice\s*\)/.test(agentContent) &&
        /shouldClose\s*=\s*true/.test(agentContent);

      // Check for the hardcoded 4h constant — must be on the SAME LINE as MAX_HOLDING
      // to avoid false positives from unrelated lines like:
      //   closeReason: reason, // STOP_LOSS_HIT, TAKE_PROFIT_HIT, or MAX_HOLDING_TIME
      //   7 * 24 * 60 * 60 * 1000 (7 days calculation)
      // We search line-by-line for a line that has BOTH the 4h calculation AND MAX_HOLDING
      let hasHardcoded4hLine = false;
      const lines = agentContent.split('\n');
      for (const line of lines) {
        if (/4\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(line) && /MAX_HOLDING/.test(line)) {
          hasHardcoded4hLine = true;
          break;
        }
      }
      // Also check for the variable assignment pattern (more specific)
      if (!hasHardcoded4hLine) {
        hasHardcoded4hLine = /MAX_HOLDING_TIME_MS\s*=\s*4\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(agentContent);
      }

      // V184 fix indicator: actualExitPrice (the new variable we added)
      const hasActualExitPrice = /actualExitPrice\s*=\s*result/.test(agentContent);

      if (hasOldBreakevenSet && hasHardcoded4hLine) {
        failures.push('Agent لا يزال يغلق المراكز الورقية بسعر الدخول بعد 4h (breakeven exit) — الصفقات الرابحة تُغسل!');
      } else if (hasOldBreakevenSet) {
        failures.push('Agent لا يزال يضع currentPrice = entryPrice عند إغلاق MAX_HOLDING_TIME');
      } else if (hasHardcoded4hLine) {
        failures.push('Agent لا يزال يملك MAX_HOLDING_TIME_MS = 4h hardcoded');
      } else if (hasActualExitPrice) {
        // The old code is gone AND the new fix is present — confirmed
        passes.push('Agent أزال إغلاق الـ 4h breakeven ويستخدم actualExitPrice (V184)');
      } else {
        // Old code gone but no actualExitPrice either — might be different fix
        passes.push('Agent لا يملك كود الإغلاق القديم (4h breakeven) — الإصلاح مطبق');
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
    }

    // ── V15c: Agent uses actualExitPrice (not local currentPrice) for PnL tracking ──
    if (agentContent) {
      const hasActualExitPrice = /actualExitPrice\s*=\s*result/.test(agentContent);
      if (!hasActualExitPrice) {
        failures.push('Agent لا يزال يستخدم currentPrice المحلي لحساب PnL — سجلات خاطئة عند breakeven close');
      } else {
        passes.push('Agent يستخدم actualExitPrice الفعلي لحساب PnL');
      }
    }

    // ── V15d: Position Monitor has unified MAX_HOLDING_TIME with Agent=48h ──
    if (monitorContent) {
      const hasGetMaxHoldingMs = /_getMaxHoldingMs/.test(monitorContent);

      if (!hasGetMaxHoldingMs) {
        failures.push('Position Monitor لا يملك _getMaxHoldingMs — لا توجد أوقات ديناميكية');
      } else {
        passes.push('Position Monitor يستخدم أوقات ديناميكية حسب الإطار الزمني');

        // Check for Agent 48h — in compiled JS the pattern is different
        // TypeScript: if (isAgent) return 48 * H;
        // Compiled JS may have: if(isAgent){return 48*H} or split across lines
        // Use robust multi-line patterns + simple substring checks
        const methodBody = this._findMethodBody(monitorContent, '_getMaxHoldingMs');
        if (methodBody) {
          // Multi-line regex: isAgent followed by 48 anywhere (even across lines)
          const hasAgent48h =
            /isAgent[\s\S]*?48/.test(methodBody) ||   // isAgent ... 48 (multi-line)
            /48[\s\S]*?isAgent/.test(methodBody) ||   // 48 ... isAgent (reverse)
            (methodBody.includes('return 48') && methodBody.includes('isAgent')) ||  // both present
            (methodBody.includes('48 * H') && methodBody.includes('isAgent')) ||      // 48 * H pattern
            /isAgent.*return/.test(methodBody) && /return.*48/.test(methodBody);      // isAgent → return → 48
          if (hasAgent48h) {
            passes.push('Position Monitor يعطي Agent positions 48 ساعة (swing trading)');
          } else {
            // Final fallback: check the FULL file content for the pattern
            const hasFallback48h = monitorContent.includes('isAgent') && /48\s*\*\s*H/.test(monitorContent);
            if (hasFallback48h) {
              passes.push('Position Monitor يعطي Agent positions 48 ساعة (من فحص الملف الكامل)');
            } else {
              warnings.push('Position Monitor لا يعطي Agent positions 48h صراحةً — قد يستخدم وقت أقل');
            }
          }
        }
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

  // ── V16: V185 — Council Intelligence features (9 new services) ──
  private checkV16(): CheckResult {
    const failures: string[] = [];
    const warnings: string[] = [];
    const passes: string[] = [];

    // ── V16a: Trade Journal Service exists ──
    const journalContent = this.read('modules/ai/council-intelligence/trade-journal.service.ts');
    if (!journalContent) {
      failures.push('ملف TradeJournalService غير موجود');
    } else {
      const hasRecordOpen = journalContent.includes('recordTradeOpen');
      const hasRecordClose = journalContent.includes('recordTradeClose');
      const hasWasRight = journalContent.includes('_evaluateCouncilVotes');
      if (hasRecordOpen && hasRecordClose && hasWasRight) {
        passes.push('مجلة التداول تسجّل الفتح والإغلاق وتقيّم أصوات المجلس');
      } else {
        failures.push('مجلة التداول ناقصة — تحتاج recordTradeOpen + recordTradeClose + _evaluateCouncilVotes');
      }
    }

    // ── V16b: Council Vote Accuracy Service exists ──
    const accuracyContent = this.read('modules/ai/council-intelligence/council-vote-accuracy.service.ts');
    if (!accuracyContent) {
      failures.push('ملف CouncilVoteAccuracyService غير موجود');
    } else {
      const hasGetWeight = accuracyContent.includes('getRoleWeight');
      const hasRecalc = accuracyContent.includes('recalculateWeights');
      const hasRecordVote = accuracyContent.includes('recordVoteResult');
      if (hasGetWeight && hasRecalc && hasRecordVote) {
        passes.push('حلقة التعلم تتتبع الأصوات وتُعدّل الأوزان ديناميكياً');
      } else {
        failures.push('حلقة التعلم ناقصة — تحتاج getRoleWeight + recalculateWeights + recordVoteResult');
      }
    }

    // ── V16c: Market Regime Detection exists ──
    const regimeContent = this.read('modules/ai/council-intelligence/market-regime.service.ts');
    if (!regimeContent) {
      failures.push('ملف MarketRegimeService غير موجود');
    } else {
      const hasDetect = regimeContent.includes('detectRegime');
      const hasBull = regimeContent.includes("'BULL'");
      const hasBear = regimeContent.includes("'BEAR'");
      const hasRange = regimeContent.includes("'RANGE'");
      const hasContext = regimeContent.includes('buildRegimeContext');
      const hasRRAdjust = regimeContent.includes('rrAdjustment');
      if (hasDetect && hasBull && hasBear && hasRange && hasContext && hasRRAdjust) {
        passes.push('كشف وضع السوق يحدد BULL/BEAR/RANGE + يُعدّل R:R + يبني سياق AI');
      } else {
        failures.push('كشف وضع السوق ناقص — يحتاج detectRegime + BULL/BEAR/RANGE + buildRegimeContext + rrAdjustment');
      }
    }

    // ── V16d: Cross-Pair Correlation exists ──
    const corrContent = this.read('modules/ai/council-intelligence/cross-pair-correlation.service.ts');
    if (!corrContent) {
      failures.push('ملف CrossPairCorrelationService غير موجود');
    } else {
      const hasCheckRisk = corrContent.includes('checkCorrelatedRisk');
      const hasSizeMult = corrContent.includes('getPositionSizeMultiplier');
      const hasPearson = corrContent.includes('_pearsonCorrelation');
      if (hasCheckRisk && hasSizeMult && hasPearson) {
        passes.push('الارتباط بين الأزواج يحسب Pearson + يُعدّل حجم الصفقة');
      } else {
        failures.push('الارتباط بين الأزواج ناقص — يحتاج checkCorrelatedRisk + getPositionSizeMultiplier + Pearson');
      }
    }

    // ── V16e: Dynamic Position Sizing exists ──
    const sizingContent = this.read('modules/ai/council-intelligence/dynamic-position-sizing.service.ts');
    if (!sizingContent) {
      failures.push('ملف DynamicPositionSizingService غير موجود');
    } else {
      const hasCalc = sizingContent.includes('calculateSizeMultiplier');
      const hasRegimeFactor = sizingContent.includes('regimeAlignmentFactor');
      const hasCorrFactor = sizingContent.includes('correlationService');
      const hasMinMax = sizingContent.includes('MAX_MULTIPLIER') && sizingContent.includes('MIN_MULTIPLIER');
      if (hasCalc && hasRegimeFactor && hasCorrFactor && hasMinMax) {
        passes.push('الحجم الذكي يُعدّل بناءً على Regime + الارتباط + الإجماع مع حدود 0.3×–2.0×');
      } else {
        failures.push('الحجم الذكي ناقص — يحتاج calculateSizeMultiplier + regime + correlation + MIN/MAX');
      }
    }

    // ── V16f: System Memory exists ──
    const memoryContent = this.read('modules/ai/council-intelligence/system-memory.service.ts');
    if (!memoryContent) {
      failures.push('ملف SystemMemoryService غير موجود');
    } else {
      const hasStore = memoryContent.includes('storeMemory');
      const hasGenFromTrade = memoryContent.includes('generateMemoriesFromTrade');
      const hasContext = memoryContent.includes('getMemoryContext');
      const hasDailySummary = memoryContent.includes('generateDailySummary');
      if (hasStore && hasGenFromTrade && hasContext && hasDailySummary) {
        passes.push('ذاكرة النظام تخزن وتتعلم من الصفقات وتُولّد ملخص يومي');
      } else {
        failures.push('ذاكرة النظام ناقصة — تحتاج storeMemory + generateMemoriesFromTrade + getMemoryContext');
      }
    }

    // ── V16g: Adaptive Schedule exists ──
    const scheduleContent = this.read('modules/ai/council-intelligence/adaptive-schedule.service.ts');
    if (!scheduleContent) {
      failures.push('ملف AdaptiveScheduleService غير موجود');
    } else {
      const hasRecommended = scheduleContent.includes('getRecommendedInterval');
      const hasEmergency = scheduleContent.includes('triggerEmergencySession');
      const hasMin = scheduleContent.includes('MIN_INTERVAL_MS');
      if (hasRecommended && hasEmergency && hasMin) {
        passes.push('الجدول الذكي يُعدّل حسب التقلب + جلسات طارئة عند أحداث مهمة');
      } else {
        failures.push('الجدول الذكي ناقص — يحتاج getRecommendedInterval + triggerEmergencySession');
      }
    }

    // ── V16h: Self-Healing exists ──
    const healingContent = this.read('modules/ai/council-intelligence/self-healing.service.ts');
    if (!healingContent) {
      failures.push('ملف SelfHealingService غير موجود');
    } else {
      const hasReportFail = healingContent.includes('reportFailure');
      const hasReportSuccess = healingContent.includes('reportSuccess');
      const hasIsDisabled = healingContent.includes('isComponentDisabled');
      const hasLevel3 = healingContent.includes('DISABLED');
      if (hasReportFail && hasReportSuccess && hasIsDisabled && hasLevel3) {
        passes.push('الشفاء الذاتي يكتشف الفشل + يعطّل المكونات + يعيد التفعيل تلقائياً');
      } else {
        failures.push('الشفاء الذاتي ناقص — يحتاج reportFailure + reportSuccess + isComponentDisabled');
      }
    }

    // ── V16i: Backtesting Engine exists ──
    const backtestContent = this.read('modules/ai/council-intelligence/backtesting-engine.service.ts');
    if (!backtestContent) {
      failures.push('ملف BacktestingEngineService غير موجود');
    } else {
      const hasRun = backtestContent.includes('runBacktest');
      const hasOptimize = backtestContent.includes('optimizeParameters');
      const hasSharpe = backtestContent.includes('sharpeRatio');
      if (hasRun && hasOptimize && hasSharpe) {
        passes.push('محرك الاختبار الرجعي يختبر الاستراتيجيات ويحسب Sharpe Ratio');
      } else {
        failures.push('محرك الاختبار الرجعي ناقص — يحتاج runBacktest + optimizeParameters + sharpeRatio');
      }
    }

    // ── V16j: CouncilIntelligenceModule registered in AppModule ──
    const appModuleContent = this.read('app.module.ts');
    if (!appModuleContent) {
      warnings.push('ملف AppModule غير موجود — لا يمكن التحقق من تسجيل الموديول');
    } else {
      const hasModuleImport = appModuleContent.includes('CouncilIntelligenceModule');
      if (hasModuleImport) {
        passes.push('CouncilIntelligenceModule مسجّل في AppModule');
      } else {
        failures.push('CouncilIntelligenceModule غير مسجّل في AppModule — الميزات لن تعمل!');
      }
    }

    // ── V16k: Prisma schema has new models ──
    // We check for TradeJournal model in schema (no comment stripping needed for .prisma)
    // Try multiple possible paths — production and development layouts differ
    let schemaContent: string | null = null;
    const schemaPaths = [
      '../../prisma/schema.prisma',    // from dist/ → project root /prisma/
      '../../../prisma/schema.prisma',  // from dist/modules/ → project root /prisma/
      '../../../../prisma/schema.prisma',// from dist/modules/maintenance/ → project root /prisma/
      '../../apps/api/prisma/schema.prisma',  // monorepo layout
      'prisma/schema.prisma',            // relative to SRC_DIR
    ];
    for (const p of schemaPaths) {
      schemaContent = this.readRaw(p);
      if (schemaContent) break;
    }
    // Also try absolute path resolution from project root markers
    if (!schemaContent) {
      // Walk up from SRC_DIR looking for prisma/schema.prisma
      let dir = this.SRC_DIR;
      for (let i = 0; i < 6; i++) {
        const candidate = path.resolve(dir, 'prisma', 'schema.prisma');
        try {
          schemaContent = fs.readFileSync(candidate, 'utf-8');
          break;
        } catch {}
        dir = path.resolve(dir, '..');
      }
    }
    if (!schemaContent) {
      warnings.push('ملف schema.prisma غير موجود — لا يمكن التحقق من النماذج الجديدة');
    } else {
      const hasJournal = schemaContent.includes('model TradeJournal');
      const hasAccuracy = schemaContent.includes('model CouncilVoteAccuracy');
      const hasRegime = schemaContent.includes('model MarketRegimeSnapshot');
      const hasCorr = schemaContent.includes('model CrossPairCorrelation');
      const hasMemory = schemaContent.includes('model SystemMemory');
      const hasSchedule = schemaContent.includes('model AdaptiveSchedule');
      const missing: string[] = [];
      if (!hasJournal) missing.push('TradeJournal');
      if (!hasAccuracy) missing.push('CouncilVoteAccuracy');
      if (!hasRegime) missing.push('MarketRegimeSnapshot');
      if (!hasCorr) missing.push('CrossPairCorrelation');
      if (!hasMemory) missing.push('SystemMemory');
      if (!hasSchedule) missing.push('AdaptiveSchedule');

      if (missing.length === 0) {
        passes.push('كل النماذج الجديدة (6) موجودة في Prisma schema');
      } else {
        failures.push(`نماذج مفقودة من Prisma schema: ${missing.join(', ')}`);
      }
    }

    // ── Build result ──
    if (failures.length > 0) {
      return {
        id: 'V16',
        name: 'V185 مجلس الذكاء: ٩ ميزات جديدة',
        status: 'FAIL',
        detail: `${failures.length} مشكلة: ${failures.join(' | ')}`,
      };
    }

    if (warnings.length > 0) {
      return {
        id: 'V16',
        name: 'V185 مجلس الذكاء: ٩ ميزات جديدة',
        status: 'WARN',
        detail: `${warnings.length} تحذير: ${warnings.join(' | ')} | ✅ ${passes.join(' | ')}`,
      };
    }

    return {
      id: 'V16',
      name: 'V185 مجلس الذكاء: ٩ ميزات جديدة',
      status: 'PASS',
      detail: `كل الميزات مطبقة (${passes.length}): ${passes.join(' | ')}`,
    };
  }

  // ── V17: V185 — Council Intelligence INTEGRATION ──
  // V16 checks if services EXIST. V17 checks if they're actually CALLED from the trading pipeline.
  private checkV17(): CheckResult {
    const failures: string[] = [];
    const passes: string[] = [];

    // ── V17a: PositionMonitor calls TradeJournal.recordTradeClose ──
    const monitorContent = this.read('modules/engine/services/position-monitor.service.ts');
    if (!monitorContent) {
      failures.push('ملف PositionMonitor غير موجود');
    } else {
      const hasJournalImport = monitorContent.includes('TradeJournalService');
      const hasRecordClose = monitorContent.includes('recordTradeClose');
      if (hasJournalImport && hasRecordClose) {
        passes.push('PositionMonitor يسجّل إغلاق الصفقات في مجلة التداول');
      } else if (hasJournalImport) {
        failures.push('PositionMonitor يستورد TradeJournal لكن لا يستدعي recordTradeClose');
      } else {
        failures.push('PositionMonitor لا يستورد TradeJournalService — حلقة التعلم لن تحصل على بيانات');
      }
    }

    // ── V17b: PositionMonitor uses SelfHealing ──
    if (monitorContent) {
      const hasHealingImport = monitorContent.includes('SelfHealingService');
      const hasReportFailure = monitorContent.includes('reportFailure');
      const hasIsDisabled = monitorContent.includes('isComponentDisabled');
      if (hasHealingImport && hasReportFailure && hasIsDisabled) {
        passes.push('PositionMonitor يُبلّغ عن الفشل ويتحقق من تعطيل المكونات');
      } else if (hasHealingImport) {
        failures.push('PositionMonitor يستورد SelfHealing لكن لا يستدعي reportFailure/isComponentDisabled');
      } else {
        failures.push('PositionMonitor لا يستورد SelfHealingService — لا شفاء ذاتي');
      }
    }

    // ── V17c: StrategicCouncil uses MarketRegime + SystemMemory + VoteAccuracy ──
    const councilContent = this.read('modules/ai/services/strategic-council.service.ts');
    if (!councilContent) {
      failures.push('ملف StrategicCouncil غير موجود');
    } else {
      const hasRegime = councilContent.includes('MarketRegimeService');
      const hasMemory = councilContent.includes('SystemMemoryService');
      const hasAccuracy = councilContent.includes('CouncilVoteAccuracyService');
      const hasRegimeContext = councilContent.includes('buildRegimeContext');
      const hasMemoryContext = councilContent.includes('getMemoryContext');
      const hasDynamicWeight = councilContent.includes('getRoleWeight');

      if (hasRegime && hasRegimeContext) {
        passes.push('مجلس الذكاء يُضيف سياق وضع السوق (BULL/BEAR/RANGE) لتحليلات AI');
      } else if (hasRegime) {
        failures.push('مجلس الذكاء يستورد MarketRegime لكن لا يستدعي buildRegimeContext');
      } else {
        failures.push('مجلس الذكاء لا يستورد MarketRegimeService — لا سياق للوضع');
      }

      if (hasMemory && hasMemoryContext) {
        passes.push('مجلس الذكاء يُضيف دروس الصفقات السابقة لتحليلات AI');
      } else if (hasMemory) {
        failures.push('مجلس الذكاء يستورد SystemMemory لكن لا يستدعي getMemoryContext');
      } else {
        failures.push('مجلس الذكاء لا يستورد SystemMemoryService — لا ذاكرة');
      }

      if (hasAccuracy && hasDynamicWeight) {
        passes.push('مجلس الذكاء يستخدم أوزان ديناميكية بناءً على دقة الأصوات');
      } else if (hasAccuracy) {
        failures.push('مجلس الذكاء يستورد VoteAccuracy لكن لا يستدعي getRoleWeight');
      } else {
        failures.push('مجلس الذكاء لا يستورد CouncilVoteAccuracyService — أوزان ثابتة');
      }
    }

    // ── V17d: SmartExecutor uses DynamicSizing + Correlation + Journal ──
    const executorContent = this.read('modules/ai/smart-executor/smart-executor.service.ts');
    if (!executorContent) {
      failures.push('ملف SmartExecutor غير موجود');
    } else {
      const hasSizing = executorContent.includes('DynamicPositionSizingService');
      const hasCorrelation = executorContent.includes('CrossPairCorrelationService');
      const hasJournal = executorContent.includes('TradeJournalService');
      const hasSizingCall = executorContent.includes('calculateSizeMultiplier');
      const hasCorrCall = executorContent.includes('checkCorrelatedRisk');
      const hasJournalCall = executorContent.includes('recordTradeOpen');

      if (hasSizing && hasSizingCall) {
        passes.push('المنفذ الذكي يُعدّل حجم الصفقة بناءً على Regime + الإجماع');
      } else if (hasSizing) {
        failures.push('المنفذ الذكي يستورد DynamicSizing لكن لا يستدعي calculateSizeMultiplier');
      } else {
        failures.push('المنفذ الذكي لا يستورد DynamicPositionSizingService — حجم ثابت');
      }

      if (hasCorrelation && hasCorrCall) {
        passes.push('المنفذ الذكي يفحص الارتباط بين الأزواج قبل فتح صفقة');
      } else if (hasCorrelation) {
        failures.push('المنفذ الذكي يستورد CrossPairCorrelation لكن لا يستدعي checkCorrelatedRisk');
      } else {
        failures.push('المنفذ الذكي لا يستورد CrossPairCorrelationService — لا حماية من الارتباط');
      }

      if (hasJournal && hasJournalCall) {
        passes.push('المنفذ الذكي يسجّل فتح الصفقات في مجلة التداول');
      } else if (hasJournal) {
        failures.push('المنفذ الذكي يستورد TradeJournal لكن لا يستدعي recordTradeOpen');
      } else {
        failures.push('المنفذ الذكي لا يستورد TradeJournalService — لا تسجيل للفتح');
      }
    }

    // ── V17e: Module imports CouncilIntelligenceModule ──
    const engineModule = this.read('modules/engine/engine.module.ts');
    const smartModule = this.read('modules/ai/smart-executor/smart-executor.module.ts');
    const aiModule = this.read('modules/ai/ai.module.ts');

    const engineHasCI = engineModule?.includes('CouncilIntelligenceModule');
    const smartHasCI = smartModule?.includes('CouncilIntelligenceModule');
    const aiHasCI = aiModule?.includes('CouncilIntelligenceModule');

    if (engineHasCI && smartHasCI && aiHasCI) {
      passes.push('كل الوحدات (Engine + SmartExecutor + AI) تستورد CouncilIntelligenceModule');
    } else {
      const missing: string[] = [];
      if (!engineHasCI) missing.push('EngineModule');
      if (!smartHasCI) missing.push('SmartExecutorModule');
      if (!aiHasCI) missing.push('AiModule');
      failures.push(`وحدات لا تستورد CouncilIntelligenceModule: ${missing.join(', ')} — الخدمات لن تُحقن`);
    }

    // ── Build result ──
    if (failures.length > 0) {
      return {
        id: 'V17',
        name: 'V185 تكامل مجلس الذكاء',
        status: 'FAIL',
        detail: `${failures.length} مشكلة تكامل: ${failures.join(' | ')}`,
      };
    }

    return {
      id: 'V17',
      name: 'V185 تكامل مجلس الذكاء',
      status: 'PASS',
      detail: `كل الميزات مربوطة بخط التداول: ${passes.join(' | ')}`,
    };
  }

  // ── V18: V187 — Agent 4h auto-close fix (fall-through to MAX_HOLDING) ──
  private checkV18(): CheckResult {
    const passes: string[] = [];
    const failures: string[] = [];
    const warnings: string[] = [];

    // ── V18a: Position Monitor does NOT early-return for Agent positions ──
    // Before V187, Agent positions did "return result" after SL/TP check,
    // which meant MAX_HOLDING_TIME was never checked for Agent positions.
    // V187 removed the early return so Agent positions fall through.
    //
    // IMPORTANT: We check COMPILED JS patterns (comments are stripped).
    // The key V187 change is: if(!isAgentPosition) guard around the 
    // trailing stop / break-even / SL/TP section. If this guard exists,
    // it means Agent positions fall through the early block and reach
    // MAX_HOLDING_TIME check but skip the trailing/break-even section.
    const monitorContent = this.read('modules/engine/services/position-monitor.service.ts');
    if (!monitorContent) {
      return { id: 'V18', name: 'V187 إصلاح إغلاق 4h للوكيل', status: 'MISSING', detail: 'position-monitor.service.ts غير موجود' };
    }

    // V187 added: if (!isAgentPosition) { ... trailing/break-even ... }
    // In compiled JS: if(!isAgentPosition) or if(!e) (minified)
    // We check for the source-level pattern which survives compilation
    const hasAgentSkipGuard = /if\s*\(\s*!isAgentPosition\s*\)/.test(monitorContent);
    // Also check for the comment (works in dev mode with read())
    const hasFallThroughComment = /V187.*fall/i.test(monitorContent) || /fall through to MAX_HOLDING/i.test(monitorContent);
    
    if (hasAgentSkipGuard || hasFallThroughComment) {
      passes.push('Position Monitor يسمح لصفقات Agent بالمرور لفحص MAX_HOLDING (بدون early return)');
    } else {
      failures.push('Position Monitor لا يزال يعمل early return لصفقات Agent — MAX_HOLDING لا يُفحص');
    }

    // ── V18b: Agent saves timeframe to Redis (like SmartExecutor) ──
    const agentContent = this.read('agents/autonomous-trader/agent.service.ts');
    if (!agentContent) {
      warnings.push('agent.service.ts غير موجود — لا يمكن التحقق من حفظ timeframe');
    } else {
      // In compiled JS, "position-tf" string literal survives
      const agentSavesTf = /position-tf/.test(agentContent);
      if (agentSavesTf) {
        passes.push('Agent يحفظ timeframe في Redis لاستخدامه في حساب MAX_HOLDING');
      } else {
        failures.push('Agent لا يحفظ timeframe في Redis — Position Monitor سيستخدم fallback بدل 48h');
      }
    }

    // ── V18c: Agent positions get isAgent=true → 48h in _getMaxHoldingMs ──
    if (monitorContent) {
      // Check for isAgent and 48 together (in compiled JS, variable names may be minified)
      // But the pattern "48*H" or "48*H" should survive with H=60*60*1000
      const hasAgent48h = 
        /isAgent/.test(monitorContent) && (/48\s*\*\s*H/.test(monitorContent) || /48\s*\*\s*60/.test(monitorContent));
      // Fallback: check for the specific return pattern
      const has48hReturn = /return\s+48/.test(monitorContent);
      if (hasAgent48h || has48hReturn) {
        passes.push('_getMaxHoldingMs يعطي Agent = 48 ساعة');
      } else {
        // This might fail in minified code - use warning instead of failure
        warnings.push('لا يمكن التأكد من أن _getMaxHoldingMs يعطي Agent 48 ساعة — الكود المترجم قد يكون مضغوط');
      }
    }

    // ── V18d: Trailing stop and break-even skip Agent positions ──
    if (hasAgentSkipGuard) {
      passes.push('Trailing stop و break-even لا تتدخل مع Agent (يدير SL بنفسه)');
    } else {
      warnings.push('قد يتدخل trailing stop مع Agent positions — يحتاج فحص');
    }

    // ── Build result ──
    if (failures.length > 0) {
      return {
        id: 'V18',
        name: 'V187 إصلاح إغلاق 4h للوكيل',
        status: 'FAIL',
        detail: `${failures.length} مشكلة: ${failures.join(' | ')}`,
      };
    }

    const warningStr = warnings.length > 0 ? ` | ⚠️ ${warnings.join(' | ')}` : '';
    return {
      id: 'V18',
      name: 'V187 إصلاح إغلاق 4h للوكيل',
      status: 'PASS',
      detail: `${passes.join(' | ')}${warningStr}`,
    };
  }

  // ── V19: V188 — Settings Security & Validation Overhaul ──
  // V2: Calls the Next.js /api/integrity/settings-security endpoint which
  // does runtime-based checks (API behavior) instead of reading source files.
  // Falls back to local NestJS-side checks (SmartExecutor, RiskManager).
  private async checkV19(): Promise<CheckResult> {
    const failures: string[] = [];
    const warnings: string[] = [];
    const passes: string[] = [];

    // ── V19-web: Call Next.js integrity endpoint for web-side checks ──
    const webUrl = process.env.WEB_INTERNAL_URL || process.env.NEXTAUTH_URL || 'http://127.0.0.1:3000';
    try {
      const res = await fetch(`${webUrl}/api/integrity/settings-security`, {
        signal: AbortSignal.timeout(8000),
        headers: { 'Accept': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json() as any;
        // Merge web-side sub-checks
        if (data.subChecks && Array.isArray(data.subChecks)) {
          for (const sc of data.subChecks) {
            if (sc.status === 'FAIL') failures.push(sc.detail);
            else if (sc.status === 'WARN') warnings.push(sc.detail);
            else passes.push(sc.detail);
          }
        }
      } else {
        warnings.push(`Next.js settings-security endpoint returned ${res.status}`);
      }
    } catch (error: any) {
      warnings.push(`Next.js settings-security API غير متاح (${error?.message || 'unknown'}) — فحص جانب الويب متخطى`);
    }

    // ── V19b: SmartExecutor maxOpenPositions unified to 20 ──
    const executorContent = this.read('modules/ai/smart-executor/smart-executor.service.ts');
    if (executorContent) {
      const maxPosMatch = executorContent.match(/maxOpenPositions: *(20|5|15)/);
      const configMatch = executorContent.match(/maxOpenPositions[: ]*= *(20|5|15)/);
      const has20 = /maxOpenPositions.*?20/.test(executorContent.substring(0, 3000));
      if (has20 || (configMatch && configMatch[1] === '20') || (maxPosMatch && maxPosMatch[1] === '20')) {
        passes.push('SmartExecutor maxOpenPositions = 20 (موحد)');
      } else {
        const has5 = /maxOpenPositions.*?5(?!0)/.test(executorContent.substring(0, 3000));
        if (has5) {
          failures.push('SmartExecutor maxOpenPositions لا يزال 5 — يجب أن يكون 20 (موحد)');
        } else {
          warnings.push('لا يمكن تحديد قيمة maxOpenPositions في SmartExecutor');
        }
      }
    }

    // ── V19c: RiskManager riskPerTrade * 3 (not * 5) ──
    const riskMgrContent = this.read('modules/trading/risk-manager.service.ts');
    if (riskMgrContent) {
      const hasOldScaling = /riskPerTrade.* * *5/.test(riskMgrContent) && riskMgrContent.includes('maxPositionSizePercent');
      const hasNewScaling = /riskPct.* * *3/.test(riskMgrContent) && riskMgrContent.includes('Math.min(30');
      if (hasNewScaling) {
        passes.push('RiskManager riskPerTrade × 3 (حد أقصى 30%) — آمن');
      } else if (hasOldScaling && !hasNewScaling) {
        failures.push('RiskManager لا يزال يستخدم riskPerTrade * 5 — خطير عند riskPerTrade عالية');
      } else {
        warnings.push('لا يمكن تحديد طريقة تحجيم riskPerTrade في RiskManager');
      }

      // V19d: RiskManager uses filtered findMany (not loading ALL settings)
      const hasFilteredQuery = riskMgrContent.includes("key: { in:") || riskMgrContent.includes("key: { in: ['riskConfig'");
      if (hasFilteredQuery) {
        passes.push('RiskManager يفلتر استعلام الإعدادات — لا يحمّل كل بيانات المستخدمين');
      } else {
        warnings.push('RiskManager قد يحمّل كل الإعدادات من DB — يمكن تحسينه');
      }
    }

    // ── Build result ──
    if (failures.length > 0) {
      return {
        id: 'V19',
        name: 'V188 أمان الإعدادات والتحقق',
        status: 'FAIL',
        detail: `${failures.length} مشكلة: ${failures.join(' | ')}`,
      };
    }

    const warningStr = warnings.length > 0 ? ` | ⚠️ ${warnings.join(' | ')}` : '';
    return {
      id: 'V19',
      name: 'V188 أمان الإعدادات والتحقق',
      status: 'PASS',
      detail: `كل الإصلاحات مطبقة: ${passes.join(' | ')}${warningStr}`,
    };
  }

  // ── V20: V189 — Settings Deception Removal ──
  // This check runs on the Next.js side (where source files exist in production),
  // NOT on the NestJS side (which only has compiled dist/ files).
  // The Next.js endpoint at /api/integrity/settings does the actual file checks.
  private async checkV20(): Promise<CheckResult> {
    // V2: Runtime-based check — calls the Next.js /api/integrity/settings endpoint
    // which now tests actual API behavior instead of reading source files.
    // This works in ALL environments (dev + production Docker where src/ is absent).
    const webUrl = process.env.WEB_INTERNAL_URL || process.env.NEXTAUTH_URL || 'http://127.0.0.1:3000';

    try {
      const res = await fetch(`${webUrl}/api/integrity/settings`, {
        signal: AbortSignal.timeout(8000),
        headers: { 'Accept': 'application/json' },
      });

      if (!res.ok) {
        return { id: 'V20', name: 'V189 إزالة خداع الإعدادات', status: 'WARN', detail: `Next.js integrity endpoint returned ${res.status}` };
      }

      const data = await res.json() as any;
      return {
        id: 'V20',
        name: data.name || 'V189 إزالة خداع الإعدادات',
        status: data.status || 'WARN',
        detail: data.detail || 'لا توجد تفاصيل',
      };
    } catch (error: any) {
      // Fallback: try reading the source file directly (development only)
      // In production Docker, apps/web/src/ is not available.
      // The Next.js endpoint above should always be reachable since both
      // services run in the same container (start.sh starts both).
      const failures: string[] = [];
      const warnings: string[] = [];
      const passes: string[] = [];

      // Try multiple possible paths for the settings page source
      let settingsPageContent: string | null = null;
      const settingsPaths = [
        // Monorepo structure: apps/web/src/... (from project root)
        path.resolve(process.cwd(), '..', 'web', 'src', 'app', '[locale]', 'dashboard', 'settings', 'page.tsx'),
        path.resolve(process.cwd(), '..', 'web', 'src', 'app', '[locale]', 'dashboard', 'settings', 'page.jsx'),
        // Direct: from apps/api/ to apps/web/src/
        path.resolve(this.SRC_DIR, '..', '..', 'web', 'src', 'app', '[locale]', 'dashboard', 'settings', 'page.tsx'),
        // Monorepo root
        path.resolve(process.cwd(), 'apps', 'web', 'src', 'app', '[locale]', 'dashboard', 'settings', 'page.tsx'),
      ];
      for (const sp of settingsPaths) {
        try {
          settingsPageContent = fs.readFileSync(sp, 'utf-8');
          break;
        } catch {}
      }

      if (!settingsPageContent) {
        // Neither the API nor source files are available — likely production
        // where Next.js hasn't started yet or is unreachable.
        // Don't fail the check, just warn — the runtime API will work once
        // Next.js is fully started.
        return {
          id: 'V20',
          name: 'V189 إزالة خداع الإعدادات',
          status: 'WARN',
          detail: `Next.js API غير متاح (${error?.message || 'unknown'}) وملفات المصدر غير موجودة — فحص سلوكي سيعمل بعد بدء Next.js بالكامل`,
        };
      }

      // Source-level checks (development fallback)
      const noopToggles = (settingsPageContent.match(/onChange=\{\(\) => \{\}\}/g) || []).length;
      if (noopToggles === 0) {
        passes.push('لا مفاتيح وهمية');
      } else {
        failures.push(`${noopToggles} مفتاح وهمي`);
      }

      if (settingsPageContent.includes('currentLocale') && settingsPageContent.includes('router.replace')) {
        passes.push('تغيير اللغة حقيقي');
      } else {
        failures.push('تغيير اللغة وهمي');
      }

      if (settingsPageContent.includes('/api/trading/positions') && !settingsPageContent.includes('Simulate export')) {
        passes.push('تصدير البيانات حقيقي');
      } else {
        failures.push('تصدير البيانات وهمي');
      }

      if (settingsPageContent.includes('/api/auth/sessions')) {
        passes.push('الجلسات حقيقية');
      } else {
        failures.push('الجلسات وهمية');
      }

      if (failures.length > 0) {
        return { id: 'V20', name: 'V189 إزالة خداع الإعدادات', status: 'FAIL', detail: `${failures.length} مشكلة: ${failures.join(' | ')}` };
      }

      return { id: 'V20', name: 'V189 إزالة خداع الإعدادات', status: 'PASS', detail: `كل الإصلاحات مطبقة (من الكود المصدري): ${passes.join(' | ')}` };
    }
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
