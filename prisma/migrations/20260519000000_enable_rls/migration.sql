-- ═══════════════════════════════════════════════════════════════════
-- Row Level Security (RLS) — Defense-in-Depth Layer 2
-- ═══════════════════════════════════════════════════════════════════
--
-- PURPOSE: Even if the application layer (Layer 1) fails to filter by
-- userId, PostgreSQL will enforce that users can only access their own
-- data at the database level. This prevents data leakage even in cases
-- of SQL injection, ORM bugs, or developer mistakes.
--
-- HOW IT WORKS:
-- 1. ENABLE ROW LEVEL SECURITY on all user-scoped tables
-- 2. Create policies that check "userId" = current_setting('app.current_user_id')
-- 3. The application MUST set this PostgreSQL session variable before
--    each query using: SET LOCAL app.current_user_id = 'userId'
-- 4. If the variable is not set, ALL rows are rejected (fail-safe)
--
-- IMPORTANT: Prisma does NOT natively support SET LOCAL in transactions.
-- This migration is a FUTURE SAFETY NET. When we migrate to a connection
-- pooler that supports session variables (like PgBouncer in session mode),
-- or implement a Prisma extension that sets the variable in $transaction,
-- RLS will automatically activate.
--
-- For now, this migration:
-- 1. Creates the RLS policies (they exist but are dormant until we
--    set app.current_user_id in queries)
-- 2. Creates a helper function to set the user context
-- 3. Creates a superuser bypass so system/background jobs can access
--    all data (needed for SmartExecutor, Agent, etc.)
-- ═══════════════════════════════════════════════════════════════════

-- Helper function: Safely get the current user ID from session variable
-- Returns NULL if not set (which blocks ALL access under RLS)
CREATE OR REPLACE FUNCTION rls_current_user_id() RETURNS TEXT AS $$
BEGIN
    RETURN current_setting('app.current_user_id', true);
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- ═══════════════════════════════════════════════════════════════════
-- ENABLE RLS ON ALL USER-SCOPED TABLES
-- ═══════════════════════════════════════════════════════════════════

-- Exchange Credentials (API keys — MOST sensitive)
ALTER TABLE "ExchangeCredential" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExchangeCredential" FORCE ROW LEVEL SECURITY;

-- Positions (trading positions)
ALTER TABLE "Position" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Position" FORCE ROW LEVEL SECURITY;

-- Orders
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" FORCE ROW LEVEL SECURITY;

-- Trades
ALTER TABLE "Trade" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Trade" FORCE ROW LEVEL SECURITY;

-- Portfolios
ALTER TABLE "Portfolio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Portfolio" FORCE ROW LEVEL SECURITY;

-- Signals
ALTER TABLE "Signal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Signal" FORCE ROW LEVEL SECURITY;

-- Paper Orders
ALTER TABLE "PaperOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaperOrder" FORCE ROW LEVEL SECURITY;

-- Autonomous Trades
ALTER TABLE "AutonomousTrade" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutonomousTrade" FORCE ROW LEVEL SECURITY;

-- Agent Sessions
ALTER TABLE "AgentSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentSession" FORCE ROW LEVEL SECURITY;

-- Agent Settings
ALTER TABLE "AgentSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentSettings" FORCE ROW LEVEL SECURITY;

-- Sessions (auth sessions)
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" FORCE ROW LEVEL SECURITY;

-- Coach Advice
ALTER TABLE "CoachAdvice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CoachAdvice" FORCE ROW LEVEL SECURITY;

-- User Notifications
ALTER TABLE "UserNotification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserNotification" FORCE ROW LEVEL SECURITY;

-- Alerts
ALTER TABLE "Alert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Alert" FORCE ROW LEVEL SECURITY;

-- Accounts (OAuth)
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Account" FORCE ROW LEVEL SECURITY;

-- API Keys (legacy)
ALTER TABLE "ApiKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiKey" FORCE ROW LEVEL SECURITY;

-- Chart Preferences
ALTER TABLE "ChartPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChartPreference" FORCE ROW LEVEL SECURITY;

-- Position Reconciliation
ALTER TABLE "PositionReconciliation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PositionReconciliation" FORCE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════
-- CREATE RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════
-- Policy logic:
-- - SELECT: User can only see rows where "userId" matches their ID
-- - INSERT: User can only insert rows with their own userId
-- - UPDATE: User can only update rows they own
-- - DELETE: User can only delete rows they own
-- - ALL: Superuser bypass for system operations (SmartExecutor, etc.)
-- ═══════════════════════════════════════════════════════════════════

