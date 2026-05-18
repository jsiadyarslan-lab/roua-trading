-- AlterTable: Add exitPrice column to Position table
-- V140: Stores the actual close price when a position is closed
-- This column is referenced by trading.service.ts closePosition() and forceClosePosition()
ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "exitPrice" Decimal(18,8);
