/**
 * notification-dispatcher.ts — خدمة إرسال التنبيهات
 *
 * تقرأ إعدادات التنبيهات من قاعدة البيانات (NotificationConfig)
 * وتُرسل الإشعارات عبر Telegram و Browser Push
 *
 * هذا هو الرابط المفقود: لوحة الإدارة تحفظ الإعدادات ← هذا الملف يقرأها ويرسل فعلياً
 */

import { db, ensureDbReady } from '@/lib/db'

// ── أنواع التنبيهات ──

export interface NotificationEvent {
  type: 'new_user' | 'subscription_upgrade' | 'system_error' | 'performance_alert' | 'large_trade' | 'system_update'
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

// ── جلب الإعدادات من قاعدة البيانات ──

async function loadConfig(): Promise<AllNotificationConfig> {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      console.warn('[notification-dispatcher] قاعدة البيانات غير متاحة')
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
    console.error('[notification-dispatcher] خطأ في جلب الإعدادات:', error?.message)
    return { telegram: null, browser: null, events: null }
  }
}

// ── إرسال عبر Telegram ──

async function sendTelegram(
  config: TelegramConfig,
  event: NotificationEvent
): Promise<boolean> {
  if (!config.botToken || !config.chatId) {
    console.warn('[notification-dispatcher] إعدادات Telegram غير مكتملة')
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
      console.log(`[notification-dispatcher] تم إرسال تنبيه Telegram: ${event.type}`)

      // تحديث عداد التنبيهات
      await updateTriggerCount('telegram')

      return true
    } else {
      const errorData = await res.json().catch(() => ({}))
      console.error(`[notification-dispatcher] فشل إرسال Telegram:`, errorData)
      return false
    }
  } catch (error: any) {
    console.error(`[notification-dispatcher] خطأ في إرسال Telegram:`, error?.message)
    return false
  }
}

// ── تحديث عداد التنبيهات ──

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

// ── الدالة الرئيسية: إرسال تنبيه ──

export async function dispatchNotification(event: NotificationEvent): Promise<{
  telegram: boolean
  browser: boolean
  skipped: boolean
}> {
  const config = await loadConfig()
  const results = { telegram: false, browser: false, skipped: false }

  // فحص هل الحدث مفعّل
  if (config.events && !config.events.enabledEvents.includes(event.type)) {
    results.skipped = true
    console.log(`[notification-dispatcher] الحدث ${event.type} غير مفعّل — تخطي`)
    return results
  }

  // إرسال عبر Telegram
  if (config.telegram) {
    results.telegram = await sendTelegram(config.telegram, event)
  }

  // إرسال عبر المتصفح — يتم عبر تسجيل الإشعار في DB ليقرأه العميل
  if (config.browser) {
    try {
      // Store for browser push pickup
      await db.auditLog.create({
        data: {
          userId: 'system',
          action: `notification:${event.type}`,
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
      console.error('[notification-dispatcher] خطأ في تسجيل إشعار المتصفح:', error?.message)
    }
  }

  // تسجيل الحدث
  console.log(
    `[notification-dispatcher] تنبيه ${event.type}: ` +
    `Telegram=${results.telegram}, Browser=${results.browser}, Skipped=${results.skipped}`
  )

  return results
}

// ── دوال مساعدة سريعة للأحداث الشائعة ──

export async function notifyNewUser(userEmail: string, displayName?: string) {
  return dispatchNotification({
    type: 'new_user',
    title: 'مستخدم جديد',
    body: `تم تسجيل مستخدم جديد: ${displayName || userEmail}\nالبريد: ${userEmail}`,
    severity: 'info',
    data: { email: userEmail, displayName },
  })
}

export async function notifySubscriptionUpgrade(userEmail: string, fromTier: string, toTier: string) {
  return dispatchNotification({
    type: 'subscription_upgrade',
    title: 'ترقية اشتراك',
    body: `المستخدم ${userEmail} رقّى اشتراكه من ${fromTier} إلى ${toTier}`,
    severity: 'success',
    data: { email: userEmail, fromTier, toTier },
  })
}

export async function notifySystemError(error: string, context?: string) {
  return dispatchNotification({
    type: 'system_error',
    title: 'خطأ في النظام',
    body: `${context ? `[${context}] ` : ''}${error.slice(0, 300)}`,
    severity: 'error',
    data: { error, context },
  })
}

export async function notifyPerformanceAlert(metric: string, value: number, threshold: number) {
  return dispatchNotification({
    type: 'performance_alert',
    title: 'تنبيه أداء',
    body: `${metric} = ${value} (الحد: ${threshold})`,
    severity: 'warning',
    data: { metric, value, threshold },
  })
}

export async function notifyLargeTrade(symbol: string, amount: number, userId: string) {
  return dispatchNotification({
    type: 'large_trade',
    title: 'صفقة كبيرة',
    body: `صفقة كبيرة على ${symbol} بمبلغ ${amount}\nالمستخدم: ${userId}`,
    severity: 'warning',
    data: { symbol, amount, userId },
  })
}

export async function notifySystemUpdate(message: string) {
  return dispatchNotification({
    type: 'system_update',
    title: 'تحديث النظام',
    body: message,
    severity: 'info',
  })
}
