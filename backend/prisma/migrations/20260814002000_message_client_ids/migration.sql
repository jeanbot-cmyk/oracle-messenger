ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "clientMessageId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Message_senderId_clientMessageId_key"
  ON "Message"("senderId", "clientMessageId");
