import type { Building, Lesson, Me, Session, Substitution, Teacher, WeekSchedule } from '../api';
import { addDays, fromIsoDate, mondayOf, toIsoDate } from '../lib/date';
import { MOCK_BUILDINGS, MOCK_CLASSROOMS, MOCK_GROUPS, MOCK_LESSONS, MOCK_ME, MOCK_SCHEDULE_GROUP_ID, PAIR_TIMES } from './fixtures';

// Підміна fetch для режиму MOCK=1. Повертає справжній Response, тож api.ts проходить ті самі
// шляхи (логування, коди помилок), що й з реальним сервером. Стан живе в памʼяті до перезапуску.

const LATENCY_MS = 250;

let state: { groupId: string | null; subgroup: number } = { groupId: null, subgroup: 0 };

// F6: заміни, створені й скасовані в цьому запуску (за id пари). Пара мока має id mock-<понеділок>-<номер>
const createdSubs = new Map<string, Substitution>();
const removedSubs = new Set<string>();
let subCounter = 0;

// Викладачі для «Інший викладач»: усі, хто є в мок-розкладі
const MOCK_TEACHERS: Teacher[] = [...new Set(MOCK_LESSONS.map((l) => l.teacher).filter((t): t is string => !!t))]
  .sort((a, b) => a.localeCompare(b, 'uk'))
  .map((fullName, i) => ({ id: `mock-t-${i}`, fullName, position: null }));

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': 'mock' },
  });

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// «218/Т» -> корпус з довідника мока (як building у відповіді бекенда)
const buildingOf = (room: string | null): Building | null =>
  room ? (MOCK_BUILDINGS[room.slice(room.lastIndexOf('/') + 1)] ?? null) : null;

function weekOf(dateParam: string | null): WeekSchedule {
  const monday = mondayOf(dateParam ? fromIsoDate(dateParam) : new Date());
  const weekStart = toIsoDate(monday);
  // Як у бекенді: група без жодної пари = «розклад ще не опубліковано»
  if (state.groupId !== MOCK_SCHEDULE_GROUP_ID) return { weekStart, published: false, lessons: [] };

  const lessons: Lesson[] = MOCK_LESSONS.filter((l) => state.subgroup === 0 || [0, state.subgroup].includes(l.subgroup))
    .sort((a, b) => a.day - b.day || a.pair - b.pair || a.subgroup - b.subgroup)
    .map((l, i) => ({
      id: `mock-${weekStart}-${i}`,
      date: toIsoDate(addDays(monday, l.day)),
      pairNumber: l.pair,
      start: PAIR_TIMES[l.pair].start,
      end: PAIR_TIMES[l.pair].end,
      subject: l.subject,
      type: l.type,
      audience: l.audience,
      subgroup: l.subgroup,
      teacher: l.teacher,
      room: l.room,
      building: buildingOf(l.room),
      substitution: l.substitution
        ? { id: `mock-sub-${weekStart}-${i}`, ...l.substitution, newBuilding: buildingOf(l.substitution.newRoom) }
        : null,
    }))
    .map((l) =>
      createdSubs.has(l.id)
        ? { ...l, substitution: createdSubs.get(l.id)! }
        : removedSubs.has(l.id)
          ? { ...l, substitution: null }
          : l,
    );
  return { weekStart, published: true, lessons };
}

