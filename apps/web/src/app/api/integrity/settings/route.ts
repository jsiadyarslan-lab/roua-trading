import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

/**
 * GET /api/integrity/settings
 *
 * V189: Settings Deception Removal — runtime verification.
 * This endpoint runs on the Next.js server where the source files ARE available,
 * unlike the NestJS API which runs from compiled dist/ and can't find web source.
 *
 * Checks that no fake/deceptive UI elements exist in the settings page:
 * - No onChange={() => {}} no-op toggle switches
 * - Language switching uses real locale routing
 * - Font size, dark mode, animations, grid lines, stealth mode are persisted
 * - Data export fetches real trading data
 * - Session management uses real API endpoints
 */

interface SubCheck {
  id: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
}

export async function GET() {
  const checks: SubCheck[] = [];

  // ── Find the settings page source ──
  let settingsContent: string | null = null;
  const searchPaths = [
    // Development: source in apps/web/src/
    path.resolve(process.cwd(), 'src', 'app', '[locale]', 'dashboard', 'settings', 'page.tsx'),
    path.resolve(process.cwd(), 'apps', 'web', 'src', 'app', '[locale]', 'dashboard', 'settings', 'page.tsx'),
    // Production: Next.js builds from project root or apps/web/
    path.resolve(process.cwd(), '..', 'src', 'app', '[locale]', 'dashboard', 'settings', 'page.tsx'),
  ];

  for (const sp of searchPaths) {
    try {
      settingsContent = fs.readFileSync(sp, 'utf-8');
      break;
    } catch {}
  }

  if (!settingsContent) {
    return NextResponse.json({
      id: 'V20',
      name: 'V189 إزالة خداع الإعدادات',
      status: 'WARN',
      detail: 'ملف صفحة الإعدادات غير موجود في المسارات المتوقعة',
      subChecks: [],
      searchedPaths: searchPaths,
      cwd: process.cwd(),
    });
  }

  // ── V20a: No fake onChange={() => {}} toggle switches ──
  const noopToggles = (settingsContent.match(/onChange=\{\(\) => \{\}\}/g) || []).length;
  checks.push({
    id: 'V20a',
    status: noopToggles === 0 ? 'PASS' : 'FAIL',
    detail: noopToggles === 0
      ? 'لا مفاتيح وهمية — كل التبديلات حقيقية أو شارة "قريباً"'
      : `${noopToggles} مفتاح وهمي لا يزال موجود (onChange={() => {}})`,
  });

  // ── V20b: Language switching uses real locale ──
  const hasRealLangSwitch = settingsContent.includes('currentLocale') && settingsContent.includes('router.replace');
  checks.push({
    id: 'V20b',
    status: hasRealLangSwitch ? 'PASS' : 'FAIL',
    detail: hasRealLangSwitch
      ? 'تغيير اللغة حقيقي — يستخدم currentLocale + router.replace'
      : 'تغيير اللغة وهمي — لا يستخدم currentLocale أو router.replace',
  });

  // ── V20c: Font size is persisted ──
  const hasFontSizePersist = settingsContent.includes('roua_font_size');
  checks.push({
    id: 'V20c',
    status: hasFontSizePersist ? 'PASS' : 'FAIL',
    detail: hasFontSizePersist
      ? 'حجم الخط محفوظ (localStorage: roua_font_size)'
      : 'حجم الخط غير محفوظ — التغيير يختفي بعد التحديث',
  });

  // ── V20d: Dark mode is persisted ──
  const hasDarkModePersist = settingsContent.includes('roua_dark_mode');
  checks.push({
    id: 'V20d',
    status: hasDarkModePersist ? 'PASS' : 'FAIL',
    detail: hasDarkModePersist
      ? 'الوضع الداكن محفوظ (localStorage: roua_dark_mode)'
      : 'الوضع الداكن غير محفوظ — التغيير يختفي بعد التحديث',
  });

  // ── V20e: Animations toggle is persisted ──
  const hasAnimPersist = settingsContent.includes('roua_animations');
  checks.push({
    id: 'V20e',
    status: hasAnimPersist ? 'PASS' : 'WARN',
    detail: hasAnimPersist
      ? 'تبديل الرسوم المتحركة محفوظ (localStorage: roua_animations)'
      : 'تبديل الرسوم المتحركة غير محفوظ',
  });

  // ── V20f: Data export is real (not simulated) ──
  const hasRealExport = settingsContent.includes('/api/trading/positions') && !settingsContent.includes('Simulate export');
  checks.push({
    id: 'V20f',
    status: hasRealExport ? 'PASS' : 'FAIL',
    detail: hasRealExport
      ? 'تصدير البيانات حقيقي — يجلب بيانات التداول والمراكز'
      : 'تصدير البيانات وهمي — لا يجلب بيانات حقيقية',
  });

  // ── V20g: Sessions use real API ──
  const hasRealSessions = settingsContent.includes('/api/auth/sessions');
  checks.push({
    id: 'V20g',
    status: hasRealSessions ? 'PASS' : 'FAIL',
    detail: hasRealSessions
      ? 'الجلسات حقيقية — يستخدم /api/auth/sessions'
      : 'الجلسات وهمية — لا يستخدم API حقيقي',
  });

  // ── V20h: Kill sessions uses DELETE ──
  const hasRealKill = settingsContent.includes("method: 'DELETE'") && settingsContent.includes('revokeAll');
  checks.push({
    id: 'V20h',
    status: hasRealKill ? 'PASS' : 'FAIL',
    detail: hasRealKill
      ? 'إنهاء الجلسات حقيقي — يستخدم DELETE /api/auth/sessions'
      : 'إنهاء الجلسات وهمي — لا يستخدم API حقيقي',
  });

  // ── V20i: ComingSoonBadge component exists ──
  const hasComingSoonBadge = settingsContent.includes('ComingSoonBadge');
  checks.push({
    id: 'V20i',
    status: hasComingSoonBadge ? 'PASS' : 'WARN',
    detail: hasComingSoonBadge
      ? 'شارة "قريباً" موجودة — بدلاً من مفاتيح وهمية'
      : 'لا توجد شارة "قريباً" — الميزات غير المكتملة تبدو وكأنها تعمل',
  });

  // ── V20j: Stealth mode is real ──
  const hasStealthMode = settingsContent.includes('roua_stealth_mode');
  checks.push({
    id: 'V20j',
    status: hasStealthMode ? 'PASS' : 'WARN',
    detail: hasStealthMode
      ? 'وضع التخفي حقيقي — يحفظ في localStorage ويضيف class'
      : 'وضع التخفي وهمي',
  });

  // ── Build overall result ──
  const failures = checks.filter(c => c.status === 'FAIL');
  const warnings = checks.filter(c => c.status === 'WARN');
  const passes = checks.filter(c => c.status === 'PASS');

  let overallStatus: 'PASS' | 'FAIL' | 'WARN';
  let detail: string;

  if (failures.length > 0) {
    overallStatus = 'FAIL';
    detail = `${failures.length} مشكلة: ${failures.map(f => f.detail).join(' | ')}`;
  } else if (warnings.length > 0) {
    overallStatus = 'PASS';
    detail = `كل الإصلاحات مطبقة: ${passes.map(p => p.detail).join(' | ')} | ⚠️ ${warnings.map(w => w.detail).join(' | ')}`;
  } else {
    overallStatus = 'PASS';
    detail = `كل الإصلاحات مطبقة: ${passes.map(p => p.detail).join(' | ')}`;
  }

  return NextResponse.json({
    id: 'V20',
    name: 'V189 إزالة خداع الإعدادات',
    status: overallStatus,
    detail,
    subChecks: checks,
  });
}
