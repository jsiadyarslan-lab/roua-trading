-- Migration: Add missing tables that were defined in schema but never migrated
-- This fixes: UserNotificationPreferences, UserNotification, AgentSettings,
-- ContentArticle, ContentSchedule, Subscription, AiUsageLog, Setting,
-- AdminSession, VerificationToken, NotificationConfig, NewsArticle,
-- StrategyReport, PredictionEvent

-- ── UserNotificationPreferences ──
CREATE TABLE IF NOT EXISTS "UserNotificationPreferences" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
  "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
  "browserEnabled" BOOLEAN NOT NULL DEFAULT true,
  "telegramEnabled" BOOLEAN NOT NULL DEFAULT false,
  "signalAlerts" BOOLEAN NOT NULL DEFAULT true,
  "tradeAlerts" BOOLEAN NOT NULL DEFAULT true,
  "aiAlerts" BOOLEAN NOT NULL DEFAULT true,
  "scannerAlerts" BOOLEAN NOT NULL DEFAULT true,
  "riskAlerts" BOOLEAN NOT NULL DEFAULT true,
  "systemAlerts" BOOLEAN NOT NULL DEFAULT true,
  "autoExecuteEnabled" BOOLEAN NOT NULL DEFAULT false,
  "autoExecuteMinConfidence" INTEGER NOT NULL DEFAULT 75,
  "autoExecuteMaxPositionSize" DECIMAL(5,4) NOT NULL DEFAULT 0.02,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserNotificationPreferences_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserNotificationPreferences_userId_key" ON "UserNotificationPreferences"("userId");
CREATE INDEX IF NOT EXISTS "UserNotificationPreferences_userId_idx" ON "UserNotificationPreferences"("userId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'UserNotificationPreferences_userId_fkey'
  ) THEN
    ALTER TABLE "UserNotificationPreferences" ADD CONSTRAINT "UserNotificationPreferences_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── UserNotification ──
DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM ('SIGNAL_GENERATED', 'ORDER_FILLED', 'ORDER_REJECTED', 'ORDER_ACCEPTED', 'POSITION_OPENED', 'POSITION_CLOSED', 'RISK_WARNING', 'PRICE_ALERT', 'AI_INSIGHT', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationPriority" AS ENUM ('URGENT', 'HIGH', 'MEDIUM', 'LOW');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "UserNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "priority" "NotificationPriority" NOT NULL DEFAULT 'MEDIUM',
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "data" TEXT NOT NULL DEFAULT '{}',
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "source" TEXT NOT NULL DEFAULT 'system',
  "action" TEXT NOT NULL DEFAULT 'INFO',
  "pair" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "UserNotification_userId_idx" ON "UserNotification"("userId");
CREATE INDEX IF NOT EXISTS "UserNotification_type_idx" ON "UserNotification"("type");
CREATE INDEX IF NOT EXISTS "UserNotification_priority_idx" ON "UserNotification"("priority");
CREATE INDEX IF NOT EXISTS "UserNotification_isRead_idx" ON "UserNotification"("isRead");
CREATE INDEX IF NOT EXISTS "UserNotification_createdAt_idx" ON "UserNotification"("createdAt");
CREATE INDEX IF NOT EXISTS "UserNotification_userId_isRead_createdAt_idx" ON "UserNotification"("userId", "isRead", "createdAt");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'UserNotification_userId_fkey'
  ) THEN
    ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── AgentSettings ──
