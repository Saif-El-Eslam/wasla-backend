import { Prisma } from '@prisma/client';

export type QrUrlContext = {
  apiOrigin?: string;
};

export const qrInclude = Prisma.validator<Prisma.MenuInclude>()({
  qrCode: true,
  branch: {
    include: {
      venue: true,
    },
  },
});

export type QrMenu = Prisma.MenuGetPayload<{ include: typeof qrInclude }>;

export type QrFormat = 'png' | 'svg' | 'poster';
