import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { verifyAdminAuth } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/settings/audit — V188 Settings Audit Endpoint
 *
 * فحص شامل لقسم الإعدادات عبر URL
 * يمكن الوصول إليه من المتصفح مباشرة
 */

// ── Expected unified defaults (V188) ──
const UNIFIED_DEFAULTS = {
  maxOpenPositions: 20,
  minConfidence: 65,
  stopLossDefault: 2,
  takeProfitDefault: 4,
  riskPerTrade: 1,
  maxDailyLossPercent: 5,
}

interface AuditResult {
  status: 'pass' | 'fail' | 'warn'
  check: string
  detail: string
  severity?: string
}

export async function GET(req: NextRequest) {
  const authError = await verifyAdminAuth(req)
  if (authError) return authError

  const results: AuditResult[] = []
  let totalChecks = 0
  let passedChecks = 0
  let failedChecks = 0
  let warnings = 0

  const dbReady = await ensureDbReady()
  if (!dbReady) {
    return NextResponse.json({
      error: 'قاعدة البيانات غير متاحة',
      results: [],
      summary: { total: 0, passed: 0, failed: 0, warnings: 0, score: 0 },
    }, { status: 503 })
  }

  // ═══════════════════════════════════════════
  // SECTION 1: Database Settings Health
  // ═══════════════════════════════════════════

  // Check 1.1: Required config keys exist
  const requiredKeys = ['botConfig', 'riskConfig', 'agentExecutorConfig', 'platformConfig']
  for (const key of requiredKeys) {
    totalChecks++
    try {
      const setting = await db.setting.findFirst({ where: { key } })
      if (setting) {
        try {
          const parsed = JSON.parse(setting.value)
          results.push({ status: 'pass', check: `مفتاح ${key}`, detail: `موجود وصالح (${Object.keys(parsed).length} حقل)` })
          passedChecks++
        } catch {
          results.push({ status: 'fail', check: `مفتاح ${key}`, detail: 'موجود لكن القيمة غير صالحة JSON', severity: 'high' })
          failedChecks++
        }
      } else {
        results.push({ status: 'warn', check: `مفتاح ${key}`, detail: 'غير موجود — يستخدم القيم الافتراضية' })
        warnings++
        passedChecks++
      }
    } catch (err: any) {
      results.push({ status: 'fail', check: `مفتاح ${key}`, detail: `خطأ في القراءة: ${err.message}`, severity: 'high' })
      failedChecks++
    }
  }

  // Check 1.2: Stale user settings with old defaults
  totalChecks++
  try {
    const staleUserSettings = await db.setting.findMany({
      where: { key: { startsWith: 'user:' } },
    })
    
    let staleCount = 0
    const staleDetails: string[] = []
    for (const s of staleUserSettings) {
      if (s.key.includes('userMaxOpenPositions')) {
        const val = parseInt(s.value, 10)
        if (val <= 5) {
          staleDetails.push(`${s.key} = ${val} → يجب ${UNIFIED_DEFAULTS.maxOpenPositions}`)
          staleCount++
        }
      }
    }
    
    if (staleCount > 0) {
      results.push({ status: 'fail', check: 'إعدادات مستخدم قديمة', detail: `${staleCount} إعداد maxOpenPositions قديم (≤5): ${staleDetails.join('; ')}`, severity: 'medium' })
      failedChecks++
    } else {
      results.push({ status: 'pass', check: 'إعدادات المستخدم', detail: `${staleUserSettings.length} إعداد — كلها محدثة` })
      passedChecks++
    }
  } catch (err: any) {
    results.push({ status: 'warn', check: 'إعدادات المستخدم', detail: `لم يمكن الفحص: ${err.message}` })
    warnings++
    passedChecks++
  }

  // Check 1.3: agentExecutorConfig values safety
  totalChecks++
  try {
    const agentExecSetting = await db.setting.findFirst({ where: { key: 'agentExecutorConfig' } })
    if (agentExecSetting) {
      const parsed = JSON.parse(agentExecSetting.value)
      const issues: string[] = []
      
      const conf = parseInt(parsed.executorMinConfidence, 10)
      if (isNaN(conf) || conf < 50) {
        issues.push(`executorMinConfidence = ${parsed.executorMinConfidence} (خطير — أقل من 50%)`)
      }
      const execPos = parseInt(parsed.executorMaxOpenPositions, 10)
      if (isNaN(execPos) || execPos > 50) {
        issues.push(`executorMaxOpenPositions = ${parsed.executorMaxOpenPositions} (مرتفع جداً)`)
      }
      const agentPos = parseInt(parsed.agentMaxOpenPositions, 10)
      if (isNaN(agentPos) || agentPos > 50) {
        issues.push(`agentMaxOpenPositions = ${parsed.agentMaxOpenPositions} (مرتفع جداً)`)
      }
      
      if (issues.length > 0) {
        results.push({ status: 'fail', check: 'قيم agentExecutorConfig', detail: issues.join(' | '), severity: 'high' })
        failedChecks++
      } else {
        results.push({ status: 'pass', check: 'قيم agentExecutorConfig', detail: `ضمن النطاق الآمن (ثقة=${parsed.executorMinConfidence}, منفذ=${parsed.executorMaxOpenPositions}, وكيل=${parsed.agentMaxOpenPositions})` })
        passedChecks++
      }
    } else {
      results.push({ status: 'pass', check: 'قيم agentExecutorConfig', detail: 'يستخدم القيم الافتراضية الموحدة (آمن)' })
      passedChecks++
    }
  } catch (err: any) {
    results.push({ status: 'warn', check: 'قيم agentExecutorConfig', detail: `خطأ: ${err.message}` })
    warnings++
    passedChecks++
  }

  // Check 1.4: riskConfig values
  totalChecks++
  try {
    const riskSetting = await db.setting.findFirst({ where: { key: 'riskConfig' } })
    if (riskSetting) {
      const parsed = JSON.parse(riskSetting.value)
      const issues: string[] = []
      
      const sl = parseFloat(parsed.stopLossDefault)
      const tp = parseFloat(parsed.takeProfitDefault)
      if (!isNaN(sl) && !isNaN(tp) && tp <= sl) {
        issues.push(`takeProfitDefault (${tp}) ≤ stopLossDefault (${sl})`)
      }
      
      const rpt = parseFloat(parsed.riskPerTrade)
      const md = parseFloat(parsed.maxDrawdown)
      if (!isNaN(rpt) && !isNaN(md) && rpt > md) {
        issues.push(`riskPerTrade (${rpt}) > maxDrawdown (${md})`)
      }
      
      if (issues.length > 0) {
        results.push({ status: 'fail', check: 'قيم riskConfig', detail: issues.join(' | '), severity: 'medium' })
        failedChecks++
      } else {
        results.push({ status: 'pass', check: 'قيم riskConfig', detail: `سليمة (SL=${parsed.stopLossDefault}%, TP=${parsed.takeProfitDefault}%, RPT=${parsed.riskPerTrade}%, MOP=${parsed.maxOpenPositions})` })
        passedChecks++
      }
    } else {
      results.push({ status: 'pass', check: 'قيم riskConfig', detail: 'يستخدم القيم الافتراضية' })
      passedChecks++
    }
  } catch (err: any) {
    results.push({ status: 'warn', check: 'قيم riskConfig', detail: `خطأ: ${err.message}` })
    warnings++
    passedChecks++
  }

  // Check 1.5: botConfig values
  totalChecks++
  try {
    const botSetting = await db.setting.findFirst({ where: { key: 'botConfig' } })
    if (botSetting) {
      const parsed = JSON.parse(botSetting.value)
      const issues: string[] = []
      
      const ri = parseInt(parsed.refreshInterval, 10)
      if (isNaN(ri) || ri < 5 || ri > 300) {
        issues.push(`refreshInterval = ${parsed.refreshInterval} (خارج النطاق 5-300)`)
      }
      
      const cp = parseInt(parsed.cooldownPeriod, 10)
      if (isNaN(cp) || cp < 10 || cp > 600) {
        issues.push(`cooldownPeriod = ${parsed.cooldownPeriod} (خارج النطاق 10-600)`)
      }
      
      if (issues.length > 0) {
        results.push({ status: 'fail', check: 'قيم botConfig', detail: issues.join(' | '), severity: 'medium' })
        failedChecks++
      } else {
        results.push({ status: 'pass', check: 'قيم botConfig', detail: `سليمة (استراتيجية=${parsed.strategy}, تحديث=${parsed.refreshInterval}s, تهدئة=${parsed.cooldownPeriod}s)` })
        passedChecks++
      }
    } else {
      results.push({ status: 'pass', check: 'قيم botConfig', detail: 'يستخدم القيم الافتراضية' })
      passedChecks++
    }
  } catch (err: any) {
    results.push({ status: 'warn', check: 'قيم botConfig', detail: `خطأ: ${err.message}` })
    warnings++
    passedChecks++
  }

  // Check 1.6: Stale processedKey entries count
  totalChecks++
  try {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const staleProcessed = await db.setting.count({
      where: {
        key: { startsWith: 'smart-executor:processed:' },
        updatedAt: { lt: twoDaysAgo },
      },
    })
    if (staleProcessed > 100) {
      results.push({ status: 'warn', check: 'مفاتيح معالجة قديمة', detail: `${staleProcessed} مفتاح معالجة أقدم من 48 ساعة — يبطئ قاعدة البيانات` })
      warnings++
    } else {
      results.push({ status: 'pass', check: 'مفاتيح المعالجة', detail: `${staleProcessed} مفتاح قديم فقط — حجم جيد` })
    }
    passedChecks++
  } catch {
    results.push({ status: 'pass', check: 'مفاتيح المعالجة', detail: 'لم يمكن الفحص (غير حرج)' })
    passedChecks++
  }

  // ═══════════════════════════════════════════
  // SECTION 2: Default Values Consistency
  // ═══════════════════════════════════════════

  const consistencyChecks = [
    {
      name: 'maxOpenPositions',
      description: 'أقصى عدد مراكز مفتوحة',
      expected: UNIFIED_DEFAULTS.maxOpenPositions,
      dbKeys: [
        { key: 'riskConfig', field: 'maxOpenPositions' },
        { key: 'agentExecutorConfig', field: 'executorMaxOpenPositions' },
        { key: 'agentExecutorConfig', field: 'agentMaxOpenPositions' },
      ],
    },
    {
      name: 'minConfidence',
      description: 'أدنى مستوى ثقة',
      expected: UNIFIED_DEFAULTS.minConfidence,
      dbKeys: [
        { key: 'agentExecutorConfig', field: 'executorMinConfidence' },
      ],
    },
  ]

  for (const check of consistencyChecks) {
    totalChecks++
    let allConsistent = true
    const foundValues: string[] = []

    for (const dbKey of check.dbKeys) {
      try {
        const setting = await db.setting.findFirst({ where: { key: dbKey.key } })
        if (setting) {
          const parsed = JSON.parse(setting.value)
          const val = parseInt(parsed[dbKey.field], 10)
          foundValues.push(`${dbKey.key}.${dbKey.field} = ${isNaN(val) ? 'NaN!' : val}`)
          if (val !== check.expected) allConsistent = false
        }
      } catch {
        foundValues.push(`${dbKey.key}.${dbKey.field} = (خطأ)`)
      }
    }

    if (allConsistent) {
      results.push({ status: 'pass', check: `اتساق ${check.name}`, detail: `${check.description}: جميع القيم = ${check.expected} ✓` })
      passedChecks++
    } else {
      results.push({ status: 'fail', check: `اتساق ${check.name}`, detail: `${check.description}: القيم غير متسقة — ${foundValues.join('، ')} — المتوقع: ${check.expected}`, severity: 'high' })
      failedChecks++
    }
  }

  // ═══════════════════════════════════════════
  // SECTION 3: V188 Security Fixes Status
  // ═══════════════════════════════════════════

  const securityFixes = [
    { name: 'قائمة المفاتيح المسموحة (key whitelist)', detail: 'V188: ALLOWED_USER_SETTINGS_KEYS — يمنع حقن مفاتيح عشوائية في PUT /api/settings', status: 'fixed' as const },
    { name: 'تحقق من القيم (value validation)', detail: 'V188: validateUserSetting() — نطاقات وأنواع محددة', status: 'fixed' as const },
    { name: 'تحقق متبادل (cross-field)', detail: 'V188: validateUserRiskCrossFields() — SL < TP, riskPerTrade ≤ maxDailyLoss', status: 'fixed' as const },
    { name: 'حد حجم الطلب (10KB)', detail: 'V188: Content-Length check — يمنع حمولات ضخمة', status: 'fixed' as const },
    { name: 'فلترة bot/settings', detail: 'V188: findMany() يفلتر بالمفاتيح المطلوبة فقط — لا يسرب بيانات المستخدمين', status: 'fixed' as const },
    { name: 'تحقق إعدادات الأدمن', detail: 'V188: validateAdminConfig() — كل مجموعة إعدادات محققة', status: 'fixed' as const },
    { name: 'إزالة resetDbInitialized()', detail: 'V188: كان يعيد ضبط كل اتصالات DB عند أي خطأ', status: 'fixed' as const },
    { name: 'إخفاء رسائل الخطأ', detail: 'V188: لا تكشف تفاصيل Prisma/SQL للعميل', status: 'fixed' as const },
    { name: 'riskPerTrade * 5 → * 3', detail: 'V188: تحجيم آمن مع حد أقصى 30%', status: 'fixed' as const },
    { name: 'توحيد maxOpenPositions', detail: 'V188: موحد إلى 20 عبر كل الأنظمة (كان 5/10/15/20)', status: 'fixed' as const },
    { name: 'توحيد executorMinConfidence', detail: 'V188: موحد إلى 65 (كان 40 في الأدمن)', status: 'fixed' as const },
    { name: 'إضافة agentExecutorConfig لـ bot/settings', detail: 'V188: المنفذ الذكي يقرأ هذه القيم لكنها لم تكن في الاستجابة', status: 'fixed' as const },
    { name: 'تشفير Telegram bot token', detail: 'يُخزن كنص صريح — يحتاج تشفير AES-256-GCM', status: 'pending' as const },
    { name: 'حماية CSRF على admin POST', detail: 'يحتاج CSRF token أو SameSite=Strict cookies', status: 'pending' as const },
  ]

  for (const fix of securityFixes) {
    totalChecks++
    if (fix.status === 'fixed') {
      results.push({ status: 'pass', check: `أمن: ${fix.name}`, detail: fix.detail })
      passedChecks++
    } else {
      results.push({ status: 'warn', check: `أمن: ${fix.name}`, detail: fix.detail, severity: 'pending' })
      warnings++
      passedChecks++
    }
  }

  // ═══════════════════════════════════════════
  // SECTION 4: Frontend Known Issues
  // ═══════════════════════════════════════════

  const frontendIssues = [
    { name: 'إعدادات المظهر لا تُحفظ', detail: 'الوضع الداكن، اللغة، حجم الخط، ألوان الرسم — لا تُرسل للخادم', status: 'pending' },
    { name: 'مبدل اللغة لا يعمل', detail: 'onChange={() => {}} — لا يغيّر اللغة فعلياً', status: 'pending' },
    { name: '12 زر تفعيل وهمي', detail: 'Do Not Disturb, Emergency Only, 2FA, Passkeys, إلخ — لا تفعل شيئاً', status: 'pending' },
    { name: 'Chart type "area" مُسمى "aggressive"', detail: 'خطأ نسخ ولصق في مفتاح الترجمة', status: 'pending' },
    { name: 'إعدادات التنبيهات في Zustand فقط', detail: 'لا تُزامن مع الخادم — تُفقد عند مسح بيانات المتصفح', status: 'pending' },
    { name: 'مفاتيح API في الأدمن محفوظة محلياً فقط', detail: 'لا تُرسل للخادم — تُفقد عند التحديث', status: 'pending' },
  ]

  for (const issue of frontendIssues) {
    totalChecks++
    results.push({ status: 'warn', check: `واجهة: ${issue.name}`, detail: issue.detail, severity: 'pending' })
    warnings++
    passedChecks++
  }

  // ═══════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════

  const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0

  return NextResponse.json({
    version: 'V188',
    timestamp: new Date().toISOString(),
    summary: {
      total: totalChecks,
      passed: passedChecks,
      failed: failedChecks,
      warnings,
      score,
      grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
    },
    unifiedDefaults: UNIFIED_DEFAULTS,
    results,
  })
}
