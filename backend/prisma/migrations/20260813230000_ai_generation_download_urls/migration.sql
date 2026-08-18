ALTER TABLE "AiFlyerGeneration" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'COMPLETED';
ALTER TABLE "AiFlyerGeneration" ADD COLUMN IF NOT EXISTS "fileUrl" TEXT;
ALTER TABLE "AiFlyerGeneration" ADD COLUMN IF NOT EXISTS "downloadUrl" TEXT;
ALTER TABLE "AiFlyerGeneration" ADD COLUMN IF NOT EXISTS "filePath" TEXT;
ALTER TABLE "AiFlyerGeneration" ADD COLUMN IF NOT EXISTS "fileName" TEXT;
ALTER TABLE "AiFlyerGeneration" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "AiFlyerGeneration" ADD COLUMN IF NOT EXISTS "failedAt" TIMESTAMP(3);

ALTER TABLE "AiVideoGeneration" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'COMPLETED';
ALTER TABLE "AiVideoGeneration" ADD COLUMN IF NOT EXISTS "fileUrl" TEXT;
ALTER TABLE "AiVideoGeneration" ADD COLUMN IF NOT EXISTS "downloadUrl" TEXT;
ALTER TABLE "AiVideoGeneration" ADD COLUMN IF NOT EXISTS "filePath" TEXT;
ALTER TABLE "AiVideoGeneration" ADD COLUMN IF NOT EXISTS "fileName" TEXT;
ALTER TABLE "AiVideoGeneration" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "AiVideoGeneration" ADD COLUMN IF NOT EXISTS "failedAt" TIMESTAMP(3);

UPDATE "AiFlyerGeneration"
SET "status" = 'COMPLETED', "completedAt" = COALESCE("completedAt", "createdAt")
WHERE "completedAt" IS NULL;

UPDATE "AiVideoGeneration"
SET "status" = 'COMPLETED', "completedAt" = COALESCE("completedAt", "createdAt")
WHERE "completedAt" IS NULL;
