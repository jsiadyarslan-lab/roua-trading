"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseUserSettingsOptions {
  debounceMs?: number;
}

/**
 * V312: Unified settings hook — replaces the 2800-line monolith's
 * scattered saveSettings/loadSettings logic with a single, reusable hook.
 *
 * Features:
 * - Debounced auto-save
 * - Save status tracking (idle/saving/saved/error)
 * - beforeunload flush
 * - Error feedback (no more silent .catch(() => {}))
 * - Settings loaded guard (prevents overwriting with defaults)
 */
export function useUserSettings(options: UseUserSettingsOptions = {}) {
  const debounceMs = options.debounceMs ?? 2000;
  const t = useTranslations('dashboard.settings');

  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSettingsRef = useRef<Record<string, any>>({});

  // Load settings on mount
  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data?.settings && typeof data.settings === 'object') {
          setSettings(data.settings);
        }
        setLoaded(true); // Only set loaded=true on success
      })
      .catch(() => {
        // DON'T set loaded=true on failure — prevents auto-save overwriting
        if (!cancelled) setLoaded(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Update a single setting
  const update = useCallback((key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    pendingSettingsRef.current[key] = value;
  }, []);

  // Update multiple settings at once
  const updateMany = useCallback((updates: Record<string, any>) => {
    setSettings(prev => ({ ...prev, ...updates }));
    Object.assign(pendingSettingsRef.current, updates);
  }, []);

  // Debounced save
  const save = useCallback(() => {
    if (!loaded) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      const toSave = { ...pendingSettingsRef.current };
      if (Object.keys(toSave).length === 0) return;

      setSaveStatus('saving');
      try {
        const res = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings: toSave }),
        });

        if (res.ok) {
          setSaveStatus('saved');
          pendingSettingsRef.current = {};
          setTimeout(() => setSaveStatus('idle'), 2000);
        } else {
          const errData = await res.json().catch(() => ({}));
          console.error('[useUserSettings] Save failed:', res.status, errData?.error || errData?.details);
          setSaveStatus('error');
        }
      } catch (err) {
        console.error('[useUserSettings] Save network error:', err);
        setSaveStatus('error');
      }
    }, debounceMs);
  }, [loaded, debounceMs]);

  // Auto-save when pendingSettings changes
  useEffect(() => {
    if (Object.keys(pendingSettingsRef.current).length > 0) {
      save();
    }
  }, [settings, save]);

  // beforeunload flush
  useEffect(() => {
    const handler = () => {
      if (Object.keys(pendingSettingsRef.current).length > 0) {
        navigator.sendBeacon('/api/settings', JSON.stringify({
          settings: pendingSettingsRef.current,
        }));
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Get a setting with fallback
  const get = useCallback(<T>(key: string, fallback: T): T => {
    const val = settings[key];
    return val !== undefined ? val : fallback;
  }, [settings]);

  return {
    settings,
    loaded,
    saveStatus,
    update,
    updateMany,
    get,
    save,
  };
}
