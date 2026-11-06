import { api } from '../../api';
import { log } from '../../lib/logger';
import { hasPermission } from '../reminders/notifications';
import { readPushToken } from './token';

// F8: токен цього пристрою на сервері. Живе до виходу з акаунта, після перезапуску застосунку шлеться знову:
// так сервер оновлює час останньої активності, а новий токен (пристрій міг його змінити) потрапляє туди сам.
let registered: string | null = null;
let inflight: Promise<void> | null = null;
// Вихід, що стався під час реєстрації, скасовує її: токен не має дійти до сервера вже після видалення
let generation = 0;

const warn = (message: string, error: unknown) =>
  log.warn('push', message, { reason: error instanceof Error ? error.message : String(error) });

async function register(accessToken: string, startedIn: number) {
  if (!(await hasPermission())) return;
  const token = await readPushToken();
  if (!token || token === registered || startedIn !== generation) return;
  try {
    await api.registerPushToken(accessToken, token);
    registered = token;
  } catch (error) {
    // Спробуємо ще раз, коли застосунок повернеться на передній план
    warn('токен пристрою не збережено на сервері', error);
  }
}

/** Передати токен на сервер, якщо є дозвіл. Не кидає помилок: без токена просто не буде пушів. */
export function syncPushToken(accessToken: string): Promise<void> {
  inflight ??= register(accessToken, generation).finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Прибрати токен із сервера перед виходом, інакше пуші йтимуть на телефон уже без користувача. Не кидає помилок. */
export async function unregisterPushToken(accessToken: string): Promise<void> {
  generation += 1;
  await inflight;
  // Реєстрація могла не вдатися в цьому запуску, а токен лишитися на сервері з минулого
  const token = registered ?? (await readPushToken());
  registered = null;
  if (!token) return;
  await api.removePushToken(accessToken, token).catch((error) => warn('токен пристрою не видалено з сервера', error));
}
