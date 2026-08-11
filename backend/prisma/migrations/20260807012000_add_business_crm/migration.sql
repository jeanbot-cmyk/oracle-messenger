-- CreateTable
CREATE TABLE "BusinessClient" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "customerUserId" TEXT,
    "conversationId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'prospect',
    "tags" TEXT NOT NULL DEFAULT 'prospect',
    "notes" TEXT NOT NULL DEFAULT '',
    "value" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "lastIntent" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessReminder" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "clientId" TEXT,
    "conversationId" TEXT,
    "title" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessClient_ownerId_updatedAt_idx" ON "BusinessClient"("ownerId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "BusinessClient_ownerId_conversationId_idx" ON "BusinessClient"("ownerId", "conversationId");

-- CreateIndex
CREATE INDEX "BusinessClient_ownerId_customerUserId_idx" ON "BusinessClient"("ownerId", "customerUserId");

-- CreateIndex
CREATE INDEX "BusinessReminder_ownerId_dueAt_idx" ON "BusinessReminder"("ownerId", "dueAt");

-- CreateIndex
CREATE INDEX "BusinessReminder_clientId_idx" ON "BusinessReminder"("clientId");

-- AddForeignKey
ALTER TABLE "BusinessClient" ADD CONSTRAINT "BusinessClient_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessClient" ADD CONSTRAINT "BusinessClient_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessReminder" ADD CONSTRAINT "BusinessReminder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessReminder" ADD CONSTRAINT "BusinessReminder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "BusinessClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
