import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { HttpError } from '../common/http/http-error';

function assertStorageConfigured() {
  if (
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_BUCKET_NAME ||
    !env.R2_PUBLIC_BASE_URL
  ) {
    throw new HttpError(503, 'Storage is not configured');
  }
}

function createClient() {
  assertStorageConfigured();

  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? '',
    },
  });
}

export async function uploadObject(input: { key: string; body: Buffer; contentType: string }) {
  const client = createClient();

  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    }),
  );

  return `${env.R2_PUBLIC_BASE_URL}/${input.key}`;
}
