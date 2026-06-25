-- CreateEnum
CREATE TYPE "ExtractionJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ExtractionJob" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "requestedById" TEXT,
    "status" "ExtractionJobStatus" NOT NULL DEFAULT 'PENDING',
    "modelProvider" TEXT NOT NULL DEFAULT 'google',
    "modelName" TEXT NOT NULL,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "rawModelResponse" TEXT,
    "extractedMenu" JSONB,
    "confidenceScore" DOUBLE PRECISION,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "errors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtractionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExtractionJob_venueId_createdAt_idx" ON "ExtractionJob"("venueId", "createdAt");

-- CreateIndex
CREATE INDEX "ExtractionJob_branchId_createdAt_idx" ON "ExtractionJob"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "ExtractionJob_menuId_status_idx" ON "ExtractionJob"("menuId", "status");

-- AddForeignKey
ALTER TABLE "ExtractionJob" ADD CONSTRAINT "ExtractionJob_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
