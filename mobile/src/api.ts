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
  /** Перемикач «Зміни та скасування» (пуші F8); старі відповіді без поля вважаємо true */
  notifySubstitutions?: boolean;
};

/** F9: налаштування, які PATCH /me змінює окремо від групи (передаються лише змінені поля) */
export type ProfileSettings = { reminderMinutes?: number; notifySubstitutions?: boolean };

export type LessonType = 'LECTURE' | 'PRACTICE' | 'LAB' | 'EXAM' | 'OTHER';
export type SubstitutionKind = 'CANCELLED' | 'REPLACED' | 'MOVED' | 'ROOM_CHANGED';

// Корпус аудиторії: літера, назва й адреса (для екрана деталей і маршруту)
export type Building = { code: string; name: string; address: string };

export type Classroom = {
  id: string;
  number: string;
  label: string; // «номер/код корпусу»
  building: Building;
};

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
export type Teacher = { id: string; fullName: string; position: string | null };

// F6: тіло POST /substitutions. Які поля потрібні, залежить від kind (див. features/substitutions/form.ts)
export type NewSubstitution = {
  lessonId: string;
  kind: SubstitutionKind;
  newTeacherId?: string;
  newClassroomId?: string;
  newDate?: string;
  newPairNumber?: number;
  comment?: string;
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
// etag: заголовок ETag відповіді (не поле тіла). Зберігається в кеші разом із тижнем, щоб наступний запит
// надіслав If-None-Match і при незмінному розкладі отримав 304 без тіла
export type WeekSchedule = { weekStart: string; published: boolean; lessons: Lesson[]; etag?: string };

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

export type SessionBridge = {
  getSession: () => Session | null;
  getDeviceId: () => Promise<string>;
  onRefreshed: (tokens: { accessToken: string; refreshToken: string }) => Promise<void>;
  onRefreshFailed: () => Promise<void>;
};

let sessionBridge: SessionBridge | null = null;
export function setSessionBridge(bridge: SessionBridge) {
  sessionBridge = bridge;
}

// Результат оновлення токена. Сесію скидаємо лише при `rejected` (сервер визнав refresh недійсним).
// `transient` (немає мережі, 5xx, ліміт запитів) сесію зберігає: токен ще може бути дійсним, і розлогін через
// слабкий зв'язок змусив би студента проходити вхід заново.
type RefreshResult =
  | { kind: 'ok'; accessToken: string }
  | { kind: 'transient'; error: ApiError }
  | { kind: 'rejected' };

let refreshPromise: Promise<RefreshResult> | null = null;

// 400/401 від /auth/refresh: refresh недійсний чи відхилений. Усе інше вважаємо тимчасовим.
const isRefreshRejected = (e: unknown): boolean => e instanceof ApiError && (e.status === 401 || e.status === 400);

async function handleTokenRefresh(): Promise<RefreshResult> {
  if (refreshPromise) return refreshPromise;
  const bridge = sessionBridge;
  if (!bridge) return { kind: 'rejected' };

  refreshPromise = (async (): Promise<RefreshResult> => {
    try {
      const current = bridge.getSession();
      if (!current?.refreshToken) {
        await bridge.onRefreshFailed();
        return { kind: 'rejected' };
      }
      const deviceId = await bridge.getDeviceId();
      const res = await api.refresh(current.refreshToken, deviceId);
      await bridge.onRefreshed(res);
      return { kind: 'ok', accessToken: res.accessToken };
    } catch (e) {
      if (isRefreshRejected(e)) {
        log.warn('auth', 'сервер відхилив refresh-токен, скидаємо сесію', { error: e });
        await bridge.onRefreshFailed();
        return { kind: 'rejected' };
      }
      log.warn('auth', 'не вдалось оновити токен (тимчасово), сесію зберігаємо', { error: e });
      const error = e instanceof ApiError ? e : new ApiError('NETWORK_ERROR');
      return { kind: 'transient', error };
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

type Sent = { body: unknown; status: number; headers: Headers };

// Єдина точка всіх HTTP-запитів: тут логуємо метод, шлях, статус, код помилки з тіла і тривалість.
// Токени, тіла відповідей і query-рядок у лог не потрапляють. 304 (Not Modified) вважаємо успіхом:
// що з ним робити, вирішує виклик, який надіслав If-None-Match (див. api.week).
async function send(path: string, init: RequestInit = {}, token?: string, isRetry = false): Promise<Sent> {
  const method = init.method ?? 'GET';
  const route = path.split('?')[0];
  const started = Date.now();
  let res: Response;
  try {
    const options = {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> | undefined),
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
  if (!res.ok && res.status !== 304) {
    const code: string = body.error ?? `HTTP_${res.status}`;
    // A1: авто-refresh при 401 TOKEN_EXPIRED (specs/f1-login.md)
    if (
      res.status === 401 &&
      code === 'TOKEN_EXPIRED' &&
      !isRetry &&
      route !== '/auth/refresh' &&
      route !== '/auth/microsoft' &&
      sessionBridge
    ) {
      log.info('auth', 'access токен прострочено, виконуємо авто-refresh');
      const refreshed = await handleTokenRefresh();
      if (refreshed.kind === 'ok') return send(path, init, refreshed.accessToken, true);
      // Тимчасова помилка refresh: віддаємо її (наприклад NETWORK_ERROR) замість 401, щоб екран показав
      // «Офлайн» і збережений розклад, а загальний обробник не скинув сесію
      if (refreshed.kind === 'transient') throw refreshed.error;
    }
    log.warn('api', `${method} ${route} → ${res.status} ${code}`, { ms, requestId });
    throw new ApiError(code, res.status, requestId);
  }
  if (__DEV__) log.info('api', `${method} ${route} → ${res.status}`, { ms, requestId });
  return { body, status: res.status, headers: res.headers };
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  return (await send(path, init, token)).body as T;
}

// F3: тиждень з ETag. Є збережений тиждень з etag: шлемо If-None-Match, і на 304 віддаємо його ж
// (сервер підтвердив, що розклад не змінився), інакше беремо нове тіло і новий etag.
async function fetchWeek(token: string, date?: string, cached?: WeekSchedule): Promise<WeekSchedule> {
  const path = `/schedule/week${date ? `?date=${date}` : ''}`;
  const init: RequestInit = cached?.etag ? { headers: { 'If-None-Match': cached.etag } } : {};
  const res = await send(path, init, token);
  if (res.status === 304) {
    if (cached) return cached;
    // 304 без нашого If-None-Match (наприклад, проксі): тіла немає, тож це помилка, а не порожній тиждень
    throw new ApiError('HTTP_304', 304, res.headers.get('x-request-id') ?? undefined);
  }
  const etag = res.headers.get('etag') ?? undefined;
  return { ...(res.body as WeekSchedule), etag };
}

export const api = {
  loginWithMicrosoft: (idToken: string, deviceId: string) =>
    request<Session>('/auth/microsoft', { method: 'POST', body: JSON.stringify({ idToken, deviceId }) }),
  refresh: (refreshToken: string, deviceId: string) =>
    request<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken, deviceId }),
    }),
  logout: (refreshToken: string) =>
    request<void>('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
  // Видалення власного акаунта: 204 без тіла
  deleteAccount: (token: string) => request<void>('/me', { method: 'DELETE' }, token),
  groups: (token: string) => request<Group[]>('/groups', {}, token),
  me: (token: string) => request<Me>('/me', {}, token),
  updateSettings: (token: string, settings: ProfileSettings) =>
    request<Me>('/me', { method: 'PATCH', body: JSON.stringify(settings) }, token),
  setGroup: (token: string, groupId: string, subgroup: number) =>
    request<{ id: string; groupId: string; subgroup: number }>(
      '/me',
      { method: 'PATCH', body: JSON.stringify({ groupId, subgroup }) },
      token,
    ),
  week: fetchWeek,
  buildings: (token: string) => request<Building[]>('/buildings', {}, token),
  classrooms: (token: string, q?: string, building?: string) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (building) params.set('building', building);
    const qs = params.toString();
    return request<Classroom[]>(`/classrooms${qs ? `?${qs}` : ''}`, {}, token);
  },
  teachers: (token: string, q?: string) =>
    request<Teacher[]>(`/teachers${q ? `?q=${encodeURIComponent(q)}` : ''}`, {}, token),
  createSubstitution: (token: string, body: NewSubstitution) =>
    request<{ id: string }>('/substitutions', { method: 'POST', body: JSON.stringify(body) }, token),
  // Скасування заміни: 204 без тіла, пара повертається до звичайного вигляду
  deleteSubstitution: (token: string, id: string) =>
    request<void>(`/substitutions/${encodeURIComponent(id)}`, { method: 'DELETE' }, token),
};
