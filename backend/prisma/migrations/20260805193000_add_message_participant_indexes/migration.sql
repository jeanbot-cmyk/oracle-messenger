-- Optimise conversation loading, unread counts, message history and replies.
CREATE INDEX IF NOT EXISTS "Participant_conversationId_idx"
  ON "Participant" ("conversationId");

CREATE INDEX IF NOT EXISTS "Participant_userId_lastReadAt_idx"
  ON "Participant" ("userId", "lastReadAt");

CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx"
  ON "Message" ("conversationId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Message_conversationId_senderId_createdAt_idx"
  ON "Message" ("conversationId", "senderId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Message_senderId_createdAt_idx"
  ON "Message" ("senderId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Message_replyToId_idx"
  ON "Message" ("replyToId");
