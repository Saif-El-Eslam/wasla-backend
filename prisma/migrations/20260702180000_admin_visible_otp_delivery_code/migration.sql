-- Stores the temporary OTP delivery value encrypted at rest.
-- Verification continues to validate against codeHash.
ALTER TABLE "OtpCode" ADD COLUMN "deliveryCodeEncrypted" TEXT;
