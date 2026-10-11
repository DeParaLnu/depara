import { Audience, LessonType, type PrismaClient } from '@prisma/client';
import { isIsoDate, isNonEmptyString } from './validation';

// Формат збігається з prisma/seed/schedule.seed.json. Усі довідники необов'язкові.
export interface ImportLesson {
  group: string;
  faculty?: string; // short_name, лише якщо код групи не унікальний
  date: string;
  pair: number;
  subject: string;
  type: LessonType;
  teacher: string | null;
  audience: Audience;
  subgroup: number;
  room: string | null; // "218/Т": номер/літера корпусу
}

export interface ImportPayload {
  pair_times: { pair: number; start: string; end: string }[];
  faculties: { name: string; short_name: string }[];
  groups: { code: string; course: number; faculty: string }[];
  buildings: { code: string; name: string; address: string }[];
  teachers: { full_name: string; position: string | null }[];
  lessons: ImportLesson[];
}

export class ImportError extends Error {
  constructor(public errors: string[]) {
    super(errors.join('; '));
  }
}

const MAX_LESSONS = 20000;
const MAX_ERRORS = 50;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const LESSON_TYPES = Object.values(LessonType) as string[];
const AUDIENCES = Object.values(Audience) as string[];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function list(payload: Obj, key: string, errors: string[]): Obj[] {
  const v = payload[key];
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every(isObj)) {
    errors.push(`${key}: має бути масивом об'єктів`);
    return [];
  }
  return v;
}

