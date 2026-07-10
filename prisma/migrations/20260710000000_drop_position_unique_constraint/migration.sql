-- BUG-066s FIX: Drop the unique constraint on Position(userId, symbol, side, status)
-- This constraint prevents users from having 2 OPEN positions on the same symbol/side
-- (i.e., scaling into positions). It should be a non-unique index instead.
--
-- The unique index was created by the init migration:
--   CREATE UNIQUE INDEX IF NOT EXISTS "Position_userId_symbol_side_status_key"
--   ON "Position"("userId", "symbol", "side", "status");
--
-- We drop the unique index and recreate it as a non-unique index
-- (for query performance on the common filter pattern).

-- Drop the unique index
DROP INDEX IF EXISTS "Position_userId_symbol_side_status_key";

-- Recreate as non-unique index (for query performance)
CREATE INDEX IF NOT EXISTS "Position_userId_symbol_side_status_idx"
  ON "Position"("userId", "symbol", "side", "status");
