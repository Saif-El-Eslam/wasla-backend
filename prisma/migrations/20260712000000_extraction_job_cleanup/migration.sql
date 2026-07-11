ALTER TABLE "ExtractionJob"
ADD COLUMN "retryExpiresAt" TIMESTAMP(3),
ADD COLUMN "cleanedUpAt" TIMESTAMP(3);

CREATE INDEX "ExtractionJob_status_retryExpiresAt_idx"
ON "ExtractionJob"("status", "retryExpiresAt");

UPDATE "ExtractionJob"
SET "retryExpiresAt" = "updatedAt" + INTERVAL '1 day'
WHERE "status" IN ('FAILED', 'REJECTED');

DELETE FROM "ExtractionJobImage" AS image
USING "ExtractionJob" AS job
WHERE image."jobId" = job."id"
  AND (
    job."status" = 'APPROVED'
    OR (
      job."status" IN ('FAILED', 'REJECTED')
      AND job."retryExpiresAt" <= CURRENT_TIMESTAMP
    )
  );

UPDATE "ExtractionJob"
SET
  "rawModelResponse" = NULL,
  "extractedMenu" = NULL,
  "confidenceScore" = NULL,
  "providerResponseId" = NULL,
  "warnings" = ARRAY[]::TEXT[],
  "cleanedUpAt" = CASE
    WHEN "status" = 'APPROVED' OR "retryExpiresAt" <= CURRENT_TIMESTAMP
      THEN CURRENT_TIMESTAMP
    ELSE "cleanedUpAt"
  END
WHERE "status" IN ('APPROVED', 'FAILED', 'REJECTED');
