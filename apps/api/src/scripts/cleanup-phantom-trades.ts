import { PrismaService } from '../common/prisma/prisma.service';
import { Logger } from '@nestjs/common';

/**
 * CLEANUP SCRIPT: Delete Phantom Trades from Database
 *
 * This script deletes all phantom positions, trades, and related data
 * that were created by auto-trading systems before the critical fixes.
 *
 * Run with: npx ts-node apps/api/src/scripts/cleanup-phantom-trades.ts
 */

async function cleanupPhantomTrades() {
  const logger = new Logger('CleanupPhantomTrades');
  const prisma = new PrismaService();

  try {
    await prisma.$connect();
    logger.log('🔧 Connected to database');

    // Step 1: Delete phantom positions
    const deletedPositions = await prisma.position.deleteMany({
      where: {
        OR: [
          { exchange: 'paper-trading' },
          { source: { in: ['smart_executor', 'agent', 'paper_trading', 'auto_paper'] } },
        ],
      },
    });
    logger.log(`🗑️ Deleted ${deletedPositions.count} phantom position(s)`);

    // Step 2: Delete phantom trades
    const deletedTrades = await prisma.trade.deleteMany({
      where: {
        OR: [
          { exchange: 'paper-trading' },
          { source: { in: ['smart_executor', 'agent', 'paper_trading', 'auto_paper'] } },
        ],
      },
    });
    logger.log(`🗑️ Deleted ${deletedTrades.count} phantom trade(s)`);

    // Step 3: Delete paper-trading credentials
    const deletedCredentials = await prisma.exchangeCredential.deleteMany({
      where: { exchange: 'paper-trading' },
    });
    logger.log(`🗑️ Deleted ${deletedCredentials.count} paper-trading credential(s)`);

    // Step 4: Delete autonomous trades
    const deletedAutonomousTrades = await prisma.autonomousTrade.deleteMany({
      where: { source: { in: ['smart_executor', 'agent', 'auto_paper'] } },
    });
    logger.log(`🗑️ Deleted ${deletedAutonomousTrades.count} autonomous trade(s)`);

    // Step 5: Delete paper orders
    const deletedPaperOrders = await prisma.paperOrder.deleteMany({
      where: { source: { in: ['smart_executor', 'agent', 'auto_paper'] } },
    });
    logger.log(`🗑️ Deleted ${deletedPaperOrders.count} paper order(s)`);

    // Step 6: Stop all running agent sessions
    const stoppedAgentSessions = await prisma.agentSession.updateMany({
      where: { status: { in: ['RUNNING', 'PAUSED', 'DAILY_LIMIT_REACHED'] } },
      data: { status: 'STOPPED', updatedAt: new Date() },
    });
    logger.log(`⏹️ Stopped ${stoppedAgentSessions.count} agent session(s)`);

    // Step 7: Delete AI briefs
    const deletedBriefs = await prisma.aiBrief.deleteMany({
      where: { source: { in: ['smart_executor', 'agent', 'auto_paper'] } },
    });
    logger.log(`🗑️ Deleted ${deletedBriefs.count} AI brief(s)`);

    // Verification queries
    const remainingPositions = await prisma.position.count({
      where: {
        OR: [
          { exchange: 'paper-trading' },
          { source: { in: ['smart_executor', 'agent', 'paper_trading', 'auto_paper'] } },
        ],
      },
    });

    const remainingTrades = await prisma.trade.count({
      where: {
        OR: [
          { exchange: 'paper-trading' },
          { source: { in: ['smart_executor', 'agent', 'paper_trading', 'auto_paper'] } },
        ],
      },
    });

    const remainingCredentials = await prisma.exchangeCredential.count({
      where: { exchange: 'paper-trading' },
    });

    const runningSessions = await prisma.agentSession.count({
      where: { status: { in: ['RUNNING', 'PAUSED', 'DAILY_LIMIT_REACHED'] } },
    });

    logger.log('✅ Cleanup completed');
    logger.log(`📊 Remaining phantom positions: ${remainingPositions}`);
    logger.log(`📊 Remaining phantom trades: ${remainingTrades}`);
    logger.log(`📊 Remaining paper credentials: ${remainingCredentials}`);
    logger.log(`📊 Running agent sessions: ${runningSessions}`);

  } catch (error) {
    logger.error('❌ Cleanup failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupPhantomTrades();
