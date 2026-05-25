/**
 * notification-dispatcher.ts — Notification Dispatch Service
 *
 * Reads notification settings from the database (NotificationConfig)
 * and sends notifications via Telegram and Browser Push
 *
 * This is the missing link: Admin panel saves settings ← this file reads and sends
 */

import { db, ensureDbReady } from '@/lib/db'

// ── Notification types ──

export interface NotificationEvent {
  type: 'new_user' | 'subscription_upgrade' | 'system_error' | 'performance_alert' | 'large_trade' | 'system_update' | 'new_report'
  title: string
  body: string
  severity?: 'info' | 'warning' | 'error' | 'success'
  data?: Record<string, any>
}

interface TelegramConfig {
  enabled: boolean
  botToken: string
  chatId: string
}

interface BrowserConfig {
  enabled: boolean
}

interface EventsConfig {
  enabledEvents: string[]
}

interface AllNotificationConfig {
  telegram: TelegramConfig | null
  browser: BrowserConfig | null
  events: EventsConfig | null
}

// ── Load config from database ──

async function loadConfig(): Promise<AllNotificationConfig> {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      console.warn('[notification-dispatcher] Database unavailable')
      return { telegram: null, browser: null, events: null }
    }

    const configs = await db.notificationConfig.findMany()

    const telegramRow = configs.find(c => c.type === 'telegram')
    const browserRow = configs.find(c => c.type === 'browser')
    const eventsRow = configs.find(c => c.type === 'events')

    let telegram: TelegramConfig | null = null
    if (telegramRow && telegramRow.enabled) {
      const parsed = JSON.parse(telegramRow.config || '{}')
      telegram = {
        enabled: true,
        botToken: parsed.botToken || '',
        chatId: parsed.chatId || '',
      }
    }

    let browser: BrowserConfig | null = null
    if (browserRow && browserRow.enabled) {
      browser = { enabled: true }
    }

    let events: EventsConfig | null = null
    if (eventsRow) {
      const parsed = JSON.parse(eventsRow.config || '{}')
      events = {
        enabledEvents: parsed.enabledEvents || [],
      }
    }

    return { telegram, browser, events }
  } catch (error: any) {
    console.error('[notification-dispatcher] Error loading config:', error?.message)
    return { telegram: null, browser: null, events: null }
  }
}

// ── Send via Telegram ──

