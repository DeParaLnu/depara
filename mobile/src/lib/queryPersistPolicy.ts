// Що з кешу запитів переживає перезапуск застосунку. Чиста логіка без нативних модулів: її перевіряють юніт-тести,
// а саме сховище (AsyncStorage) підключено в queryPersist.ts.

/** Скільки зберігаємо кеш на диску. Розклад старший за цей строк уже не показуємо як «збережений». */
export const PERSIST_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** Змінюйте при зміні форми відповідей API: старий кеш на диску тоді відкидається, а не ламає екрани. */
export const PERSIST_CACHE_VERSION = '2';

// Лише те, що потрібно, щоб відкрити розклад без мережі. Пошук аудиторій навмисно не зберігаємо.
const PERSISTED_KEYS = new Set(['week', 'me', 'groups', 'buildings']);

type QueryLike = { queryKey: readonly unknown[]; state: { status: string; dataUpdatedAt: number } };

const isFresh = (dataUpdatedAt: number, now: number) => now - dataUpdatedAt <= PERSIST_MAX_AGE_MS;

// maxAge бібліотеки перевіряє час запису всього знімка, а не кожного запиту: пара-тиждень, якого давно не
// відкривали, переписувався б щоразу разом з іншими запитами і жив би далі за 14 днів. Тому вік рахуємо
// за dataUpdatedAt кожного запиту, і при збереженні, і (нижче) при відновленні.
export const shouldPersistQuery = (query: QueryLike, now = Date.now()): boolean =>
  query.state.status === 'success' &&
  PERSISTED_KEYS.has(String(query.queryKey[0])) &&
  isFresh(query.state.dataUpdatedAt, now);

/** Прибирає із знімка, прочитаного з диска, запити старші за PERSIST_MAX_AGE_MS. */
export function pruneExpiredQueries<T extends { clientState: { queries: { state: { dataUpdatedAt: number } }[] } }>(
  client: T | undefined,
  now = Date.now(),
): T | undefined {
  if (!client) return client;
  return {
    ...client,
    clientState: {
      ...client.clientState,
      queries: client.clientState.queries.filter((q) => isFresh(q.state.dataUpdatedAt, now)),
    },
  };
}
