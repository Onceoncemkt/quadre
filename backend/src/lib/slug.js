function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

async function generateUniqueBusinessSlug(prisma, businessName) {
  const base = slugify(businessName) || 'negocio';
  let slug = base;
  let suffix = 1;

  while (await prisma.business.findUnique({ where: { slug } })) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

module.exports = { slugify, generateUniqueBusinessSlug };
