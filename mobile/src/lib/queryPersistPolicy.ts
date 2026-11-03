// Що з кешу запитів переживає перезапуск застосунку. Чиста логіка без нативних модулів: її перевіряють юніт-тести,
// а саме сховище (AsyncStorage) підключено в queryPersist.ts.

/** Скільки зберігаємо кеш на диску. Розклад старший за цей строк уже не показуємо як «збережений». */
export const PERSIST_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** Змінюйте при зміні форми відповідей API: старий кеш на диску тоді відкидається, а не ламає екрани. */
export const PERSIST_CACHE_VERSION = '1';

// Лише те, що потрібно, щоб відкрити розклад без мережі. Пошук аудиторій навмисно не зберігаємо.
const PERSISTED_KEYS = new Set(['week', 'me', 'groups', 'buildings']);

type QueryLike = { queryKey: readonly unknown[]; state: { status: string } };

export const shouldPersistQuery = (query: QueryLike): boolean =>
  query.state.status === 'success' && PERSISTED_KEYS.has(String(query.queryKey[0]));
