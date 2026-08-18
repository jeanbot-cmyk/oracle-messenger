ALTER TABLE "Participant"
  ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'member';

UPDATE "Participant" p
SET "role" = 'admin'
FROM (
  SELECT DISTINCT ON ("conversationId") "id"
  FROM "Participant"
  ORDER BY "conversationId", "joinedAt" ASC
) first_participants
INNER JOIN "Conversation" c ON c."id" = (
  SELECT "conversationId" FROM "Participant" WHERE "id" = first_participants."id"
)
WHERE p."id" = first_participants."id"
  AND c."type" = 'group';
