ALTER TABLE "Conversation"
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "messagePolicy" TEXT NOT NULL DEFAULT 'ALL_PARTICIPANTS';

ALTER TABLE "Participant"
  ADD COLUMN IF NOT EXISTS "canSendMessages" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "GroupInvitation" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "invitedUserId" TEXT NOT NULL,
  "invitedById" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "respondedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GroupInvitation_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GroupInvitation_conversationId_fkey'
  ) THEN
    ALTER TABLE "GroupInvitation"
      ADD CONSTRAINT "GroupInvitation_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GroupInvitation_invitedUserId_fkey'
  ) THEN
    ALTER TABLE "GroupInvitation"
      ADD CONSTRAINT "GroupInvitation_invitedUserId_fkey"
      FOREIGN KEY ("invitedUserId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GroupInvitation_invitedById_fkey'
  ) THEN
    ALTER TABLE "GroupInvitation"
      ADD CONSTRAINT "GroupInvitation_invitedById_fkey"
      FOREIGN KEY ("invitedById") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "GroupInvitation_conversationId_invitedUserId_key"
  ON "GroupInvitation"("conversationId", "invitedUserId");

CREATE INDEX IF NOT EXISTS "GroupInvitation_invitedUserId_status_idx"
  ON "GroupInvitation"("invitedUserId", "status");

CREATE INDEX IF NOT EXISTS "GroupInvitation_conversationId_status_idx"
  ON "GroupInvitation"("conversationId", "status");

CREATE INDEX IF NOT EXISTS "GroupInvitation_invitedById_idx"
  ON "GroupInvitation"("invitedById");
