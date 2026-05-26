// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Root not-found.tsx — Minimal, no i18n
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// This page is rendered when a URL doesn't match any route BEFORE
// the [locale] segment is matched (e.g., truly invalid paths).
// It's outside the NextIntlClientProvider, so it can't use translations.
// The locale-aware version at [locale]/not-found.tsx handles most 404s.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import Link from 'next/link'

export default function RootNotFound() {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <div
          className="min-h-screen flex items-center justify-center px-4"
          style={{
            background: 'radial-gradient(ellipse at 50% 0%, rgba(16,185,129,0.06) 0%, transparent 50%), #06090f',
          }}
        >
          <div className="text-center max-w-md">
            <div
              className="text-[120px] sm:text-[160px] font-bold leading-none mb-2"
              style={{
                background: 'linear-gradient(135deg, #10B981 0%, #3B82F6 50%, #8B5CF6 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              404
            </div>
            <h1 className="text-2xl font-bold mb-3" style={{ color: '#E2E8F0' }}>
              الصفحة غير موجودة
            </h1>
            <p className="text-sm mb-8" style={{ color: '#64748B' }}>
              عذراً، الصفحة التي تبحث عنها غير موجودة أو تم نقلها
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all duration-300"
              style={{
                background: 'linear-gradient(135deg, #059669, #10B981)',
                color: '#fff',
              }}
            >
              العودة للرئيسية
            </Link>
          </div>
        </div>
      </body>
    </html>
  )
}
