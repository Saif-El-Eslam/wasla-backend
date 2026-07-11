ALTER TABLE "ExtractionJob"
ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN "providerResponseId" TEXT;

CREATE TABLE "ExtractionJobImage" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExtractionJobImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExtractionJob_status_nextAttemptAt_idx"
ON "ExtractionJob"("status", "nextAttemptAt");

CREATE INDEX "ExtractionJobImage_jobId_idx" ON "ExtractionJobImage"("jobId");

CREATE UNIQUE INDEX "ExtractionJobImage_jobId_sortOrder_key"
ON "ExtractionJobImage"("jobId", "sortOrder");

ALTER TABLE "ExtractionJobImage"
ADD CONSTRAINT "ExtractionJobImage_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "ExtractionJob"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