CREATE TABLE IF NOT EXISTS "AgentSettings" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "autoTradingEnabled" BOOLEAN NOT NULL DEFAULT true,
  "paperBalance" DECIMAL(19,4) NOT NULL DEFAULT 10000,
  "maxPositionSizePercent" DECIMAL(5,2) NOT NULL DEFAULT 2,
  "maxDailyLossPercent" DECIMAL(5,2) NOT NULL DEFAULT 5,
  "maxOpenPositions" INTEGER NOT NULL DEFAULT 5,
  "riskPerTradePercent" DECIMAL(5,2) NOT NULL DEFAULT 1.5,
  "defaultStrategy" TEXT NOT NULL DEFAULT 'AUTO',
  "scalpingTimeframe" TEXT NOT NULL DEFAULT '5m',
  "scalpingTakeProfitPips" INTEGER NOT NULL DEFAULT 15,
  "scalpingStopLossPips" INTEGER NOT NULL DEFAULT 10,
  "scalpingMaxSpread" INTEGER NOT NULL DEFAULT 3,
  "swingTimeframe" TEXT NOT NULL DEFAULT '1h',
  "swingHoldingPeriodHours" INTEGER NOT NULL DEFAULT 48,
  "swingTrendLookback" INTEGER NOT NULL DEFAULT 50,
  "gridLevels" INTEGER NOT NULL DEFAULT 5,
  "gridSpacingPercent" DECIMAL(5,2) NOT NULL DEFAULT 0.5,
  "gridQuantityPerLevel" DECIMAL(19,8),
  "defaultSymbols" TEXT NOT NULL DEFAULT 'BTC/USDT,ETH/USDT,SOL/USDT,BNB/USDT,XRP/USDT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AgentSettings_userId_key" ON "AgentSettings"("userId");
CREATE INDEX IF NOT EXISTS "AgentSettings_userId_idx" ON "AgentSettings"("userId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AgentSettings_userId_fkey'
  ) THEN
    ALTER TABLE "AgentSettings" ADD CONSTRAINT "AgentSettings_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── ContentArticle ──
DO $$ BEGIN
  CREATE TYPE "ContentArticleStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ContentArticle" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "titleAr" TEXT NOT NULL,
  "titleEn" TEXT NOT NULL,
  "contentAr" TEXT NOT NULL,
  "contentEn" TEXT NOT NULL,
  "summaryAr" TEXT NOT NULL,
  "summaryEn" TEXT NOT NULL,
  "excerpt" TEXT,
  "category" TEXT NOT NULL,
  "categoryAr" TEXT,
  "tags" TEXT NOT NULL DEFAULT '[]',
  "relatedSymbols" TEXT NOT NULL DEFAULT '[]',
  "seo" TEXT NOT NULL DEFAULT '{}',
  "aiModel" TEXT,
  "generationSource" TEXT,
  "confidence" INTEGER NOT NULL DEFAULT 0,
  "qualityScore" INTEGER NOT NULL DEFAULT 0,
  "sentimentScore" DECIMAL(5,4) NOT NULL DEFAULT 0,
  "impactLevel" TEXT,
  "riskWarnings" TEXT NOT NULL DEFAULT '[]',
  "sources" TEXT NOT NULL DEFAULT '[]',
  "readingTimeMinutes" INTEGER NOT NULL DEFAULT 0,
  "wordCountAr" INTEGER NOT NULL DEFAULT 0,
  "wordCountEn" INTEGER NOT NULL DEFAULT 0,
  "views" INTEGER NOT NULL DEFAULT 0,
  "shares" INTEGER NOT NULL DEFAULT 0,
  "likes" INTEGER NOT NULL DEFAULT 0,
  "status" "ContentArticleStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedAt" TIMESTAMP(3),
  "scheduledAt" TIMESTAMP(3),
  "imageUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentArticle_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContentArticle_userId_idx" ON "ContentArticle"("userId");
CREATE INDEX IF NOT EXISTS "ContentArticle_category_idx" ON "ContentArticle"("category");
CREATE INDEX IF NOT EXISTS "ContentArticle_contentType_idx" ON "ContentArticle"("contentType");
CREATE INDEX IF NOT EXISTS "ContentArticle_status_idx" ON "ContentArticle"("status");
CREATE INDEX IF NOT EXISTS "ContentArticle_publishedAt_idx" ON "ContentArticle"("publishedAt");
CREATE INDEX IF NOT EXISTS "ContentArticle_createdAt_idx" ON "ContentArticle"("createdAt");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ContentArticle_userId_fkey'
  ) THEN
    ALTER TABLE "ContentArticle" ADD CONSTRAINT "ContentArticle_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── ContentSchedule ──
