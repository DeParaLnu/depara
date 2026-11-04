// Підготовка даних для мобільних E2E через API бекенда (з машини, де бігає Appium, а не з емулятора).
// Бекенд у CI слухає localhost:3000 на тій самій машині (емулятор ходить на нього як 10.0.2.2).
// Вхід фейковим токеном test:<email> працює лише з AUTH_MODE=fake, адмін задається ADMIN_EMAILS.
const API = process.env.E2E_API_URL ?? 'http://localhost:3000';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'e2e.admin@lnu.edu.ua';
// Той самий акаунт, яким входить кнопка «Увійти як староста (E2E)» (src/config.ts)
export const HEADMAN_EMAIL = 'headman@lnu.edu.ua';

async function call<T>(method: string, path: string, token?: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return (text ? JSON.parse(text) : {}) as T;
}

const login = async (email: string) =>
  (await call<{ accessToken: string }>('POST', '/auth/microsoft', undefined, { idToken: `test:${email}`, deviceId: 'e2e-setup' }))
    .accessToken;

/**
 * Тестовий староста групи ТЕСТ-31: акаунт створюється входом, група обирається, роль призначає адмін.
 * Повторний запуск на тій самій базі нічого не ламає (та сама група дозволена й старості).
 */
export async function ensureHeadman(groupCode = 'ТЕСТ-31'): Promise<void> {
  const headman = await login(HEADMAN_EMAIL);
  const groups = await call<{ id: string; code: string }[]>('GET', '/groups', headman);
  const group = groups.find((g) => g.code === groupCode);
  if (!group) throw new Error(`Немає групи ${groupCode}: чи виконано npm run seed?`);
  await call('PATCH', '/me', headman, { groupId: group.id, subgroup: 0 });
  const me = await call<{ id: string }>('GET', '/me', headman);

  const admin = await login(ADMIN_EMAIL);
  await call('PATCH', `/admin/users/${me.id}/role`, admin, { role: 'HEADMAN' });
}