-- ExchangeCredential
CREATE POLICY rls_select_credential ON "ExchangeCredential" FOR SELECT USING ("userId" = rls_current_user_id());
CREATE POLICY rls_insert_credential ON "ExchangeCredential" FOR INSERT WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_update_credential ON "ExchangeCredential" FOR UPDATE USING ("userId" = rls_current_user_id()) WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_delete_credential ON "ExchangeCredential" FOR DELETE USING ("userId" = rls_current_user_id());

-- Position
CREATE POLICY rls_select_position ON "Position" FOR SELECT USING ("userId" = rls_current_user_id());
CREATE POLICY rls_insert_position ON "Position" FOR INSERT WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_update_position ON "Position" FOR UPDATE USING ("userId" = rls_current_user_id()) WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_delete_position ON "Position" FOR DELETE USING ("userId" = rls_current_user_id());

-- Order
CREATE POLICY rls_select_order ON "Order" FOR SELECT USING ("userId" = rls_current_user_id());
CREATE POLICY rls_insert_order ON "Order" FOR INSERT WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_update_order ON "Order" FOR UPDATE USING ("userId" = rls_current_user_id()) WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_delete_order ON "Order" FOR DELETE USING ("userId" = rls_current_user_id());

-- Trade
CREATE POLICY rls_select_trade ON "Trade" FOR SELECT USING ("userId" = rls_current_user_id());
CREATE POLICY rls_insert_trade ON "Trade" FOR INSERT WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_update_trade ON "Trade" FOR UPDATE USING ("userId" = rls_current_user_id()) WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_delete_trade ON "Trade" FOR DELETE USING ("userId" = rls_current_user_id());

-- Portfolio
CREATE POLICY rls_select_portfolio ON "Portfolio" FOR SELECT USING ("userId" = rls_current_user_id());
CREATE POLICY rls_insert_portfolio ON "Portfolio" FOR INSERT WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_update_portfolio ON "Portfolio" FOR UPDATE USING ("userId" = rls_current_user_id()) WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_delete_portfolio ON "Portfolio" FOR DELETE USING ("userId" = rls_current_user_id());

-- Signal
CREATE POLICY rls_select_signal ON "Signal" FOR SELECT USING ("userId" = rls_current_user_id());
CREATE POLICY rls_insert_signal ON "Signal" FOR INSERT WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_update_signal ON "Signal" FOR UPDATE USING ("userId" = rls_current_user_id()) WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_delete_signal ON "Signal" FOR DELETE USING ("userId" = rls_current_user_id());

-- PaperOrder
CREATE POLICY rls_select_paper_order ON "PaperOrder" FOR SELECT USING ("userId" = rls_current_user_id());
CREATE POLICY rls_insert_paper_order ON "PaperOrder" FOR INSERT WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_update_paper_order ON "PaperOrder" FOR UPDATE USING ("userId" = rls_current_user_id()) WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_delete_paper_order ON "PaperOrder" FOR DELETE USING ("userId" = rls_current_user_id());

-- AutonomousTrade
CREATE POLICY rls_select_auto_trade ON "AutonomousTrade" FOR SELECT USING ("userId" = rls_current_user_id());
CREATE POLICY rls_insert_auto_trade ON "AutonomousTrade" FOR INSERT WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_update_auto_trade ON "AutonomousTrade" FOR UPDATE USING ("userId" = rls_current_user_id()) WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_delete_auto_trade ON "AutonomousTrade" FOR DELETE USING ("userId" = rls_current_user_id());

-- AgentSession
CREATE POLICY rls_select_agent_session ON "AgentSession" FOR SELECT USING ("userId" = rls_current_user_id());
CREATE POLICY rls_insert_agent_session ON "AgentSession" FOR INSERT WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_update_agent_session ON "AgentSession" FOR UPDATE USING ("userId" = rls_current_user_id()) WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_delete_agent_session ON "AgentSession" FOR DELETE USING ("userId" = rls_current_user_id());

-- AgentSettings
CREATE POLICY rls_select_agent_settings ON "AgentSettings" FOR SELECT USING ("userId" = rls_current_user_id());
CREATE POLICY rls_insert_agent_settings ON "AgentSettings" FOR INSERT WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_update_agent_settings ON "AgentSettings" FOR UPDATE USING ("userId" = rls_current_user_id()) WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_delete_agent_settings ON "AgentSettings" FOR DELETE USING ("userId" = rls_current_user_id());

-- Session (auth sessions)
CREATE POLICY rls_select_session ON "Session" FOR SELECT USING ("userId" = rls_current_user_id());
CREATE POLICY rls_insert_session ON "Session" FOR INSERT WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_update_session ON "Session" FOR UPDATE USING ("userId" = rls_current_user_id()) WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_delete_session ON "Session" FOR DELETE USING ("userId" = rls_current_user_id());

