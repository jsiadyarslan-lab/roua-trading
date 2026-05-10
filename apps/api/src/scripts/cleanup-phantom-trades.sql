-- ═══════════════════════════════════════════════════════════════════════════
-- CLEANUP SCRIPT: Delete Phantom Trades from Database
-- ═══════════════════════════════════════════════════════════════════════════
-- This script deletes all phantom positions, trades, and related data
-- that were created by auto-trading systems (Smart Executor, Autonomous Trader)
-- before the critical fixes were applied.
-- ═══════════════════════════════════════════════════════════════════════════

-- Step 1: Delete phantom positions (paper-trading, smart_executor, agent, auto_paper)
DELETE FROM "Position"
WHERE exchange = 'paper-trading'
   OR source IN ('smart_executor', 'agent', 'paper_trading', 'auto_paper');

-- Step 2: Delete phantom trades (paper-trading, smart_executor, agent, auto_paper)
DELETE FROM "Trade"
WHERE exchange = 'paper-trading'
   OR source IN ('smart_executor', 'agent', 'paper_trading', 'auto_paper');

-- Step 3: Delete paper-trading credentials (auto-created without user consent)
DELETE FROM "ExchangeCredential"
WHERE exchange = 'paper-trading';

-- Step 4: Delete autonomous trades from auto-trading systems
DELETE FROM "AutonomousTrade"
WHERE source IN ('smart_executor', 'agent', 'auto_paper');

-- Step 5: Delete paper orders (test orders created by auto-trading)
DELETE FROM "PaperOrder"
WHERE source IN ('smart_executor', 'agent', 'auto_paper');

-- Step 6: Stop all running agent sessions (set to STOPPED)
UPDATE "AgentSession"
SET status = 'STOPPED',
    updatedAt = CURRENT_TIMESTAMP
WHERE status IN ('RUNNING', 'PAUSED', 'DAILY_LIMIT_REACHED');

-- Step 7: Delete AI briefs from strategic council (auto-generated without user consent)
DELETE FROM "AiBrief"
WHERE source IN ('smart_executor', 'agent', 'auto_paper');

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (run after cleanup to verify)
-- ═══════════════════════════════════════════════════════════════════════════

-- Check remaining phantom positions
SELECT COUNT(*) as phantom_positions_remaining
FROM "Position"
WHERE exchange = 'paper-trading'
   OR source IN ('smart_executor', 'agent', 'paper_trading', 'auto_paper');

-- Check remaining phantom trades
SELECT COUNT(*) as phantom_trades_remaining
FROM "Trade"
WHERE exchange = 'paper-trading'
   OR source IN ('smart_executor', 'agent', 'paper_trading', 'auto_paper');

-- Check remaining paper-trading credentials
SELECT COUNT(*) as paper_credentials_remaining
FROM "ExchangeCredential"
WHERE exchange = 'paper-trading';

-- Check running agent sessions
SELECT COUNT(*) as running_agent_sessions
FROM "AgentSession"
WHERE status IN ('RUNNING', 'PAUSED', 'DAILY_LIMIT_REACHED');
