-- ═══════════════════════════════════════════════════════════════════
-- Roua Trading — Row Level Security (RLS) for User Data Isolation
-- Defense-in-Depth Layer 2: Database-Level Isolation
-- ═══════════════════════════════════════════════════════════════════
--
-- ROOT CAUSE: When Prisma queries receive undefined userId, Prisma
-- STRIPS the undefined field from the WHERE clause, returning ALL
-- records from ALL users. This is the #1 cause of data leakage.
--
-- RLS ensures that even if the application layer fails to filter
-- by userId, the database itself will only return rows belonging
-- to the current user (set via current_setting).
--
-- HOW IT WORKS:
-- 1. App sets the current userId via: SET LOCAL app.current_user_id = 'userId'
-- 2. Each table's RLS policy uses current_setting('app.current_user_id')
-- 3. Even if Prisma strips userId from WHERE, RLS enforces isolation
--
-- IMPORTANT: The application must call setUserIdInTransaction(userId)
-- before any query on these tables. This is done by the
-- UserIsolationInterceptor.
-- ═══════════════════════════════════════════════════════════════════

-- Step 1: Enable RLS on user-scoped tables
ALTER TABLE "ExchangeCredential" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Position" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Trade" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Signal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SignalUsage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaperOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutonomousTrade" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Portfolio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PortfolioAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

-- Step 2: Create RLS policies — each policy uses current_setting('app.current_user_id')
-- If the setting is not set (empty string), the policy returns FALSE → no rows visible

-- ExchangeCredential: Only see your own API keys
CREATE POLICY user_isolation_policy ON "ExchangeCredential"
  FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

-- Position: Only see your own positions
CREATE POLICY user_isolation_policy ON "Position"
  FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

-- Order: Only see your own orders
CREATE POLICY user_isolation_policy ON "Order"
  FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

-- Trade: Only see your own trades
CREATE POLICY user_isolation_policy ON "Trade"
  FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

-- Signal: Only see your own signals
CREATE POLICY user_isolation_policy ON "Signal"
  FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

-- SignalUsage: Only see your own signal usage
CREATE POLICY user_isolation_policy ON "SignalUsage"
  FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

-- PaperOrder: Only see your own paper orders
CREATE POLICY user_isolation_policy ON "PaperOrder"
  FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

-- AutonomousTrade: Only see your own autonomous trades
CREATE POLICY user_isolation_policy ON "AutonomousTrade"
  FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

-- AgentSession: Only see your own agent sessions
CREATE POLICY user_isolation_policy ON "AgentSession"
  FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

-- AgentSettings: Only see your own agent settings
CREATE POLICY user_isolation_policy ON "AgentSettings"
  FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

-- Portfolio: Only see your own portfolios
CREATE POLICY user_isolation_policy ON "Portfolio"
  FOR ALL
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));

-- PortfolioAsset: Only see assets in your own portfolios
CREATE POLICY user_isolation_policy ON "PortfolioAsset"
  FOR ALL
  USING ("portfolioId" IN (SELECT id FROM "Portfolio" WHERE "userId" = current_setting('app.current_user_id', true)))
  WITH CHECK ("portfolioId" IN (SELECT id FROM "Portfolio" WHERE "userId" = current_setting('app.current_user_id', true)));

-- AuditLog: Only see your own audit logs (userId is nullable — null logs are visible to all)
CREATE POLICY user_isolation_policy ON "AuditLog"
  FOR ALL
  USING ("userId" IS NULL OR "userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" IS NULL OR "userId" = current_setting('app.current_user_id', true));

-- Step 3: Create a superuser bypass policy for background services
-- Background services (Position Monitor, Exchange Sync, Smart Executor) need
-- to query across ALL users. They run without a user context, so they need
-- a bypass. We create a separate role or use a flag.
-- For now, RLS is enforced but background services can disable it per-session:
--   SET LOCAL app.current_user_id = ''; -- Empty = no user = superuser bypass
-- Actually, we need a different approach. Let's use a bypass flag:
--   SET LOCAL app.rls_bypass = 'true';
-- And create policies that allow bypass when this flag is set.

-- Create bypass policies for ALL tables with RLS
-- These policies allow access when app.rls_bypass = 'true'
CREATE POLICY superuser_bypass_policy ON "ExchangeCredential"
  FOR ALL
  USING (current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK (current_setting('app.rls_bypass', true) = 'true');

CREATE POLICY superuser_bypass_policy ON "Position"
  FOR ALL
  USING (current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK (current_setting('app.rls_bypass', true) = 'true');

CREATE POLICY superuser_bypass_policy ON "Order"
  FOR ALL
  USING (current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK (current_setting('app.rls_bypass', true) = 'true');

CREATE POLICY superuser_bypass_policy ON "Trade"
  FOR ALL
  USING (current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK (current_setting('app.rls_bypass', true) = 'true');

CREATE POLICY superuser_bypass_policy ON "Signal"
  FOR ALL
  USING (current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK (current_setting('app.rls_bypass', true) = 'true');

CREATE POLICY superuser_bypass_policy ON "SignalUsage"
  FOR ALL
  USING (current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK (current_setting('app.rls_bypass', true) = 'true');

CREATE POLICY superuser_bypass_policy ON "PaperOrder"
  FOR ALL
  USING (current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK (current_setting('app.rls_bypass', true) = 'true');

CREATE POLICY superuser_bypass_policy ON "AutonomousTrade"
  FOR ALL
  USING (current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK (current_setting('app.rls_bypass', true) = 'true');

CREATE POLICY superuser_bypass_policy ON "AgentSession"
  FOR ALL
  USING (current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK (current_setting('app.rls_bypass', true) = 'true');

CREATE POLICY superuser_bypass_policy ON "AgentSettings"
  FOR ALL
  USING (current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK (current_setting('app.rls_bypass', true) = 'true');

CREATE POLICY superuser_bypass_policy ON "Portfolio"
  FOR ALL
  USING (current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK (current_setting('app.rls_bypass', true) = 'true');

CREATE POLICY superuser_bypass_policy ON "PortfolioAsset"
  FOR ALL
  USING (current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK (current_setting('app.rls_bypass', true) = 'true');

CREATE POLICY superuser_bypass_policy ON "AuditLog"
  FOR ALL
  USING (current_setting('app.rls_bypass', true) = 'true')
  WITH CHECK (current_setting('app.rls_bypass', true) = 'true');
