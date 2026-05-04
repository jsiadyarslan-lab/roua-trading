-- CreateTable
CREATE TABLE "TradingBrief" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "pair" TEXT NOT NULL,
    "direction" "BriefDirection" NOT NULL,
    "entryPrice" DECIMAL(19,8) NOT NULL,
    "stopLoss" DECIMAL(19,8) NOT NULL,
    "takeProfit" DECIMAL(19,8) NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "timeframe" "BriefTimeframe" NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "strictRules" TEXT NOT NULL DEFAULT '{}',
    "lastReviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewStatus" "BriefReviewStatus" NOT NULL DEFAULT 'ACTIVE',
    "analysisSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingBrief_pkey" PRIMARY KEY ("id")
);

-- CreateEnum
CREATE TYPE "BriefTimeframe" AS ENUM ('H1', 'H4', 'D1', 'W1');
CREATE TYPE "BriefReviewStatus" AS ENUM ('ACTIVE', 'MODIFIED', 'CANCELLED');
CREATE TYPE "BriefDirection" AS ENUM ('BUY', 'SELL');

-- CreateIndex
CREATE INDEX "TradingBrief_userId_idx" ON "TradingBrief"("userId");
CREATE INDEX "TradingBrief_pair_idx" ON "TradingBrief"("pair");
CREATE INDEX "TradingBrief_timeframe_idx" ON "TradingBrief"("timeframe");
CREATE INDEX "TradingBrief_isActive_idx" ON "TradingBrief"("isActive");
CREATE INDEX "TradingBrief_reviewStatus_idx" ON "TradingBrief"("reviewStatus");
CREATE INDEX "TradingBrief_expiresAt_idx" ON "TradingBrief"("expiresAt");
CREATE INDEX "TradingBrief_isActive_expiresAt_idx" ON "TradingBrief"("isActive", "expiresAt");
CREATE INDEX "TradingBrief_pair_timeframe_isActive_idx" ON "TradingBrief"("pair", "timeframe", "isActive");
CREATE INDEX "TradingBrief_userId_isActive_reviewStatus_idx" ON "TradingBrief"("userId", "isActive", "reviewStatus");

-- AddForeignKey
ALTER TABLE "TradingBrief" ADD CONSTRAINT "TradingBrief_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Add tradingBriefs relation to User
-- (Prisma handles this via the relation definition in schema)
