-- Add cross-device session sync columns to Session table
-- These columns are required by the Prisma schema and the session creation code.
-- Without them, Prisma's RETURNING clause references non-existent columns,
-- causing ALL session operations (including "minimal" creates) to fail with
-- "column does not exist" errors.

-- refreshToken: unique token for session refresh + cross-device sync
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "refreshToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Session_refreshToken_key" ON "Session"("refreshToken");
CREATE INDEX IF NOT EXISTS "Session_refreshToken_idx" ON "Session"("refreshToken");

-- deviceInfo: JSON string with browser, os, device info for session management UI
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "deviceInfo" TEXT;

-- ipAddress: client IP address for audit + security
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;

-- userAgent: raw User-Agent string for device identification
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;

-- isActive: flag for session revocation (soft delete)
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS "Session_userId_isActive_idx" ON "Session"("userId", "isActive");

-- expiresAt index for session cleanup queries
CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");
