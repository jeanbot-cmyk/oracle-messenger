CREATE TABLE "AiFlyerWallet" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "creditsRemaining" INTEGER NOT NULL DEFAULT 0,
  "creditsPurchased" INTEGER NOT NULL DEFAULT 0,
  "creditsConsumed" INTEGER NOT NULL DEFAULT 0,
  "totalGenerated" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiFlyerWallet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiFlyerPayment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "amountFcfa" INTEGER NOT NULL,
  "credits" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "authorizationUrl" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiFlyerPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiFlyerGeneration" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'paid',
  "mime" TEXT,
  "imageBytes" INTEGER,
  "imageHash" TEXT,
  "title" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiFlyerGeneration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiFlyerWallet_userId_key" ON "AiFlyerWallet"("userId");
CREATE UNIQUE INDEX "AiFlyerPayment_reference_key" ON "AiFlyerPayment"("reference");
CREATE INDEX "AiFlyerPayment_userId_createdAt_idx" ON "AiFlyerPayment"("userId", "createdAt" DESC);
CREATE INDEX "AiFlyerGeneration_userId_createdAt_idx" ON "AiFlyerGeneration"("userId", "createdAt" DESC);

ALTER TABLE "AiFlyerWallet" ADD CONSTRAINT "AiFlyerWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiFlyerPayment" ADD CONSTRAINT "AiFlyerPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiFlyerGeneration" ADD CONSTRAINT "AiFlyerGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
