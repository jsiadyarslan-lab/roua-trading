import { NextResponse } from 'next/server';

/**
 * POST /api/admin/db-migrate
 * One-time endpoint to add missing columns directly to the production database.
 * This bypasses Prisma migrations which may not have been applied yet.
 *
 * Security: Only adds columns IF NOT EXISTS — safe to run multiple times.
 */
export async function POST() {
  const results: { column: string; status: string; detail?: string }[] = [];

  // Get the production DATABASE_URL
  const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL;
  if (!dbUrl || dbUrl.startsWith('file:')) {
    // Local SQLite — just skip, the column should exist via prisma db push
    results.push({ column: 'skip', status: 'local_db', detail: 'DATABASE_URL is SQLite, skipping' });
    return NextResponse.json({ success: true, results });
  }

  // Import pg dynamically
  let pg: any;
  try {
    pg = await import('pg');
  } catch {
    return NextResponse.json({
      success: false,
      error: 'pg module not available',
    }, { status: 500 });
  }

  const { Client } = pg;
  const client = new Client({
    connectionString: dbUrl,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
  });

  try {
    await client.connect();

    // ── Add exitPrice column to Position table ──
    try {
      await client.query(`
        ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "exitPrice" Decimal(18,8);
      `);
      results.push({ column: 'Position.exitPrice', status: 'added' });
    } catch (e: any) {
      results.push({ column: 'Position.exitPrice', status: 'error', detail: e.message });
    }

    // ── Verify the column exists ──
    try {
      const check = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'Position' AND column_name = 'exitPrice';
      `);
      if (check.rows.length > 0) {
        results.push({ column: 'Position.exitPrice', status: 'verified' });
      } else {
        results.push({ column: 'Position.exitPrice', status: 'missing_after_add' });
      }
    } catch (e: any) {
      results.push({ column: 'Position.exitPrice', status: 'verify_error', detail: e.message });
    }

    // ── Also mark the migration as applied in _prisma_migrations ──
    try {
      await client.query(`
        INSERT INTO "_prisma_migrations" (id, checksum, migration_name, logs, started_at, finished_at, applied_steps_count)
        VALUES (
          gen_random_uuid(),
          'manual-v140e',
          '20260518000000_add_position_exit_price',
          NULL,
          NOW(),
          NOW(),
          1
        ) ON CONFLICT (migration_name) DO NOTHING;
      `);
      results.push({ column: '_prisma_migrations', status: 'recorded' });
    } catch (e: any) {
      // Non-fatal — the column is already added above
      results.push({ column: '_prisma_migrations', status: 'skip', detail: e.message?.substring(0, 100) });
    }

  } catch (e: any) {
    return NextResponse.json({
      success: false,
      error: e.message,
      results,
    }, { status: 500 });
  } finally {
    try { await client.end(); } catch {}
  }

  return NextResponse.json({ success: true, results });
}
