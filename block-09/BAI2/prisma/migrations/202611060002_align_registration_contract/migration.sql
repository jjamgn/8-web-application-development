-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('pending', 'active');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'viewer',
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'pending';

-- Preserve the agreed invariant for any accounts verified before this migration.
UPDATE "User" SET "status" = 'active' WHERE "emailVerifiedAt" IS NOT NULL;

-- AlterTable
ALTER TABLE "EmailVerification" ADD COLUMN     "usedAt" TIMESTAMP(3);
