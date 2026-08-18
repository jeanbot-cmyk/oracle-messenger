ALTER TABLE "AiFlyerGeneration" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "AiFlyerGeneration" ADD COLUMN IF NOT EXISTS "downloadedAt" TIMESTAMP(3);
ALTER TABLE "AiFlyerGeneration" ADD COLUMN IF NOT EXISTS "purgedAt" TIMESTAMP(3);

ALTER TABLE "AiVideoGeneration" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "AiVideoGeneration" ADD COLUMN IF NOT EXISTS "downloadedAt" TIMESTAMP(3);
ALTER TABLE "AiVideoGeneration" ADD COLUMN IF NOT EXISTS "purgedAt" TIMESTAMP(3);

UPDATE "AiFlyerGeneration"
SET "expiresAt" = COALESCE("expiresAt", "completedAt" + INTERVAL '12 hours')
WHERE "status" = 'DOWNLOADABLE'
  AND "completedAt" IS NOT NULL
  AND "expiresAt" IS NULL;

UPDATE "AiVideoGeneration"
SET "expiresAt" = COALESCE("expiresAt", "completedAt" + INTERVAL '12 hours')
WHERE "status" = 'DOWNLOADABLE'
  AND "completedAt" IS NOT NULL
  AND "expiresAt" IS NULL;

CREATE INDEX IF NOT EXISTS "AiFlyerGeneration_status_expiresAt_idx"
  ON "AiFlyerGeneration"("status", "expiresAt");

CREATE INDEX IF NOT EXISTS "AiVideoGeneration_status_expiresAt_idx"
  ON "AiVideoGeneration"("status", "expiresAt");
