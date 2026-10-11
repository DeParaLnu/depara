// Імпорт розкладу з schedule.seed.json у базу. Повторний запуск оновлює, а не дублює.
// Запуск: npm run seed
// Для E2E: npm run seed -- --shift-to-current-week (дати з жовтня 2026 зсуваються на поточний тиждень)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { ImportError, importSchedule, validateImport } from '../../src/lib/scheduleImport';

const prisma = new PrismaClient();
const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(here, 'schedule.seed.json'), 'utf8'));
const shift = process.argv.includes('--shift-to-current-week');

const DAY_MS = 24 * 60 * 60 * 1000;

function mondayOf(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

// Опорний понеділок у даних: 12.10.2026. Його переносимо на понеділок поточного тижня.
const shiftMs = shift ? mondayOf(new Date()).getTime() - Date.UTC(2026, 9, 12) : 0;

function shiftDate(s: string): string {
  return new Date(new Date(`${s}T00:00:00Z`).getTime() + shiftMs).toISOString().slice(0, 10);
}

async function main() {
  const lessons = (raw.lessons as { date: string }[]).map((l) => ({ ...l, date: shiftDate(l.date) }));
  const checked = validateImport({ ...raw, lessons });
  if (!checked.ok) throw new ImportError(checked.errors);

  const result = await importSchedule(prisma, checked.data);
  for (const w of result.warnings) console.warn(w);

  const days = Math.round(shiftMs / DAY_MS);
  console.log(`Seed готовий: ${result.imported} пар${shift ? `, дати зсунуто на ${days} дн.` : ''}`);
}

main()
  .catch((e) => {
    console.error(e instanceof ImportError ? e.errors.join('\n') : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
