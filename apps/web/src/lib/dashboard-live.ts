'use client'

import type { QuoteData } from '@/hooks/useMarketStore'

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

export function getStatusLabel(status: DataStatus) {
  switch (status) {
    case 'live':
      return 'LIVE'
    case 'delayed':
      return 'DELAYED'
    case 'fallback':
      return 'FALLBACK'
    case 'demo':
      return 'DEMO'
    default:
      return 'OFFLINE'
  }
}

export function getStatusTone(status: DataStatus) {
  switch (status) {
    case 'live':
      return '#00C853'
    case 'delayed':
      return '#FFB800'
    case 'fallback':
      return '#00E5FF'
    case 'demo':
      return '#B388FF'
    default:
      return '#FF3B30'
  }
}

export function getSourceLabel(source?: string | null) {
  if (!source) return 'Unknown source'
  return source.replace(/\s+/g, ' ').trim()
}

export function formatFreshness(timestamp?: string | number | null) {
  if (!timestamp) return 'غير متصل'
  const ms = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime()
  if (!Number.isFinite(ms)) return 'غير معروف'

  const diff = Math.max(0, Date.now() - ms)
  if (diff < 5000) return 'الآن'
  if (diff < 60000) return `منذ ${Math.floor(diff / 1000)}ث`
  if (diff < 3600000) return `منذ ${Math.floor(diff / 60000)}د`
  return `منذ ${Math.floor(diff / 3600000)}س`
}

export function formatExecutionLabel(state: ExecutionState, side?: 'buy' | 'sell' | null) {
  switch (state) {
    case 'validating':
      return 'فحص بيانات الأمر'
    case 'ready':
      return `الأمر ${side === 'sell' ? 'البيعي' : 'الشرائي'} جاهز`
    case 'submitting':
      return 'إرسال الأمر إلى المزود'
    case 'accepted':
      return 'تم قبول الأمر'
    case 'filled':
      return 'تم تنفيذ الأمر'
    case 'partial':
      return 'تنفيذ جزئي'
    case 'rejected':
      return 'تم رفض الأمر'
    default:
      return 'جاهز للتنفيذ'
  }
}
