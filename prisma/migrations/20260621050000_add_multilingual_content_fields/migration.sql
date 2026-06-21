-- Add multilingual content fields (French, Turkish, Spanish) to ContentArticle
-- These are nullable because existing articles won't have translations yet.
-- New articles generated after the V9 update will have all 5 languages.

ALTER TABLE "ContentArticle" ADD COLUMN "titleFr"   TEXT;
ALTER TABLE "ContentArticle" ADD COLUMN "contentFr" TEXT;
ALTER TABLE "ContentArticle" ADD COLUMN "summaryFr" TEXT;
ALTER TABLE "ContentArticle" ADD COLUMN "titleTr"   TEXT;
ALTER TABLE "ContentArticle" ADD COLUMN "contentTr" TEXT;
ALTER TABLE "ContentArticle" ADD COLUMN "summaryTr" TEXT;
ALTER TABLE "ContentArticle" ADD COLUMN "titleEs"   TEXT;
ALTER TABLE "ContentArticle" ADD COLUMN "contentEs" TEXT;
ALTER TABLE "ContentArticle" ADD COLUMN "summaryEs" TEXT;
