const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log("=== DATABASE ANALYSIS ===\n");
  
  // 1. Users
  const userCount = await prisma.user.count();
  console.log(`Users: ${userCount}`);
  const users = await prisma.user.findMany({ select: { id: true, email: true, tier: true, createdAt: true } });
  users.forEach(u => console.log(`  - ${u.email} (${u.tier}) created: ${u.createdAt}`));
  
  // 2. Signals
  const signalCount = await prisma.signal.count();
  console.log(`\nSignals: ${signalCount}`);
  
  if (signalCount > 0) {
    const signalsByAction = await prisma.signal.groupBy({ by: ['action'], _count: true });
    console.log("  By Action:", JSON.stringify(signalsByAction));
    
    const signalsByStatus = await prisma.signal.groupBy({ by: ['status'], _count: true });
    console.log("  By Status:", JSON.stringify(signalsByStatus));
    
    const recentSignals = await prisma.signal.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, pair: true, action: true, confidence: true, status: true, reason: true, entryPrice: true, stopLoss: true, takeProfit: true, createdAt: true }
    });
    console.log("\n  Recent 20 Signals:");
    recentSignals.forEach(s => {
      console.log(`  ${s.createdAt.toISOString().slice(0,16)} | ${s.pair} | ${s.action} | conf:${s.confidence} | ${s.status} | entry:${s.entryPrice} | SL:${s.stopLoss} | TP:${s.takeProfit}`);
      console.log(`    Reason: ${(s.reason || '').substring(0, 120)}`);
    });
    
    // Signal confidence distribution
    const allSignals = await prisma.signal.findMany({ select: { confidence: true, action: true } });
    const confBuckets = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
    allSignals.forEach(s => {
      if (s.confidence <= 20) confBuckets['0-20']++;
      else if (s.confidence <= 40) confBuckets['21-40']++;
      else if (s.confidence <= 60) confBuckets['41-60']++;
      else if (s.confidence <= 80) confBuckets['61-80']++;
      else confBuckets['81-100']++;
    });
    console.log("\n  Confidence Distribution:", JSON.stringify(confBuckets));
    
    // Pairs distribution
    const signalsByPair = await prisma.signal.groupBy({ by: ['pair'], _count: true, orderBy: { _count: { pair: 'desc' } } });
    console.log("  By Pair:", JSON.stringify(signalsByPair));
  }
  
  // 3. Trades
  const tradeCount = await prisma.trade.count();
  console.log(`\nTrades: ${tradeCount}`);
  
  if (tradeCount > 0) {
    const tradesBySide = await prisma.trade.groupBy({ by: ['side'], _count: true });
    console.log("  By Side:", JSON.stringify(tradesBySide));
    
    const tradesBySource = await prisma.trade.groupBy({ by: ['source'], _count: true });
    console.log("  By Source:", JSON.stringify(tradesBySource));
    
    const tradesByType = await prisma.trade.groupBy({ by: ['type'], _count: true });
    console.log("  By Type:", JSON.stringify(tradesByType));
    
    const tradesBySymbol = await prisma.trade.groupBy({ by: ['symbol'], _count: true, orderBy: { _count: { symbol: 'desc' } } });
    console.log("  By Symbol:", JSON.stringify(tradesBySymbol));
    
    // PnL analysis
    const trades = await prisma.trade.findMany({
      select: { pnl: true, side: true, source: true, symbol: true, price: true, quantity: true, fee: true, executedAt: true }
    });
    
    const totalPnl = trades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
    const totalFees = trades.reduce((sum, t) => sum + (Number(t.fee) || 0), 0);
    const wins = trades.filter(t => Number(t.pnl) > 0);
    const losses = trades.filter(t => Number(t.pnl) < 0);
    const neutrals = trades.filter(t => Number(t.pnl) === 0 || t.pnl === null);
    
    console.log(`\n  Total PnL: $${totalPnl.toFixed(4)}`);
    console.log(`  Total Fees: $${totalFees.toFixed(4)}`);
    console.log(`  Net PnL: $${(totalPnl - totalFees).toFixed(4)}`);
    console.log(`  Wins: ${wins.length}, Losses: ${losses.length}, Neutral: ${neutrals.length}`);
    if (wins.length > 0) console.log(`  Avg Win: $${(wins.reduce((s,t) => s + Number(t.pnl), 0) / wins.length).toFixed(4)}`);
    if (losses.length > 0) console.log(`  Avg Loss: $${(losses.reduce((s,t) => s + Number(t.pnl), 0) / losses.length).toFixed(4)}`);
    console.log(`  Win Rate: ${trades.length > 0 ? ((wins.length / (wins.length + losses.length)) * 100).toFixed(1) : 0}%`);
    
    // Recent trades
    const recentTrades = await prisma.trade.findMany({
      orderBy: { executedAt: 'desc' },
      take: 20,
      select: { symbol: true, side: true, type: true, price: true, quantity: true, pnl: true, fee: true, source: true, executedAt: true }
    });
    console.log("\n  Recent 20 Trades:");
    recentTrades.forEach(t => {
      console.log(`  ${t.executedAt.toISOString().slice(0,16)} | ${t.symbol} | ${t.side} | ${t.type} | price:${t.price} | qty:${t.quantity} | pnl:${t.pnl} | fee:${t.fee} | src:${t.source}`);
    });
    
    // PnL by source
    const pnlBySource = {};
    trades.forEach(t => {
      const src = t.source || 'unknown';
      if (!pnlBySource[src]) pnlBySource[src] = { count: 0, pnl: 0, wins: 0, losses: 0 };
      pnlBySource[src].count++;
      pnlBySource[src].pnl += Number(t.pnl) || 0;
      if (Number(t.pnl) > 0) pnlBySource[src].wins++;
      else if (Number(t.pnl) < 0) pnlBySource[src].losses++;
    });
    console.log("\n  PnL by Source:");
    Object.entries(pnlBySource).forEach(([src, data]) => {
      const wr = data.wins + data.losses > 0 ? ((data.wins / (data.wins + data.losses)) * 100).toFixed(1) : 'N/A';
      console.log(`    ${src}: ${data.count} trades, PnL: $${data.pnl.toFixed(4)}, Win Rate: ${wr}%`);
    });
  }
  
  // 4. Positions
  const openPositions = await prisma.position.count({ where: { status: 'OPEN' } });
  const closedPositions = await prisma.position.count({ where: { status: 'CLOSED' } });
  console.log(`\nPositions: ${openPositions} open, ${closedPositions} closed`);
  
  if (closedPositions > 0) {
    const closedPos = await prisma.position.findMany({
      where: { status: 'CLOSED' },
      select: { symbol: true, side: true, realizedPnl: true, closeReason: true, entryPrice: true, exitPrice: true, openedAt: true, closedAt: true, source: true }
    });
    
    const posWins = closedPos.filter(p => Number(p.realizedPnl) > 0);
    const posLosses = closedPos.filter(p => Number(p.realizedPnl) < 0);
    const totalRealized = closedPos.reduce((s, p) => s + Number(p.realizedPnl), 0);
    
    console.log(`  Closed PnL: $${totalRealized.toFixed(4)}`);
    console.log(`  Position Wins: ${posWins.length}, Losses: ${posLosses.length}`);
    if (posWins.length + posLosses.length > 0)
      console.log(`  Position Win Rate: ${((posWins.length / (posWins.length + posLosses.length)) * 100).toFixed(1)}%`);
    
    // Close reason distribution
    const closeReasons = {};
    closedPos.forEach(p => {
      const reason = p.closeReason || 'unknown';
      if (!closeReasons[reason]) closeReasons[reason] = 0;
      closeReasons[reason]++;
    });
    console.log("  Close Reasons:", JSON.stringify(closeReasons));
    
    // PnL by source
    const posPnlBySource = {};
    closedPos.forEach(p => {
      const src = p.source || 'unknown';
      if (!posPnlBySource[src]) posPnlBySource[src] = { count: 0, pnl: 0, wins: 0 };
      posPnlBySource[src].count++;
      posPnlBySource[src].pnl += Number(p.realizedPnl);
      if (Number(p.realizedPnl) > 0) posPnlBySource[src].wins++;
    });
    console.log("  Closed Position PnL by Source:");
    Object.entries(posPnlBySource).forEach(([src, data]) => {
      console.log(`    ${src}: ${data.count} pos, PnL: $${data.pnl.toFixed(4)}, Wins: ${data.wins}`);
    });
  }
  
  // 5. Autonomous Trades
  const autoTradeCount = await prisma.autonomousTrade.count();
  console.log(`\nAutonomous Trades: ${autoTradeCount}`);
  
  if (autoTradeCount > 0) {
    const autoByStrategy = await prisma.autonomousTrade.groupBy({ by: ['strategy'], _count: true });
    console.log("  By Strategy:", JSON.stringify(autoByStrategy));
    
    const autoByStatus = await prisma.autonomousTrade.groupBy({ by: ['status'], _count: true });
    console.log("  By Status:", JSON.stringify(autoByStatus));
    
    const autoTrades = await prisma.autonomousTrade.findMany({
      select: { symbol: true, side: true, strategy: true, status: true, pnl: true, confidence: true, riskScore: true, riskRewardRatio: true, exitReason: true, isWinning: true, entryPrice: true, exitPrice: true, stopLoss: true, takeProfit: true, quantity: true, fee: true, openedAt: true, closedAt: true }
    });
    
    const autoWins = autoTrades.filter(t => t.isWinning === true);
    const autoLosses = autoTrades.filter(t => t.isWinning === false);
    const autoPnl = autoTrades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    const autoFees = autoTrades.reduce((s, t) => s + (Number(t.fee) || 0), 0);
    
    console.log(`  Total Auto PnL: $${autoPnl.toFixed(4)}`);
    console.log(`  Total Auto Fees: $${autoFees.toFixed(4)}`);
    console.log(`  Auto Wins: ${autoWins.length}, Losses: ${autoLosses.length}`);
    if (autoWins.length + autoLosses.length > 0)
      console.log(`  Auto Win Rate: ${((autoWins.length / (autoWins.length + autoLosses.length)) * 100).toFixed(1)}%`);
    
    // Auto by strategy PnL
    const autoByStratPnl = {};
    autoTrades.forEach(t => {
      if (!autoByStratPnl[t.strategy]) autoByStratPnl[t.strategy] = { count: 0, pnl: 0, wins: 0, losses: 0 };
      autoByStratPnl[t.strategy].count++;
      autoByStratPnl[t.strategy].pnl += Number(t.pnl) || 0;
      if (t.isWinning === true) autoByStratPnl[t.strategy].wins++;
      else if (t.isWinning === false) autoByStratPnl[t.strategy].losses++;
    });
    console.log("  Auto PnL by Strategy:");
    Object.entries(autoByStratPnl).forEach(([strat, data]) => {
      const wr = data.wins + data.losses > 0 ? ((data.wins / (data.wins + data.losses)) * 100).toFixed(1) : 'N/A';
      console.log(`    ${strat}: ${data.count} trades, PnL: $${data.pnl.toFixed(4)}, Win Rate: ${wr}%`);
    });
    
    // Exit reason distribution
    const exitReasons = {};
    autoTrades.forEach(t => {
      const r = t.exitReason || 'unknown';
      if (!exitReasons[r]) exitReasons[r] = 0;
      exitReasons[r]++;
    });
    console.log("  Exit Reasons:", JSON.stringify(exitReasons));
    
    // Confidence distribution
    const confDist = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
    autoTrades.forEach(t => {
      if (t.confidence <= 20) confDist['0-20']++;
      else if (t.confidence <= 40) confDist['21-40']++;
      else if (t.confidence <= 60) confDist['41-60']++;
      else if (t.confidence <= 80) confDist['61-80']++;
      else confDist['81-100']++;
    });
    console.log("  Confidence Distribution:", JSON.stringify(confDist));
  }
  
  // 6. Agent Sessions
  const agentSessionCount = await prisma.agentSession.count();
  console.log(`\nAgent Sessions: ${agentSessionCount}`);
  
  if (agentSessionCount > 0) {
    const sessions = await prisma.agentSession.findMany({
      select: { agentRunId: true, status: true, strategy: true, totalPnl: true, totalTrades: true, winningTrades: true, losingTrades: true, startedAt: true, stoppedAt: true }
    });
    sessions.forEach(s => {
      console.log(`  ${s.agentRunId} | ${s.strategy} | ${s.status} | trades:${s.totalTrades} | pnl:${s.totalPnl} | W:${s.winningTrades}/L:${s.losingTrades}`);
    });
  }
  
  // 7. Orders
  const orderCount = await prisma.order.count();
  console.log(`\nOrders: ${orderCount}`);
  
  if (orderCount > 0) {
    const ordersByStatus = await prisma.order.groupBy({ by: ['status'], _count: true });
    console.log("  By Status:", JSON.stringify(ordersByStatus));
    
    const ordersBySide = await prisma.order.groupBy({ by: ['side'], _count: true });
    console.log("  By Side:", JSON.stringify(ordersBySide));
    
    const rejectedOrders = await prisma.order.findMany({
      where: { status: 'REJECTED' },
      select: { symbol: true, side: true, rejectReason: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    if (rejectedOrders.length > 0) {
      console.log("  Recent Rejected Orders:");
      rejectedOrders.forEach(o => console.log(`    ${o.createdAt.toISOString().slice(0,16)} | ${o.symbol} | ${o.side} | reason: ${o.rejectReason}`));
    }
  }
  
  // 8. Risk Events
  const riskEventCount = await prisma.riskEvent.count();
  console.log(`\nRisk Events: ${riskEventCount}`);
  if (riskEventCount > 0) {
    const riskByType = await prisma.riskEvent.groupBy({ by: ['type'], _count: true });
    console.log("  By Type:", JSON.stringify(riskByType));
  }
  
  // 9. Council Vote Accuracy
  const councilCount = await prisma.councilVoteAccuracy.count();
  console.log(`\nCouncil Vote Accuracy Records: ${councilCount}`);
  if (councilCount > 0) {
    const councilData = await prisma.councilVoteAccuracy.findMany({ take: 20 });
    councilData.forEach(c => {
      console.log(`  ${c.createdAt?.toISOString().slice(0,16)} | pair:${c.pair} | decision:${c.councilDecision} | actual:${c.actualMove} | correct:${c.wasCorrect}`);
    });
  }
  
  // 10. Trading Briefs
  const briefCount = await prisma.tradingBrief.count();
  console.log(`\nTrading Briefs: ${briefCount}`);
  if (briefCount > 0) {
    const recentBriefs = await prisma.tradingBrief.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { pair: true, action: true, confidence: true, regime: true, createdAt: true }
    });
    recentBriefs.forEach(b => {
      console.log(`  ${b.createdAt?.toISOString().slice(0,16)} | ${b.pair} | ${b.action} | conf:${b.confidence} | regime:${b.regime}`);
    });
  }
}

main().catch(e => { console.error(e); }).finally(() => prisma.$disconnect());
