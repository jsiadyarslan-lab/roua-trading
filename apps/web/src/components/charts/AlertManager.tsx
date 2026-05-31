// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Smart Alert Manager
// Manages alert state and detection logic
// ═══════════════════════════════════════════════════════════

'use client'

import { AUDIO_TONES, AUDIO_ALERT_CONFIG } from '@/lib/charts/config'

export type AlertType = 'price' | 'indicator' | 'pattern' | 'whale' | 'prediction' | 'news';

export interface Alert {
  id: string;
  type: AlertType;
  symbol: string;
  condition: string;
  value: number;
  current: number;
  direction: 'above' | 'below' | 'cross';
  active: boolean;
  triggered: boolean;
  createdAt: number;
  triggeredAt?: number;
  labelAr: string;
  notifySound: boolean;
  notifyBrowser: boolean;
  notifyTelegram: boolean;
  notifyEmail: boolean;
}

const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  price: 'price',
  indicator: 'indicatorType',
  pattern: 'patternType',
  whale: 'whale',
  prediction: 'prediction',
  news: 'newsType',
};

const ALERT_TYPE_ICONS: Record<AlertType, string> = {
  price: '💰',
  indicator: '📊',
  pattern: '🕯',
  whale: '🐋',
  prediction: '🎯',
  news: '📰',
};

let alertIdCounter = 0;

/* ── AudioContext singleton ──
 * Reuse a single AudioContext instead of creating a new one per alert.
 * The context is lazily created on first use and auto-closes after the sound plays.
 */
let _alertAudioCtx: AudioContext | null = null;

function getAlertAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!_alertAudioCtx || _alertAudioCtx.state === 'closed') {
    try {
      _alertAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (_alertAudioCtx.state === 'suspended') {
    _alertAudioCtx.resume().catch(() => {});
  }
  return _alertAudioCtx;
}

/**
 * i18n helper for alert notification strings in non-component contexts.
 * Set by the nearest component via setAlertTranslator().
 */
let _alertTn: ((key: string, vars?: Record<string, any>) => string) | null = null

export function setAlertTranslator(tn: (key: string, vars?: Record<string, any>) => string) {
  _alertTn = tn
}

export function createAlert(params: {
  type: AlertType;
  symbol: string;
  condition: string;
  value: number;
  direction: 'above' | 'below' | 'cross';
  labelAr?: string;
}): Alert {
  return {
    id: `alert-${alertIdCounter++}-${Date.now()}`,
    type: params.type,
    symbol: params.symbol,
    condition: params.condition,
    value: params.value,
    current: 0,
    direction: params.direction,
    active: true,
    triggered: false,
    createdAt: Date.now(),
    labelAr: `${ALERT_TYPE_LABELS[params.type]} ${params.direction === 'above' ? 'above' : params.direction === 'below' ? 'below' : 'cross'} ${params.value}`,
    notifySound: true,
    notifyBrowser: true,
    notifyTelegram: false,
    notifyEmail: false,
  };
}

export function checkAlert(alert: Alert, currentPrice: number): boolean {
  if (!alert.active || alert.triggered) return false;
  const triggered = alert.direction === 'above'
    ? currentPrice >= alert.value
    : alert.direction === 'below'
    ? currentPrice <= alert.value
    : Math.abs(currentPrice - alert.value) / alert.value < 0.001;

  if (triggered) {
    if (alert.notifyBrowser && typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const alertTitle = _alertTn ? _alertTn('alertTitle') : 'Roua Trading Alert';
        new Notification(alertTitle, {
          body: `${alert.symbol}: ${alert.labelAr}`,
          icon: '/favicon.ico',
        });
      } catch {}
    }
    if (alert.notifySound && typeof window !== 'undefined') {
      try {
        const ac = getAlertAudioContext();
        if (ac) {
          const osc = ac.createOscillator();
          const gain = ac.createGain();
          osc.connect(gain);
          gain.connect(ac.destination);
          osc.frequency.value = alert.type === 'whale' ? AUDIO_TONES.whale.frequency : AUDIO_ALERT_CONFIG.breakout.frequency;
          gain.gain.value = 0.1;
          osc.start();
          setTimeout(() => { osc.stop(); osc.disconnect(); gain.disconnect(); }, 200);
        }
      } catch {}
    }
  }

  return triggered;
}

export { ALERT_TYPE_LABELS, ALERT_TYPE_ICONS };
