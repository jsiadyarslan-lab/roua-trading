/**
 * GET /api/debug/db-cleanup-safe
 *
 * Safe DB cleanup: deletes old rows from 18 non-essential tables.
 * Uses raw pg connection (NOT PrismaClient) to avoid connection pool issues.
 * Only deletes rows older than retention period.
 * Does NOT touch: User, Position, Trade, Order, AgentSettings, etc.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== 'Bearer emergency-cleanup-2024' && authHeader !== 'Bearer roua-admin-2024') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: any = { steps: [], deleted: 0, errors: [] };

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 500 });
  }

  try {
    const { Client } = await import('pg');
    const client = new Client({
      connectionString: dbUrl,
      connectionTimeoutMillis: 10000,
      query_timeout: 300000, // 5 minutes
    });

    await client.connect();
    results.steps.push('Connected to DB ✅');

    const tables = [
      { name: 'RiskEvent', dateField: 'createdAt', days: 3 },
      { name: 'AuditLog', dateField: 'createdAt', days: 7 },
      { name: 'AiUsageLog', dateField: 'createdAt', days: 7 },
      { name: 'OrderEvent', dateField: 'timestamp', days: 14 },
      { name: 'TradeLifecycleLog', dateField: 'createdAt', days: 14 },
      { name: 'PositionReconciliation', dateField: 'createdAt', days: 14 },
      { name: 'MarketRegimeSnapshot', dateField: 'createdAt', days: 14 },
      { name: 'SystemMemory', dateField: 'createdAt', days: 14 },
      { name: 'CouncilVoteAccuracy', dateField: 'createdAt', days: 14 },
      { name: 'TradeJournal', dateField: 'createdAt', days: 30 },
      { name: 'CrossPairCorrelation', dateField: 'createdAt', days: 14 },
      { name: 'AdaptiveSchedule', dateField: 'createdAt', days: 14 },
      { name: 'NewsArticle', dateField: 'createdAt', days: 30 },
      { name: 'ContentArticle', dateField: 'createdAt', days: 30 },
      { name: 'ContentSchedule', dateField: 'createdAt', days: 14 },
      { name: 'StrategyReport', dateField: 'createdAt', days: 30 },
      { name: 'Alert', dateField: 'createdAt', days: 14 },
      { name: 'UserNotification', dateField: 'createdAt', days: 14 },
    ];

    for (const { name, dateField, days } of tables) {
      try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        const result = await client.query(
          `DELETE FROM "${name}" WHERE "${dateField}" < $1`,
          [cutoff.toISOString()]
        );

        const deleted = result.rowCount || 0;
        results.deleted += deleted;
        if (deleted > 0) {
          results.steps.push(`🗑️ ${name}: ${deleted} rows deleted (older than ${days} days)`);
        }
      } catch (err: any) {
        results.errors.push(`${name}: ${err.message}`);
      }
    }

    // VACUUM (not FULL — safe, no table lock)
    for (const { name } of tables) {
      try {
        await client.query(`VACUUM "${name}"`);
      } catch {}
    }
    results.steps.push('VACUUM done ✅');

    await client.end();
    results.steps.push(`Total deleted: ${results.deleted} rows`);
  } catch (err: any) {
    results.steps.push(`FATAL: ${err.message}`);
  }

  return NextResponse.json(results);
}
