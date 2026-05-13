-- CreateEnum
CREATE TYPE "InfographicStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Infographic" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT,
    "contentAr" TEXT NOT NULL DEFAULT '',
    "contentEn" TEXT,
    "summaryAr" TEXT,
    "summaryEn" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "categoryAr" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "relatedSymbols" TEXT NOT NULL DEFAULT '[]',
    "imageUrl" TEXT,
    "imagePrompt" TEXT,
    "imageSource" TEXT DEFAULT 'none',
    "aiModel" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "qualityScore" INTEGER NOT NULL DEFAULT 0,
    "status" "InfographicStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Infographic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Infographic_slug_key" ON "Infographic"("slug");
CREATE INDEX "Infographic_slug_idx" ON "Infographic"("slug");
CREATE INDEX "Infographic_category_idx" ON "Infographic"("category");
CREATE INDEX "Infographic_status_idx" ON "Infographic"("status");
CREATE INDEX "Infographic_publishedAt_idx" ON "Infographic"("publishedAt");
CREATE INDEX "Infographic_createdAt_idx" ON "Infographic"("createdAt");
CREATE INDEX "Infographic_status_publishedAt_idx" ON "Infographic"("status", "publishedAt");
