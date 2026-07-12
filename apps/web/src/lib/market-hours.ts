// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Market Hours Checker
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Determines if a given market is currently open based on:
 *  - Asset type (crypto, forex, stock, commodity)
 *  - Day of week and time (in UTC)
 *  - Known holidays (simplified)
 *
 * Crypto markets are 24/7 — always open.
 * Forex: Mon-Fri, opens Sunday 22:00 UTC, closes Friday 22:00 UTC
 * US Stocks: Mon-Fri, 14:30-21:00 UTC (9:30 AM - 4:00 PM ET)
 * Commodities (XAU, XAG): Mon-Fri, 23:00 Sun - 22:00 Fri UTC
 */

import { CRYPTO_BASES as _CRYPTO_BASES } from '@/lib/charts/config'

export type MarketType = 'crypto' | 'forex' | 'stock' | 'commodity' | 'unknown'

const FOREX_SYMBOLS = ['EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'USD']
const COMMODITY_SYMBOLS = ['XAU', 'XAG', 'XPT', 'XPD']
const US_STOCK_SYMBOLS = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META']

/**
 * Detect the market type from a trading pair symbol
 */
export function detectMarketType(symbol: string): MarketType {
  const base = symbol.split('/')[0].toUpperCase().replace('USDT', '').replace('USD', '')

  if (_CRYPTO_BASES.has(base)) return 'crypto'
  if (COMMODITY_SYMBOLS.includes(base)) return 'commodity'

  // Forex pairs look like EUR/USD, GBP/USD, USD/JPY
  if (symbol.includes('/')) {
    const parts = symbol.split('/')
    if (parts.length === 2 && FOREX_SYMBOLS.includes(parts[0].toUpperCase()) && FOREX_SYMBOLS.includes(parts[1].toUpperCase())) {
      return 'forex'
    }
  }

  if (US_STOCK_SYMBOLS.includes(base)) return 'stock'

  // Additional heuristic: if the symbol doesn't contain / it might be a stock ticker
  if (!symbol.includes('/') && base.length <= 5 && base === base.toUpperCase()) {
    return 'stock'
  }

  return 'unknown'
}

/**
 * Check if the market for a given symbol is currently open.
 * Returns an object with status and human-readable reason (Arabic).
 */
export function isMarketOpen(symbol: string, now: Date = new Date()): {
  open: boolean
  reason: string
  marketType: MarketType
  nextOpen: Date | null
} {
  const marketType = detectMarketType(symbol)

  switch (marketType) {
    case 'crypto':
      // Crypto markets are always open (24/7/365)
      return { open: true, reason: 'سوق العملات الرقمية يعمل على مدار الساعة', marketType, nextOpen: null }

    case 'forex':
      return checkForexHours(now)

    case 'stock':
      return checkStockHours(now)

    case 'commodity':
      return checkCommodityHours(now)

    default:
      // Unknown market type — be conservative and allow (might be crypto variant)
      return { open: true, reason: 'نوع السوق غير محدد — يُسمح بالتداول', marketType, nextOpen: null }
  }
}

/**
 * Forex market hours:
 * Opens: Sunday 22:00 UTC (5:00 PM ET)
 * Closes: Friday 22:00 UTC (5:00 PM ET)
 * Daily break: 21:59 - 22:00 UTC (1-minute rollover, varies by broker)
 */
function checkForexHours(now: Date): {
  open: boolean
  reason: string
  marketType: MarketType
  nextOpen: Date | null
} {
  const day = now.getUTCDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const hour = now.getUTCHours()
  const minute = now.getUTCMinutes()
  const timeInMinutes = hour * 60 + minute

  // Saturday — always closed
  if (day === 6) {
    const nextOpen = getNextForexOpen(now)
    return { open: false, reason: 'سوق الفوركس مغلق — عطلة نهاية الأسبوع (السبت)', marketType: 'forex', nextOpen }
  }

  // Sunday — opens at 22:00 UTC
  if (day === 0) {
    if (timeInMinutes < 22 * 60) {
      const nextOpen = getNextForexOpen(now)
      return { open: false, reason: 'سوق الفوركس مغلق — يفتح الأحد الساعة 22:00 بتوقيت غرينتش', marketType: 'forex', nextOpen }
    }
    return { open: true, reason: 'سوق الفوركس مفتوح', marketType: 'forex', nextOpen: null }
  }

  // Friday — closes at 22:00 UTC
  if (day === 5) {
    if (timeInMinutes >= 22 * 60) {
      const nextOpen = getNextForexOpen(now)
      return { open: false, reason: 'سوق الفوركس مغلق — أُغلق الجمعة الساعة 22:00 بتوقيت غرينتش', marketType: 'forex', nextOpen }
    }
    return { open: true, reason: 'سوق الفوركس مفتوح', marketType: 'forex', nextOpen: null }
  }

  // Monday-Thursday — always open
  return { open: true, reason: 'سوق الفوركس مفتوح', marketType: 'forex', nextOpen: null }
}

/**
 * Get next forex open time from current time
 */
function getNextForexOpen(now: Date): Date {
  const day = now.getUTCDay()
  const nextOpen = new Date(now)

  if (day === 6) {
    // Saturday → Sunday 22:00
    nextOpen.setUTCDate(nextOpen.getUTCDate() + 1)
    nextOpen.setUTCHours(22, 0, 0, 0)
  } else if (day === 5) {
    // After Friday close → next Sunday 22:00
    nextOpen.setUTCDate(nextOpen.getUTCDate() + 2)
    nextOpen.setUTCHours(22, 0, 0, 0)
  } else if (day === 0) {
    // Before Sunday open → same day 22:00
    nextOpen.setUTCHours(22, 0, 0, 0)
  } else {
    // Should not reach here for forex, but default to next day
    nextOpen.setUTCDate(nextOpen.getUTCDate() + 1)
    nextOpen.setUTCHours(0, 0, 0, 0)
  }

  return nextOpen
}

/**
 * US Stock market hours:
 * Monday-Friday, 14:30-21:00 UTC (9:30 AM - 4:00 PM ET)
 * Closed on weekends and US holidays
 */
function checkStockHours(now: Date): {
  open: boolean
  reason: string
  marketType: MarketType
  nextOpen: Date | null
} {
  const day = now.getUTCDay()
  const hour = now.getUTCHours()
  const minute = now.getUTCMinutes()
  const timeInMinutes = hour * 60 + minute

  // Weekend — always closed
  if (day === 0 || day === 6) {
    const reason = day === 6
      ? 'سوق الأسهم الأمريكية مغلق — عطلة نهاية الأسبوع (السبت)'
      : 'سوق الأسهم الأمريكية مغلق — عطلة نهاية الأسبوع (الأحد)'
    const nextOpen = getNextStockOpen(now)
    return { open: false, reason, marketType: 'stock', nextOpen }
  }

  // Check US holidays (simplified — major ones only)
  if (isUSHoliday(now)) {
    const nextOpen = getNextStockOpen(now)
    return { open: false, reason: 'سوق الأسهم الأمريكية مغلق — عطلة رسمية', marketType: 'stock', nextOpen }
  }

  // Pre-market (before 14:30 UTC = 9:30 AM ET)
  if (timeInMinutes < 14 * 60 + 30) {
    const nextOpen = new Date(now)
    nextOpen.setUTCHours(14, 30, 0, 0)
    return { open: false, reason: 'سوق الأسهم الأمريكية مغلق — يفتح الساعة 14:30 بتوقيت غرينتش', marketType: 'stock', nextOpen }
  }

  // After-hours (after 21:00 UTC = 4:00 PM ET)
  if (timeInMinutes >= 21 * 60) {
    const nextOpen = getNextStockOpen(now)
    return { open: false, reason: 'سوق الأسهم الأمريكية مغلق — انتهت ساعات التداول', marketType: 'stock', nextOpen }
  }

  return { open: true, reason: 'سوق الأسهم الأمريكية مفتوح', marketType: 'stock', nextOpen: null }
}

/**
 * Commodity market hours (XAU, XAG):
 * Similar to forex: Sunday 23:00 - Friday 22:00 UTC
 */
function checkCommodityHours(now: Date): {
  open: boolean
  reason: string
  marketType: MarketType
  nextOpen: Date | null
} {
  const day = now.getUTCDay()
  const hour = now.getUTCHours()
  const minute = now.getUTCMinutes()
  const timeInMinutes = hour * 60 + minute

  // Saturday — always closed
  if (day === 6) {
    const nextOpen = new Date(now)
    nextOpen.setUTCDate(nextOpen.getUTCDate() + 1)
    nextOpen.setUTCHours(23, 0, 0, 0)
    return { open: false, reason: 'سوق السلع مغلق — عطلة نهاية الأسبوع', marketType: 'commodity', nextOpen }
  }

  // Sunday — opens at 23:00 UTC
  if (day === 0) {
    if (timeInMinutes < 23 * 60) {
      const nextOpen = new Date(now)
      nextOpen.setUTCHours(23, 0, 0, 0)
      return { open: false, reason: 'سوق السلع مغلق — يفتح الأحد الساعة 23:00 بتوقيت غرينتش', marketType: 'commodity', nextOpen }
    }
    return { open: true, reason: 'سوق السلع مفتوح', marketType: 'commodity', nextOpen: null }
  }

  // Friday — closes at 22:00 UTC
  if (day === 5) {
    if (timeInMinutes >= 22 * 60) {
      const nextOpen = new Date(now)
      nextOpen.setUTCDate(nextOpen.getUTCDate() + 2)
      nextOpen.setUTCHours(23, 0, 0, 0)
      return { open: false, reason: 'سوق السلع مغلق — أُغلق الجمعة الساعة 22:00 بتوقيت غرينتش', marketType: 'commodity', nextOpen }
    }
    return { open: true, reason: 'سوق السلع مفتوح', marketType: 'commodity', nextOpen: null }
  }

  // Monday-Thursday — always open
  return { open: true, reason: 'سوق السلع مفتوح', marketType: 'commodity', nextOpen: null }
}

function getNextStockOpen(now: Date): Date {
  const day = now.getUTCDay()
  const nextOpen = new Date(now)
  nextOpen.setUTCHours(14, 30, 0, 0)

  if (day === 6) {
    // Saturday → Monday
    nextOpen.setUTCDate(nextOpen.getUTCDate() + 2)
  } else if (day === 0) {
    // Sunday → Monday
    nextOpen.setUTCDate(nextOpen.getUTCDate() + 1)
  } else if (day === 5) {
    // Friday after hours → next Monday
    nextOpen.setUTCDate(nextOpen.getUTCDate() + 3)
  } else {
    // Weekday after hours → next day
    nextOpen.setUTCDate(nextOpen.getUTCDate() + 1)
  }

  // Skip holidays
  let maxAttempts = 10
  while (isUSHoliday(nextOpen) && maxAttempts > 0) {
    nextOpen.setUTCDate(nextOpen.getUTCDate() + 1)
    maxAttempts--
  }

  return nextOpen
}

/**
 * Simplified US holiday check
 * Only checks major holidays that affect stock trading
 */
function isUSHoliday(date: Date): boolean {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + 1 // 1-12
  const day = date.getUTCDate()

  // Fixed holidays
  if (month === 1 && day === 1) return true   // New Year's Day
  if (month === 7 && day === 4) return true   // Independence Day
  if (month === 12 && day === 25) return true  // Christmas Day

  // Thanksgiving (4th Thursday of November)
  if (month === 11) {
    const thanksgiving = getNthWeekday(year, 10, 4, 4) // November=10(0-indexed), 4th Thursday
    if (day === thanksgiving) return true
  }

  // MLK Day (3rd Monday of January)
  if (month === 1) {
    const mlkDay = getNthWeekday(year, 0, 1, 3) // January=0, 3rd Monday
    if (day === mlkDay) return true
  }

  // Presidents Day (3rd Monday of February)
  if (month === 2) {
    const presDay = getNthWeekday(year, 1, 1, 3) // February=1, 3rd Monday
    if (day === presDay) return true
  }

  // Memorial Day (last Monday of May)
  if (month === 5) {
    const memDay = getLastWeekday(year, 4, 1) // May=4, Monday
    if (day === memDay) return true
  }

  // Labor Day (1st Monday of September)
  if (month === 9) {
    const laborDay = getNthWeekday(year, 8, 1, 1) // September=8, 1st Monday
    if (day === laborDay) return true
  }

  return false
}

/** Get the date of the Nth weekday of a month */
function getNthWeekday(year: number, month: number, weekday: number, n: number): number {
  const date = new Date(Date.UTC(year, month, 1))
  let count = 0
  while (date.getUTCMonth() === month) {
    if (date.getUTCDay() === weekday) {
      count++
      if (count === n) return date.getUTCDate()
    }
    date.setUTCDate(date.getUTCDate() + 1)
  }
  return -1
}

/** Get the date of the last weekday of a month */
function getLastWeekday(year: number, month: number, weekday: number): number {
  const date = new Date(Date.UTC(year, month + 1, 0)) // Last day of month
  while (date.getUTCMonth() === month) {
    if (date.getUTCDay() === weekday) return date.getUTCDate()
    date.setUTCDate(date.getUTCDate() - 1)
  }
  return -1
}

/**
 * Get a summary of all market statuses for the dashboard
 */
export function getMarketStatusSummary(now: Date = new Date()): {
  crypto: { open: boolean; reason: string }
  forex: { open: boolean; reason: string; nextOpen: Date | null }
  stocks: { open: boolean; reason: string; nextOpen: Date | null }
  commodities: { open: boolean; reason: string; nextOpen: Date | null }
} {
  return {
    crypto: { open: true, reason: 'سوق العملات الرقمية يعمل على مدار الساعة' },
    forex: checkForexHours(now),
    stocks: checkStockHours(now),
    commodities: checkCommodityHours(now),
  }
}

/**
 * Check if a specific symbol's market is open and return Arabic status text
 */
export function getSymbolMarketStatus(symbol: string): {
  isOpen: boolean
  statusText: string
  statusColor: string
  marketType: MarketType
} {
  const { open, reason, marketType } = isMarketOpen(symbol)

  if (marketType === 'crypto') {
    return {
      isOpen: true,
      statusText: 'مفتوح 24/7',
      statusColor: T.success,
      marketType,
    }
  }

  return {
    isOpen: open,
    statusText: open ? 'السوق مفتوح' : 'السوق مغلق',
    statusColor: open ? T.success : T.danger,
    marketType,
  }
}
