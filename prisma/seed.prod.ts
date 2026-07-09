import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { seedPlanCatalog } from './seed-plan-catalog';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

async function seedSuperAdmin() {
  if (!process.env.SUPER_ADMIN_PHONE || !process.env.SUPER_ADMIN_PASSWORD) {
    console.log('[seed:prod] SUPER_ADMIN_PHONE/SUPER_ADMIN_PASSWORD not set; skipped super admin.');
    return;
  }

  const passwordHash = await bcrypt.hash(process.env.SUPER_ADMIN_PASSWORD, 12);

  await prisma.user.upsert({
    where: { phone: process.env.SUPER_ADMIN_PHONE },
    update: {
      venueId: null,
      name: process.env.SUPER_ADMIN_NAME ?? 'Wasla Platform Admin',
      role: UserRole.SUPER_ADMIN,
      passwordHash,
      phoneVerifiedAt: new Date(),
    },
    create: {
      venueId: null,
      phone: process.env.SUPER_ADMIN_PHONE,
      name: process.env.SUPER_ADMIN_NAME ?? 'Wasla Platform Admin',
      role: UserRole.SUPER_ADMIN,
      passwordHash,
      phoneVerifiedAt: new Date(),
    },
  });

  console.log('[seed:prod] Super admin user is ready.');
}

async function main() {
  await prisma.$connect();
  await seedPlanCatalog(prisma);
  await seedSuperAdmin();
  console.log('[seed:prod] Production plan catalog is ready.');
}

main()
  .catch((error) => {
    console.error('[seed:prod] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
