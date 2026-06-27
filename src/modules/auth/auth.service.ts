import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { User } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { HttpError } from '../../common/http/http-error';
import type { SessionPayload } from '../../common/middleware/auth.middleware';
import { env } from '../../config/env';
import type { z } from 'zod';
import type { updateMeSchema, updatePasswordSchema } from './auth.schemas';

const OTP_TTL_MINUTES = 10;

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
>;

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
  };
}

function createSessionToken(payload: SessionPayload) {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

async function createOtpCode(
  userId: string,
  code = env.NODE_ENV === 'production' ? undefined : '123456',
) {
  const plainCode = code ?? String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = await bcrypt.hash(plainCode, 10);

  await prisma.otpCode.create({
    data: {
      userId,
      codeHash,
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
      data: { consumedAt: new Date() },
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
    },
  });

  if (!user) {
    throw new HttpError(401, 'errors.userNotFound');
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
