import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { requireVenueAdmin } from '../../common/auth/branch-access';
import { HttpError } from '../../common/http/http-error';
import type { SessionPayload } from '../../common/middleware/auth.middleware';
import { buildPaginationMeta, type PaginationOptions } from '../../common/pagination/pagination';
import type { z } from 'zod';
import type { createVenueUserSchema, updateUserBranchesSchema } from './user.schemas';

const userSelect = Prisma.validator<Prisma.UserSelect>()({
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
});

type UserWithAccess = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function sanitizeUser(user: UserWithAccess) {
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
    branches: user.branchAccesses.map((access) => access.branch),
  };
}

async function assertBranchesBelongToVenue(venueId: string, branchIds: string[]) {
  if (branchIds.length === 0) {
    return;
  }

  const count = await prisma.branch.count({
    where: {
      venueId,
      id: { in: branchIds },
    },
  });

  if (count !== new Set(branchIds).size) {
    throw new HttpError(400, 'errors.invalidBranchAssignment');
  }
}

function buildUserSearchWhere(search?: string): Prisma.UserWhereInput {
  if (!search) {
    return {};
  }

  return {
    OR: [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ],
  };
}

export async function listVenueUsers(
  session: SessionPayload | undefined,
  pagination?: PaginationOptions,
  filters: { search?: string } = {},
) {
  const admin = await requireVenueAdmin(session);
  const where: Prisma.UserWhereInput = {
    AND: [{ venueId: admin.venueId }, buildUserSearchWhere(filters.search)],
  };
  const orderBy = [{ role: 'asc' as const }, { createdAt: 'asc' as const }];

  if (pagination?.paginate === false) {
    const users = await prisma.user.findMany({ where, orderBy, select: userSelect });
    return { users: users.map(sanitizeUser) };
  }

  const paginationOptions = pagination ?? {
    paginate: true,
    page: 1,
    limit: 20,
    skip: 0,
  };

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy,
      skip: paginationOptions.skip,
      take: paginationOptions.limit,
      select: userSelect,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: users.map(sanitizeUser),
    pagination: buildPaginationMeta(total, paginationOptions),
  };
}

export async function createVenueUser(
  session: SessionPayload | undefined,
  input: z.infer<typeof createVenueUserSchema>,
) {
  const admin = await requireVenueAdmin(session);
  const branchIds = Array.from(new Set(input.branchIds));

  if (input.role === 'STAFF' && branchIds.length === 0) {
    throw new HttpError(400, 'errors.branchAssignmentRequired');
  }

  await assertBranchesBelongToVenue(admin.venueId, branchIds);

  const existingUser = await prisma.user.findUnique({ where: { phone: input.phone } });

  if (existingUser) {
    throw new HttpError(409, 'errors.phoneAlreadyExists');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await prisma.user.create({
    data: {
      venueId: admin.venueId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      passwordHash,
      role: input.role,
      phoneVerifiedAt: new Date(),
      branchAccesses: {
        create: branchIds.map((branchId) => ({ branchId })),
      },
    },
    select: userSelect,
  });

  return sanitizeUser(user);
}

export async function updateUserBranches(
  session: SessionPayload | undefined,
  userId: string,
  input: z.infer<typeof updateUserBranchesSchema>,
) {
  const admin = await requireVenueAdmin(session);
  const branchIds = Array.from(new Set(input.branchIds));

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      venueId: admin.venueId,
    },
    select: { id: true, role: true },
  });

  if (!user) {
    throw new HttpError(404, 'errors.userNotFound');
  }

  if (user.role === 'OWNER') {
    throw new HttpError(400, 'errors.ownerBranchAssignment');
  }

  if (user.role === 'STAFF' && branchIds.length === 0) {
    throw new HttpError(400, 'errors.branchAssignmentRequired');
  }

  await assertBranchesBelongToVenue(admin.venueId, branchIds);

  const updatedUser = await prisma.$transaction(async (tx) => {
    await tx.userBranchAccess.deleteMany({ where: { userId } });

    if (branchIds.length > 0) {
      await tx.userBranchAccess.createMany({
        data: branchIds.map((branchId) => ({ userId, branchId })),
        skipDuplicates: true,
      });
    }

    return tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: userSelect,
    });
  });

  return sanitizeUser(updatedUser);
}

export async function deleteVenueUser(session: SessionPayload | undefined, userId: string) {
  const admin = await requireVenueAdmin(session);

  if (admin.id === userId) {
    throw new HttpError(400, 'errors.cannotDeleteSelf');
  }

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      venueId: admin.venueId,
    },
    select: { id: true, role: true },
  });

  if (!user) {
    throw new HttpError(404, 'errors.userNotFound');
  }

  if (user.role === 'OWNER') {
    throw new HttpError(400, 'errors.cannotDeleteOwner');
  }

  await prisma.user.delete({ where: { id: userId } });

  return { deleted: true };
}
