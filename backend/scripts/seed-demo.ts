import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

// Demo ma'lumotlar. Ishlatish: npm run seed:demo  (avval db:seed va birinchi sozlash bajarilgan bo'lsin)
// Qayta ishga tushirish xavfsiz: lidlar mavjud bo'lsa o'tkazib yuboradi (--force bilan qayta yaratadi).
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const phone = () => `+998${pick(['90', '91', '93', '94', '95', '97', '99', '88', '33'])}${int(1000000, 9999999)}`;
const DAY = 86400000;
const ago = (d: number) => new Date(Date.now() - d * DAY);

const MALE = ['Aziz', 'Bobur', 'Jasur', 'Sardor', 'Otabek', 'Dilshod', 'Rustam', 'Sherzod', 'Alisher', 'Javohir', 'Timur', 'Behzod', 'Farhod', 'Nodir', 'Ulug\'bek', 'Anvar'];
const FEMALE = ['Malika', 'Nilufar', 'Dilnoza', 'Madina', 'Zilola', 'Gulnora', 'Sevara', 'Shahnoza', 'Feruza', 'Kamola', 'Nargiza', 'Zarina'];
const LAST_M = ['Karimov', 'Rahimov', 'Tursunov', 'Abdullayev', 'Yusupov', 'Ergashev', 'Saidov', 'Normatov', 'Qodirov', 'Ismoilov', 'Xolmatov', 'Mirzayev'];
const fullName = () => (rnd() < 0.6 ? `${pick(MALE)} ${pick(LAST_M)}` : `${pick(FEMALE)} ${pick(LAST_M)}a`);

const SOURCES = ['Instagram', 'Meta Ads', 'Telegram', 'Tavsiya', 'Sayt', 'Qo\'ng\'iroq', 'Google Ads'];
const TAGS = [
  ['Issiq', '#E5484D'], ['VIP', '#9B59B6'], ['Qayta aloqa', '#D9952E'], ['Korxona', '#3F77DD'],
  ['Chegirma', '#46B17B'], ['Instagram', '#E1306C'], ['Shoshilinch', '#F76B15'],
];
const COMPANIES = ['Oltin Vodiy MChJ', 'Silk Road Trade', 'Tashkent Build Group', 'Navruz Logistics', 'Zarafshon Tekstil', 'Mega Savdo', 'Orient Pharm', 'Bahor Food', 'Samarqand Auto', 'Digital Soft UZ'];
const POSITIONS = ['Direktor', 'Xarid menejeri', 'Marketing rahbari', 'Buxgalter', 'Savdo bo\'limi boshlig\'i', 'Ta\'sischi'];
const TASKS: [string, string][] = [
  ['Qo\'ng\'iroq qilish', 'call'], ['Taklif yuborish', 'message'], ['Uchrashuv belgilash', 'meeting'],
  ['Shartnoma loyihasini yuborish', 'task'], ['To\'lovni aniqlashtirish', 'call'], ['Telegramda yozish', 'message'],
];
const NOTES = [
  'Mijoz narx haqida so\'radi, chegirma kutmoqda.',
  'Hafta oxirigacha qaror qabul qilishini aytdi.',
  'Raqobatchi bilan solishtirmoqda, tezroq taklif yuborish kerak.',
  'Direktor bilan gaplashish kerak, hozircha xodim bilan aloqa.',
  'Demo ko\'rsatildi, juda qiziqish bildirdi.',
  'Byudjet tasdiqlanishini kutmoqda.',
];

const PIPE_A = [ // standart voronka (pipelineId = null), mavjud tizim bosqichlari qayta nomlanadi
  { key: 'new', name: 'Yangi so\'rov', color: '#99CCFD', kind: 'open' },
  { key: 'contact', name: 'Aloqa o\'rnatildi', color: '#FFEB99', kind: 'open' },
  { key: 'qualified', name: 'Ehtiyoj aniqlandi', color: '#FFCC66', kind: 'open' },
  { key: 'offer', name: 'Taklif yuborildi', color: '#D6EAFF', kind: 'open' },
  { key: 'payment', name: 'Muzokaralar', color: '#FFAC8E', kind: 'open' },
  { key: 'won', name: 'Muvaffaqiyatli yopildi', color: '#CCFF66', kind: 'won' },
  { key: 'lost', name: 'Yo\'qotilgan', color: '#D5D8DB', kind: 'lost' },
];
const PIPE_B = [
  { key: 'kurs_new', name: 'Yangi ariza', color: '#98CBFF', kind: 'open' },
  { key: 'kurs_call', name: 'Bog\'lanildi', color: '#FFF000', kind: 'open' },
  { key: 'kurs_trial', name: 'Sinov darsi', color: '#EB93FF', kind: 'open' },
  { key: 'kurs_pay', name: 'To\'lov kutilmoqda', color: '#FFCC66', kind: 'open' },
  { key: 'kurs_won', name: 'O\'qishni boshladi', color: '#87F2C0', kind: 'won' },
  { key: 'kurs_lost', name: 'Rad etdi', color: '#D5D8DB', kind: 'lost' },
];

