/**
 * Ma'lumotlar yaxlitligi tekshiruvchisi — bazadagi mantiqiy ziddiyatlarni (bug izlarini) o'zi topadi.
 *   npm run check:integrity            — faqat hisobot (o'zgartirmaydi), muammo bo'lsa exit 1
 *   npm run check:integrity -- --fix   — xavfsiz tuzatishlar (yetim yozuvlar, yopilish sanalari, noto'g'ri bosqich/voronka)
 *   npm run check:integrity -- --json  — mashina uchun JSON hisobot
 * DATABASE_URL .env'dan olinadi. E2E testlar oxirida test bazasida ham yuradi.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';

type Check = { id: string; title: string; sql: string; fix?: string };

// har bir tekshiruv: muammoli qatorlarni qaytaradigan SELECT (namuna uchun id/nom) va ixtiyoriy xavfsiz tuzatish
const CHECKS: Check[] = [
  {
    id: 'lead_unknown_stage',
    title: "Bitim mavjud bo'lmagan bosqichda (voronkada ko'rinmaydi)",
    sql: `SELECT l.id, l.name, l.stage FROM leads l LEFT JOIN crm_stages s ON s.key = l.stage WHERE s.key IS NULL`,
    fix: `UPDATE leads l SET stage = COALESCE((SELECT s2.key FROM crm_stages s2 WHERE s2."pipelineId" IS NOT DISTINCT FROM l."pipelineId" AND s2.kind = 'open' ORDER BY s2."order" LIMIT 1), 'new')
          WHERE NOT EXISTS (SELECT 1 FROM crm_stages s WHERE s.key = l.stage)`,
  },
  {
    id: 'lead_pipeline_mismatch',
    title: 'Bitim voronkasi bosqich voronkasiga mos emas',
    sql: `SELECT l.id, l.name, l.stage, l."pipelineId" FROM leads l JOIN crm_stages s ON s.key = l.stage WHERE s."pipelineId" IS DISTINCT FROM l."pipelineId"`,
    fix: `UPDATE leads l SET "pipelineId" = s."pipelineId" FROM crm_stages s WHERE s.key = l.stage AND s."pipelineId" IS DISTINCT FROM l."pipelineId"`,
  },
  {
    id: 'won_without_date',
    title: "Yutilgan bosqichda, lekin yopilish sanasi (wonAt) yo'q — statistikada ko'rinmaydi",
    sql: `SELECT l.id, l.name FROM leads l JOIN crm_stages s ON s.key = l.stage WHERE s.kind = 'won' AND (l."wonAt" IS NULL OR l."lostAt" IS NOT NULL)`,
    fix: `UPDATE leads l SET "wonAt" = COALESCE(l."wonAt", l."updatedAt"), "lostAt" = NULL, "lostReason" = NULL FROM crm_stages s WHERE s.key = l.stage AND s.kind = 'won' AND (l."wonAt" IS NULL OR l."lostAt" IS NOT NULL)`,
  },
  {
    id: 'lost_without_date',
    title: "Yo'qotilgan bosqichda, lekin lostAt yo'q",
    sql: `SELECT l.id, l.name FROM leads l JOIN crm_stages s ON s.key = l.stage WHERE s.kind = 'lost' AND (l."lostAt" IS NULL OR l."wonAt" IS NOT NULL)`,
    fix: `UPDATE leads l SET "lostAt" = COALESCE(l."lostAt", l."updatedAt"), "wonAt" = NULL FROM crm_stages s WHERE s.key = l.stage AND s.kind = 'lost' AND (l."lostAt" IS NULL OR l."wonAt" IS NOT NULL)`,
  },
  {
    id: 'open_with_close_data',
    title: "Ochiq bosqichda, lekin yopilgan/yo'qotilgan deb belgilangan (statistikani buzadi)",
    sql: `SELECT l.id, l.name FROM leads l JOIN crm_stages s ON s.key = l.stage WHERE s.kind = 'open' AND (l."wonAt" IS NOT NULL OR l."lostAt" IS NOT NULL OR l."lostReason" IS NOT NULL)`,
    fix: `UPDATE leads l SET "wonAt" = NULL, "lostAt" = NULL, "lostReason" = NULL FROM crm_stages s WHERE s.key = l.stage AND s.kind = 'open' AND (l."wonAt" IS NOT NULL OR l."lostAt" IS NOT NULL OR l."lostReason" IS NOT NULL)`,
  },
  {
    id: 'lead_empty_name',
    title: "Bitim nomi bo'sh",
    sql: `SELECT l.id FROM leads l WHERE btrim(l.name) = ''`,
  },
  {
    id: 'lead_negative_value',
    title: 'Bitim byudjeti manfiy',
    sql: `SELECT l.id, l.name, l.value FROM leads l WHERE l.value < 0`,
  },
  {
    id: 'lead_missing_contact',
    title: "Bitimning asosiy kontakti o'chirilgan",
    sql: `SELECT l.id, l.name FROM leads l WHERE l."contactId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM crm_contacts c WHERE c.id = l."contactId")`,
    fix: `UPDATE leads l SET "contactId" = NULL WHERE l."contactId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM crm_contacts c WHERE c.id = l."contactId")`,
  },
  {
    id: 'lead_missing_company',
    title: "Bitim kompaniyasi o'chirilgan",
    sql: `SELECT l.id, l.name FROM leads l WHERE l."companyId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM crm_companies c WHERE c.id = l."companyId")`,
    fix: `UPDATE leads l SET "companyId" = NULL WHERE l."companyId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM crm_companies c WHERE c.id = l."companyId")`,
  },
  {
    id: 'contact_missing_company',
    title: "Kontakt kompaniyasi o'chirilgan",
    sql: `SELECT c.id, c.name FROM crm_contacts c WHERE c."companyId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM crm_companies x WHERE x.id = c."companyId")`,
    fix: `UPDATE crm_contacts c SET "companyId" = NULL WHERE c."companyId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM crm_companies x WHERE x.id = c."companyId")`,
  },
  {
    id: 'lead_missing_assignee',
    title: "Bitim mas'uli tizimda yo'q",
    sql: `SELECT l.id, l.name, l."assigneeId" FROM leads l WHERE l."assigneeId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = l."assigneeId")`,
    fix: `UPDATE leads l SET "assigneeId" = NULL WHERE l."assigneeId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = l."assigneeId")`,
  },
  ...(['crm_activities', 'crm_messages', 'crm_conversations', 'crm_salesbot_runs', 'crm_automation_jobs', 'crm_deleted_tasks'] as const).map((t) => ({
    id: `orphan_${t}`,
    title: `Yetim yozuvlar: ${t} (bitimi o'chirilgan)`,
    sql: `SELECT x."leadId" AS id FROM ${t} x WHERE x."leadId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = x."leadId")`,
    fix: `DELETE FROM ${t} x WHERE x."leadId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = x."leadId")`,
  })),
  {
    id: 'orphan_salesbot_runs_bot',
    title: "Bot ishga tushishlari — boti o'chirilgan",
    sql: `SELECT r.id FROM crm_salesbot_runs r WHERE NOT EXISTS (SELECT 1 FROM crm_salesbots b WHERE b.id = r."botId")`,
    fix: `DELETE FROM crm_salesbot_runs r WHERE NOT EXISTS (SELECT 1 FROM crm_salesbots b WHERE b.id = r."botId")`,
  },
  {
    id: 'call_log_missing_lead',
    title: "Qo'ng'iroq jurnali o'chirilgan bitimga bog'langan",
    sql: `SELECT c.id FROM call_logs c WHERE c."leadId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = c."leadId")`,
    fix: `UPDATE call_logs c SET "leadId" = NULL WHERE c."leadId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = c."leadId")`,
  },
  {
    id: 'pipeline_missing_kinds',
    title: "Voronkada ochiq/yutilgan/yo'qotilgan bosqichlardan biri yo'q (bitimni yopib bo'lmaydi)",
    sql: `SELECT p.id, p.name FROM crm_pipelines p WHERE (SELECT count(DISTINCT s.kind) FROM crm_stages s WHERE s."pipelineId" = p.id AND s.kind IN ('open','won','lost')) < 3
          UNION ALL SELECT 'main', 'Asosiy voronka' WHERE (SELECT count(DISTINCT s.kind) FROM crm_stages s WHERE s."pipelineId" IS NULL AND s.kind IN ('open','won','lost')) < 3`,
  },
  {
    id: 'stage_unknown_pipeline',
    title: "Bosqich o'chirilgan voronkaga tegishli",
    sql: `SELECT s.key, s.name FROM crm_stages s WHERE s."pipelineId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM crm_pipelines p WHERE p.id = s."pipelineId")`,
  },
  {
    id: 'automation_unknown_stage',
    title: "Avtomatlashtirish mavjud bo'lmagan bosqichga bog'langan (hech qachon ishlamaydi)",
    sql: `SELECT a.id, a.name, a."stageKey" FROM crm_automations a WHERE a."stageKey" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM crm_stages s WHERE s.key = a."stageKey")`,
  },
  {
    id: 'task_done_without_date',
    title: "Bajarilgan vazifada bajarilish vaqti yo'q",
    sql: `SELECT t.id, t.title FROM lead_tasks t WHERE t.done AND t."doneAt" IS NULL`,
    fix: `UPDATE lead_tasks SET "doneAt" = "createdAt" WHERE done AND "doneAt" IS NULL`,
  },
  {
    id: 'task_missing_assignee',
    title: "Vazifa mas'uli tizimda yo'q",
    sql: `SELECT t.id, t.title FROM lead_tasks t WHERE t."assigneeId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = t."assigneeId")`,
  },
  {
    id: 'bad_json',
    title: "Buzilgan JSON maydonlar (kartochka ochilmasligi mumkin)",
    sql: `SELECT l.id, l.name FROM leads l WHERE NOT (l."tagsJson" ~ '^\\s*\\[' AND l."customJson" ~ '^\\s*\\{' AND l."notesJson" ~ '^\\s*\\[' AND l."itemsJson" ~ '^\\s*\\[')`,
  },
];

async function main() {
  const fix = process.argv.includes('--fix');
  const json = process.argv.includes('--json');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const report: { id: string; title: string; count: number; sample: unknown[]; fixed?: number }[] = [];
  try {
    for (const c of CHECKS) {
      const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(c.sql);
      const item: (typeof report)[number] = { id: c.id, title: c.title, count: rows.length, sample: rows.slice(0, 5) };
      if (fix && rows.length && c.fix) item.fixed = await prisma.$executeRawUnsafe(c.fix);
      report.push(item);
    }
  } finally {
    await prisma.$disconnect();
  }
  const problems = report.filter((r) => r.count > 0 && !(r.fixed && r.fixed >= r.count));
  if (json) console.log(JSON.stringify({ ok: !problems.length, report }, null, 2));
  else {
    for (const r of report) {
      const mark = r.count === 0 ? '✔' : r.fixed ? '🛠' : '✖';
      console.log(`${mark} ${r.title}${r.count ? ` — ${r.count} ta${r.fixed ? ` (tuzatildi: ${r.fixed})` : ''}` : ''}`);
      if (r.count && !r.fixed) for (const s of r.sample) console.log(`    ${JSON.stringify(s)}`);
    }
    console.log(problems.length ? `\n${problems.length} ta muammo topildi${fix ? '' : " (xavfsizlarini tuzatish: --fix)"}` : '\nHammasi joyida.');
  }
  process.exitCode = problems.length ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exit(2); });
