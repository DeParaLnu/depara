import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Persister } from '@tanstack/react-query-persist-client';
import { pruneExpiredQueries } from './queryPersistPolicy';

// Кеш розкладу на диску (AsyncStorage): без нього «Офлайн» працює лише поки живий процес застосунку.
// Містить розклад і профіль користувача, тому при виході його обов'язково прибираємо (resetCaches).
const storagePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'depara_query_cache',
  throttleTime: 1000,
});

// При відновленні відкидаємо запити старші за 14 днів (див. queryPersistPolicy.ts)
export const queryPersister: Persister = {
  ...storagePersister,
  restoreClient: async () => pruneExpiredQueries(await storagePersister.restoreClient()),
};

export const clearPersistedQueries = (): Promise<void> => Promise.resolve(storagePersister.removeClient());
