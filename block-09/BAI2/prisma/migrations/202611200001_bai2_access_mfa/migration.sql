BEGIN;
ALTER TABLE "User"
  ADD COLUMN "chefId" INTEGER,
  ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mfaSecretEncrypted" TEXT,
  ADD COLUMN "mfaLastUsedStep" BIGINT;
ALTER TABLE "User" ADD CONSTRAINT "User_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "Chef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_role_chef_check" CHECK (
  (role = 'editor' AND "chefId" IS NOT NULL) OR (role IN ('viewer','admin') AND "chefId" IS NULL)
);
ALTER TABLE "Dish" ADD COLUMN "status" VARCHAR(16) NOT NULL DEFAULT 'published';
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_status_check" CHECK (status IN ('draft','published'));
CREATE TABLE "RecoveryCode" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "codeHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usedAt" TIMESTAMP(3),
  CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RecoveryCode_codeHash_key" ON "RecoveryCode"("codeHash");
CREATE INDEX "RecoveryCode_userId_idx" ON "RecoveryCode"("userId");
COMMIT;
