require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { hashPassword } = require('../src/lib/auth');
const { slugify } = require('../src/lib/slug');

const prisma = new PrismaClient();

async function upsertBusinessForOwner({ userId, businessName, locationName }) {
  const slug = slugify(businessName);
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);

  const business = await prisma.business.upsert({
    where: { slug },
    update: {
      name: businessName,
    },
    create: {
      name: businessName,
      slug,
      status: 'TRIAL',
      trialEndsAt,
    },
  });

  await prisma.location.upsert({
    where: {
      id: `seed-${slug}`,
    },
    update: {
      name: locationName,
      businessId: business.id,
    },
    create: {
      id: `seed-${slug}`,
      businessId: business.id,
      name: locationName,
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_businessId: {
        userId,
        businessId: business.id,
      },
    },
    update: {
      role: 'OWNER',
    },
    create: {
      userId,
      businessId: business.id,
      role: 'OWNER',
    },
  });
}

async function main() {
  const email = 'maria@quadre.mx';
  const passwordHash = await hashPassword('quadre2026');

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: 'María',
      passwordHash,
    },
    create: {
      email,
      name: 'María',
      passwordHash,
    },
  });

  await upsertBusinessForOwner({
    userId: user.id,
    businessName: 'Tulanyork',
    locationName: 'Tulanyork',
  });

  await upsertBusinessForOwner({
    userId: user.id,
    businessName: 'Donde Siempre',
    locationName: 'Donde Siempre',
  });

  const businesses = await prisma.business.findMany({
    select: { id: true },
  });

  await Promise.all(
    businesses.map((business) =>
      prisma.expenseCategory.upsert({
        where: {
          businessId_name: {
            businessId: business.id,
            name: 'Insumos',
          },
        },
        update: {
          kind: 'COSTO_VENTA',
        },
        create: {
          businessId: business.id,
          name: 'Insumos',
          kind: 'COSTO_VENTA',
        },
      }),
    ),
  );

  // eslint-disable-next-line no-console
  console.log('Seed completado. Recuerda cambiar la contraseña temporal de maria@quadre.mx');
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
