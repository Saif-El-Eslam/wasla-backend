import crypto from 'node:crypto';
import { env } from '../config/env';
import { HttpError } from '../common/http/http-error';

type ImageUploadScope = 'venue' | 'branch' | 'menu-category' | 'menu-item' | 'qr' | 'misc';

export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;

export type ImageUploadSignature = {
  provider: 'cloudinary';
  uploadUrl: string;
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
  maxBytes: number;
};

function cloudinaryConfig() {
  if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
    return {
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      apiSecret: env.CLOUDINARY_API_SECRET,
    };
  }

  if (env.CLOUDINARY_URL) {
    try {
      const url = new URL(env.CLOUDINARY_URL);
      const apiKey = decodeURIComponent(url.username);
      const apiSecret = decodeURIComponent(url.password);
      const cloudName = url.hostname;

      if (cloudName && apiKey && apiSecret) {
        return { cloudName, apiKey, apiSecret };
      }
    } catch {
      // Fall through to the explicit error below.
    }
  }

  throw new HttpError(503, 'Image storage is not configured');
}

function signCloudinaryParams(params: Record<string, string | number>, apiSecret: string) {
  const payload = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return crypto.createHash('sha1').update(`${payload}${apiSecret}`).digest('hex');
}

export function createImageUploadSignature(input: { venueId: string; scope: ImageUploadScope }) {
  const config = cloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `wasla/${input.venueId}/${input.scope}`;
  const publicId = crypto.randomUUID();
  const signature = signCloudinaryParams(
    {
      folder,
      public_id: publicId,
      timestamp,
    },
    config.apiSecret,
  );

  return {
    provider: 'cloudinary',
    uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    timestamp,
    signature,
    folder,
    publicId,
    maxBytes: MAX_IMAGE_UPLOAD_BYTES,
  } satisfies ImageUploadSignature;
}

function cloudinaryPublicIdFromUrl(imageUrl: string) {
  const config = cloudinaryConfig();
  let url: URL;

  try {
    url = new URL(imageUrl);
  } catch {
    return null;
  }

  if (url.hostname !== 'res.cloudinary.com') {
    return null;
  }

  const uploadMarker = `/${config.cloudName}/image/upload/`;
  const markerIndex = url.pathname.indexOf(uploadMarker);

  if (markerIndex === -1) {
    return null;
  }

  const afterUpload = url.pathname.slice(markerIndex + uploadMarker.length);
  const segments = afterUpload.split('/').filter(Boolean);
  const versionIndex = segments.findIndex((segment) => /^v\d+$/.test(segment));
  const publicIdSegments = versionIndex >= 0 ? segments.slice(versionIndex + 1) : segments;
  const publicIdWithExtension = publicIdSegments.join('/');

  if (!publicIdWithExtension) {
    return null;
  }

  return decodeURIComponent(publicIdWithExtension.replace(/\.[a-zA-Z0-9]+$/, ''));
}

export async function deleteImageByUrl(
  imageUrl: string | null | undefined,
  options: { venueId: string },
) {
  if (!imageUrl) {
    return;
  }

  const config = cloudinaryConfig();
  const publicId = cloudinaryPublicIdFromUrl(imageUrl);

  if (!publicId) {
    return;
  }

  if (!publicId.startsWith(`wasla/${options.venueId}/`)) {
    return;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signCloudinaryParams(
    {
      public_id: publicId,
      timestamp,
    },
    config.apiSecret,
  );
  const formData = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: config.apiKey,
    signature,
  });

  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/destroy`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      console.warn(`[storage] Could not delete image ${publicId}: ${response.status}`);
    }
  } catch (error) {
    console.warn(`[storage] Could not delete image ${publicId}`, error);
  }
}

export async function deleteImagesByUrl(
  imageUrls: Array<string | null | undefined>,
  options: { venueId: string },
) {
  const uniqueUrls = Array.from(new Set(imageUrls.filter(Boolean)));

  await Promise.all(uniqueUrls.map((url) => deleteImageByUrl(url, options)));
}

export function imageUrlChanged(previousUrl: string | null | undefined, nextUrl: string | null | undefined) {
  return Boolean(previousUrl && previousUrl !== nextUrl);
}
