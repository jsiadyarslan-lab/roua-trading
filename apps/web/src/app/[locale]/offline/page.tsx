'use client';

import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';

/**
 * Offline fallback page.
 *
 * Shown by the Serwist Service Worker when a navigation request fails
 * (user is offline and the page is not in the cache).
 *
 * Routes:
 *   - /ar/offline
 *   - /en/offline
 *   - /fr/offline
 *   - ... (any supported locale)
 *
 * Implemented as a client component (like not-found.tsx) to avoid
 * dynamic server usage errors during static prerendering.
 */

export default function OfflinePage() {
  const t = useTranslations('offline');
  const params = useParams<{ locale: string }>();
  const locale = params?.locale || 'ar';
  const isRtl = locale === 'ar' || locale === 'he' || locale === 'fa' || locale === 'ur';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        paddingTop: 'calc(1.5rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
        background:
          'radial-gradient(ellipse at 50% 0%, rgba(16,185,129,0.06) 0%, transparent 50%), #06090f',
        color: '#9CA3B5',
        textAlign: 'center',
        fontFamily: 'var(--font-ar, "Cairo", sans-serif)',
        direction: isRtl ? 'rtl' : 'ltr',
      }}
    >
      <div style={{ maxWidth: '28rem' }}>
        {/* Icon: cloud-off */}
        <svg
          width="80"
          height="80"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#10B981"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ margin: '0 auto 1.5rem', display: 'block' }}
          aria-hidden="true"
        >
          <path d="M12 2v2" />
          <path d="M5.45 5.11 4.04 3.7" />
          <path d="M2 12h2" />
          <path d="M12 22a8 8 0 0 0 8-8" />
          <path d="m17.95 5.95 1.41-1.41" />
          <path d="M22 12h-2" />
          <path d="M5.45 5.11A8 8 0 0 1 12 4a8 8 0 0 1 8 8" />
          <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
          <path d="m2 2 20 20" />
        </svg>

        <h1
          style={{
            fontSize: '2rem',
            fontWeight: 700,
            marginBottom: '0.75rem',
            background: 'linear-gradient(135deg, #10B981, #3B82F6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          {t('title')}
        </h1>

        <p style={{ fontSize: '1rem', lineHeight: 1.6, marginBottom: '2rem', opacity: 0.85 }}>
          {t('description')}
        </p>

        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.location.reload();
            }
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.5rem',
            borderRadius: '0.75rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            background: 'linear-gradient(135deg, #059669, #10B981)',
            color: '#fff',
            boxShadow: '0 0 20px rgba(16, 185, 129, 0.15)',
            transition: 'opacity 0.2s',
            // Apple HIG: minimum 44px touch target
            minHeight: '44px',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          {t('retry')}
        </button>
      </div>
    </div>
  );
}
