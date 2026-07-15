'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Share, PlusSquare } from 'lucide-react';
import { haptic } from '@/lib/haptics';

/**
 * InstallPrompt — shows a PWA install banner with platform-aware UX.
 *
 * Behavior:
 * - Chrome/Edge Android: listens for `beforeinstallprompt` event, shows banner
 *   after 30s delay (only if user hasn't dismissed it before).
 * - Safari iOS: doesn't fire `beforeinstallprompt`, so we show a separate
 *   hint explaining how to add to home screen via the Share button.
 * - Desktop browsers that don't support install: nothing is shown.
 *
 * Persistence:
 * - When user dismisses: localStorage flag prevents re-showing for 7 days.
 * - When user accepts: banner hides permanently (Chrome fires `appinstalled`).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'pwa-install-dismissed';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SHOW_DELAY_MS = 30_000; // 30 seconds

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  // Modern iPad reports as Mac, so check for touch + Mac platform
  const isIPad =
    /iPad/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return /iPhone|iPod/.test(navigator.userAgent) || isIPad;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  );
}

function shouldShow(): boolean {
  if (typeof window === 'undefined') return false;
  const dismissed = localStorage.getItem(DISMISS_KEY);
  if (!dismissed) return true;
  const dismissedAt = parseInt(dismissed, 10);
  if (Number.isNaN(dismissedAt)) return true;
  return Date.now() - dismissedAt > DISMISS_DURATION_MS;
}

function markDismissed(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DISMISS_KEY, String(Date.now()));
}

export function InstallPrompt() {
  const t = useTranslations('pwaInstall');
  const locale = useLocale();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) return; // Already installed — don't show
    if (!shouldShow()) return; // User dismissed recently

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault(); // Prevent the default mini-infobar
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Delay showing the banner to avoid annoying first-time visitors
      timeoutId = setTimeout(() => {
        setShowBanner(true);
      }, SHOW_DELAY_MS);
    };

    const handleAppInstalled = () => {
      setShowBanner(false);
      setShowIOSHint(false);
      setDeferredPrompt(null);
      // Don't mark dismissed — user already installed
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    // iOS Safari doesn't fire beforeinstallprompt. Show iOS hint after delay
    // only if user is on iOS and hasn't installed yet.
    if (isIOS()) {
      timeoutId = setTimeout(() => {
        setShowIOSHint(true);
      }, SHOW_DELAY_MS);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const handleInstall = async () => {
    haptic.medium();
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;

    if (choice.outcome === 'accepted') {
      // User accepted — hide banner, don't mark dismissed
      setShowBanner(false);
    } else {
      // User dismissed the native prompt — remember for 7 days
      markDismissed();
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    haptic.light();
    markDismissed();
    setShowBanner(false);
    setShowIOSHint(false);
  };

  const isRtl = locale === 'ar' || locale === 'he' || locale === 'fa' || locale === 'ur';

  return (
    <AnimatePresence>
      {(showBanner || showIOSHint) && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          style={{
            position: 'fixed',
            bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
            left: '1rem',
            right: '1rem',
            zIndex: 9998,
            maxWidth: '32rem',
            margin: '0 auto',
            background: 'rgba(11, 14, 20, 0.98)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: '16px',
            padding: '1rem 1.25rem',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4), 0 0 30px rgba(16, 185, 129, 0.1)',
            direction: isRtl ? 'rtl' : 'ltr',
            fontFamily: 'var(--font-ar, "Cairo", sans-serif)',
          }}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={handleDismiss}
            aria-label={t('later')}
            style={{
              position: 'absolute',
              top: '8px',
              right: isRtl ? 'auto' : '8px',
              left: isRtl ? '8px' : 'auto',
              background: 'transparent',
              border: 'none',
              color: '#9CA3B5',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '32px',
              minWidth: '32px',
            }}
          >
            <X size={16} />
          </button>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', paddingRight: isRtl ? '0' : '2rem', paddingLeft: isRtl ? '2rem' : '0' }}>
            {/* Icon */}
            <div
              style={{
                flexShrink: 0,
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #059669, #10B981)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 0 20px rgba(16, 185, 129, 0.3)',
              }}
            >
              <Download size={20} />
            </div>

            {/* Text + actions */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3
                style={{
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  margin: '0 0 4px 0',
                  color: '#F0F2F5',
                  lineHeight: 1.3,
                }}
              >
                {t('title')}
              </h3>
              <p
                style={{
                  fontSize: '0.8125rem',
                  margin: '0 0 12px 0',
                  color: '#9CA3B5',
                  lineHeight: 1.5,
                }}
              >
                {t('description')}
              </p>

              {/* iOS hint (Share → Add to Home Screen) */}
              {showIOSHint && (
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: '#9CA3B5',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    margin: '0 0 10px 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    flexWrap: 'wrap',
                  }}
                >
                  <Share size={14} style={{ flexShrink: 0 }} />
                  <span>{t('iosHint')}</span>
                  <PlusSquare size={14} style={{ flexShrink: 0 }} />
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '8px' }}>
                {showBanner && (
                  <button
                    type="button"
                    onClick={handleInstall}
                    style={{
                      flex: 1,
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #059669, #10B981)',
                      color: '#fff',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      minHeight: '40px',
                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                    }}
                  >
                    {t('install')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDismiss}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    background: 'transparent',
                    color: '#9CA3B5',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    minHeight: '40px',
                  }}
                >
                  {t('later')}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
