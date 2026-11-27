-- CreateEnum
CREATE TYPE "PhotoStatus" AS ENUM ('PUBLISHED', 'DELETING');

-- CreateEnum
CREATE TYPE "CleanupStatus" AS ENUM ('PENDING', 'DONE');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "sid" TEXT NOT NULL,
    "userId" UUID,
    "data" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("sid")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" UUID NOT NULL,
    "uploaderId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "alt" VARCHAR(300) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "status" "PhotoStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoVariant" (
    "id" UUID NOT NULL,
    "photoId" UUID NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "mime" TEXT NOT NULL DEFAULT 'image/webp',
    "bytes" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "chunkSize" INTEGER NOT NULL DEFAULT 1048576,
    "chunkCount" INTEGER NOT NULL,
    "storagePrefix" TEXT NOT NULL,

    CONSTRAINT "PhotoVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoChunk" (
    "id" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "partNumber" INTEGER NOT NULL,
    "offset" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "storageKey" TEXT NOT NULL,

    CONSTRAINT "PhotoChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageCleanupTask" (
    "id" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" "CleanupStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageCleanupTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Photo_status_createdAt_id_idx" ON "Photo"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Photo_uploaderId_idx" ON "Photo"("uploaderId");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoVariant_storagePrefix_key" ON "PhotoVariant"("storagePrefix");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoVariant_photoId_width_key" ON "PhotoVariant"("photoId", "width");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoChunk_storageKey_key" ON "PhotoChunk"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoChunk_variantId_partNumber_key" ON "PhotoChunk"("variantId", "partNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StorageCleanupTask_storageKey_key" ON "StorageCleanupTask"("storageKey");

-- CreateIndex
CREATE INDEX "StorageCleanupTask_status_createdAt_idx" ON "StorageCleanupTask"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoVariant" ADD CONSTRAINT "PhotoVariant_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoChunk" ADD CONSTRAINT "PhotoChunk_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "PhotoVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Application invariants also enforced when data is written outside Prisma.
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_dimensions_check" CHECK ("width" > 0 AND "height" > 0 AND "width"::bigint * "height" <= 40000000);
ALTER TABLE "PhotoVariant" ADD CONSTRAINT "PhotoVariant_dimensions_check" CHECK ("width" > 0 AND "height" > 0 AND "bytes" > 0 AND "mime" = 'image/webp');
ALTER TABLE "PhotoVariant" ADD CONSTRAINT "PhotoVariant_chunks_check" CHECK ("chunkSize" = 1048576 AND "chunkCount" = (("bytes"::bigint + 1048575) / 1048576));
ALTER TABLE "PhotoVariant" ADD CONSTRAINT "PhotoVariant_hash_check" CHECK ("sha256" ~ '^[a-f0-9]{64}$');
ALTER TABLE "PhotoChunk" ADD CONSTRAINT "PhotoChunk_bounds_check" CHECK ("partNumber" > 0 AND "offset"::bigint = ("partNumber"::bigint - 1) * 1048576 AND "bytes" > 0 AND "bytes" <= 1048576);
ALTER TABLE "PhotoChunk" ADD CONSTRAINT "PhotoChunk_hash_check" CHECK ("sha256" ~ '^[a-f0-9]{64}$');
