-- Indexes for conversation, message history and unread-count queries.
CREATE INDEX "Conversation_updatedAt_idx" ON "Conversation"("updatedAt" DESC);
CREATE INDEX "Participant_conversationId_idx" ON "Participant"("conversationId");
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt" DESC);
CREATE INDEX "Message_conversationId_senderId_status_idx" ON "Message"("conversationId", "senderId", "status");
CREATE INDEX "Message_conversationId_senderId_isDeleted_createdAt_idx" ON "Message"("conversationId", "senderId", "isDeleted", "createdAt");
