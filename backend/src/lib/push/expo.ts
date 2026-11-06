// Клієнт Expo Push API: https://docs.expo.dev/push-notifications/sending-notifications/
// Лише відправка (tickets). Квитанції доставки (receipts) не перевіряємо: для MVP досить того, що
// DeviceNotRegistered у ticket прибирає мертвий токен.

export const EXPO_CHUNK = 100; // максимум повідомлень в одному запиті до Expo

const TOKEN_RE = /^Expo(?:nent)?PushToken\[[^[\]\s]{8,200}\]$/;
export const isExpoPushToken = (v: unknown): v is string => typeof v === 'string' && TOKEN_RE.test(v);

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface SendResult {
  sent: string[]; // Expo прийняв
  invalid: string[]; // пристрій більше не зареєстрований: токен видаляємо
  retry: string[]; // тимчасовий збій (мережа, 429, 5xx): повторимо пізніше
  failed: string[]; // інша помилка, повтор не допоможе
  errors: string[]; // опис помилок для журналу (без токенів)
}

export interface ExpoOptions {
  url: string;
  accessToken?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

type Ticket = { status?: string; message?: string; details?: { error?: string } };

export async function sendExpoPush(messages: PushMessage[], opts: ExpoOptions): Promise<SendResult> {
  const result: SendResult = { sent: [], invalid: [], retry: [], failed: [], errors: [] };
  const doFetch = opts.fetchImpl ?? fetch;
  for (let i = 0; i < messages.length; i += EXPO_CHUNK) {
    const chunk = messages.slice(i, i + EXPO_CHUNK);
    const tokens = chunk.map((m) => m.to);
    let res: Response;
    try {
      res = await doFetch(opts.url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(opts.accessToken ? { authorization: `Bearer ${opts.accessToken}` } : {}),
        },
        body: JSON.stringify(chunk.map((m) => ({ ...m, sound: 'default', priority: 'high' }))),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
      });
    } catch (err) {
      result.retry.push(...tokens);
      result.errors.push(`мережа: ${(err as Error).message}`);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      result.retry.push(...tokens);
      result.errors.push(`Expo HTTP ${res.status}`);
      continue;
    }
    const payload = (await res.json().catch(() => null)) as { data?: unknown; errors?: unknown } | null;
    const tickets = payload?.data;
    if (!res.ok || !Array.isArray(tickets) || tickets.length !== chunk.length) {
      result.failed.push(...tokens);
      result.errors.push(`Expo HTTP ${res.status}: ${JSON.stringify(payload?.errors ?? payload).slice(0, 200)}`);
      continue;
    }
    tickets.forEach((t: Ticket, k) => {
      const token = tokens[k];
      if (t?.status === 'ok') return void result.sent.push(token);
      const code = t?.details?.error ?? 'unknown';
      if (code === 'DeviceNotRegistered') result.invalid.push(token);
      else if (code === 'MessageRateExceeded') result.retry.push(token);
      else {
        result.failed.push(token);
        result.errors.push(`ticket ${code}: ${t?.message ?? ''}`.trim());
      }
    });
  }
  return result;
}