CREATE TABLE IF NOT EXISTS "ContentSchedule" (
  "id" TEXT NOT NULL,
  "contentId" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "platform" TEXT NOT NULL DEFAULT 'WEBSITE',
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentSchedule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContentSchedule_contentId_idx" ON "ContentSchedule"("contentId");
CREATE INDEX IF NOT EXISTS "ContentSchedule_scheduledAt_idx" ON "ContentSchedule"("scheduledAt");
CREATE INDEX IF NOT EXISTS "ContentSchedule_status_idx" ON "ContentSchedule"("status");

-- ── Subscription ──
CREATE TABLE IF NOT EXISTS "Subscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tier" "Tier" NOT NULL DEFAULT 'FREE',
  "previousTier" "Tier",
  "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'active',
  "paymentMethod" TEXT,
  "amount" DECIMAL(19,4),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Subscription_userId_idx" ON "Subscription"("userId");
CREATE INDEX IF NOT EXISTS "Subscription_tier_idx" ON "Subscription"("tier");
CREATE INDEX IF NOT EXISTS "Subscription_status_idx" ON "Subscription"("status");

-- ── AiUsageLog ──
CREATE TABLE IF NOT EXISTS "AiUsageLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "model" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "costUsd" DECIMAL(10,6) NOT NULL DEFAULT 0,
  "latencyMs" INTEGER NOT NULL DEFAULT 0,
  "cached" BOOLEAN NOT NULL DEFAULT false,
  "success" BOOLEAN NOT NULL DEFAULT true,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AiUsageLog_model_idx" ON "AiUsageLog"("model");
CREATE INDEX IF NOT EXISTS "AiUsageLog_provider_idx" ON "AiUsageLog"("provider");
CREATE INDEX IF NOT EXISTS "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AiUsageLog_userId_idx" ON "AiUsageLog"("userId");
CREATE INDEX IF NOT EXISTS "AiUsageLog_cached_idx" ON "AiUsageLog"("cached");

-- ── Setting ──
CREATE TABLE IF NOT EXISTS "Setting" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Setting_key_key" ON "Setting"("key");
CREATE INDEX IF NOT EXISTS "Setting_key_idx" ON "Setting"("key");

-- ── AdminSession ──
CREATE TABLE IF NOT EXISTS "AdminSession" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AdminSession_token_key" ON "AdminSession"("token");
CREATE INDEX IF NOT EXISTS "AdminSession_token_idx" ON "AdminSession"("token");
CREATE INDEX IF NOT EXISTS "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

-- ── VerificationToken ──
CREATE TABLE IF NOT EXISTS "VerificationToken" (
  "id" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");
CREATE INDEX IF NOT EXISTS "VerificationToken_identifier_idx" ON "VerificationToken"("identifier");
CREATE INDEX IF NOT EXISTS "VerificationToken_expires_idx" ON "VerificationToken"("expires");

-- ── NotificationConfig ──
CREATE TABLE IF NOT EXISTS "NotificationConfig" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "config" TEXT NOT NULL DEFAULT '{}',
  "description" TEXT,
  "lastTriggeredAt" TIMESTAMP(3),
  "triggerCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationConfig_type_key" ON "NotificationConfig"("type");
CREATE INDEX IF NOT EXISTS "NotificationConfig_type_idx" ON "NotificationConfig"("type");
CREATE INDEX IF NOT EXISTS "NotificationConfig_enabled_idx" ON "NotificationConfig"("enabled");

-- ── NewsArticle ──
CREATE TABLE IF NOT EXISTS "NewsArticle" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "translatedTitle" TEXT,
  "content" TEXT NOT NULL,
  "translatedContent" TEXT,
  "summary" TEXT,
  "url" TEXT,
  "sentiment" DECIMAL(5,4),
  "sentimentLabel" TEXT,
  "impactLevel" TEXT,
  "affectedAssets" TEXT,
  "entities" TEXT,
  "aiAnalysis" TEXT,
  "category" TEXT,
  "categoryAr" TEXT,
  "embedding" TEXT,
  "imageUrl" TEXT,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "NewsArticle_source_idx" ON "NewsArticle"("source");
CREATE INDEX IF NOT EXISTS "NewsArticle_publishedAt_idx" ON "NewsArticle"("publishedAt");
CREATE INDEX IF NOT EXISTS "NewsArticle_sentimentLabel_idx" ON "NewsArticle"("sentimentLabel");
CREATE INDEX IF NOT EXISTS "NewsArticle_category_idx" ON "NewsArticle"("category");
CREATE UNIQUE INDEX IF NOT EXISTS "NewsArticle_url_key" ON "NewsArticle"("url");

-- ── StrategyReport ──
CREATE TABLE IF NOT EXISTS "StrategyReport" (
  "id" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "assetName" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "price" DECIMAL(19,4) NOT NULL,
  "change" DECIMAL(10,4) NOT NULL,
  "isUp" BOOLEAN NOT NULL,
  "tag" TEXT,
  "decision" TEXT NOT NULL,
  "matrix" TEXT NOT NULL,
  "risk" TEXT NOT NULL,
  "flow" TEXT NOT NULL,
  "consensus" TEXT NOT NULL,
  "hiddenSignature" TEXT NOT NULL,
  "deepAnalysis" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StrategyReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StrategyReport_symbol_idx" ON "StrategyReport"("symbol");
CREATE INDEX IF NOT EXISTS "StrategyReport_type_idx" ON "StrategyReport"("type");
CREATE INDEX IF NOT EXISTS "StrategyReport_publishedAt_idx" ON "StrategyReport"("publishedAt");

-- ── PredictionEvent ──
DO $$ BEGIN
  CREATE TYPE "PredictionEventStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'EXPIRED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PredictionDirection" AS ENUM ('UP', 'DOWN', 'VOLATILE', 'NEUTRAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "HedgeComplexity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TimeHorizon" AS ENUM ('IMMEDIATE', 'SHORT', 'MEDIUM', 'LONG');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PredictionEvent" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'polymarket',
  "title" TEXT NOT NULL,
  "titleAr" TEXT,
  "description" TEXT,
  "descriptionAr" TEXT,
  "category" TEXT,
  "categoryAr" TEXT,
  "relatedSymbols" TEXT NOT NULL DEFAULT '[]',
  "marketProbability" DECIMAL(7,6) NOT NULL,
  "aiProbability" DECIMAL(7,6),
  "predictionGap" DECIMAL(7,6),
  "gapDirection" TEXT,
  "volume24h" DECIMAL(19,4),
  "liquidity" DECIMAL(19,4),
  "endDate" TIMESTAMP(3),
  "resolution" TEXT,
  "status" "PredictionEventStatus" NOT NULL DEFAULT 'ACTIVE',
  "impactAssessment" TEXT,
  "signalBoost" DECIMAL(5,4) NOT NULL DEFAULT 0,
  "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PredictionEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PredictionEvent_source_sourceId_key" ON "PredictionEvent"("source", "sourceId");
CREATE INDEX IF NOT EXISTS "PredictionEvent_status_idx" ON "PredictionEvent"("status");
CREATE INDEX IF NOT EXISTS "PredictionEvent_category_idx" ON "PredictionEvent"("category");
CREATE INDEX IF NOT EXISTS "PredictionEvent_endDate_idx" ON "PredictionEvent"("endDate");
CREATE INDEX IF NOT EXISTS "PredictionEvent_status_endDate_idx" ON "PredictionEvent"("status", "endDate");
CREATE INDEX IF NOT EXISTS "PredictionEvent_predictionGap_idx" ON "PredictionEvent"("predictionGap");
CREATE INDEX IF NOT EXISTS "PredictionEvent_lastSyncedAt_idx" ON "PredictionEvent"("lastSyncedAt");
CREATE INDEX IF NOT EXISTS "PredictionEvent_source_idx" ON "PredictionEvent"("source");

-- ── AuditLog: ensure updatedAt column exists ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AuditLog' AND column_name = 'updatedAt'
  ) THEN
    ALTER TABLE "AuditLog" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

-- ── ExchangeCredential: ensure updatedAt column exists ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ExchangeCredential' AND column_name = 'updatedAt'
  ) THEN
    ALTER TABLE "ExchangeCredential" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

-- ── Account: ensure updatedAt column exists ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Account' AND column_name = 'updatedAt'
  ) THEN
    ALTER TABLE "Account" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;
