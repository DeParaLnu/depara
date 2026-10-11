export const API = process.env.API_URL ?? 'http://localhost:3000';

export const DEVICE = 'e2e-device';

export function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function loginRaw(email: string, deviceId: string | undefined = DEVICE): Promise<Response> {
  return postJson('/auth/google', { idToken: `test:${email}`, deviceId });
}

export function authHeaders(token: string) {
  return { authorization: `Bearer ${token}` };
}

// Створює студента, обирає йому тестову групу й повертає токен.
export async function setupStudent(email: string, subgroup = 0): Promise<string> {
  const login = await loginRaw(email);
  const { accessToken } = (await login.json()) as { accessToken: string };

  const groupsRes = await fetch(`${API}/groups`, { headers: authHeaders(accessToken) });
  const groups = (await groupsRes.json()) as { id: string; code: string }[];
  const group = groups.find((g) => g.code === 'ТЕСТ-31');
  if (!group) throw new Error('Немає групи ТЕСТ-31: чи виконано npm run seed?');

  await fetch(`${API}/me`, {
    method: 'PATCH',
    headers: { ...authHeaders(accessToken), 'content-type': 'application/json' },
    body: JSON.stringify({ groupId: group.id, subgroup }),
  });
  return accessToken;
}

// Адмін створюється через ADMIN_EMAILS (див. CI та README). Локально: ADMIN_EMAILS=e2e.admin@lnu.edu.ua
export const ADMIN_EMAIL = 'e2e.admin@lnu.edu.ua';

export async function loginToken(email: string): Promise<string> {
  const res = await loginRaw(email);
  return ((await res.json()) as { accessToken: string }).accessToken;
}

export async function adminToken(): Promise<string> {
  const token = await loginToken(ADMIN_EMAIL);
  const me = (await (await fetch(`${API}/me`, { headers: authHeaders(token) })).json()) as { role: string };
  if (me.role !== 'ADMIN') throw new Error(`Запустіть сервер з ADMIN_EMAILS=${ADMIN_EMAIL}`);
  return token;
}

export function send(method: string, path: string, token: string, body?: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: { ...authHeaders(token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function userId(token: string): Promise<string> {
  return ((await (await fetch(`${API}/me`, { headers: authHeaders(token) })).json()) as { id: string }).id;
}

// Понеділок поточного тижня (UTC), YYYY-MM-DD: у цьому тижні E2E шукають пари
export function currentMonday(): string {
  const d = new Date();
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

export interface WeekLesson {
  id: string;
  subject: string;
  pairNumber: number;
  substitution: { id: string; kind: string; newTeacher: string | null; newRoom: string | null } | null;
}

export async function weekLessons(token: string): Promise<WeekLesson[]> {
  const res = await fetch(`${API}/schedule/week`, { headers: authHeaders(token) });
  return ((await res.json()) as { lessons: WeekLesson[] }).lessons;
}

// Створює через імпорт нову унікальну пару (щоб тести не залежали від попередніх запусків)
export async function importLesson(admin: string, subject: string, group = 'ТЕСТ-31'): Promise<Response> {
  return send('POST', '/admin/schedule/import', admin, {
    faculties: [{ name: 'Тестовий факультет', short_name: 'ТФ' }],
    groups: [{ code: group, course: 3, faculty: 'ТФ' }],
    lessons: [{ group, date: currentMonday(), pair: 5, subject, type: 'PRACTICE', subgroup: 0 }],
  });
}
