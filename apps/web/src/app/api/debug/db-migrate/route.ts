/**
 * GET /api/debug/db-migrate
 *
 * نسخ البيانات من Postgres-Clean (القديمة) إلى Postgres-New (الحالية DATABASE_URL).
 * يعمل من داخل شبكة Railway — يتصل بـ postgres-clean.railway.internal.
 * timeout طويل: 5 دقائق لكل عملية.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== 'Bearer emergency-cleanup-2024' && authHeader !== 'Bearer roua-admin-2024') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: any = { steps: [], errors: [] };

  // Postgres-Clean القديمة — عبر الشبكة الداخلية
  const oldDbUrl = 'postgresql://postgres:ECwmddGzeOxVuViSsKmjZXKnZTNNqVtm@postgres-clean.railway.internal:5432/railway';

  try {
    const { Client } = await import('pg');
    const oldDb = new Client({
      connectionString: oldDbUrl,
      connectionTimeoutMillis: 300000, // 5 دقائق
      query_timeout: 600000, // 10 دقائق
    });

    results.steps.push('Connecting to old DB (Postgres-Clean) via internal network...');
    await oldDb.connect();
    results.steps.push('Connected to old DB! ✅');

    // نسخ جداول مهمة فقط (ليس كل الجداول)
    const tablesToCopy = [
      { name: 'User', query: 'SELECT * FROM "User"' },
      { name: 'AgentSettings', query: 'SELECT * FROM "AgentSettings"' },
      { name: 'ExchangeCredential', query: 'SELECT * FROM "ExchangeCredential"' },
      { name: 'Setting', query: 'SELECT * FROM "Setting"' },
      { name: 'Session', query: 'SELECT * FROM "Session"' },
      { name: 'Account', query: 'SELECT * FROM "Account"' },
      { name: 'VerificationToken', query: 'SELECT * FROM "VerificationToken"' },
      { name: 'AgentSession', query: 'SELECT * FROM "AgentSession"' },
      { name: 'Portfolio', query: 'SELECT * FROM "Portfolio"' },
      { name: 'PortfolioAsset', query: 'SELECT * FROM "PortfolioAsset"' },
      { name: 'ApiKey', query: 'SELECT * FROM "ApiKey"' },
      { name: 'ChartPreference', query: 'SELECT * FROM "ChartPreference"' },
      { name: 'Subscription', query: 'SELECT * FROM "Subscription"' },
      { name: 'UserNotificationPreferences', query: 'SELECT * FROM "UserNotificationPreferences"' },
      { name: 'NotificationConfig', query: 'SELECT * FROM "NotificationConfig"' },
      { name: 'EAToken', query: 'SELECT * FROM "EAToken"' },
      { name: 'AdminSession', query: 'SELECT * FROM "AdminSession"' },
      { name: 'Challenge', query: 'SELECT * FROM "Challenge"' },
    ];

    for (const { name, query } of tablesToCopy) {
      try {
        const res = await oldDb.query(query);
        results.steps.push(`${name}: ${res.rows.length} rows found in old DB`);

        if (res.rows.length === 0) continue;

        // استخدم raw SQL للنسخ (upsert)
        let copied = 0;
        for (const row of res.rows) {
          try {
            const columns = Object.keys(row).map(c => `"${c}"`).join(', ');
            const values = Object.values(row);
            const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
            const conflictCol = row.id ? 'id' : (row.userId ? '"userId"' : (row.key ? 'key' : null));

            if (conflictCol) {
              await prisma.$executeRawUnsafe(
                `INSERT INTO "${name}" (${columns}) VALUES (${placeholders}) ON CONFLICT (${conflictCol}) DO NOTHING`,
                ...values
              );
            } else {
              await prisma.$executeRawUnsafe(
                `INSERT INTO "${name}" (${columns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
                ...values
              );
            }
            copied++;
          } catch (e: any) {
            // skip individual row errors
          }
        }
        results.steps.push(`${name}: ${copied} rows copied to new DB`);
      } catch (e: any) {
        results.errors.push(`${name}: ${e.message}`);
      }
    }

    await oldDb.end();
    results.steps.push('Migration complete!');
  } catch (e: any) {
    results.steps.push(`FATAL: ${e.message}`);
  }

  return NextResponse.json(results);
}
