// Імпорт розкладу з schedule.seed.json у базу. Повторний запуск оновлює, а не дублює.
// Запуск: npm run seed
// Для E2E: npm run seed -- --shift-to-current-week (дати з жовтня 2026 зсуваються на поточний тиждень)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Audience, LessonType, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, 'schedule.seed.json'), 'utf8'));
const shift = process.argv.includes('--shift-to-current-week');

const DAY_MS = 24 * 60 * 60 * 1000;

function mondayOf(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

// Опорний понеділок у даних: 12.10.2026. Його переносимо на понеділок поточного тижня.
const shiftMs = shift
  ? mondayOf(new Date()).getTime() - Date.UTC(2026, 9, 12)
  : 0;

function toDate(s: string): Date {
  return new Date(new Date(`${s}T00:00:00Z`).getTime() + shiftMs);
}

function toTime(s: string): Date {
  return new Date(`1970-01-01T${s}:00Z`);
}

// "218/Т" -> { number: "218", code: "Т" }. Ділимо по ОСТАННЬОМУ слешу.
function splitRoom(room: string | null): { number: string; code: string } | null {
  if (!room) return null;
  const i = room.lastIndexOf('/');
  if (i < 0) return null;
  return { number: room.slice(0, i).trim(), code: room.slice(i + 1).trim() };
}

async function main() {
  // Перевірка унікальності ключа імпорту до запису в базу
  const seen = new Set<string>();
  for (const l of data.lessons) {
    const key = [l.group, l.date, l.pair, l.subgroup, l.subject].join('|');
    if (seen.has(key)) {
      throw new Error(`Дубль у розкладі: ${key}. Розрізніть пари через subgroup.`);
    }
    seen.add(key);
  }

  for (const p of data.pair_times) {
    await prisma.pairTime.upsert({
      where: { pairNumber: p.pair },
      update: { startTime: toTime(p.start), endTime: toTime(p.end) },
      create: { pairNumber: p.pair, startTime: toTime(p.start), endTime: toTime(p.end) },
    });
  }

  const facultyId = new Map<string, string>();
  for (const f of data.faculties) {
    const found = await prisma.faculty.findFirst({ where: { shortName: f.short_name } });
    const row =
      found ??
      (await prisma.faculty.create({ data: { name: f.name, shortName: f.short_name } }));
    facultyId.set(f.short_name, row.id);
  }

  const groupId = new Map<string, string>();
  for (const g of data.groups) {
    const fid = facultyId.get(g.faculty);
    if (!fid) throw new Error(`Невідомий факультет ${g.faculty}`);
    const row = await prisma.studyGroup.upsert({
      where: { facultyId_code: { facultyId: fid, code: g.code } },
      update: { course: g.course },
      create: { code: g.code, course: g.course, facultyId: fid },
    });
    groupId.set(g.code, row.id);
  }

  const buildingId = new Map<string, string>();
  for (const b of data.buildings) {
    const row = await prisma.building.upsert({
      where: { code: b.code },
      update: { name: b.name, address: b.address },
      create: { code: b.code, name: b.name, address: b.address },
    });
    buildingId.set(b.code, row.id);
  }

  const teacherId = new Map<string, string>();
  for (const t of data.teachers) {
    const row = await prisma.teacher.upsert({
      where: { fullName: t.full_name },
      update: { position: t.position },
      create: { fullName: t.full_name, position: t.position },
    });
    teacherId.set(t.full_name, row.id);
  }

  let count = 0;
  for (const l of data.lessons) {
    const gid = groupId.get(l.group);
    if (!gid) throw new Error(`Невідома група ${l.group}`);

    let classroomId: string | null = null;
    const room = splitRoom(l.room);
    if (room) {
      const bid = buildingId.get(room.code);
      if (!bid) {
        console.warn(`Корпусу "${room.code}" немає в довіднику, аудиторія ${l.room} пропущена`);
      } else {
        const c = await prisma.classroom.upsert({
          where: { buildingId_number: { buildingId: bid, number: room.number } },
          update: {},
          create: { buildingId: bid, number: room.number },
        });
        classroomId = c.id;
      }
    }

    const common = {
      type: l.type as LessonType,
      audience: l.audience as Audience,
      teacherId: l.teacher ? (teacherId.get(l.teacher) ?? null) : null,
      classroomId,
    };

    await prisma.lesson.upsert({
      where: {
        groupId_date_pairNumber_subgroup_subject: {
          groupId: gid,
          date: toDate(l.date),
          pairNumber: l.pair,
          subgroup: l.subgroup,
          subject: l.subject,
        },
      },
      update: common,
      create: {
        groupId: gid,
        date: toDate(l.date),
        pairNumber: l.pair,
        subgroup: l.subgroup,
        subject: l.subject,
        ...common,
      },
    });
    count++;
  }

  const days = Math.round(shiftMs / DAY_MS);
  console.log(`Seed готовий: ${count} пар${shift ? `, дати зсунуто на ${days} дн.` : ''}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
