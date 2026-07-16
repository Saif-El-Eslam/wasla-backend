import { Prisma, type UserRole } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { HttpError } from '../http/http-error';
import type { SessionPayload } from '../middleware/auth.middleware';

export type CurrentAccessUser = {
  id: string;
  venueId: string;
  role: UserRole;
  branchIds: string[];
  isVenueAdmin: boolean;
};

function isVenueAdminRole(role: UserRole | string | undefined) {
  return role === 'OWNER' || role === 'MANAGER';
}

export async function requireAccessUser(session?: SessionPayload): Promise<CurrentAccessUser> {
  if (!session?.sub) {
    throw new HttpError(401, 'errors.authRequired');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      venueId: true,
      role: true,
      phoneVerifiedAt: true,
      branchAccesses: {
        select: { branchId: true },
      },
    },
  });

  if (!user?.venueId) {
    throw new HttpError(404, 'errors.venueRequired');
  }

  if (!user.phoneVerifiedAt) {
    throw new HttpError(401, 'errors.phoneNotVerified');
  }

  return {
    id: user.id,
    venueId: user.venueId,
    role: user.role,
    branchIds: user.branchAccesses.map((access) => access.branchId),
    isVenueAdmin: isVenueAdminRole(user.role),
  };
}

export async function requireVenueAdmin(session?: SessionPayload) {
  const user = await requireAccessUser(session);

  if (!user.isVenueAdmin) {
    throw new HttpError(403, 'errors.adminRequired');
  }

  return user;
}

export function branchScopeWhere(user: CurrentAccessUser): Prisma.BranchWhereInput {
  if (user.isVenueAdmin) {
    return { venueId: user.venueId };
  }

  return {
    venueId: user.venueId,
    id: { in: user.branchIds },
  };
}

export async function requireBranchAccess(session: SessionPayload | undefined, branchId: string) {
  const user = await requireAccessUser(session);
  const branch = await prisma.branch.findFirst({
    where: {
      AND: [
        { venueId: user.venueId },
        { id: branchId },
        user.isVenueAdmin ? {} : { id: { in: user.branchIds } },
      ],
    },
  });

  if (!branch) {
    throw new HttpError(404, 'errors.branchNotFound');
  }

  return { user, branch };
}
