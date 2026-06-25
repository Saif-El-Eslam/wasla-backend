import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' },
  ],
});

prisma.$on('query', (_event) => {
  // console.log(`[db] ${event.duration}ms ${event.query}`);
});

prisma.$on('error', (event) => {
  console.error(`[db:error] ${event.message}`);
});

prisma.$on('warn', (event) => {
  console.warn(`[db:warn] ${event.message}`);
});

export async function connectDatabase() {
  await prisma.$connect();
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}
