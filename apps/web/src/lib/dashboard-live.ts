'use client'

import type { QuoteData } from '@/hooks/useMarketStore'
import T from '@/lib/unified-tokens'

export type DataStatus = 'live' | 'delayed' | 'fallback' | 'demo' | 'disconnected'
export type ExecutionState =
  | 'idle'
  | 'validating'
  | 'ready'
  | 'submitting'
  | 'accepted'
  | 'filled'
  | 'partial'
  | 'rejected'

export interface ActivityItem {
  id: string
  symbol?: string
  title: string
  detail: string
  tone: 'info' | 'success' | 'warning' | 'danger'
  timestamp: number
}

/** Optional translation function type (from next-intl useTranslations) */
type TFn = (key: string, params?: Record<string, any>) => string

export function getDataStatus(quote?: QuoteData | null): DataStatus {
  if (!quote) return 'disconnected'

  const source = (quote.source || '').toLowerCase()
  const ageMs = Date.now() - new Date(quote.timestamp).getTime()

  if (source.includes('demo')) return 'demo'
  if (source.includes('fallback') || source.includes('sim')) return 'fallback'
  if (!Number.isFinite(ageMs)) return 'disconnected'
  if (ageMs > 120000) return 'delayed'
  return 'live'
}

/** Map status to translation key in common namespace */
const STATUS_KEY_MAP: Record<DataStatus, string> = {
  live: 'statusLive',
  delayed: 'statusDelayed',
  fallback: 'statusFallback',
  demo: 'statusDemo',
  disconnected: 'statusDisconnected',
}

/** Legacy Arabic-only fallback (for backward compat if t not provided) */
const STATUS_AR_FALLBACK: Record<DataStatus, string> = {
  live: 'مباشر',
  delayed: 'متأخر',
  fallback: 'احتياطي',
  demo: 'تجريبي',
  disconnected: 'بانتظار الربط',
}

export function getStatusLabel(status: DataStatus, t?: TFn): string {
  if (t) return t(STATUS_KEY_MAP[status])
  return STATUS_AR_FALLBACK[status]
}

export function getStatusTone(status: DataStatus) {
  switch (status) {
    case 'live':
      return '#00C853'
    case 'delayed':
      return T.warning
    case 'fallback':
      return '#00E5FF'
    case 'demo':
      return T.council
    default:
      return T.warning // Amber instead of red — "waiting for connection" is not an error
  }
}

/** Map source names to translation keys in common namespace */
const SOURCE_KEY_MAP: Record<string, string> = {
  'Binance WS': 'sourceBinanceWS',
  'Binance': 'sourceBinance',
  'CoinGecko': 'sourceCoinGecko',
  'TwelveData': 'sourceTwelveData',
  'Yahoo Finance': 'sourceYahoo',
  'Metals.dev': 'sourceMetalsDev',
  'FCSAPI': 'sourceFcsApi',
  'GoldPrice': 'sourceGoldPrice',
  'ECB/Frankfurter': 'sourceEcb',
  'Aggregated': 'sourceAggregated',
}

/** Legacy Arabic-only fallback */
const SOURCE_AR_MAP: Record<string, string> = {
  'Binance WS': 'بينانس مباشر',
  'Binance': 'بينانس',
  'CoinGecko': 'كوين جيكو',
  'TwelveData': 'تويلف داتا',
  'Yahoo Finance': 'ياهو فاينانس',
  'Metals.dev': 'ميتالز',
  'FCSAPI': 'FCSAPI',
  'GoldPrice': 'غولد برايس',
  'ECB/Frankfurter': 'البنك المركزي الأوروبي',
  'Aggregated': 'مجمّع',
}

export function getSourceLabel(source?: string | null, t?: TFn): string {
  if (!source) return t ? t('sourceAwaitingApi') : 'في انتظار ربط API'
  const trimmed = source.trim()

  if (t) {
    const key = SOURCE_KEY_MAP[trimmed]
    if (key) return t(key)
    return source.replace(/\s+/g, ' ').trim()
  }

  // Legacy Arabic fallback
  const mapped = SOURCE_AR_MAP[trimmed] || source.replace(/\s+/g, ' ').trim()
  if (mapped.includes('(مؤقت)')) return mapped
  return mapped
}

export function formatFreshness(timestamp?: string | number | null, t?: TFn): string {
  if (!timestamp) return t ? t('notConnected') : 'غير متصل'
  const ms = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime()
  if (!Number.isFinite(ms)) return t ? t('unknown') : 'غير معروف'

  const diff = Math.max(0, Date.now() - ms)
  if (diff < 5000) return t ? t('now') : 'الآن'
  if (diff < 60000) {
    const secs = Math.floor(diff / 1000)
    return t ? t('secondsAgoShort', { n: secs }) : `منذ ${secs}ث`
  }
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000)
    return t ? t('minutesAgoShort', { n: mins }) : `منذ ${mins}د`
  }
  const hrs = Math.floor(diff / 3600000)
  return t ? t('hoursAgoShort', { n: hrs }) : `منذ ${hrs}س`
}

export function formatExecutionLabel(state: ExecutionState, side?: 'buy' | 'sell' | null, t?: TFn): string {
  if (t) {
    switch (state) {
      case 'validating': return t('execValidating')
      case 'ready': return side === 'sell' ? t('execReadySell') : t('execReadyBuy')
      case 'submitting': return t('execSubmitting')
      case 'accepted': return t('execAccepted')
      case 'filled': return t('execFilled')
      case 'partial': return t('execPartial')
      case 'rejected': return t('execRejected')
      default: return t('execIdle')
    }
  }

  // Legacy Arabic fallback
  switch (state) {
    case 'validating': return 'فحص بيانات الأمر'
    case 'ready': return `الأمر ${side === 'sell' ? 'البيعي' : 'الشرائي'} جاهز`
    case 'submitting': return 'إرسال الأمر إلى المزود'
    case 'accepted': return 'تم قبول الأمر'
    case 'filled': return 'تم تنفيذ الأمر'
    case 'partial': return 'تنفيذ جزئي'
    case 'rejected': return 'تم رفض الأمر'
    default: return 'جاهز للتنفيذ'
  }
}
