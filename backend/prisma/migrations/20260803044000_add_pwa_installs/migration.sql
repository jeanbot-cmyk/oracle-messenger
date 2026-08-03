-- Persist PWA installs instead of keeping them in backend memory.
CREATE TABLE IF NOT EXISTS "PwaInstall" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userAgent" TEXT,

  CONSTRAINT "PwaInstall_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PwaInstall_userId_key" ON "PwaInstall"("userId");

ALTER TABLE "PwaInstall"
  ADD CONSTRAINT "PwaInstall_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
