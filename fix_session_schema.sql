-- ═══════════════════════════════════════════════════════════
-- ROUA Trading — Session Table Migration
-- Run this on Railway PostgreSQL to fix auth/login failures
-- Date: 2026-05-07
-- ═══════════════════════════════════════════════════════════

-- Add missing columns that exist in schema.prisma but not in DB
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "refreshToken" TEXT UNIQUE;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "deviceInfo"   TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "ipAddress"    TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "userAgent"    TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "isActive"     BOOLEAN NOT NULL DEFAULT true;

-- Add missing indexes
CREATE INDEX IF NOT EXISTS "Session_refreshToken_key"      ON "Session"("refreshToken");
CREATE INDEX IF NOT EXISTS "Session_userId_isActive_idx"   ON "Session"("userId", "isActive");
CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx"         ON "Session"("expiresAt");

-- Verify result
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'Session'
ORDER BY ordinal_position;
