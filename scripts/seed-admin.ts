import bcrypt from "bcryptjs";
import { prisma } from "../src/db";
import { config } from "../src/config";

async function main() {
  const existing = await prisma.adminUser.findUnique({
    where: { username: config.adminSeedUsername },
  });
  if (existing) {
    console.log(`Admin user "${config.adminSeedUsername}" already exists. Skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(config.adminSeedPassword, 10);
  await prisma.adminUser.create({
    data: { username: config.adminSeedUsername, passwordHash },
  });

  console.log(`Created admin user "${config.adminSeedUsername}".`);
  console.log(`Login at /admin with the password from ADMIN_SEED_PASSWORD in your .env.`);
  console.log(`Change it immediately if this is anything other than local dev.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
