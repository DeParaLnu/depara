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
