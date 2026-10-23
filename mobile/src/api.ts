import { config } from './config';
import { mockFetch } from './mock/mockFetch';
import { log } from './lib/logger';

export type Session = {
  accessToken: string;
  refreshToken: string;
  needsOnboarding: boolean;
};

export type Group = { id: string; code: string; course: number; faculty: string };

export type Me = {
  id: string;
  email: string;
  fullName: string | null;
  role: 'STUDENT' | 'HEADMAN' | 'ADMIN';
  groupId: string | null;
  subgroup: number;
  reminderMinutes: number;
};

export type LessonType = 'LECTURE' | 'PRACTICE' | 'LAB' | 'EXAM' | 'OTHER';
export type SubstitutionKind = 'CANCELLED' | 'REPLACED' | 'MOVED' | 'ROOM_CHANGED';

// Корпус аудиторії: літера, назва й адреса (для екрана деталей і маршруту)
export type Building = { code: string; name: string; address: string };

export type Substitution = {
  id: string;
  kind: SubstitutionKind;
  comment: string | null;
  newTeacher: string | null;
  newRoom: string | null; // «номер/код корпусу»
  newBuilding: Building | null;
  newDate: string | null;
  newPairNumber: number | null;
};

export type Lesson = {
  id: string;
  date: string; // YYYY-MM-DD
  pairNumber: number;
  start: string; // HH:MM, місцевий час університету
  end: string;
  subject: string;
  type: LessonType;
  audience: 'STREAM' | 'COMBINED' | 'GROUP';
  subgroup: number; // 0 = уся група
  teacher: string | null;
  room: string | null; // «номер/код корпусу»
  building: Building | null;
  substitution: Substitution | null;
};

// published = false: деканат ще нічого не опублікував для групи («Розклад ще не опубліковано»),
// на відміну від порожнього тижня при published = true
export type WeekSchedule = { weekStart: string; published: boolean; lessons: Lesson[] };

export class ApiError extends Error {
  constructor(
    public code: string,
    public status = 0,
    /** Заголовок X-Request-ID відповіді: за ним запис знаходиться в логах бекенда. */
    public requestId?: string,
  ) {
    super(code);
  }
}

// Єдина точка всіх HTTP-запитів: тут логуємо метод, шлях, статус, код помилки з тіла і тривалість.
// Токени, тіла відповідей і query-рядок у лог не потрапляють.
async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const method = init.method ?? 'GET';
  const route = path.split('?')[0];
  const started = Date.now();
  let res: Response;
  try {
    const options = {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    // MOCK=1: запити обслуговує вбудований мок (src/mock), мережа й бекенд не потрібні
    res = await (config.mock ? mockFetch(path, options) : fetch(`${config.apiUrl}${path}`, options));
  } catch {
    log.warn('api', `${method} ${route}: немає зв’язку`, { code: 'NETWORK_ERROR', ms: Date.now() - started });
    throw new ApiError('NETWORK_ERROR');
  }
  const ms = Date.now() - started;
  const requestId = res.headers.get('x-request-id') ?? undefined;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code: string = body.error ?? `HTTP_${res.status}`;
    log.warn('api', `${method} ${route} → ${res.status} ${code}`, { ms, requestId });
    throw new ApiError(code, res.status, requestId);
  }
  if (__DEV__) log.info('api', `${method} ${route} → ${res.status}`, { ms, requestId });
  return body as T;
}

export const api = {
  loginWithMicrosoft: (idToken: string, deviceId: string) =>
    request<Session>('/auth/microsoft', { method: 'POST', body: JSON.stringify({ idToken, deviceId }) }),
  groups: (token: string) => request<Group[]>('/groups', {}, token),
  me: (token: string) => request<Me>('/me', {}, token),
  setGroup: (token: string, groupId: string, subgroup: number) =>
    request<{ id: string; groupId: string; subgroup: number }>(
      '/me',
      { method: 'PATCH', body: JSON.stringify({ groupId, subgroup }) },
      token,
    ),
  week: (token: string, date?: string) =>
    request<WeekSchedule>(`/schedule/week${date ? `?date=${date}` : ''}`, {}, token),
};
