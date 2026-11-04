import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { defaultShouldDehydrateQuery, type Query } from '@tanstack/react-query';
import { log } from './logger';

// F3 офлайн: кеш запитів зберігається на пристрої, тож після перезапуску без інтернету
// застосунок показує останній завантажений розклад. Токенів тут немає (вони в secure-store),
// лише профіль, список груп і тижні розкладу.

/** Скільки зберігати кеш. Також це gcTime: інакше react-query викине відновлені запити через 5 хв. */
export const CACHE_MAX_AGE = 14 * 24 * 60 * 60 * 1000;

/** Змініть, коли змінюється форма відповідей API: старий кеш тоді відкинеться при запуску. */
export const CACHE_BUSTER = '1';

const CACHE_KEY = 'depara_query_cache';

// Лише те, що потрібно екранам розкладу офлайн. Пошук аудиторій не зберігаємо.
const PERSISTED_QUERIES = new Set(['me', 'groups', 'week']);

export const shouldPersistQuery = (query: Query) =>
  defaultShouldDehydrateQuery(query) && PERSISTED_QUERIES.has(String(query.queryKey[0]));

export const queryPersister = createAsyncStoragePersister({ storage: AsyncStorage, key: CACHE_KEY });

/** Видалити збережений кеш: при виході і при запуску без сесії, щоб дані одного акаунта не дісталися іншому. */
export async function clearPersistedQueries(): Promise<void> {
  try {
    await queryPersister.removeClient();
  } catch (error) {
    log.warn('cache', 'не вдалося очистити збережений кеш', {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
