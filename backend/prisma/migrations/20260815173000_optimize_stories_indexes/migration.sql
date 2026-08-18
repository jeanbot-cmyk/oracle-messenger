CREATE INDEX IF NOT EXISTS "Story_authorId_expiresAt_createdAt_idx"
  ON "Story"("authorId", "expiresAt", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Story_expiresAt_createdAt_idx"
  ON "Story"("expiresAt", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "StoryView_userId_storyId_idx"
  ON "StoryView"("userId", "storyId");

CREATE INDEX IF NOT EXISTS "StoryView_storyId_viewedAt_idx"
  ON "StoryView"("storyId", "viewedAt" DESC);
