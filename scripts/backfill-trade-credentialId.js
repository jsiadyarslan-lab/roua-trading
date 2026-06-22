#!/usr/bin/env node
/**
 * V334: Backfill NULL credentialId on Trade records
 *
 * Problem:
 *   Before V205 migration, Trade records had no credentialId column.
 *   After V205 added it (as nullable String?), old trades kept NULL.
 *   getTradeHistory used `OR: [{ credentialId }, { credentialId: null }]`
 *   to include legacy trades — but this mixed trades from different accounts.
 *
 * Fix:
 *   This script retroactively assigns a credentialId to NULL trades by
 *   correlating them with their parent Position (via positionId).
 *   - If a Trade has a positionId, copy the credentialId from that Position.
 *   - If a Trade has no positionId (orphan), copy from the user's FIRST
 *     ExchangeCredential (oldest one). If the user has no credentials,
 *     log a warning and skip — we cannot safely assign a credentialId.
 *
 * Safety:
 *   - DRY-RUN by default. Prints what it WOULD do without writing.
 *   - Use --apply to actually write to the database.
 *   - Only updates rows WHERE "credentialId" IS NULL.
 *   - Logs every update with trade id + assigned credentialId.
 *
 * Usage:
 *   node scripts/backfill-trade-credentialId.js            # dry-run
 *   node scripts/backfill-trade-credentialId.js --apply    # write
 *
 * Environment:
 *   Requires DATABASE_URL in .env (or env var).
 */

const { PrismaClient } = require('@prisma/client');

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

async function main() {
  console.log(`\n[V334] Trade credentialId backfill — mode: ${APPLY ? 'APPLY (write)' : 'DRY-RUN (read-only)'}\n`);

  // 1. Count NULL-credentialId trades
  const nullCount = await prisma.trade.count({
    where: { credentialId: null },
  });
  console.log(`[1/4] Found ${nullCount} Trade records with credentialId=NULL`);

  if (nullCount === 0) {
    console.log('\n✅ Nothing to backfill. All Trade records already have a credentialId.');
    return;
  }

  // 2. Group NULL trades by userId
  const nullTradesByUser = await prisma.trade.groupBy({
    by: ['userId'],
    where: { credentialId: null },
    _count: { _all: true },
    orderBy: { _count: { userId: 'desc' } },
  });
  console.log(`[2/4] Affected users: ${nullTradesByUser.length}`);
  nullTradesByUser.forEach(u => {
    console.log(`       - User ${u.userId.slice(0, 12)}... : ${u._count._all} NULL trades`);
  });

  // 3. For each user, find their ExchangeCredentials
  let totalFixed = 0;
  let totalSkipped = 0;
  const skippedReasons = { noCredential: 0, noPositionNoCredential: 0 };

  for (const userGroup of nullTradesByUser) {
    const userId = userGroup.userId;

    // Get all NULL trades for this user, with their positionId if any
    const nullTrades = await prisma.trade.findMany({
      where: { userId, credentialId: null },
      select: { id: true, positionId: true, symbol: true, executedAt: true },
      orderBy: { executedAt: 'asc' },
    });

    // Get all user's ExchangeCredentials (oldest first)
    const userCreds = await prisma.exchangeCredential.findMany({
      where: { userId },
      select: { id: true, exchange: true, createdAt: true, isValid: true },
      orderBy: { createdAt: 'asc' },
    });

    if (userCreds.length === 0) {
      console.log(`\n  ⚠️  User ${userId.slice(0, 12)}... has ${nullTrades.length} NULL trades but NO ExchangeCredentials — skipping all`);
      skippedReasons.noCredential += nullTrades.length;
      totalSkipped += nullTrades.length;
      continue;
    }

    // Preferred credential: user's active setting, else first valid one, else first one
    let activeCredId = null;
    try {
      const activeSetting = await prisma.setting.findUnique({
        where: { key: `user:${userId}:activeCredentialId` },
        select: { value: true },
      });
      if (activeSetting?.value) {
        // Setting.value is JSON-encoded — strip quotes if present
        activeCredId = activeSetting.value.replace(/^"|"$/g, '');
      }
    } catch { /* Setting table may not exist — ignore */ }

    let activeCred;
    if (activeCredId) {
      activeCred = userCreds.find(c => c.id === activeCredId);
    }
    if (!activeCred) {
      activeCred = userCreds.find(c => c.isValid) || userCreds[0];
    }
    console.log(`\n  User ${userId.slice(0, 12)}... : ${nullTrades.length} NULL trades, ${userCreds.length} credentials`);
    console.log(`    Fallback credential: ${activeCred.id.slice(0, 12)}... (${activeCred.exchange}, valid=${activeCred.isValid}${activeCredId === activeCred.id ? ', active=user-setting' : ''})`);

    // For each NULL trade, try to get credentialId from its Position
    let userFixed = 0;
    let userSkipped = 0;
    const updates = []; // { tradeId, credentialId, source: 'position' | 'fallback' }

    for (const trade of nullTrades) {
      let credId = null;
      let source = '';

      if (trade.positionId) {
        // Try to get credentialId from the parent Position
        const position = await prisma.position.findUnique({
          where: { id: trade.positionId },
          select: { credentialId: true },
        });
        if (position?.credentialId) {
          credId = position.credentialId;
          source = 'position';
        }
      }

      if (!credId) {
        // Fallback: use the user's preferred credential
        credId = activeCred.id;
        source = 'fallback';
      }

      updates.push({ tradeId: trade.id, credentialId: credId, source, symbol: trade.symbol });
    }

    // Apply updates
    if (APPLY) {
      for (const u of updates) {
        await prisma.trade.update({
          where: { id: u.tradeId },
          data: { credentialId: u.credentialId },
        });
        userFixed++;
      }
    } else {
      userFixed = updates.length;
    }

    // Log summary for this user
    const fromPosition = updates.filter(u => u.source === 'position').length;
    const fromFallback = updates.filter(u => u.source === 'fallback').length;
    console.log(`    ${APPLY ? 'Updated' : 'Would update'}: ${userFixed} trades (${fromPosition} from Position, ${fromFallback} from fallback)`);
    if (fromFallback > 0) {
      console.log(`    ⚠️  ${fromFallback} trades had no positionId — assigned to fallback credential. Review manually if needed.`);
    }

    totalFixed += userFixed;
    totalSkipped += userSkipped;
  }

  // 4. Summary
  console.log(`\n[3/4] ${APPLY ? 'Updated' : 'Would update'}: ${totalFixed} trades`);
  console.log(`[4/4] Skipped: ${totalSkipped} trades (no credentials found)`);

  if (skippedReasons.noCredential > 0) {
    console.log(`\n⚠️  ${skippedReasons.noCredential} trades could not be backfilled because the user has no ExchangeCredentials.`);
    console.log('    These trades will remain with credentialId=NULL and will only appear in "all accounts" view.');
  }

  if (!APPLY) {
    console.log('\n📋 This was a DRY-RUN. To apply changes, run:');
    console.log('   node scripts/backfill-trade-credentialId.js --apply\n');
  } else {
    console.log('\n✅ Backfill complete.\n');
  }
}

main()
  .catch((e) => {
    console.error('❌ Backfill failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
