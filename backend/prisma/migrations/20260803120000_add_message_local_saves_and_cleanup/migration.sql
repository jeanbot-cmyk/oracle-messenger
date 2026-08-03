-- Track which participants have stored a media message locally.
CREATE TABLE IF NOT EXISTS "MessageLocalSave" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MessageLocalSave_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MessageLocalSave_messageId_userId_key"
  ON "MessageLocalSave"("messageId", "userId");

CREATE INDEX IF NOT EXISTS "MessageLocalSave_messageId_idx"
  ON "MessageLocalSave"("messageId");

CREATE INDEX IF NOT EXISTS "MessageLocalSave_userId_idx"
  ON "MessageLocalSave"("userId");

ALTER TABLE "MessageLocalSave"
  ADD CONSTRAINT "MessageLocalSave_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
