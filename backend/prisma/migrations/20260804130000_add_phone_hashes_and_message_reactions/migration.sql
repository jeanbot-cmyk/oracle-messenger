ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "phoneHash" TEXT,
  ADD COLUMN IF NOT EXISTS "phoneDigitsHash" TEXT,
  ADD COLUMN IF NOT EXISTS "phoneLast8Hash" TEXT,
  ADD COLUMN IF NOT EXISTS "phoneLast9Hash" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_phoneHash_key" ON "User"("phoneHash");
CREATE INDEX IF NOT EXISTS "User_phoneDigitsHash_idx" ON "User"("phoneDigitsHash");
CREATE INDEX IF NOT EXISTS "User_phoneLast8Hash_idx" ON "User"("phoneLast8Hash");
CREATE INDEX IF NOT EXISTS "User_phoneLast9Hash_idx" ON "User"("phoneLast9Hash");

CREATE TABLE IF NOT EXISTS "MessageReaction" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MessageReaction_messageId_userId_key"
  ON "MessageReaction"("messageId", "userId");
CREATE INDEX IF NOT EXISTS "MessageReaction_messageId_idx" ON "MessageReaction"("messageId");
CREATE INDEX IF NOT EXISTS "MessageReaction_userId_idx" ON "MessageReaction"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MessageReaction_messageId_fkey'
  ) THEN
    ALTER TABLE "MessageReaction"
      ADD CONSTRAINT "MessageReaction_messageId_fkey"
      FOREIGN KEY ("messageId") REFERENCES "Message"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MessageReaction_userId_fkey'
  ) THEN
    ALTER TABLE "MessageReaction"
      ADD CONSTRAINT "MessageReaction_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
