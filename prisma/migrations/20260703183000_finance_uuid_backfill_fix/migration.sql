-- Fix finance defaults that were backfilled with deterministic non-UUID ids.
-- The API validates categoryId/paymentMethodId as UUIDs, so existing seeded rows
-- must use the same id format as Prisma-created rows. Foreign keys cascade on
-- update, preserving any transaction references.

UPDATE "TransactionCategory"
SET "id" = lower(
        substr(md5("id"), 1, 8) || '-' ||
        substr(md5("id"), 9, 4) || '-' ||
        '4' || substr(md5("id"), 14, 3) || '-' ||
        'a' || substr(md5("id"), 18, 3) || '-' ||
        substr(md5("id"), 21, 12)
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" LIKE 'finance-category-%';

UPDATE "PaymentMethod"
SET "id" = lower(
        substr(md5("id"), 1, 8) || '-' ||
        substr(md5("id"), 9, 4) || '-' ||
        '4' || substr(md5("id"), 14, 3) || '-' ||
        'a' || substr(md5("id"), 18, 3) || '-' ||
        substr(md5("id"), 21, 12)
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" LIKE 'finance-payment-%';
