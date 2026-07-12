import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD || 'roua-admin-secret-2026'
  if (!adminToken || adminToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const backup: any = {
    timestamp: new Date().toISOString(),
    tables: {},
  }

  const tablesToExport = [
    'AdminSession',
    'AgentSession',
    'Alert',
    'AutonomousTrade',
    'Challenge',
    'ChartPreference',
    'CoachAdvice',
    'ContentArticle',
    'ContentSchedule',
    'EAToken',
    'NewsArticle',
    'NotificationConfig',
    'PaperOrder',
    'PortfolioAsset',
    'PositionReconciliation',
    'PredictionEvent',
    'Signal',
    'SignalUsage',
    'StrategyReport',
    'Subscription',
    'TradingBot',
    'TradingBrief',
    'UserNotification',
    'UserNotificationPreferences',
    'VerificationToken',
    'accounts',
    'advertisements',
    'agency_events',
    'agent_logs',
    'api_keys',
    'bookmarks',
    'calendar_events',
    'chat_messages',
    'chat_sessions',
    'comments',
    'company_profiles',
    'contact_messages',
    'council_briefs',
    'discussion_replies',
    'discussions',
    'economic_events',
    'economic_reports',
    'geopolitical_events',
    'geopolitical_risks',
    'infographics',
    'market_analyses',
    'market_indicators',
    'news_fetch_logs',
    'news_item_archives',
    'news_items',
    'newsletter_subscribers',
    'notifications',
    'passkeys',
    'personalized_recommendations',
    'pipeline_runs',
    'portfolio_holdings',
    'portfolio_trades',
    'price_alerts',
    'report_subscriptions',
    'report_views',
    'reports',
    'sessions',
    'site_settings',
    'smart_alerts',
    'stock_analyses',
    'subscriptions',
    'telegram_accounts',
    'trading_signals',
    'user_profiles',
    'users',
    'verification_tokens',
    'video_reports',
    'AuditLog',
    'TradeLifecycleLog',
    'Session',
  ]

  for (const table of tablesToExport) {
    try {
      let count = 0
      try {
        const countResult = await db.$queryRawUnsafe(
          `SELECT count(*)::int as count FROM "${table}"`
        )
        count = countResult[0]?.count || 0
      } catch {
        backup.tables[table] = { error: 'table not accessible' }
        continue
      }

      if (count === 0) {
        backup.tables[table] = { count: 0, data: [] }
        continue
      }

      const limit = count > 5000 ? 1000 : count
      const data = await db.$queryRawUnsafe(
        `SELECT * FROM "${table}" LIMIT ${limit}`
      )
      backup.tables[table] = {
        count,
        sampled: count > 5000,
        sampleSize: Array.isArray(data) ? data.length : 0,
        data,
      }
    } catch (err: any) {
      backup.tables[table] = { error: err?.message?.substring(0, 200) }
    }
  }

  return NextResponse.json(backup)
}
