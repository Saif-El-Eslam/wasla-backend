import { prisma } from '../../database/prisma';
import { HttpError } from '../../common/http/http-error';
import type { SessionPayload } from '../../common/middleware/auth.middleware';
import type { z } from 'zod';
import type { setupVenueSchema, updateVenueSchema } from './venue.schemas';

function requireUserId(session?: SessionPayload) {
  if (!session?.sub) {
    throw new HttpError(401, 'errors.authRequired');
  }

  return session.sub;
}

export async function getMyVenue(session?: SessionPayload) {
  const userId = requireUserId(session);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      venue: {
        include: {
          subscription: true,
        },
      },
    },
  });

  if (!user?.venue) {
    throw new HttpError(404, 'errors.venueRequired');
  }

  return user.venue;
}

export async function setupVenue(session: SessionPayload | undefined, input: z.infer<typeof setupVenueSchema>) {
  const userId = requireUserId(session);

  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { venueId: true },
  });

  if (existingUser?.venueId) {
    throw new HttpError(409, 'errors.venueAlreadyExists');
  }

  return prisma.$transaction(async (tx) => {
    const createdVenue = await tx.venue.create({
      data: {
        ownerId: userId,
        type: input.type,
        name: input.name,
        slug: input.slug,
        description: input.description,
        defaultLocale: input.defaultLocale,
        supportedLocales: input.supportedLocales,
        phone: input.phone,
        whatsapp: input.whatsapp,
        address: input.address,
        googleMapsUrl: input.googleMapsUrl || null,
        instagramUrl: input.instagramUrl || null,
        subscription: {
          create: {
            plan: 'FREE',
            status: 'TRIALING',
          },
        },
        branches: {
          create: {
            name: input.branchName,
            slug: input.branchSlug,
            isMain: true,
            active: true,
            phone: input.phone,
            whatsapp: input.whatsapp,
            address: input.address,
            googleMapsUrl: input.googleMapsUrl || null,
            instagramUrl: input.instagramUrl || null,
          },
        },
      },
      include: {
        branches: true,
        subscription: true,
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: { venueId: createdVenue.id },
    });

    return createdVenue;
  });
}

export async function updateMyVenue(session: SessionPayload | undefined, input: z.infer<typeof updateVenueSchema>) {
  const userId = requireUserId(session);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { venueId: true },
  });

  if (!user?.venueId) {
    throw new HttpError(404, 'errors.venueRequired');
  }

  return prisma.venue.update({
    where: { id: user.venueId },
    data: {
      ...input,
      googleMapsUrl: input.googleMapsUrl === '' ? null : input.googleMapsUrl,
      instagramUrl: input.instagramUrl === '' ? null : input.instagramUrl,
    },
    include: {
      subscription: true,
    },
  });
}
