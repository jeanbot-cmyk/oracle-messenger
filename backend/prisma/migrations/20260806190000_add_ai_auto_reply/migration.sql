-- Gemini Auto-Réponse Premium
CREATE TABLE "AiAutoConfig" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "paidActive" BOOLEAN NOT NULL DEFAULT false,
  "prompt" TEXT NOT NULL,
  "delayMs" INTEGER NOT NULL DEFAULT 5000,
  "recipientScope" TEXT NOT NULL DEFAULT 'private_only',
  "dailyLimit" INTEGER,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiAutoConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiWallet" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "wordsRemaining" INTEGER NOT NULL DEFAULT 0,
  "wordsConsumed" INTEGER NOT NULL DEFAULT 0,
  "valueRemainingFcfa" INTEGER NOT NULL DEFAULT 0,
  "totalResponses" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiWallet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiPayment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "planCode" TEXT NOT NULL,
  "amountFcfa" INTEGER NOT NULL,
  "words" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "authorizationUrl" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiUsageLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conversationId" TEXT,
  "messageId" TEXT,
  "mode" TEXT NOT NULL DEFAULT 'auto',
  "words" INTEGER NOT NULL,
  "costFcfa" INTEGER NOT NULL,
  "response" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiPlan" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "priceFcfa" INTEGER NOT NULL,
  "words" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiSetting" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiAutoConfig_userId_key" ON "AiAutoConfig"("userId");
CREATE UNIQUE INDEX "AiWallet_userId_key" ON "AiWallet"("userId");
CREATE UNIQUE INDEX "AiPayment_reference_key" ON "AiPayment"("reference");
CREATE INDEX "AiPayment_userId_createdAt_idx" ON "AiPayment"("userId", "createdAt" DESC);
CREATE INDEX "AiUsageLog_userId_createdAt_idx" ON "AiUsageLog"("userId", "createdAt" DESC);
CREATE INDEX "AiUsageLog_conversationId_idx" ON "AiUsageLog"("conversationId");
CREATE UNIQUE INDEX "AiPlan_code_key" ON "AiPlan"("code");
CREATE UNIQUE INDEX "AiSetting_key_key" ON "AiSetting"("key");

ALTER TABLE "AiAutoConfig" ADD CONSTRAINT "AiAutoConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiWallet" ADD CONSTRAINT "AiWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiPayment" ADD CONSTRAINT "AiPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "AiPlan" ("id", "code", "label", "type", "priceFcfa", "words", "enabled", "sortOrder", "updatedAt")
VALUES
  ('ai_plan_activation_1500', 'activation_1500', 'Activation IA Premium', 'activation', 1500, 750, true, 10, CURRENT_TIMESTAMP),
  ('ai_plan_recharge_2000', 'recharge_2000', 'Recharge 3 000 mots', 'recharge', 2000, 3000, true, 20, CURRENT_TIMESTAMP),
  ('ai_plan_recharge_5000', 'recharge_5000', 'Recharge 8 000 mots', 'recharge', 5000, 8000, true, 30, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "AiSetting" ("id", "key", "value", "updatedAt")
VALUES
  ('ai_setting_service_enabled', 'service_enabled', 'true', CURRENT_TIMESTAMP),
  ('ai_setting_cost_per_word_fcfa', 'cost_per_word_fcfa', '2', CURRENT_TIMESTAMP),
  ('ai_setting_daily_limit_default', 'daily_limit_default', '200', CURRENT_TIMESTAMP),
  ('ai_setting_gemini_model', 'gemini_model', 'gemini-1.5-flash', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
