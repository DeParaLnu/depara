import { config } from './config';

export type Session = {
  accessToken: string;
  refreshToken: string;
  needsOnboarding: boolean;
};

export type Group = { id: string; code: string; course: number; faculty: string };

export class ApiError extends Error {
  constructor(public code: string) {
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
  if (!res.ok) throw new ApiError(body.error ?? `HTTP_${res.status}`);
  return body as T;
}

export const api = {
  loginWithGoogle: (idToken: string, deviceId: string) =>
    request<Session>('/auth/google', { method: 'POST', body: JSON.stringify({ idToken, deviceId }) }),
  groups: (token: string) => request<Group[]>('/groups', {}, token),
};