async function sendTelegram(
  config: TelegramConfig,
  event: NotificationEvent
): Promise<boolean> {
  if (!config.botToken || !config.chatId) {
    console.warn('[notification-dispatcher] Telegram config incomplete')
    return false
  }

  const severityEmoji: Record<string, string> = {
    info: 'ℹ️',
    warning: '⚠️',
    error: '🚨',
    success: '✅',
  }

  const emoji = severityEmoji[event.severity || 'info']

  const message = [
    `${emoji} <b>${event.title}</b>`,
    '',
    event.body,
    '',
    `🕐 ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`,
  ].join('\n')

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    const res = await fetch(
      `https://api.telegram.org/bot${config.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.chatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      }
    )

    clearTimeout(timeout)

    if (res.ok) {
      console.log(`[notification-dispatcher] Telegram alert sent: ${event.type}`)

      // Update alert counter
      await updateTriggerCount('telegram')

      return true
    } else {
      const errorData = await res.json().catch(() => ({}))
      console.error(`[notification-dispatcher] Telegram send failed:`, errorData)
      return false
    }
  } catch (error: any) {
    console.error(`[notification-dispatcher] Telegram send error:`, error?.message)
    return false
  }
}

// ── Update alert counter ──

async function updateTriggerCount(type: string): Promise<void> {
  try {
    await db.notificationConfig.update({
      where: { type },
      data: {
        lastTriggeredAt: new Date(),
        triggerCount: { increment: 1 },
      },
    })
  } catch {
    // Non-critical — don't fail the notification
  }
}

// ── Main dispatch function ──

export async function dispatchNotification(event: NotificationEvent): Promise<{
  telegram: boolean
  browser: boolean
  skipped: boolean
}> {
  const config = await loadConfig()
  const results = { telegram: false, browser: false, skipped: false }

  // Check if event is enabled
  if (config.events && !config.events.enabledEvents.includes(event.type)) {
    results.skipped = true
    console.log(`[notification-dispatcher] Event ${event.type} not enabled — skipping`)
    return results
  }

  // Send via Telegram
  if (config.telegram) {
    results.telegram = await sendTelegram(config.telegram, event)
  }

  // Send via browser — store in DB for client pickup
  if (config.browser) {
    try {
      // Store for browser push pickup
      await db.auditLog.create({
        data: {
          userId: 'system',
          action: `notification:${event.type}`,
          resource: 'notification',
          details: JSON.stringify({
            title: event.title,
            body: event.body,
            severity: event.severity,
            source: event.type,
            data: event.data || {},
            read: false,
            createdAt: new Date().toISOString(),
          }),
        },
      })

      await updateTriggerCount('browser')
      results.browser = true
    } catch (error: any) {
      console.error('[notification-dispatcher] Error storing browser notification:', error?.message)
    }
  }

  // Log result
  console.log(
    `[notification-dispatcher] Alert ${event.type}: Telegram=${results.telegram}, Browser=${results.browser}, Skipped=${results.skipped}`
  )

  return results
}

// ── Helper functions for common events ──

export async function notifyNewUser(userEmail: string, displayName?: string) {
  return dispatchNotification({
    type: 'new_user',
    title: 'New User',
    body: `New user registered: ${displayName || userEmail}\nEmail: ${userEmail}`,
    severity: 'info',
    data: { email: userEmail, displayName },
  })
}

export async function notifySubscriptionUpgrade(userEmail: string, fromTier: string, toTier: string) {
  return dispatchNotification({
    type: 'subscription_upgrade',
    title: 'Subscription Upgrade',
    body: `User ${userEmail} upgraded from ${fromTier} to ${toTier}`,
    severity: 'success',
    data: { email: userEmail, fromTier, toTier },
  })
}

export async function notifySystemError(error: string, context?: string) {
  return dispatchNotification({
    type: 'system_error',
    title: 'System Error',
    body: `${context ? `[${context}] ` : ''}${error.slice(0, 300)}`,
    severity: 'error',
    data: { error, context },
  })
}

export async function notifyPerformanceAlert(metric: string, value: number, threshold: number) {
  return dispatchNotification({
    type: 'performance_alert',
    title: 'Performance Alert',
    body: `${metric} = ${value} (Threshold: ${threshold})`,
    severity: 'warning',
    data: { metric, value, threshold },
  })
}

export async function notifyLargeTrade(symbol: string, amount: number, userId: string) {
  return dispatchNotification({
    type: 'large_trade',
    title: 'Large Trade',
    body: `Large trade on ${symbol} for ${amount}\nUser: ${userId}`,
    severity: 'warning',
    data: { symbol, amount, userId },
  })
}

export async function notifySystemUpdate(message: string) {
  return dispatchNotification({
    type: 'system_update',
    title: 'System Update',
    body: message,
    severity: 'info',
  })
}

export async function notifyNewReport(titleAr: string, type: string, category: string, symbols: string[]) {
  const typeEmojis: Record<string, string> = {
    ARTICLE: '📰',
    ANALYSIS: '📊',
    NEWS_DIGEST: '📋',
    MARKET_REPORT: '📈',
    EDUCATIONAL: '📚',
    OPINION: '💡',
    BREAKING: '🚨',
    HOURLY_UPDATE: '⏱️',
    WEEKLY_REVIEW: '📅',
    PAIR_ANALYSIS: '💹',
  }
  const emoji = typeEmojis[type] || '📄'
  const symbolsStr = symbols.length > 0 ? symbols.join(', ') : '—'

  return dispatchNotification({
    type: 'new_report',
    title: `${emoji} New Report`,
    body: `📌 ${titleAr}\n📂 Category: ${category}\n🏷️ Assets: ${symbolsStr}\n\n⚠️ This content is for educational purposes only and does not constitute investment advice`,
    severity: 'info',
    data: { titleAr, type, category, symbols },
  })
}
