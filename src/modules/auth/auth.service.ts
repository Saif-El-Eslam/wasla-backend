import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Prisma, type User } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { HttpError } from '../../common/http/http-error';
import type { SessionPayload } from '../../common/middleware/auth.middleware';
import { env } from '../../config/env';
import type { z } from 'zod';
import type { updateMeSchema, updatePasswordSchema } from './auth.schemas';
import { requireSuperAdmin } from '../subscription/subscription.service';

const OTP_TTL_MINUTES = 10;
const OTP_DELIVERY_ENCRYPTION_VERSION = 'v1';

type SanitizableUser = Pick<
  User,
  | 'id'
  | 'venueId'
  | 'phone'
  | 'email'
  | 'name'
  | 'role'
  | 'phoneVerifiedAt'
  | 'createdAt'
  | 'updatedAt'
> & {
  branchAccesses?: Array<{
    branch: {
      id: string;
      name: unknown;
      slug: string;
      isMain: boolean;
      active: boolean;
    };
  }>;
};

function sanitizeUser(user: SanitizableUser) {
  return {
    id: user.id,
    venueId: user.venueId,
    phone: user.phone,
    email: user.email,
    name: user.name,
    role: user.role,
    verified: Boolean(user.phoneVerifiedAt),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    branches: user.branchAccesses?.map((access) => access.branch) ?? [],
  };
}

function createSessionToken(payload: SessionPayload) {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

function otpDeliveryKey() {
  return crypto.createHash('sha256').update(env.JWT_SECRET).digest();
}

function encryptDeliveryCode(code: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', otpDeliveryKey(), iv);
  const encrypted = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    OTP_DELIVERY_ENCRYPTION_VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

function decryptDeliveryCode(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const [version, iv, tag, encrypted] = value.split(':');

  if (version !== OTP_DELIVERY_ENCRYPTION_VERSION || !iv || !tag || !encrypted) {
    return null;
  }

  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      otpDeliveryKey(),
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

type OtpCodeWriter = Pick<Prisma.TransactionClient, 'otpCode'>;

async function createOtpCode(userId: string, code?: string, db: OtpCodeWriter = prisma) {
  const plainCode = code ?? String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = await bcrypt.hash(plainCode, 10);

  await db.otpCode.create({
    data: {
      userId,
      codeHash,
      deliveryCodeEncrypted: encryptDeliveryCode(plainCode),
      purpose: 'PHONE_VERIFY',
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    },
  });

  return plainCode;
}

export async function register(input: { name: string; phone: string; password: string }) {
  const existingUser = await prisma.user.findUnique({ where: { phone: input.phone } });

  if (existingUser) {
    throw new HttpError(409, 'errors.phoneAlreadyExists');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      phone: input.phone,
      passwordHash,
    },
  });

  const devOtp = await createOtpCode(user.id);

  return {
    user: sanitizeUser(user),
    devOtp: env.NODE_ENV === 'production' ? undefined : devOtp,
  };
}

export async function login(input: { phone: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { phone: input.phone } });

  if (!user) {
    throw new HttpError(401, 'errors.invalidCredentials');
  }

  if (!user.phoneVerifiedAt) {
    throw new HttpError(403, 'errors.phoneNotVerified');
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);

  if (!passwordMatches) {
    throw new HttpError(401, 'errors.invalidCredentials');
  }

  const token = createSessionToken({
    sub: user.id,
    venueId: user.venueId ?? undefined,
    role: user.role,
  });

  return {
    user: sanitizeUser(user),
    token,
  };
}

export async function verifyOtp(input: { phone: string; code: string }) {
  const user = await prisma.user.findUnique({ where: { phone: input.phone } });

  if (!user) {
    throw new HttpError(404, 'errors.userNotFound');
  }

  const otp = await prisma.otpCode.findFirst({
    where: {
      userId: user.id,
      purpose: 'PHONE_VERIFY',
      consumedAt: null,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp) {
    throw new HttpError(400, 'errors.otpInvalid');
  }

  if (otp.expiresAt.getTime() < Date.now()) {
    throw new HttpError(400, 'errors.otpExpired');
  }

  const matches = await bcrypt.compare(input.code, otp.codeHash);

  if (!matches) {
    throw new HttpError(400, 'errors.otpInvalid');
  }

  const verifiedUser = await prisma.$transaction(async (tx) => {
    await tx.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: new Date(), deliveryCodeEncrypted: null },
    });

    return tx.user.update({
      where: { id: user.id },
      data: { phoneVerifiedAt: user.phoneVerifiedAt ?? new Date() },
    });
  });

  const token = createSessionToken({
    sub: verifiedUser.id,
    venueId: verifiedUser.venueId ?? undefined,
    role: verifiedUser.role,
  });

  return {
    user: sanitizeUser(verifiedUser),
    token,
  };
}

type AdminVerificationCodeStatus = 'ACTIVE' | 'EXPIRED' | 'HIDDEN' | 'MISSING';

type AdminVerificationUser = Prisma.UserGetPayload<{
  include: {
    venue: { select: { id: true; name: true; slug: true } };
    otpCodes: {
      where: { purpose: 'PHONE_VERIFY'; consumedAt: null };
      orderBy: { createdAt: 'desc' };
      take: 1;
    };
  };
}>;

function verificationCodeStatus(otp: AdminVerificationUser['otpCodes'][number] | undefined) {
  if (!otp) {
    return 'MISSING' satisfies AdminVerificationCodeStatus;
  }

  if (otp.expiresAt.getTime() < Date.now()) {
    return 'EXPIRED' satisfies AdminVerificationCodeStatus;
  }

  return decryptDeliveryCode(otp.deliveryCodeEncrypted)
    ? ('ACTIVE' satisfies AdminVerificationCodeStatus)
    : ('HIDDEN' satisfies AdminVerificationCodeStatus);
}

