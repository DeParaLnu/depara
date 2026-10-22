// Демо-дані для показу: розклад 4 факультетів на 5 тижнів навколо сьогодні, демо-акаунти і кілька замін.
// Запуск: npm run seed:demo. Повторний запуск безпечний: розклад оновлюється, демо-акаунти й заміни скидаються.
// Це НЕ E2E-seed (npm run seed): його дані та група ТЕСТ-31 не змінюються. Існування групи без розкладу
// (ЮР-41) і акаунта без групи показує стани «Розклад ще не опубліковано» й онбординг.
import { PrismaClient, type SubstitutionKind } from '@prisma/client';
import { ImportError, importSchedule, validateImport } from '../../src/lib/scheduleImport';
import { buildDemoPayload, DEMO_HEADMAN, DEMO_STUDENT_GROUP, DEMO_USERS } from './demoData';

// Демо-акаунти зі званням HEADMAN і відомими поштами не повинні з'являтися на справжній базі
if (process.env.NODE_ENV === 'production') {
  console.error('seed:demo не запускається при NODE_ENV=production: це лише для локальної та демо-бази.');
  process.exit(1);
}

const prisma = new PrismaClient();

async function seedUsers() {
  const groups = await prisma.studyGroup.findMany();
  const groupId = (code: string | null) => (code ? (groups.find((g) => g.code === code)?.id ?? null) : null);

  for (const u of DEMO_USERS) {
    const data = { fullName: u.fullName, role: u.role, groupId: groupId(u.group), subgroup: u.subgroup };
    await prisma.user.upsert({ where: { email: u.email }, update: data, create: { email: u.email, ...data } });
  }
}

// Заміни від імені демо-старости на найближчих парах групи студента: по одній кожного типу
async function seedSubstitutions(now: Date) {
  const headman = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_HEADMAN } });
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // Спершу прибираємо заміни попереднього запуску, інакше вони накопичувалися б на пізніших парах
  await prisma.substitution.deleteMany({ where: { createdById: headman.id } });

  const upcoming = await prisma.lesson.findMany({
    where: { group: { code: DEMO_STUDENT_GROUP }, date: { gte: today }, subgroup: 0 },
    orderBy: [{ date: 'asc' }, { pairNumber: 'asc' }],
    include: { classroom: { include: { building: true } } },
  });
  // По одній парі з кожного з найближчих днів, щоб заміни були на різних днях тижня
  const byDay = new Map<string, (typeof upcoming)[number]>();
  for (const l of upcoming) byDay.set(l.date.toISOString().slice(0, 10), byDay.get(l.date.toISOString().slice(0, 10)) ?? l);
  const targets = [...byDay.values()].slice(0, 4);

  const otherTeacher = await prisma.teacher.findFirst({ where: { fullName: 'Кравець Марта Юріївна' } });
  const kinds: SubstitutionKind[] = ['CANCELLED', 'ROOM_CHANGED', 'REPLACED', 'MOVED'];

  for (const [i, lesson] of targets.entries()) {
    const kind = kinds[i];
    const room =
      kind === 'ROOM_CHANGED'
        ? await prisma.classroom.findFirst({
            where: { buildingId: lesson.classroom?.buildingId, id: { not: lesson.classroomId ?? undefined } },
          })
        : null;
    const data = {
      CANCELLED: { comment: 'Викладач захворів, пару скасовано' },
      ROOM_CHANGED: { comment: 'Аудиторія зайнята, переходимо в іншу', newClassroomId: room?.id },
      REPLACED: { comment: 'Пару проведе інший викладач', newTeacherId: otherTeacher?.id },
      MOVED: { comment: 'Пару перенесено на кінець дня', newPairNumber: lesson.pairNumber === 5 ? 4 : 5 },
    }[kind];
    // Якщо для заміни нема потрібних довідкових даних, пропускаємо її, а не створюємо неповну
    if ((kind === 'ROOM_CHANGED' && !room) || (kind === 'REPLACED' && !otherTeacher)) continue;
    await prisma.substitution.create({ data: { lessonId: lesson.id, kind, createdById: headman.id, ...data } });
  }
  return targets.length;
}

async function main() {
  const now = new Date();
  const checked = validateImport(buildDemoPayload(now));
  if (!checked.ok) throw new ImportError(checked.errors);

  const result = await importSchedule(prisma, checked.data);
  for (const w of result.warnings) console.warn(w);
  await seedUsers();
  const subs = await seedSubstitutions(now);

  console.log(`Демо готове: ${result.imported} пар, ${DEMO_USERS.length} акаунтів, ${subs} замін.`);
  console.log('Вхід (демо-консоль /dev при AUTH_MODE=fake; пароля немає, лише пошта):');
  for (const u of DEMO_USERS) console.log(`  ${u.email.padEnd(32)} ${u.role.padEnd(8)} ${u.group ?? 'без групи (онбординг)'}`);
}

main()
  .catch((e) => {
    console.error(e instanceof ImportError ? e.errors.join('\n') : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
