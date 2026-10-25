import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('sifre123', 10);

  const provider = await prisma.user.upsert({
    where: { email: 'doktor@ornek.com' },
    update: {},
    create: {
      email: 'doktor@ornek.com',
      name: 'Dr. Ayşe Yılmaz',
      passwordHash,
      role: Role.PROVIDER,
      timezone: 'Europe/Istanbul',
    },
  });

  const barber = await prisma.user.upsert({
    where: { email: 'berber@ornek.com' },
    update: {},
    create: {
      email: 'berber@ornek.com',
      name: 'Mehmet Usta Berber',
      passwordHash,
      role: Role.PROVIDER,
      timezone: 'Europe/Istanbul',
    },
  });

  await prisma.user.upsert({
    where: { email: 'musteri@ornek.com' },
    update: {},
    create: {
      email: 'musteri@ornek.com',
      name: 'Ali Demir',
      passwordHash,
      role: Role.CUSTOMER,
      timezone: 'Europe/Istanbul',
    },
  });

  // Hizmetler (seed tekrar çalıştırıldığında çoğalmasın diye yalnızca ilk seferde)
  const existing = await prisma.service.count({ where: { providerId: { in: [provider.id, barber.id] } } });
  if (existing === 0) await prisma.service.createMany({
    data: [
      { providerId: provider.id, name: 'Muayene', durationMin: 30, priceCents: 150000 },
      { providerId: provider.id, name: 'Kontrol', durationMin: 15, priceCents: 50000 },
      { providerId: barber.id, name: 'Saç Kesimi', durationMin: 30, priceCents: 40000 },
      { providerId: barber.id, name: 'Saç + Sakal', durationMin: 45, priceCents: 60000 },
    ],
  });

  // Çalışma saatleri: Pzt–Cum 09:00–17:00, Cmt 10:00–14:00
  for (const p of [provider, barber]) {
    const days = [
      ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: '09:00', endTime: '17:00' })),
      { weekday: 6, startTime: '10:00', endTime: '14:00' },
    ];
    for (const d of days) {
      await prisma.workingHour.upsert({
        where: { providerId_weekday: { providerId: p.id, weekday: d.weekday } },
        update: { startTime: d.startTime, endTime: d.endTime },
        create: { providerId: p.id, ...d },
      });
    }
  }

  console.log('✅ Seed tamamlandı. Tüm demo hesapların şifresi: sifre123');
  console.log('   müşteri:       musteri@ornek.com');
  console.log('   hizmet veren:  doktor@ornek.com, berber@ornek.com');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