function adminVerificationUserRow(user: AdminVerificationUser) {
  const otp = user.otpCodes[0];
  const status = verificationCodeStatus(otp);
  const code = status === 'ACTIVE' ? decryptDeliveryCode(otp?.deliveryCodeEncrypted) : null;

  return {
    id: user.id,
    venueId: user.venueId,
    phone: user.phone,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
    venue: user.venue,
    latestCode: otp
      ? {
          id: otp.id,
          code,
          status,
          createdAt: otp.createdAt,
          expiresAt: otp.expiresAt,
        }
      : null,
  };
}

function adminVerificationUserInclude() {
  return {
    venue: { select: { id: true, name: true, slug: true } },
    otpCodes: {
      where: { purpose: 'PHONE_VERIFY' as const, consumedAt: null },
      orderBy: { createdAt: 'desc' as const },
      take: 1,
    },
  };
}

export async function listAdminVerificationCodes(
  session: SessionPayload | undefined,
  filters: { search?: string },
) {
  await requireSuperAdmin(session);
  const search = filters.search?.trim();
  const where: Prisma.UserWhereInput = {
    phoneVerifiedAt: null,
    ...(search
      ? {
          OR: [
            { phone: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
            { venue: { slug: { contains: search, mode: 'insensitive' } } },
            { venue: { name: { path: ['en'], string_contains: search, mode: 'insensitive' } } },
            { venue: { name: { path: ['ar'], string_contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: adminVerificationUserInclude(),
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);
  const rows = users.map(adminVerificationUserRow);

  return {
    users: rows,
    metrics: {
      total,
      listed: rows.length,
      activeCodes: rows.filter((user) => user.latestCode?.status === 'ACTIVE').length,
      expiredCodes: rows.filter((user) => user.latestCode?.status === 'EXPIRED').length,
      missingCodes: rows.filter((user) => !user.latestCode || user.latestCode.status === 'MISSING')
        .length,
      hiddenCodes: rows.filter((user) => user.latestCode?.status === 'HIDDEN').length,
    },
    generatedAt: new Date(),
  };
}

export async function regenerateAdminVerificationCode(
  session: SessionPayload | undefined,
  userId: string,
) {
  await requireSuperAdmin(session);
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, phoneVerifiedAt: true },
  });

  if (!existing) {
    throw new HttpError(404, 'errors.userNotFound');
  }

  if (existing.phoneVerifiedAt) {
    throw new HttpError(400, 'errors.phoneAlreadyVerified');
  }

  await prisma.$transaction(async (tx) => {
    await tx.otpCode.updateMany({
      where: {
        userId,
        purpose: 'PHONE_VERIFY',
        consumedAt: null,
      },
      data: { consumedAt: new Date(), deliveryCodeEncrypted: null },
    });

    await createOtpCode(userId, undefined, tx);
  });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: adminVerificationUserInclude(),
  });

  return {
    user: adminVerificationUserRow(user),
  };
}

export async function resendOtp(input: { phone: string }) {
  const user = await prisma.user.findUnique({ where: { phone: input.phone } });

  if (!user) {
    throw new HttpError(404, 'errors.userNotFound');
  }

  const devOtp = await createOtpCode(user.id);

  return {
    sent: true,
    devOtp: env.NODE_ENV === 'production' ? undefined : devOtp,
  };
}

export async function getCurrentUser(session?: SessionPayload) {
  if (!session?.sub) {
    throw new HttpError(401, 'errors.authRequired');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      venueId: true,
      phone: true,
      email: true,
      name: true,
      role: true,
      phoneVerifiedAt: true,
      createdAt: true,
      updatedAt: true,
      branchAccesses: {
        include: {
          branch: {
            select: {
              id: true,
              name: true,
              slug: true,
              isMain: true,
              active: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!user) {
    throw new HttpError(401, 'errors.userNotFound');
  }

  if (!user.phoneVerifiedAt) {
    throw new HttpError(401, 'errors.phoneNotVerified');
  }

  return sanitizeUser(user);
}

export async function updateCurrentUser(
  session: SessionPayload | undefined,
  input: z.infer<typeof updateMeSchema>,
) {
  if (!session?.sub) {
    throw new HttpError(401, 'errors.authRequired');
  }

  if (input.phone) {
    const existingUser = await prisma.user.findFirst({
      where: {
        phone: input.phone,
        NOT: { id: session.sub },
      },
    });

    if (existingUser) {
      throw new HttpError(409, 'errors.phoneAlreadyExists');
    }
  }

  const user = await prisma.user.update({
    where: { id: session.sub },
    data: {
      name: input.name,
      phone: input.phone,
    },
  });

  return sanitizeUser(user);
}

export async function updateCurrentUserPassword(
  session: SessionPayload | undefined,
  input: z.infer<typeof updatePasswordSchema>,
) {
  if (!session?.sub) {
    throw new HttpError(401, 'errors.authRequired');
  }

  const user = await prisma.user.findUnique({ where: { id: session.sub } });

  if (!user) {
    throw new HttpError(401, 'errors.userNotFound');
  }

  const passwordMatches = await bcrypt.compare(input.currentPassword, user.passwordHash);

  if (!passwordMatches) {
    throw new HttpError(401, 'errors.invalidCredentials');
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  return sanitizeUser(updatedUser);
}
