CREATE TABLE IF NOT EXISTS "ConferenceSubscription" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
  "planCode" TEXT NOT NULL DEFAULT 'conference_50_70m',
  "capacity" INTEGER NOT NULL DEFAULT 50,
  "activeUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ConferencePayment" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "reference" TEXT NOT NULL UNIQUE,
  "planCode" TEXT NOT NULL,
  "amountFcfa" INTEGER NOT NULL,
  "capacity" INTEGER NOT NULL,
  "months" INTEGER NOT NULL DEFAULT 0,
  "durationMinutes" INTEGER NOT NULL DEFAULT 70,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "authorizationUrl" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ConferenceRoom" (
  "id" TEXT PRIMARY KEY,
  "hostId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "slug" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "phone" TEXT,
  "contactInfo" TEXT,
  "coverUrl" TEXT,
  "speakerName" TEXT,
  "scheduledAt" TIMESTAMP(3),
  "durationMinutes" INTEGER NOT NULL DEFAULT 70,
  "logoUrl" TEXT,
  "visualIdentity" TEXT,
  "sourceMode" TEXT NOT NULL DEFAULT 'camera',
  "prerecordedLocalName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "planCode" TEXT NOT NULL DEFAULT 'conference_50_70m',
  "capacity" INTEGER NOT NULL DEFAULT 50,
  "aiWordLimit" INTEGER NOT NULL DEFAULT 3500,
  "aiWordsUsed" INTEGER NOT NULL DEFAULT 0,
  "livekitRoom" TEXT NOT NULL UNIQUE,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ConferenceParticipant" (
  "id" TEXT PRIMARY KEY,
  "roomId" TEXT NOT NULL REFERENCES "ConferenceRoom"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL DEFAULT 'viewer',
  "handStatus" TEXT NOT NULL DEFAULT 'none',
  "handRaisedAt" TIMESTAMP(3),
  "micAllowed" BOOLEAN NOT NULL DEFAULT FALSE,
  "micAllowedAt" TIMESTAMP(3),
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("roomId", "userId")
);

CREATE TABLE IF NOT EXISTS "ConferenceQuestion" (
  "id" TEXT PRIMARY KEY,
  "roomId" TEXT NOT NULL REFERENCES "ConferenceRoom"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "content" TEXT NOT NULL,
  "answer" TEXT,
  "isPinned" BOOLEAN NOT NULL DEFAULT FALSE,
  "isAnswered" BOOLEAN NOT NULL DEFAULT FALSE,
  "isDeleted" BOOLEAN NOT NULL DEFAULT FALSE,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ConferenceReaction" (
  "id" TEXT PRIMARY KEY,
  "roomId" TEXT NOT NULL REFERENCES "ConferenceRoom"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ConferencePoll" (
  "id" TEXT PRIMARY KEY,
  "roomId" TEXT NOT NULL REFERENCES "ConferenceRoom"("id") ON DELETE CASCADE,
  "question" TEXT NOT NULL,
  "options" TEXT NOT NULL DEFAULT '[]',
  "showResults" BOOLEAN NOT NULL DEFAULT TRUE,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ConferencePollVote" (
  "id" TEXT PRIMARY KEY,
  "pollId" TEXT NOT NULL REFERENCES "ConferencePoll"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "optionIndex" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("pollId", "userId")
);

CREATE TABLE IF NOT EXISTS "ConferenceDocument" (
  "id" TEXT PRIMARY KEY,
  "roomId" TEXT NOT NULL REFERENCES "ConferenceRoom"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "url" TEXT,
  "mime" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'link',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ConferenceAiSummary" (
  "id" TEXT PRIMARY KEY,
  "roomId" TEXT NOT NULL REFERENCES "ConferenceRoom"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "promptType" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "ConferenceSubscription" ALTER COLUMN "planCode" SET DEFAULT 'conference_50_70m';
ALTER TABLE "ConferencePayment" ALTER COLUMN "months" SET DEFAULT 0;
ALTER TABLE "ConferencePayment" ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER NOT NULL DEFAULT 70;
ALTER TABLE "ConferencePayment" ALTER COLUMN "durationMinutes" SET DEFAULT 70;
ALTER TABLE "ConferenceRoom" ADD COLUMN IF NOT EXISTS "coverUrl" TEXT;
ALTER TABLE "ConferenceRoom" ADD COLUMN IF NOT EXISTS "speakerName" TEXT;
ALTER TABLE "ConferenceRoom" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3);
ALTER TABLE "ConferenceRoom" ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER NOT NULL DEFAULT 70;
ALTER TABLE "ConferenceRoom" ALTER COLUMN "durationMinutes" SET DEFAULT 70;
ALTER TABLE "ConferenceRoom" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "ConferenceRoom" ADD COLUMN IF NOT EXISTS "planCode" TEXT NOT NULL DEFAULT 'conference_50_70m';
ALTER TABLE "ConferenceRoom" ADD COLUMN IF NOT EXISTS "aiWordLimit" INTEGER NOT NULL DEFAULT 3500;
ALTER TABLE "ConferenceRoom" ADD COLUMN IF NOT EXISTS "aiWordsUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ConferenceParticipant" ADD COLUMN IF NOT EXISTS "handStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "ConferenceParticipant" ADD COLUMN IF NOT EXISTS "handRaisedAt" TIMESTAMP(3);
ALTER TABLE "ConferenceParticipant" ADD COLUMN IF NOT EXISTS "micAllowed" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "ConferenceParticipant" ADD COLUMN IF NOT EXISTS "micAllowedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ConferenceRoom_hostId_updatedAt_idx" ON "ConferenceRoom"("hostId", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "ConferenceRoom_status_idx" ON "ConferenceRoom"("status");
CREATE INDEX IF NOT EXISTS "ConferenceParticipant_room_active_idx" ON "ConferenceParticipant"("roomId", "leftAt", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "ConferenceParticipant_hand_idx" ON "ConferenceParticipant"("roomId", "handStatus", "handRaisedAt");
CREATE INDEX IF NOT EXISTS "ConferenceQuestion_room_createdAt_idx" ON "ConferenceQuestion"("roomId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ConferenceReaction_room_createdAt_idx" ON "ConferenceReaction"("roomId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ConferencePoll_room_createdAt_idx" ON "ConferencePoll"("roomId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ConferenceDocument_room_createdAt_idx" ON "ConferenceDocument"("roomId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ConferencePayment_user_createdAt_idx" ON "ConferencePayment"("userId", "createdAt" DESC);
