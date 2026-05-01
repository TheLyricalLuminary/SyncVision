import "dotenv/config";
import prisma from "../lib/prisma";

// Pass OWNER_EMAIL env var to override; falls back to first AGENCY/ENTERPRISE user
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? null;

async function main() {
  const owner = OWNER_EMAIL
    ? await prisma.user.findUnique({ where: { email: OWNER_EMAIL } })
    : await prisma.user.findFirst({
        where: { planLevel: { in: ["AGENCY", "ENTERPRISE"] } },
        orderBy: { createdAt: "asc" },
      });

  if (!owner) {
    console.error(
      OWNER_EMAIL
        ? `User ${OWNER_EMAIL} not found — register first`
        : "No AGENCY/ENTERPRISE user found — register one first"
    );
    process.exit(1);
  }
  console.log(`Catalog owner: ${owner.email} (${owner.planLevel})`);

  const existing = await prisma.catalog.findFirst({
    where: { ownerId: owner.id },
  });

  let catalog = existing;
  if (!catalog) {
    catalog = await prisma.catalog.create({
      data: {
        name: "Mark Amigoni — Default Catalog",
        ownerId: owner.id,
        members: {
          create: { userId: owner.id, role: "CATALOG_OWNER" },
        },
      },
    });
    console.log(`Created catalog: ${catalog.id} — "${catalog.name}"`);
  } else {
    console.log(`Using existing catalog: ${catalog.id} — "${catalog.name}"`);

    // Ensure owner has a CATALOG_OWNER member row
    await prisma.catalogMember.upsert({
      where: { catalogId_userId: { catalogId: catalog.id, userId: owner.id } },
      update: {},
      create: { catalogId: catalog.id, userId: owner.id, role: "CATALOG_OWNER" },
    });
  }

  const { count } = await prisma.track.updateMany({
    where: { catalogId: null },
    data: { catalogId: catalog.id },
  });

  console.log(`Assigned ${count} orphaned tracks to catalog ${catalog.id}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
