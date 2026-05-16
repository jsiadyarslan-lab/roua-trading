-- CreateTable
CREATE TABLE "PredictionEvent" (
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
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "impactAssessment" TEXT,
    "signalBoost" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PredictionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PredictionEvent_source_sourceId_key" ON "PredictionEvent"("source", "sourceId");

-- CreateIndex
CREATE INDEX "PredictionEvent_status_idx" ON "PredictionEvent"("status");

-- CreateIndex
CREATE INDEX "PredictionEvent_category_idx" ON "PredictionEvent"("category");

-- CreateIndex
CREATE INDEX "PredictionEvent_endDate_idx" ON "PredictionEvent"("endDate");

-- CreateIndex
CREATE INDEX "PredictionEvent_status_endDate_idx" ON "PredictionEvent"("status", "endDate");

-- CreateIndex
CREATE INDEX "PredictionEvent_predictionGap_idx" ON "PredictionEvent"("predictionGap");

-- CreateIndex
CREATE INDEX "PredictionEvent_lastSyncedAt_idx" ON "PredictionEvent"("lastSyncedAt");

-- CreateIndex
CREATE INDEX "PredictionEvent_source_idx" ON "PredictionEvent"("source");