export async function mockFetch(path: string, init: RequestInit = {}): Promise<Response> {
  await sleep(LATENCY_MS);
  const method = init.method ?? 'GET';
  const [route, query = ''] = path.split('?');
  const authorization = (init.headers as Record<string, string> | undefined)?.Authorization;
  const body = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : {};

  if (method === 'POST' && route === '/auth/microsoft') {
    state = { groupId: null, subgroup: 0 };
    createdSubs.clear();
    removedSubs.clear();
    const session: Session = { accessToken: 'mock-access', refreshToken: 'mock-refresh', needsOnboarding: true };
    return reply(200, session);
  }

  if (method === 'POST' && route === '/auth/refresh') {
    if (!body.refreshToken || !body.deviceId) return reply(400, { error: 'INVALID_QUERY' });
    if (body.refreshToken === 'mock-invalid-refresh') return reply(401, { error: 'INVALID_REFRESH_TOKEN' });
    return reply(200, {
      accessToken: `mock-access-${Date.now()}`,
      refreshToken: `mock-refresh-${Date.now()}`,
    });
  }

  if (method === 'POST' && route === '/auth/logout') {
    return reply(204, null);
  }
  if (!authorization) return reply(401, { error: 'UNAUTHORIZED' });

  if (method === 'GET' && route === '/groups') return reply(200, MOCK_GROUPS);

  if (route === '/me') {
    if (method === 'DELETE') {
      state = { groupId: null, subgroup: 0 };
      return new Response(null, { status: 204, headers: { 'x-request-id': 'mock' } });
    }
    if (method === 'PATCH') {
      if (!MOCK_GROUPS.some((g) => g.id === body.groupId)) return reply(404, { error: 'GROUP_NOT_FOUND' });
      const subgroup = Number.isInteger(body.subgroup) ? body.subgroup : 0;
      if (subgroup < 0 || subgroup > 2) return reply(400, { error: 'INVALID_SUBGROUP' });
      state = { groupId: body.groupId, subgroup };
      return reply(200, { id: MOCK_ME.id, groupId: state.groupId, subgroup: state.subgroup });
    }
    const me: Me = { ...MOCK_ME, groupId: state.groupId, subgroup: state.subgroup };
    return reply(200, me);
  }

  if (method === 'GET' && route === '/schedule/week') {
    if (!state.groupId) return reply(409, { error: 'GROUP_NOT_SET' });
    const date = new URLSearchParams(query).get('date');
    if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return reply(400, { error: 'INVALID_DATE' });
    return reply(200, weekOf(date));
  }

  if (method === 'GET' && route === '/buildings') return reply(200, Object.values(MOCK_BUILDINGS));

  if (method === 'GET' && route === '/teachers') {
    const q = new URLSearchParams(query).get('q')?.trim().toLowerCase();
    return reply(200, MOCK_TEACHERS.filter((t) => !q || t.fullName.toLowerCase().includes(q)).slice(0, 20));
  }

  if (method === 'POST' && route === '/substitutions') return createSubstitution(body);

  if (method === 'DELETE' && route.startsWith('/substitutions/')) {
    const id = decodeURIComponent(route.slice('/substitutions/'.length));
    for (const [lessonId, sub] of createdSubs) {
      if (sub.id === id) {
        createdSubs.delete(lessonId);
        removedSubs.add(lessonId);
        return new Response(null, { status: 204, headers: { 'x-request-id': 'mock' } });
      }
    }
    // Заміна з фікстур: id mock-sub-<понеділок>-<номер>, пара має id mock-<понеділок>-<номер>
    const lessonId = id.replace(/^mock-sub-/, 'mock-');
    const lesson = weekOf(lessonWeek(lessonId)).lessons.find((l) => l.id === lessonId);
    if (!lesson?.substitution || lesson.substitution.id !== id) return reply(404, { error: 'SUBSTITUTION_NOT_FOUND' });
    removedSubs.add(lessonId);
    return new Response(null, { status: 204, headers: { 'x-request-id': 'mock' } });
  }

  if (method === 'GET' && route === '/classrooms') {
    const params = new URLSearchParams(query);
    const q = params.get('q')?.trim().toLowerCase();
    const building = params.get('building')?.trim().toLowerCase();

    let list = MOCK_CLASSROOMS;
    if (q) {
      list = list.filter((r) => r.number.toLowerCase().includes(q));
    }
    if (building) {
      list = list.filter((r) => r.building.code.toLowerCase() === building);
    }
    return reply(200, list.slice(0, 20));
  }

  return reply(404, { error: 'NOT_FOUND' });
}

// Понеділок тижня з id пари мока (mock-YYYY-MM-DD-N)
const lessonWeek = (lessonId: string) => lessonId.slice('mock-'.length, 'mock-'.length + 10);

// POST /substitutions у моку: ті самі перевірки, що й на бекенді (у скороченому вигляді)
function createSubstitution(body: Record<string, unknown>): Response {
  const lessonId = String(body.lessonId ?? '');
  const lesson = /^mock-\d{4}-\d{2}-\d{2}-\d+$/.test(lessonId)
    ? weekOf(lessonWeek(lessonId)).lessons.find((l) => l.id === lessonId)
    : undefined;
  if (!lesson) return reply(404, { error: 'LESSON_NOT_FOUND' });
  if (lesson.substitution) return reply(409, { error: 'SUBSTITUTION_EXISTS' });

  const kind = body.kind as Substitution['kind'];
  const teacher = MOCK_TEACHERS.find((t) => t.id === body.newTeacherId) ?? null;
  const room = MOCK_CLASSROOMS.find((r) => r.id === body.newClassroomId) ?? null;
  if (kind === 'REPLACED' && !teacher) return reply(400, { error: 'NEW_TEACHER_REQUIRED' });
  if (kind === 'ROOM_CHANGED' && !room) return reply(400, { error: 'NEW_CLASSROOM_REQUIRED' });
  if (kind === 'MOVED' && !body.newDate && !body.newPairNumber) return reply(400, { error: 'NEW_DATE_OR_PAIR_REQUIRED' });
  if (!['CANCELLED', 'REPLACED', 'MOVED', 'ROOM_CHANGED'].includes(kind)) return reply(400, { error: 'INVALID_KIND' });

  const sub: Substitution = {
    id: `mock-sub-new-${++subCounter}`,
    kind,
    comment: typeof body.comment === 'string' ? body.comment : null,
    newTeacher: kind === 'REPLACED' ? teacher!.fullName : null,
    newRoom: kind === 'ROOM_CHANGED' || kind === 'MOVED' ? (room?.label ?? null) : null,
    newBuilding: kind === 'ROOM_CHANGED' || kind === 'MOVED' ? (room?.building ?? null) : null,
    newDate: kind === 'MOVED' && typeof body.newDate === 'string' ? body.newDate : null,
    newPairNumber: kind === 'MOVED' && typeof body.newPairNumber === 'number' ? body.newPairNumber : null,
  };
  createdSubs.set(lesson.id, sub);
  removedSubs.delete(lesson.id);
  return reply(201, { id: sub.id, lessonId: lesson.id, kind: sub.kind });
}
