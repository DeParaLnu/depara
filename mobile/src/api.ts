import { config } from './config';

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

export type Substitution = {
  id: string;
  kind: SubstitutionKind;
  comment: string | null;
  newTeacher: string | null;
  newRoom: string | null; // «номер/код корпусу»
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
  substitution: Substitution | null;
};

export type WeekSchedule = { weekStart: string; lessons: Lesson[] };

export class ApiError extends Error {
  constructor(
    public code: string,
    public status = 0,
  ) {
    super(code);
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw new ApiError('NETWORK_ERROR');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `HTTP_${res.status}`, res.status);
  return body as T;
}

export const api = {
  loginWithGoogle: (idToken: string, deviceId: string) =>
    request<Session>('/auth/google', { method: 'POST', body: JSON.stringify({ idToken, deviceId }) }),
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