-- CoachAdvice
CREATE POLICY rls_select_coach ON "CoachAdvice" FOR SELECT USING ("userId" = rls_current_user_id());
CREATE POLICY rls_insert_coach ON "CoachAdvice" FOR INSERT WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_update_coach ON "CoachAdvice" FOR UPDATE USING ("userId" = rls_current_user_id()) WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_delete_coach ON "CoachAdvice" FOR DELETE USING ("userId" = rls_current_user_id());

-- UserNotification
CREATE POLICY rls_select_notification ON "UserNotification" FOR SELECT USING ("userId" = rls_current_user_id());
CREATE POLICY rls_insert_notification ON "UserNotification" FOR INSERT WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_update_notification ON "UserNotification" FOR UPDATE USING ("userId" = rls_current_user_id()) WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_delete_notification ON "UserNotification" FOR DELETE USING ("userId" = rls_current_user_id());

-- Alert
CREATE POLICY rls_select_alert ON "Alert" FOR SELECT USING ("userId" = rls_current_user_id());
CREATE POLICY rls_insert_alert ON "Alert" FOR INSERT WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_update_alert ON "Alert" FOR UPDATE USING ("userId" = rls_current_user_id()) WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_delete_alert ON "Alert" FOR DELETE USING ("userId" = rls_current_user_id());

-- Account (OAuth)
CREATE POLICY rls_select_account ON "Account" FOR SELECT USING ("userId" = rls_current_user_id());
CREATE POLICY rls_insert_account ON "Account" FOR INSERT WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_update_account ON "Account" FOR UPDATE USING ("userId" = rls_current_user_id()) WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_delete_account ON "Account" FOR DELETE USING ("userId" = rls_current_user_id());

-- ApiKey (legacy)
CREATE POLICY rls_select_apikey ON "ApiKey" FOR SELECT USING ("userId" = rls_current_user_id());
CREATE POLICY rls_insert_apikey ON "ApiKey" FOR INSERT WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_update_apikey ON "ApiKey" FOR UPDATE USING ("userId" = rls_current_user_id()) WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_delete_apikey ON "ApiKey" FOR DELETE USING ("userId" = rls_current_user_id());

-- ChartPreference
CREATE POLICY rls_select_chart ON "ChartPreference" FOR SELECT USING ("userId" = rls_current_user_id());
CREATE POLICY rls_insert_chart ON "ChartPreference" FOR INSERT WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_update_chart ON "ChartPreference" FOR UPDATE USING ("userId" = rls_current_user_id()) WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_delete_chart ON "ChartPreference" FOR DELETE USING ("userId" = rls_current_user_id());

-- PositionReconciliation
CREATE POLICY rls_select_recon ON "PositionReconciliation" FOR SELECT USING ("userId" = rls_current_user_id());
CREATE POLICY rls_insert_recon ON "PositionReconciliation" FOR INSERT WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_update_recon ON "PositionReconciliation" FOR UPDATE USING ("userId" = rls_current_user_id()) WITH CHECK ("userId" = rls_current_user_id());
CREATE POLICY rls_delete_recon ON "PositionReconciliation" FOR DELETE USING ("userId" = rls_current_user_id());

-- ═══════════════════════════════════════════════════════════════════
-- SUPERUSER BYPASS POLICY
-- ═══════════════════════════════════════════════════════════════════
-- Background workers (SmartExecutor, Agent, ExchangeSync) need to
-- access multiple users' data. They run as the database owner
-- (typically 'postgres' user), which bypasses RLS by default.
--
-- This comment documents the bypass mechanism:
-- - Database superusers (OWNER of the table) automatically bypass RLS
-- - We use FORCE ROW LEVEL SECURITY to prevent this for regular users
-- - The application's PrismaService connects as the database owner
-- - For RLS to work, we need to either:
--   a) Use a non-superuser role for API queries (recommended)
--   b) Set app.current_user_id in every transaction
--   c) Use a connection pooler with session variables
--
-- Current status: RLS policies are CREATED but will be DORMANT until
-- we implement option (b) or (c) in the application layer.
-- The policies are still valuable as documentation and future protection.
-- ═══════════════════════════════════════════════════════════════════

-- Add RLS helper function for setting user context in transactions
CREATE OR REPLACE FUNCTION set_rls_user_id(p_user_id TEXT) RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user_id', p_user_id, true); -- true = LOCAL (transaction-only)
END;
$$ LANGUAGE plpgsql;

-- Add RLS helper function for clearing user context
CREATE OR REPLACE FUNCTION clear_rls_user_id() RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user_id', '', true);
END;
$$ LANGUAGE plpgsql;
