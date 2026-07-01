-- Migration: add_lazic_enabled
-- اللاذع — وكيل التداول فائق السرعة
-- يُضاف إلى AgentSettings كحقل boolean بقيمة افتراضية false

ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "lazicEnabled" BOOLEAN NOT NULL DEFAULT false;
