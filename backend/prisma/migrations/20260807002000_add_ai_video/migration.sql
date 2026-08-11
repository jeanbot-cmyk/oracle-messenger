-- CreateTable
CREATE TABLE "AiVideoPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "amountFcfa" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "authorizationUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiVideoPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiVideoGeneration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'premium',
    "mime" TEXT,
    "videoBytes" INTEGER,
    "videoHash" TEXT,
    "durationSeconds" INTEGER NOT NULL,
    "aspectRatio" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "referenceCount" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiVideoGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiVideoPayment_reference_key" ON "AiVideoPayment"("reference");

-- CreateIndex
CREATE INDEX "AiVideoPayment_userId_createdAt_idx" ON "AiVideoPayment"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AiVideoGeneration_userId_createdAt_idx" ON "AiVideoGeneration"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "AiVideoPayment" ADD CONSTRAINT "AiVideoPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiVideoGeneration" ADD CONSTRAINT "AiVideoGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
