-- One-time compatibility patch for the existing Block 8 database.
-- Preflight: User and the other auth tables already exist; RefreshToken is absent.
-- Adds only the Block 9 RefreshToken table, indexes, foreign keys and RLS.
-- Do not run the original create-all-auth migration against this Block 8 database.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE public."RefreshToken" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "familyId" TEXT NOT NULL,
  "passwordVersion" INTEGER NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "replacedById" TEXT,
  CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RefreshToken_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES public."RefreshToken"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON public."RefreshToken"("tokenHash");
CREATE UNIQUE INDEX "RefreshToken_replacedById_key" ON public."RefreshToken"("replacedById");
CREATE INDEX "RefreshToken_familyId_idx" ON public."RefreshToken"("familyId");
CREATE INDEX "RefreshToken_userId_idx" ON public."RefreshToken"("userId");
CREATE INDEX "RefreshToken_expiresAt_idx" ON public."RefreshToken"("expiresAt");
ALTER TABLE public."RefreshToken" ENABLE ROW LEVEL SECURITY;
COMMIT;
