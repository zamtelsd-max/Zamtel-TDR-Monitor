import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const saltRounds = 10;

  const users = [
    { id: 'hsd-001', name: 'John Nkhoma',   pin: '9999', role: Role.HSD, zone: null },
    { id: 'zbm-001', name: 'Mary Phiri',    pin: '5678', role: Role.ZBM, zone: 'Copperbelt' },
    { id: 'zbm-002', name: 'David Mwale',   pin: '5679', role: Role.ZBM, zone: 'Lusaka' },
    { id: 'tdr-001', name: 'Abel Mumba',    pin: '1234', role: Role.TDR, zone: 'Copperbelt' },
    { id: 'tdr-002', name: 'Grace Tembo',   pin: '2345', role: Role.TDR, zone: 'Copperbelt' },
    { id: 'tdr-003', name: 'Peter Lungu',   pin: '3456', role: Role.TDR, zone: 'Lusaka' },
  ];

  for (const user of users) {
    const hashedPin = await bcrypt.hash(user.pin, saltRounds);
    await prisma.user.upsert({
      where: { id: user.id },
      update: { name: user.name, pin: hashedPin, role: user.role, zone: user.zone },
      create: {
        id:     user.id,
        name:   user.name,
        pin:    hashedPin,
        role:   user.role,
        zone:   user.zone,
        active: true,
      },
    });
    console.log(`  ✅ Upserted user: ${user.id} (${user.name})`);
  }

  console.log('🌱 Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