async function main() {
  const force = process.argv.includes('--force');
  if ((await prisma.lead.count()) > 0 && !force) {
    console.log('Lidlar mavjud — demo ma\'lumot o\'tkazib yuborildi (--force bilan qayta yaratish).');
    return;
  }
  if (force) {
    await prisma.callLog.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.leadTask.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.company.deleteMany();
  }

  const admin = await prisma.user.findFirst({ where: { role: { key: 'super_admin' } } });
  if (!admin) throw new Error('Admin topilmadi: avval birinchi sozlashni bajaring.');
  const sellerRole = await prisma.role.findUniqueOrThrow({ where: { key: 'sotuvchi' } });

  // Foydalanuvchilar
  const hash = await bcrypt.hash('Demo12345!', 10);
  const sellers = [
    ['Akmal Qodirov', 'akmal@crm.local', '101'], ['Nigora Saidova', 'nigora@crm.local', '102'],
    ['Sanjar Yo\'ldoshev', 'sanjar@crm.local', '103'], ['Mohira Tursunova', 'mohira@crm.local', '104'],
  ];
  const users = [admin];
  for (const [name, email, extension] of sellers) {
    users.push(await prisma.user.upsert({
      where: { email }, update: {},
      create: { name, email, passwordHash: hash, roleId: sellerRole.id, extension },
    }));
  }

  // Bosqichlar: standart voronka
  for (let i = 0; i < PIPE_A.length; i++) {
    const s = PIPE_A[i];
    await prisma.crmStage.upsert({
      where: { key: s.key },
      update: { name: s.name, color: s.color, kind: s.kind, order: i },
      create: { ...s, order: i, isSystem: false, pipelineId: null },
    });
  }
  let pipeB = await prisma.crmPipeline.findFirst({ where: { name: 'Onlayn kurslar' } });
  if (!pipeB) pipeB = await prisma.crmPipeline.create({ data: { name: 'Onlayn kurslar', order: 1 } });
  for (let i = 0; i < PIPE_B.length; i++) {
    const s = PIPE_B[i];
    await prisma.crmStage.upsert({
      where: { key: s.key },
      update: { name: s.name, color: s.color, kind: s.kind, order: 10 + i, pipelineId: pipeB.id },
      create: { ...s, order: 10 + i, pipelineId: pipeB.id },
    });
  }

  for (const [name, color] of TAGS) {
    await prisma.crmTag.upsert({ where: { name }, update: { color }, create: { name, color } });
  }
  if ((await prisma.lostReason.count()) === 0) {
    await prisma.lostReason.createMany({
      data: ['Narx qimmat', 'Raqobatchini tanladi', 'Javob bermadi', 'Byudjet yo\'q', 'Kerak emas'].map((name, order) => ({ name, order })),
    });
  }

  // Kompaniyalar va kontaktlar
  const companies = [];
  for (const name of COMPANIES) {
    companies.push(await prisma.company.create({
      data: {
        name, phone: phone(), email: `info@${name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')}.uz`,
        website: `https://${name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')}.uz`, createdById: admin.id,
      },
    }));
  }
  const contacts = [];
  for (let i = 0; i < 30; i++) {
    const name = fullName();
    const company = i < 22 ? pick(companies) : null;
    contacts.push(await prisma.contact.create({
      data: {
        name, phone: phone(), email: rnd() < 0.6 ? `${name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')}${int(1, 99)}@gmail.com` : null,
        position: company ? pick(POSITIONS) : null, companyId: company?.id ?? null, createdById: admin.id,
      },
    }));
  }

  // Lidlar
  const pipes = [
    { id: null as string | null, stages: PIPE_A, n: 36, values: [3, 40] },
    { id: pipeB.id, stages: PIPE_B, n: 20, values: [1, 12] },
  ];
  let total = 0;
  for (const p of pipes) {
    for (let i = 0; i < p.n; i++) {
      // ochiq bosqichlarga ko'proq, yopilganlarga kamroq
      const r = rnd();
      const open = p.stages.filter((s) => s.kind === 'open');
      const stage = r < 0.75 ? open[Math.floor(rnd() * open.length)] : r < 0.9 ? p.stages.find((s) => s.kind === 'won')! : p.stages.find((s) => s.kind === 'lost')!;
      const contact = rnd() < 0.5 ? pick(contacts) : null;
      const company = contact?.companyId ? companies.find((c) => c.id === contact.companyId) : rnd() < 0.2 ? pick(companies) : null;
      const name = contact?.name ?? fullName();
      const assignee = pick(users);
      const createdAt = ago(int(0, 45));
      const tags = Array.from(new Set(Array.from({ length: int(0, 3) }, () => pick(TAGS)[0])));
      const notes = rnd() < 0.45
        ? Array.from({ length: int(1, 3) }, (_, k) => ({ text: pick(NOTES), at: ago(k + int(0, 5)).toISOString(), by: pick(users).name }))
        : [];
      const lead = await prisma.lead.create({
        data: {
          name, phone: contact?.phone ?? phone(), email: contact?.email ?? null, company: company?.name ?? null,
          companyId: company?.id ?? null, contactId: contact?.id ?? null, source: pick(SOURCES),
          value: int(p.values[0], p.values[1]) * 1_000_000 + (rnd() < 0.5 ? 500_000 : 0),
          pipelineId: p.id, stage: stage.key, assigneeId: assignee.id, tagsJson: JSON.stringify(tags),
          hot: tags.includes('Issiq'), notesJson: JSON.stringify(notes), createdById: admin.id, createdAt,
          lastActivityAt: ago(int(0, 6)),
          wonAt: stage.kind === 'won' ? ago(int(0, 10)) : null,
          lostAt: stage.kind === 'lost' ? ago(int(0, 10)) : null,
          lostReason: stage.kind === 'lost' ? pick(['Narx qimmat', 'Raqobatchini tanladi', 'Javob bermadi', 'Byudjet yo\'q']) : null,
          queue: i,
        },
      });
      total++;
      await prisma.activity.create({ data: { leadId: lead.id, type: 'created', actorId: admin.id, actorName: admin.name, text: 'Lid yaratildi', createdAt } });
      for (const n of notes) {
        await prisma.activity.create({ data: { leadId: lead.id, type: 'note', actorName: n.by, text: n.text, createdAt: new Date(n.at) } });
      }

      // Vazifalar: bugun / muddati o'tgan / kelajak (faqat ochiq lidlarda)
      if (stage.kind === 'open' && rnd() < 0.8) {
        const [title, type] = pick(TASKS);
        const kind = pick(['today', 'today', 'overdue', 'overdue', 'future', 'future', 'future']);
        const due = new Date();
        if (kind === 'today') due.setHours(int(9, 18), pick([0, 15, 30, 45]), 0, 0);
        else if (kind === 'overdue') { due.setTime(due.getTime() - int(1, 5) * DAY); due.setHours(int(9, 18), 0, 0, 0); }
        else { due.setTime(due.getTime() + int(1, 7) * DAY); due.setHours(int(9, 18), 0, 0, 0); }
        await prisma.leadTask.create({
          data: { leadId: lead.id, title, type, dueDate: due, assigneeId: assignee.id, createdById: admin.id },
        });
        await prisma.lead.update({ where: { id: lead.id }, data: { nextTask: title, nextTaskDate: due } });
      }
      if (stage.kind === 'open' && rnd() < 0.2) {
        await prisma.leadTask.create({
          data: { leadId: lead.id, title: 'Birinchi qo\'ng\'iroq', type: 'call', dueDate: ago(3), done: true, doneAt: ago(3), result: 'Gaplashildi, qiziqish bor', assigneeId: assignee.id },
        });
      }

      // Qo'ng'iroqlar
      if (rnd() < 0.35) {
        for (let k = 0; k < int(1, 3); k++) {
          const status = pick(['completed', 'completed', 'answered', 'missed']);
          await prisma.callLog.create({
            data: {
              leadId: lead.id, userId: assignee.id, phone: lead.phone!, direction: pick(['in', 'out', 'out']),
              status, durationSec: status === 'missed' ? 0 : int(20, 600), handled: true, startedAt: ago(int(0, 14)),
            },
          });
        }
      }
    }
  }

  // Saralanmagan (kiruvchi) lidlar
  for (let i = 0; i < 6; i++) {
    await prisma.lead.create({
      data: {
        name: fullName(), phone: phone(), source: pick(['Meta Ads', 'Sayt', 'Telegram', 'Instagram']),
        value: 0, stage: 'new', unsorted: true, tagsJson: '[]', createdAt: ago(rnd() * 2),
      },
    });
    total++;
  }

  console.log(`Demo tayyor: ${total} lid, ${contacts.length} kontakt, ${companies.length} kompaniya, ${sellers.length} sotuvchi (parol: Demo12345!).`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
