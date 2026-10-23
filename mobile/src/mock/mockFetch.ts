import type { Lesson, Me, Session, WeekSchedule } from '../api';
import { addDays, fromIsoDate, mondayOf, toIsoDate } from '../lib/date';
import { MOCK_GROUPS, MOCK_LESSONS, MOCK_ME, MOCK_SCHEDULE_GROUP_ID, PAIR_TIMES } from './fixtures';

// Підміна fetch для режиму MOCK=1. Повертає справжній Response, тож api.ts проходить ті самі
// шляхи (логування, коди помилок), що й з реальним сервером. Стан живе в памʼяті до перезапуску.

const LATENCY_MS = 250;

let state: { groupId: string | null; subgroup: number } = { groupId: null, subgroup: 0 };

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': 'mock' },
  });

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function weekOf(dateParam: string | null): WeekSchedule {
  const monday = mondayOf(dateParam ? fromIsoDate(dateParam) : new Date());
  const weekStart = toIsoDate(monday);
  if (state.groupId !== MOCK_SCHEDULE_GROUP_ID) return { weekStart, lessons: [] };

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
      substitution: l.substitution ? { id: `mock-sub-${weekStart}-${i}`, ...l.substitution } : null,
    }));
  return { weekStart, lessons };
}

export async function mockFetch(path: string, init: RequestInit = {}): Promise<Response> {
  await sleep(LATENCY_MS);
  const method = init.method ?? 'GET';
  const [route, query = ''] = path.split('?');
  const authorization = (init.headers as Record<string, string> | undefined)?.Authorization;
  const body = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : {};

  if (method === 'POST' && route === '/auth/google') {
    state = { groupId: null, subgroup: 0 };
    const session: Session = { accessToken: 'mock-access', refreshToken: 'mock-refresh', needsOnboarding: true };
    return reply(200, session);
  }
  if (!authorization) return reply(401, { error: 'UNAUTHORIZED' });

  if (method === 'GET' && route === '/groups') return reply(200, MOCK_GROUPS);

  if (route === '/me') {
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

  return reply(404, { error: 'NOT_FOUND' });
}
