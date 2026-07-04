import { prisma } from '../database/prisma';
import { defaultVenueTimezone } from './timezone';

export async function venueTimezone(venueId: string) {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { timezone: true },
  });

  return venue?.timezone || defaultVenueTimezone;
}
