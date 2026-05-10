import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupPhantomTrades() {
  console.log('🔧 Starting phantom trades cleanup...');

  try {
    // Step 1: Delete phantom positions
    const deletedPositions = await prisma.position.deleteMany({
      where: {
        OR: [
          { exchange: 'paper-trading' },
          { source: { in: ['smart_executor', 'agent', 'paper_trading', 'auto_paper'] } },
        ],
      },
    });
    console.log(`🗑️ Deleted ${deletedPositions.count} phantom position(s)`);

    // Step 2: Delete phantom trades
    const deletedTrades = await prisma.trade.deleteMany({
      where: {
        OR: [
          { exchange: 'paper-trading' },
          { source: { in: ['smart_executor', 'agent', 'paper_trading', 'auto_paper'] } },
        ],
      },
    });
    console.log(`🗑️ Deleted ${deletedTrades.count} phantom trade(s)`);

    // Step 3: Delete paper-trading credentials
    const deletedCredentials = await prisma.exchangeCredential.deleteMany({
      where: { exchange: 'paper-trading' },
    });
    console.log(`🗑️ Deleted ${deletedCredentials.count} paper-trading credential(s)`);

    // Step 4: Delete autonomous trades
    const deletedAutonomousTrades = await prisma.autonomousTrade.deleteMany({
      where: { source: { in: ['smart_executor', 'agent', 'auto_paper'] } },
    });
    console.log(`🗑️ Deleted ${deletedAutonomousTrades.count} autonomous trade(s)`);

    // Step 5: Delete paper orders
    const deletedPaperOrders = await prisma.paperOrder.deleteMany({
      where: { source: { in: ['smart_executor', 'agent', 'auto_paper'] } },
    });
    console.log(`🗑️ Deleted ${deletedPaperOrders.count} paper order(s)`);

    // Step 6: Stop all running agent sessions
    const stoppedAgentSessions = await prisma.agentSession.updateMany({
      where: { status: { in: ['RUNNING', 'PAUSED', 'DAILY_LIMIT_REACHED'] } },
      data: { status: 'STOPPED', updatedAt: new Date() },
    });
    console.log(`⏹️ Stopped ${stoppedAgentSessions.count} agent session(s)`);

    // Step 7: Delete AI briefs
    const deletedBriefs = await prisma.aiBrief.deleteMany({
      where: { source: { in: ['smart_executor', 'agent', 'auto_paper'] } },
    });
    console.log(`🗑️ Deleted ${deletedBriefs.count} AI brief(s)`);

    // Verification
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

    console.log('✅ Cleanup completed');
    console.log(`📊 Remaining phantom positions: ${remainingPositions}`);
    console.log(`📊 Remaining phantom trades: ${remainingTrades}`);

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupPhantomTrades();
