/**
 * GET /api/debug/db-cleanup
 *
 * EMERGENCY: Cleans up old DB rows AND runs VACUUM FULL to reclaim disk space.
 * This is needed because DELETE alone doesn't shrink the physical disk usage
 * in PostgreSQL — VACUUM FULL is required.
 *
 * WARNING: VACUUM FULL locks tables temporarily. Run during low-traffic periods.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  // EMERGENCY: temporarily accept any of these secrets
  const authHeader = req.headers.get('authorization');
  const adminSecret = process.env.ADMIN_PASSWORD || 'roua-admin-2024';
  const emergencySecrets = [adminSecret, 'roua-admin-2024', 'emergency-cleanup-2024'];
  if (!authHeader || !emergencySecrets.includes(authHeader.replace('Bearer ', ''))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: { table: string; deleted: number; vacuumed: boolean }[] = [];
  const errors: string[] = [];

  // Tables to clean with retention days
  const cleanupTables = [
    { table: 'RiskEvent', dateField: 'createdAt', days: 3 },
    { table: 'AuditLog', dateField: 'createdAt', days: 7 },
    { table: 'AiUsageLog', dateField: 'createdAt', days: 7 },
    { table: 'OrderEvent', dateField: 'timestamp', days: 14 },
    { table: 'TradeLifecycleLog', dateField: 'createdAt', days: 14 },
    { table: 'PositionReconciliation', dateField: 'createdAt', days: 14 },
    { table: 'MarketRegimeSnapshot', dateField: 'createdAt', days: 14 },
    { table: 'SystemMemory', dateField: 'createdAt', days: 14 },
    { table: 'CouncilVoteAccuracy', dateField: 'createdAt', days: 14 },
    { table: 'TradeJournal', dateField: 'createdAt', days: 30 },
    { table: 'CrossPairCorrelation', dateField: 'createdAt', days: 14 },
    { table: 'AdaptiveSchedule', dateField: 'createdAt', days: 14 },
    { table: 'NewsArticle', dateField: 'createdAt', days: 30 },
    { table: 'ContentArticle', dateField: 'createdAt', days: 30 },
    { table: 'ContentSchedule', dateField: 'createdAt', days: 14 },
    { table: 'StrategyReport', dateField: 'createdAt', days: 30 },
    { table: 'Alert', dateField: 'createdAt', days: 14 },
    { table: 'UserNotification', dateField: 'createdAt', days: 14 },
  ];

  // Step 1: Delete old rows from each table
  for (const { table, dateField, days } of cleanupTables) {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const result = await prisma.$executeRaw`
        DELETE FROM "${table}"
        WHERE "${dateField}" < ${cutoff}
      `;

      results.push({ table, deleted: result, vacuumed: false });
      console.log(`[db-cleanup] ${table}: ${result} rows deleted (older than ${days} days)`);
    } catch (err: any) {
      errors.push(`${table}: ${err.message}`);
    }
  }

  // Step 2: VACUUM FULL on the largest tables to reclaim disk space
  const vacuumTables = [
    'RiskEvent',
    'AuditLog',
    'AiUsageLog',
    'OrderEvent',
    'TradeLifecycleLog',
    'PositionReconciliation',
    'MarketRegimeSnapshot',
    'SystemMemory',
    'CouncilVoteAccuracy',
    'TradeJournal',
    'CrossPairCorrelation',
    'AdaptiveSchedule',
    'NewsArticle',
    'ContentArticle',
    'ContentSchedule',
    'StrategyReport',
    'Alert',
    'UserNotification',
  ];

  for (const table of vacuumTables) {
    try {
      // VACUUM FULL cannot run inside a transaction block
      await prisma.$executeRawUnsafe(`VACUUM FULL "${table}"`);
      const existing = results.find(r => r.table === table);
      if (existing) existing.vacuumed = true;
      console.log(`[db-cleanup] VACUUM FULL ${table}: done`);
    } catch (err: any) {
      errors.push(`VACUUM ${table}: ${err.message}`);
    }
  }

  // Step 3: Get DB size after cleanup
  let dbSizeAfter = 'unknown';
  try {
    const sizeResult: any[] = await prisma.$queryRaw`
      SELECT pg_size_pretty(pg_database_size('railway')) as size
    `;
    dbSizeAfter = sizeResult[0]?.size || 'unknown';
  } catch {}

  const totalDeleted = results.reduce((sum, r) => sum + r.deleted, 0);

  return NextResponse.json({
    success: true,
    totalDeleted,
    dbSizeAfter,
    results,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: new Date().toISOString(),
  });
}
