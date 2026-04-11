import { PrismaClient } from "../generated/prisma";
import { DEFAULT_FEEDS, ensureDefaultFeeds } from "../src/server/data/default-feeds";

const prisma = new PrismaClient();

async function main() {
  await ensureDefaultFeeds(prisma);
  console.log(`Seeded ${DEFAULT_FEEDS.length} RSS feeds.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
