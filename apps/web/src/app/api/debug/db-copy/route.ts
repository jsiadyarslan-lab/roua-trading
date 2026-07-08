/**
 * GET /api/debug/db-copy
 *
 * Copies data from Postgres-Clean (old) to Postgres-New (current DATABASE_URL).
 * Connects to old DB via RAILWAY_SERVICE_POSTGRES_CLEAN_URL env var.
 * Copies: User, AgentSettings, ExchangeCredential, Setting
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== 'Bearer emergency-cleanup-2024' && authHeader !== 'Bearer roua-admin-2024') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: any = { steps: [] };

  // Old DB connection string (internal)
  const oldDbUrl = 'postgresql://postgres:ECwmddGzeOxVuViSsKmjZXKnZTNNqVtm@postgres-clean.railway.internal:5432/railway';

  try {
    // Dynamically import pg
    const { Client } = await import('pg');
    const oldDb = new Client({
      connectionString: oldDbUrl,
      connectionTimeoutMillis: 30000,
      queryTimeout: 120000,
    });

    results.steps.push('Connecting to old DB (Postgres-Clean)...');
    await oldDb.connect();
    results.steps.push('Connected to old DB! ✅');

    // 1. Copy User table
    try {
      const users: any[] = await oldDb.query('SELECT * FROM "User"');
      results.steps.push(`Old DB Users: ${users.length}`);

      let copiedUsers = 0;
      for (const user of users) {
        try {
          await prisma.user.upsert({
            where: { id: user.id },
            create: user,
            update: user,
          });
          copiedUsers++;
        } catch (e: any) {
          // Skip if error
        }
      }
      results.steps.push(`Copied ${copiedUsers} users to new DB`);
    } catch (e: any) {
      results.steps.push(`User copy failed: ${e.message}`);
    }

    // 2. Copy AgentSettings
    try {
      const settings: any[] = await oldDb.query('SELECT * FROM "AgentSettings"');
      results.steps.push(`Old DB AgentSettings: ${settings.length}`);

      let copied = 0;
      for (const s of settings) {
        try {
          await prisma.$executeRaw`INSERT INTO "AgentSettings" ("userId", "autoTradingEnabled", "paperBalance", "maxPositionSizePercent", "maxDailyLossPercent", "maxOpenPositions", "riskPerTradePercent", "defaultStrategy", "scalpingTimeframe", "scalpingTakeProfitPips", "scalpingStopLossPips", "scalpingMaxSpread", "lazicEnabled", "lazicObiThreshold", "lazicMaxSpreadMult", "lazicMaxDailyTrades", "lazicMaxOpenPositions", "lazicCooldownMs", "lazicRiskPerTradePct") VALUES (${s.userId}, ${s.autoTradingEnabled ?? false}, ${s.paperBalance ?? 10000}, ${s.maxPositionSizePercent ?? 15}, ${s.maxDailyLossPercent ?? 5}, ${s.maxOpenPositions ?? 20}, ${s.riskPerTradePercent ?? 1.5}, ${s.defaultStrategy ?? 'AUTO'}, ${s.scalpingTimeframe ?? '5m'}, ${s.scalpingTakeProfitPips ?? 15}, ${s.scalpingStopLossPips ?? 10}, ${s.scalpingMaxSpread ?? 3}, ${s.lazicEnabled ?? false}, ${s.lazicObiThreshold ?? 0.4}, ${s.lazicMaxSpreadMult ?? 1.5}, ${s.lazicMaxDailyTrades ?? 20}, ${s.lazicMaxOpenPositions ?? 2}, ${s.lazicCooldownMs ?? 30000}, ${s.lazicRiskPerTradePct ?? 0.5}) ON CONFLICT ("userId") DO NOTHING`;
          copied++;
        } catch (e: any) {
          // Skip
        }
      }
      results.steps.push(`Copied ${copied} AgentSettings to new DB`);
    } catch (e: any) {
      results.steps.push(`AgentSettings copy failed: ${e.message}`);
    }

    // 3. Copy ExchangeCredential
    try {
      const creds: any[] = await oldDb.query('SELECT * FROM "ExchangeCredential"');
      results.steps.push(`Old DB ExchangeCredentials: ${creds.length}`);

      let copied = 0;
      for (const c of creds) {
        try {
          await prisma.exchangeCredential.upsert({
            where: { id: c.id },
            create: c,
            update: c,
          });
          copied++;
        } catch (e: any) {
          // Skip
        }
      }
      results.steps.push(`Copied ${copied} ExchangeCredentials to new DB`);
    } catch (e: any) {
      results.steps.push(`ExchangeCredential copy failed: ${e.message}`);
    }

    // 4. Copy Setting table
    try {
      const settings: any[] = await oldDb.query('SELECT * FROM "Setting"');
      results.steps.push(`Old DB Settings: ${settings.length}`);

      let copied = 0;
      for (const s of settings) {
        try {
          await prisma.setting.upsert({
            where: { key: s.key },
            create: { key: s.key, value: s.value },
            update: { value: s.value },
          });
          copied++;
        } catch (e: any) {
          // Skip
        }
      }
      results.steps.push(`Copied ${copied} Settings to new DB`);
    } catch (e: any) {
      results.steps.push(`Setting copy failed: ${e.message}`);
    }

    await oldDb.end();
    results.steps.push('Done! Old DB connection closed.');

  } catch (e: any) {
    results.steps.push(`FATAL: ${e.message}`);
  }

  return NextResponse.json(results);
}
