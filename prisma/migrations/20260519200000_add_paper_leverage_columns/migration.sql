-- Add missing paper leverage columns to AgentSettings
-- These columns were added to schema.prisma but the migration was never created.

ALTER TABLE "AgentSettings" 
  ADD COLUMN IF NOT EXISTS "paperForexLeverage" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "paperGoldLeverage" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS "paperCryptoLeverage" INTEGER NOT NULL DEFAULT 1;
