require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const adminPhone = "+213600000000";
  const existingAdmin = await prisma.user.findUnique({ where: { phone: adminPhone } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        phone: adminPhone,
        name: "Admin",
        role: "ADMIN",
        passwordHash: await bcrypt.hash("changeme123", 10),
      },
    });
    console.log(`Created admin user ${adminPhone} / changeme123 — change this password immediately.`);
  }

  const existingRate = await prisma.exchangeRate.findFirst();
  if (!existingRate) {
    await prisma.exchangeRate.create({ data: { rateDZD: 268 } });
    console.log("Seeded initial exchange rate: 268 DA/$");
  }

  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, feePercent: 15 },
  });
  console.log("Ensured default settings (15% fee).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
