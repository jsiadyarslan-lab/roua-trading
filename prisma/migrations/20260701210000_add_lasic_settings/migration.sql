-- Migration: add_lasic_settings
-- اللاسع — إعدادات قابلة للتخصيص من المستخدم
-- تُضاف إلى AgentSettings كحقول بقيم افتراضية

ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "lazicObiThreshold"      DECIMAL(3,2)   NOT NULL DEFAULT 0.4;
ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "lazicMaxSpreadMult"     DECIMAL(3,2)   NOT NULL DEFAULT 1.5;
ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "lazicMaxDailyTrades"    INTEGER        NOT NULL DEFAULT 20;
ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "lazicMaxOpenPositions"  INTEGER        NOT NULL DEFAULT 2;
ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "lazicCooldownMs"        INTEGER        NOT NULL DEFAULT 30000;
ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "lazicRiskPerTradePct"   DECIMAL(5,2)   NOT NULL DEFAULT 0.5;
