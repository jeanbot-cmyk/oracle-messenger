ALTER TABLE "MessageLocalSave"
  ADD COLUMN IF NOT EXISTS "deliveryState" TEXT NOT NULL DEFAULT 'UPLOADED',
  ADD COLUMN IF NOT EXISTS "downloadedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "locallySavedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ackConfirmedAt" TIMESTAMP(3);

UPDATE "MessageLocalSave"
SET
  "deliveryState" = 'ACK_CONFIRMED',
  "downloadedAt" = COALESCE("downloadedAt", "updatedAt", "createdAt"),
  "locallySavedAt" = COALESCE("locallySavedAt", "updatedAt", "createdAt"),
  "ackConfirmedAt" = COALESCE("ackConfirmedAt", "updatedAt", "createdAt")
WHERE "deliveryState" IS NULL OR "deliveryState" = 'ACK_CONFIRMED';
