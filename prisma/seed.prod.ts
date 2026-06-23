import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.$connect();
  console.log('[seed:prod] No demo users are created in production.');
  console.log('[seed:prod] Release 1 Phase 3 schema is ready. Add production reference data here when needed.');
}

main()
  .catch((error) => {
    console.error('[seed:prod] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
