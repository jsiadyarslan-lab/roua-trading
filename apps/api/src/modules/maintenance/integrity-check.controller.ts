// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — System Integrity Check Controller
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// فحص سلامة نظام التداول الآلي — يُفتح من المتصفح مباشرة
// GET /api/integrity → تقرير بصيغة JSON
// GET /api/integrity?html=1 → تقرير بصيغة HTML (صفحة ويب)

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
   * In production, only compiled .js files exist in the dist/ directory.
   * The search patterns work on both .ts and .js since they look for
   * identifiers, string literals, and operators that are identical in both.
   */
  private read(filePath: string): string | null {
    // Try .ts first (development: src/ directory exists)
    const tsPath = path.resolve(this.SRC_DIR, filePath);
    try {
      return fs.readFileSync(tsPath, 'utf-8');
    } catch {}

    // Try .js (production: only dist/ with compiled .js exists)
    const jsPath = tsPath.replace(/\.ts$/, '.js');
    try {
      return fs.readFileSync(jsPath, 'utf-8');
    } catch {}

    return null;
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
    // V05: processedKey immediate deletion
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

    return results;
  }

  // ── V01: RiskGatekeeper ──
  private checkV01(): CheckResult {
    const content = this.read('modules/trading/services/risk-gatekeeper.service.ts');
    if (!content) return { id: 'V01', name: 'RiskGatekeeper فحص حجم الصفقة للورقي', status: 'MISSING', detail: 'الملف غير موجود' };

    const lines = content.split('\n');
    let insideSimBlock = false;
    let braceDepth = 0;
    let blockStartLine = 0;
    let hasPositionPercentCheck = false;
    let hasEarlyAllowedTrue = false;
    let earlyReturnLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      if ((line.includes('isPaperByFlag') || line.includes('isSimulatedByCredential') || line.includes('isSimulated')) && line.includes('if')) {
        insideSimBlock = true;
        braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        blockStartLine = lineNum;
        hasPositionPercentCheck = false;
        hasEarlyAllowedTrue = false;
        continue;
      }

      if (insideSimBlock) {
        braceDepth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        if (line.includes('positionPercent') || line.includes('maxPositionSizePercent') || line.includes('positionPercent >')) hasPositionPercentCheck = true;
        if (line.includes('allowed: true') || line.includes("allowed: 'true'")) { hasEarlyAllowedTrue = true; earlyReturnLine = lineNum; }
        if (braceDepth <= 0) {
          if (hasEarlyAllowedTrue && !hasPositionPercentCheck) {
            return { id: 'V01', name: 'RiskGatekeeper فحص حجم الصفقة للورقي', status: 'FAIL', detail: `سطر ${earlyReturnLine}: return { allowed: true } بدون فحص positionPercent داخل بلوك isSimulated (سطر ${blockStartLine})` };
          }
          insideSimBlock = false;
        }
      }
    }
    return { id: 'V01', name: 'RiskGatekeeper فحص حجم الصفقة للورقي', status: 'PASS', detail: 'RiskGatekeeper يفحص حجم الصفقة لجميع الحسابات' };
  }

  // ── V02: RiskManager ──
  private checkV02(): CheckResult {
    const content = this.read('modules/trading/risk-manager.service.ts');
    if (!content) return { id: 'V02', name: 'RiskManager فحص حجم الصفقة للورقي', status: 'MISSING', detail: 'الملف غير موجود' };

    const lines = content.split('\n');
    let insideSimBlock = false;
    let braceDepth = 0;
    let blockStartLine = 0;
    let hasPositionPercentCheck = false;
    let hasEarlyAllowedTrue = false;
    let earlyReturnLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      if (line.includes('isSimulated') && line.includes('if')) {
        insideSimBlock = true;
        braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        blockStartLine = lineNum;
        hasPositionPercentCheck = false;
        hasEarlyAllowedTrue = false;
        continue;
      }

      if (insideSimBlock) {
        braceDepth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        if (line.includes('positionPercent') || line.includes('maxPositionSizePercent')) hasPositionPercentCheck = true;
        if (line.includes('allowed: true')) { hasEarlyAllowedTrue = true; earlyReturnLine = lineNum; }
        if (braceDepth <= 0) {
          if (hasEarlyAllowedTrue && !hasPositionPercentCheck) {
            return { id: 'V02', name: 'RiskManager فحص حجم الصفقة للورقي', status: 'FAIL', detail: `سطر ${earlyReturnLine}: return { allowed: true } بدون فحص positionPercent داخل بلوك isSimulated` };
          }
          insideSimBlock = false;
        }
      }
    }

    if (content.includes('hasOnlySimulatedCredentials')) {
      const simCredBlock = content.match(/hasOnlySimulatedCredentials[\s\S]*?allowed:\s*true/);
      if (simCredBlock && !simCredBlock[0].includes('positionPercent')) {
        return { id: 'V02', name: 'RiskManager فحص حجم الصفقة للورقي', status: 'FAIL', detail: 'hasOnlySimulatedCredentials يرجع allowed:true بدون فحص positionPercent' };
      }
    }

    return { id: 'V02', name: 'RiskManager فحص حجم الصفقة للورقي', status: 'PASS', detail: 'RiskManager يفحص حجم الصفقة لجميع الحسابات' };
  }

  // ── V03: Smart Executor maxOrderValue ──
  private checkV03(): CheckResult {
    const content = this.read('modules/ai/smart-executor/smart-executor.service.ts');
    if (!content) return { id: 'V03', name: 'Smart Executor حد حجم الصفقة للورقي', status: 'MISSING', detail: 'الملف غير موجود' };

    const paperPercentMatch = content.match(/isSimulatedExecution\s*\n?\s*\?[\s\S]*?portfolioValue\s*\*\s*0\.(\d+)/);
    if (paperPercentMatch) {
      const paperPercent = parseInt(paperPercentMatch[1]);
      if (paperPercent > 2) {
        return { id: 'V03', name: 'Smart Executor حد حجم الصفقة للورقي', status: 'FAIL', detail: `حد الورقي = ${paperPercent}% من المحفظة. يجب أن يكون ≤ 2%` };
      }
      return { id: 'V03', name: 'Smart Executor حد حجم الصفقة للورقي', status: 'PASS', detail: `حد الورقي = ${paperPercent}% — ضمن الحد المطلوب` };
    }

    const allPercents = [...content.matchAll(/portfolioValue\s*\*\s*0\.(\d+)/g)];
    for (const match of allPercents) {
      if (parseInt(match[1]) > 5) {
        return { id: 'V03', name: 'Smart Executor حد حجم الصفقة للورقي', status: 'FAIL', detail: `وجدت portfolioValue * 0.${match[1]} أكبر من 5%` };
      }
    }

    return { id: 'V03', name: 'Smart Executor حد حجم الصفقة للورقي', status: 'WARN', detail: 'لم أستطع تحديد النسبة بدقة' };
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
      return { id: 'V04', name: 'حد أدنى لمسافة Stop Loss', status: 'FAIL', detail: 'يوجد فقط فحص priceRisk === 0. لا حد أدنى لنسبة المسافة — SL قريب = حجم ضخم!' };
    }

    return { id: 'V04', name: 'حد أدنى لمسافة Stop Loss', status: 'FAIL', detail: 'لا يوجد أي حد أدنى لمسافة Stop Loss' };
  }

  // ── V05: processedKey ──
  private checkV05(): CheckResult {
    const content = this.read('modules/ai/smart-executor/smart-executor.service.ts');
    if (!content) return { id: 'V05', name: 'processedKey لا يُحذف فوراً', status: 'MISSING', detail: 'الملف غير موجود' };

    if (content.includes('.del(processedKey)')) {
      if (content.includes('cooldown:') && content.includes('redis.get(cooldownKey)')) {
        return { id: 'V05', name: 'processedKey لا يُحذف فوراً', status: 'WARN', detail: 'processedKey يُحذف فوراً لكن يوجد cooldown. تحقق من تطبيقه بعد كل أسباب الإغلاق' };
      }
      return { id: 'V05', name: 'processedKey لا يُحذف فوراً', status: 'FAIL', detail: 'processedKey يُحذف فوراً عند إغلاق الصفقة — يسمح بإعادة الفتح في الـ tick التالي' };
    }
    return { id: 'V05', name: 'processedKey لا يُحذف فوراً', status: 'WARN', detail: 'لم أجد redis.del(processedKey)' };
  }

  // ── V06: PaperTradingAdapter ──
  private checkV06(): CheckResult {
    const content = this.read('modules/execution/adapters/paper-trading.adapter.ts');
    if (!content) return { id: 'V06', name: 'PaperTradingAdapter حدود الحجم', status: 'MISSING', detail: 'الملف غير موجود' };

    if (content.includes('REMOVED order value limit') || (content.includes('REMOVED') && content.includes('limit'))) {
      return { id: 'V06', name: 'PaperTradingAdapter حدود الحجم', status: 'FAIL', detail: 'PaperTradingAdapter أزال كل حدود حجم الصفقة صراحةً!' };
    }
    if (content.includes('maxNotional') || content.includes('maxOrderValue') || content.includes('positionPercent')) {
      return { id: 'V06', name: 'PaperTradingAdapter حدود الحجم', status: 'PASS', detail: 'PaperTradingAdapter يفحص حجم الصفقة' };
    }
    return { id: 'V06', name: 'PaperTradingAdapter حدود الحجم', status: 'FAIL', detail: 'PaperTradingAdapter لا يفحص حجم الصفقة' };
  }

  // ── V07: _executePaperTrade ──
  private checkV07(): CheckResult {
    const content = this.read('modules/trading/trading.service.ts');
    if (!content) return { id: 'V07', name: '_executePaperTrade فحص الحجم', status: 'MISSING', detail: 'الملف غير موجود' };

    const paperTradeMatch = content.match(/_executePaperTrade[\s\S]*?\n\s*\}/);
    if (!paperTradeMatch) return { id: 'V07', name: '_executePaperTrade فحص الحجم', status: 'WARN', detail: 'لم أجد _executePaperTrade' };

    const code = paperTradeMatch[0];
    if (code.includes('maxNotional') || code.includes('maxOrderValue') || code.includes('positionPercent') || code.includes('maxPositionSize')) {
      return { id: 'V07', name: '_executePaperTrade فحص الحجم', status: 'PASS', detail: '_executePaperTrade يفحص حجم الصفقة' };
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

    if ((content.includes('Different source') && content.includes('ALLOW')) || (content.includes('existing.source !== request.source') && content.includes('ALLOW'))) {
      return { id: 'V10', name: 'OrderDispatcher منع التكرار بين المصادر', status: 'FAIL', detail: 'OrderDispatcher يسمح صراحةً بنفس الرمز+الاتجاه من مصدر مختلف!' };
    }

    if (content.includes('cross-source') || content.includes('crossSource')) {
      return { id: 'V10', name: 'OrderDispatcher منع التكرار بين المصادر', status: 'PASS', detail: 'يوجد فحص تكرار بين المصادر' };
    }

    return { id: 'V10', name: 'OrderDispatcher منع التكرار بين المصادر', status: 'WARN', detail: 'لم أجد منع تكرار واضح بين المصادر' };
  }

  // ── V11: _getPaperPortfolioValue margin inflation ──
  private checkV11(): CheckResult {
    const content = this.read('modules/ai/smart-executor/smart-executor.service.ts');
    if (!content) return { id: 'V11', name: 'عدم تضخيم portfolioValue بـ lockedMargin', status: 'MISSING', detail: 'الملف غير موجود' };

    if (content.includes('_getPaperPortfolioValue') && content.includes('freeCash + lockedMargin')) {
      const methodMatch = content.match(/_getPaperPortfolioValue[\s\S]*?freeCash[\s\S]*?lockedMargin[\s\S]*?return/);
      if (methodMatch && methodMatch[0].includes('lockedMargin') && !methodMatch[0].includes('cap') && !methodMatch[0].includes('Math.min')) {
        return { id: 'V11', name: 'عدم تضخيم portfolioValue بـ lockedMargin', status: 'FAIL', detail: 'equity = freeCash + lockedMargin + PnL. للكريبتو (1:1), lockedMargin = القيمة الاسمية = تضخيم المحفظة!' };
      }
    }

    if (content.includes('_getPaperPortfolioValue') && !content.includes('lockedMargin')) {
      return { id: 'V11', name: 'عدم تضخيم portfolioValue بـ lockedMargin', status: 'PASS', detail: 'يستخدم freeCash فقط' };
    }

    return { id: 'V11', name: 'عدم تضخيم portfolioValue بـ lockedMargin', status: 'WARN', detail: 'لم أستطع تحديد طريقة الحساب بدقة' };
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
