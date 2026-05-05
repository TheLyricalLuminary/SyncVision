import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const briefs = [
    { title: "Triumph / Victory" }, { title: "Somber Reflection" },
    { title: "High-Octane Chase" }, { title: "Intimate Romance" },
    { title: "Corporate Growth" }, { title: "Mysterious Intrigue" },
    { title: "Playful Comedy" }, { title: "Epic Adventure" },
    { title: "Gritty Tension" }, { title: "Ethereal Calm" },
    { title: "Aggressive Sports" }, { title: "Nostalgic Journey" },
    { title: "Urban Swagger" }, { title: "Heartfelt Drama" },
    { title: "Whimsical Wonder" }, { title: "Futuristic Tech" },
    { title: "Dark Suspense" }, { title: "Uplifting Pop" },
    { title: "Rustic Folk" }, { title: "Majestic Cinematic" }
  ];

  console.log("Seeding 20 deterministic briefs...");

  for (const brief of briefs) {
    await prisma.track.create({
      data: {
        title: brief.title,
        artistName: "SyncVision Core",
        isrc: "SEED-" + brief.title.toUpperCase().replace(/\s+/g, '-'),
      },
    });
  }
  console.log("Successfully seeded 20 briefs.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
