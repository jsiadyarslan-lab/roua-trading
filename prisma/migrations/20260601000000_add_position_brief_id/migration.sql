-- AlterTable: Add briefId column to Position (referenced in Prisma schema but missing from DB)
ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "briefId" TEXT;

-- CreateIndex (only if not exists)
CREATE INDEX IF NOT EXISTS "Position_briefId_idx" ON "Position"("briefId");