// Чиста перевірка формату без звернень до бази. Збирає всі помилки з номерами рядків.
export function validateImport(raw: unknown): { ok: true; data: ImportPayload } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['Тіло запиту має бути об\'єктом'] };

  const pair_times = list(raw, 'pair_times', errors).map((p, i) => {
    if (!Number.isInteger(p.pair) || (p.pair as number) < 1) errors.push(`pair_times[${i}].pair: ціле число від 1`);
    if (typeof p.start !== 'string' || !TIME_RE.test(p.start)) errors.push(`pair_times[${i}].start: формат HH:MM`);
    if (typeof p.end !== 'string' || !TIME_RE.test(p.end)) errors.push(`pair_times[${i}].end: формат HH:MM`);
    return p as unknown as ImportPayload['pair_times'][number];
  });

  const faculties = list(raw, 'faculties', errors).map((f, i) => {
    if (!isNonEmptyString(f.name)) errors.push(`faculties[${i}].name: обов'язкове`);
    if (!isNonEmptyString(f.short_name)) errors.push(`faculties[${i}].short_name: обов'язкове`);
    return f as unknown as ImportPayload['faculties'][number];
  });

  const groups = list(raw, 'groups', errors).map((g, i) => {
    if (!isNonEmptyString(g.code)) errors.push(`groups[${i}].code: обов'язкове`);
    if (!Number.isInteger(g.course) || (g.course as number) < 1) errors.push(`groups[${i}].course: ціле число від 1`);
    if (!isNonEmptyString(g.faculty)) errors.push(`groups[${i}].faculty: обов'язкове (short_name)`);
    return g as unknown as ImportPayload['groups'][number];
  });

  const buildings = list(raw, 'buildings', errors).map((b, i) => {
    if (!isNonEmptyString(b.code)) errors.push(`buildings[${i}].code: обов'язкове`);
    if (!isNonEmptyString(b.name)) errors.push(`buildings[${i}].name: обов'язкове`);
    if (!isNonEmptyString(b.address)) errors.push(`buildings[${i}].address: обов'язкове`);
    return b as unknown as ImportPayload['buildings'][number];
  });

  const teachers = list(raw, 'teachers', errors).map((t, i) => {
    if (!isNonEmptyString(t.full_name)) errors.push(`teachers[${i}].full_name: обов'язкове`);
    return { full_name: t.full_name, position: typeof t.position === 'string' ? t.position : null } as ImportPayload['teachers'][number];
  });

  const rawLessons = raw.lessons;
  if (!Array.isArray(rawLessons) || rawLessons.length === 0) {
    errors.push('lessons: потрібен непорожній масив');
    return { ok: false, errors: errors.slice(0, MAX_ERRORS) };
  }
  if (rawLessons.length > MAX_LESSONS) {
    errors.push(`lessons: забагато записів (максимум ${MAX_LESSONS})`);
    return { ok: false, errors };
  }

  const seen = new Set<string>();
  const lessons: ImportLesson[] = [];
  rawLessons.forEach((l: unknown, i: number) => {
    if (!isObj(l)) {
      errors.push(`lessons[${i}]: має бути об'єктом`);
      return;
    }
    const at = `lessons[${i}]`;
    if (!isNonEmptyString(l.group)) errors.push(`${at}.group: обов'язкове`);
    if (!isIsoDate(l.date)) errors.push(`${at}.date: очікується існуюча дата YYYY-MM-DD`);
    if (!Number.isInteger(l.pair) || (l.pair as number) < 1) errors.push(`${at}.pair: ціле число від 1`);
    if (!isNonEmptyString(l.subject)) errors.push(`${at}.subject: обов'язкове`);
    if (l.type !== undefined && !LESSON_TYPES.includes(l.type as string)) errors.push(`${at}.type: одне з ${LESSON_TYPES.join(', ')}`);
    if (l.audience !== undefined && !AUDIENCES.includes(l.audience as string)) errors.push(`${at}.audience: одне з ${AUDIENCES.join(', ')}`);
    if (l.subgroup !== undefined && (!Number.isInteger(l.subgroup) || (l.subgroup as number) < 0 || (l.subgroup as number) > 2)) {
      errors.push(`${at}.subgroup: 0, 1 або 2`);
    }
    if (l.teacher != null && typeof l.teacher !== 'string') errors.push(`${at}.teacher: рядок`);
    if (l.room != null && (typeof l.room !== 'string' || (l.room !== '' && !l.room.includes('/')))) {
      errors.push(`${at}.room: формат "номер/літера корпусу", наприклад 218/Т`);
    }

    const lesson: ImportLesson = {
      group: String(l.group),
      faculty: typeof l.faculty === 'string' ? l.faculty : undefined,
      date: String(l.date),
      pair: Number(l.pair),
      subject: String(l.subject).trim(),
      type: ((l.type as LessonType | undefined) ?? 'OTHER') as LessonType,
      teacher: typeof l.teacher === 'string' && l.teacher.trim() ? l.teacher.trim() : null,
      audience: ((l.audience as Audience | undefined) ?? 'GROUP') as Audience,
      subgroup: typeof l.subgroup === 'number' ? l.subgroup : 0,
      room: typeof l.room === 'string' && l.room.trim() ? l.room.trim() : null,
    };
    // Той самий ключ, що й унікальний індекс у БД: інакше повторний імпорт мовчки злив би пари
    const key = [lesson.faculty ?? '', lesson.group, lesson.date, lesson.pair, lesson.subgroup, lesson.subject].join('|');
    if (seen.has(key)) errors.push(`${at}: дубль пари (${lesson.group}, ${lesson.date}, пара ${lesson.pair}, "${lesson.subject}"). Розрізніть через subgroup`);
    seen.add(key);
    lessons.push(lesson);
  });

  if (errors.length > 0) return { ok: false, errors: errors.slice(0, MAX_ERRORS) };
  return { ok: true, data: { pair_times, faculties, groups, buildings, teachers, lessons } };
}

// "218/Т" -> { number: "218", code: "Т" }. Ділимо по ОСТАННЬОМУ слешу.
function splitRoom(room: string): { number: string; code: string } {
  const i = room.lastIndexOf('/');
  return { number: room.slice(0, i).trim(), code: room.slice(i + 1).trim() };
}

const toTime = (s: string) => new Date(`1970-01-01T${s}:00Z`);
const toDate = (s: string) => new Date(`${s}T00:00:00Z`);

export interface ImportResult {
  imported: number;
  groupIds: string[];
  warnings: string[];
}

