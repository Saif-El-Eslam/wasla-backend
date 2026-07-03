import { prisma } from '../../database/prisma';
import { HttpError } from '../../common/http/http-error';
import type { LocalizedText } from '../../common/i18n/localized-text';
import type { SessionPayload } from '../../common/middleware/auth.middleware';
import { deleteImagesByUrl, imageUrlChanged } from '../../storage/image-storage.service';
import { seedDefaultFinanceSetup } from '../financial/financial.seed';
import { assertLanguageLimitAllowed, assertVenueCanMutate } from '../subscription/plan-guards';
import type { z } from 'zod';
import type { setupVenueSchema, updateVenueSchema } from './venue.schemas';

function requireUserId(session?: SessionPayload) {
  if (!session?.sub) {
    throw new HttpError(401, 'errors.authRequired');
  }

  return session.sub;
}

function asLocalizedText(value: unknown): LocalizedText {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as LocalizedText) : {};
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
        logoUrl: input.logoUrl || null,
        coverUrl: input.coverUrl || null,
        description: input.description,
        defaultLocale: input.defaultLocale,
        supportedLocales: [input.defaultLocale],
        phone: input.phone,
        whatsapp: input.whatsapp,
        address: input.address,
        googleMapsUrl: input.googleMapsUrl || null,
        instagramUrl: input.instagramUrl || null,
        facebookUrl: input.facebookUrl || null,
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
            facebookUrl: input.facebookUrl || null,
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

    await seedDefaultFinanceSetup(createdVenue.id, tx);

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
  await assertVenueCanMutate(user.venueId);
  await assertLanguageLimitAllowed(user.venueId, input.supportedLocales);

  const currentVenue = await prisma.venue.findUnique({
    where: { id: user.venueId },
    select: {
      name: true,
      description: true,
      address: true,
      logoUrl: true,
      coverUrl: true,
    },
  });

  if (!currentVenue) {
    throw new HttpError(404, 'errors.venueRequired');
  }

  const updatedVenue = await prisma.venue.update({
    where: { id: user.venueId },
    data: {
      ...input,
      name: input.name ? { ...asLocalizedText(currentVenue.name), ...input.name } : undefined,
      description: input.description
        ? { ...asLocalizedText(currentVenue.description), ...input.description }
        : undefined,
      address: input.address ? { ...asLocalizedText(currentVenue.address), ...input.address } : undefined,
      logoUrl: input.logoUrl === '' ? null : input.logoUrl,
      coverUrl: input.coverUrl === '' ? null : input.coverUrl,
      googleMapsUrl: input.googleMapsUrl === '' ? null : input.googleMapsUrl,
      instagramUrl: input.instagramUrl === '' ? null : input.instagramUrl,
      facebookUrl: input.facebookUrl === '' ? null : input.facebookUrl,
    },
    include: {
      subscription: true,
    },
  });

  await deleteImagesByUrl([
    input.logoUrl !== undefined && imageUrlChanged(currentVenue.logoUrl, updatedVenue.logoUrl)
      ? currentVenue.logoUrl
      : null,
    input.coverUrl !== undefined && imageUrlChanged(currentVenue.coverUrl, updatedVenue.coverUrl)
      ? currentVenue.coverUrl
      : null,
  ]);

  return updatedVenue;
}
