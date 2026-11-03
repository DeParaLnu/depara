import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

// Кеш розкладу на диску (AsyncStorage): без нього «Офлайн» працює лише поки живий процес застосунку.
// Містить розклад і профіль користувача, тому при виході його обов'язково прибираємо (resetCaches).
export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'depara_query_cache',
  throttleTime: 1000,
});

export const clearPersistedQueries = (): Promise<void> => Promise.resolve(queryPersister.removeClient());
