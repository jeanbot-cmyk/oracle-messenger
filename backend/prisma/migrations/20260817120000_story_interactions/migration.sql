CREATE TABLE "StoryInteraction" (
  "id" TEXT NOT NULL,
  "storyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "content" TEXT,
  "emoji" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StoryInteraction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StoryInteraction_storyId_createdAt_idx" ON "StoryInteraction"("storyId", "createdAt" DESC);
CREATE INDEX "StoryInteraction_userId_createdAt_idx" ON "StoryInteraction"("userId", "createdAt" DESC);
CREATE UNIQUE INDEX "StoryInteraction_storyId_userId_type_emoji_key" ON "StoryInteraction"("storyId", "userId", "type", "emoji");

ALTER TABLE "StoryInteraction"
  ADD CONSTRAINT "StoryInteraction_storyId_fkey"
  FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoryInteraction"
  ADD CONSTRAINT "StoryInteraction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