// Записує розклад в одній транзакції: або імпортується все, або нічого. Повторний імпорт оновлює, а не дублює.
export async function importSchedule(prisma: PrismaClient, data: ImportPayload): Promise<ImportResult> {
  return prisma.$transaction(
    async (tx) => {
      for (const p of data.pair_times) {
        await tx.pairTime.upsert({
          where: { pairNumber: p.pair },
          update: { startTime: toTime(p.start), endTime: toTime(p.end) },
          create: { pairNumber: p.pair, startTime: toTime(p.start), endTime: toTime(p.end) },
        });
      }
      const knownPairs = new Set((await tx.pairTime.findMany()).map((p) => p.pairNumber));

      for (const f of data.faculties) {
        const found = await tx.faculty.findFirst({ where: { shortName: f.short_name } });
        if (found) await tx.faculty.update({ where: { id: found.id }, data: { name: f.name } });
        else await tx.faculty.create({ data: { name: f.name, shortName: f.short_name } });
      }

      for (const g of data.groups) {
        const faculty = await tx.faculty.findFirst({ where: { shortName: g.faculty } });
        if (!faculty) throw new ImportError([`groups: невідомий факультет "${g.faculty}"`]);
        await tx.studyGroup.upsert({
          where: { facultyId_code: { facultyId: faculty.id, code: g.code } },
          update: { course: g.course },
          create: { code: g.code, course: g.course, facultyId: faculty.id },
        });
      }

      const buildingId = new Map<string, string>();
      for (const b of data.buildings) {
        const row = await tx.building.upsert({
          where: { code: b.code },
          update: { name: b.name, address: b.address },
          create: { code: b.code, name: b.name, address: b.address },
        });
        buildingId.set(b.code, row.id);
      }

      for (const t of data.teachers) {
        await tx.teacher.upsert({
          where: { fullName: t.full_name },
          update: { position: t.position },
          create: { fullName: t.full_name, position: t.position },
        });
      }

      const warnings = new Set<string>();
      const groupCache = new Map<string, string>();
      const teacherCache = new Map<string, string>();
      const roomCache = new Map<string, string | null>();
      const touchedGroups = new Set<string>();
      const problems: string[] = [];

      const resolveGroup = async (code: string, faculty?: string): Promise<string | null> => {
        const cacheKey = `${faculty ?? ''}|${code}`;
        const cached = groupCache.get(cacheKey);
        if (cached) return cached;
        const rows = await tx.studyGroup.findMany({
          where: { code, ...(faculty ? { faculty: { shortName: faculty } } : {}) },
        });
        if (rows.length === 0) {
          problems.push(`Група "${code}" не знайдена. Додайте її в groups або створіть раніше`);
          return null;
        }
        if (rows.length > 1) {
          problems.push(`Код групи "${code}" не унікальний. Вкажіть faculty (short_name) у парі`);
          return null;
        }
        groupCache.set(cacheKey, rows[0].id);
        return rows[0].id;
      };

      let imported = 0;
      for (const [i, l] of data.lessons.entries()) {
        if (!knownPairs.has(l.pair)) {
          problems.push(`lessons[${i}]: пари №${l.pair} немає в розкладі дзвінків (pair_times)`);
          continue;
        }
        const groupId = await resolveGroup(l.group, l.faculty);
        if (!groupId) continue;

        let teacherId: string | null = null;
        if (l.teacher) {
          teacherId = teacherCache.get(l.teacher) ?? null;
          if (!teacherId) {
            teacherId = (
              await tx.teacher.upsert({ where: { fullName: l.teacher }, update: {}, create: { fullName: l.teacher } })
            ).id;
            teacherCache.set(l.teacher, teacherId);
          }
        }

        let classroomId: string | null = null;
        if (l.room) {
          if (roomCache.has(l.room)) {
            classroomId = roomCache.get(l.room) ?? null;
          } else {
            const room = splitRoom(l.room);
            let bid = buildingId.get(room.code);
            if (!bid) bid = (await tx.building.findUnique({ where: { code: room.code } }))?.id;
            if (!bid) {
              warnings.add(`Корпусу "${room.code}" немає в довіднику, аудиторію ${l.room} пропущено`);
            } else {
              classroomId = (
                await tx.classroom.upsert({
                  where: { buildingId_number: { buildingId: bid, number: room.number } },
                  update: {},
                  create: { buildingId: bid, number: room.number },
                })
              ).id;
            }
            roomCache.set(l.room, classroomId);
          }
        }

        const common = { type: l.type, audience: l.audience, teacherId, classroomId };
        await tx.lesson.upsert({
          where: {
            groupId_date_pairNumber_subgroup_subject: {
              groupId,
              date: toDate(l.date),
              pairNumber: l.pair,
              subgroup: l.subgroup,
              subject: l.subject,
            },
          },
          update: common,
          create: { groupId, date: toDate(l.date), pairNumber: l.pair, subgroup: l.subgroup, subject: l.subject, ...common },
        });
        touchedGroups.add(groupId);
        imported++;
      }

      if (problems.length > 0) throw new ImportError([...new Set(problems)].slice(0, MAX_ERRORS));
      return { imported, groupIds: [...touchedGroups], warnings: [...warnings] };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}
