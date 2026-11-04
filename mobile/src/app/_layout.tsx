import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '../api';
import { AppErrorBoundary } from '../components/AppErrorBoundary';
import { config } from '../config';
import { useSession } from '../features/auth/session';
import { registerCacheReset } from '../lib/cacheReset';
import { log } from '../lib/logger';
import { clearPersistedQueries, queryPersister } from '../lib/queryPersist';
import { PERSIST_CACHE_VERSION, PERSIST_MAX_AGE_MS, shouldPersistQuery } from '../lib/queryPersistPolicy';

// Кеш розкладу на диску, щоб «Офлайн» працював і після перезапуску застосунку. У збірках MOCK і E2E дані вбудовані
// чи тестові, а кеш між запусками лише порушував би їх передбачуваність.
const persistCache = !config.mock && !config.e2e;

// Глобальний обробник помилок запитів. Помилки API (мережа, 4xx/5xx) очікувані: рівень warn.
// Усе інше це баг: рівень error зі стеком.
// 401 від сервера, що дійшов сюди = сесія недійсна (прострочений access api.ts уже пробував оновити через
// /auth/refresh): повертаємо на екран входу. Мережеві й тимчасові помилки не вилогінюють.
const onError = (error: unknown, source: string) => {
  if (error instanceof ApiError) {
    log.warn('query', `${source} не вдався: ${error.code}`, { status: error.status, requestId: error.requestId });
    // Кілька запитів можуть отримати 401 одночасно: пишемо про скидання лише раз, коли сесія ще була
    if (error.status === 401 && useSession.getState().session) {
      log.warn('auth', 'сервер відповів 401: сесію скинуто, повернення на екран входу');
      useSession.getState().signOut();
    }
    return;
  }
  log.error('query', `${source}: неочікувана помилка`, error);
};

export default function RootLayout() {
  const initSession = useSession((s) => s.initSession);
  const isHydrated = useSession((s) => s.isHydrated);

  useEffect(() => {
    void initSession();
  }, [initSession]);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: (e, query) => onError(e, `запит ${String(query.queryKey[0])}`) }),
        mutationCache: new MutationCache({
          onError: (e, _variables, _result, mutation) =>
            onError(e, `мутація ${String(mutation.options.mutationKey?.[0] ?? 'без ключа')}`),
        }),
        // gcTime не менший за maxAge збереженого кешу (інакше записи зникають із пам'яті раніше, ніж із диска)
        defaultOptions: { queries: { retry: 1, staleTime: 30_000, ...(persistCache ? { gcTime: PERSIST_MAX_AGE_MS } : {}) } },
      }),
  );

  // Вихід (у сховищі сесії, поза деревом) очищає і кеш у пам'яті, і кеш на диску: там розклад і профіль користувача
  useEffect(() => {
    registerCacheReset(async () => {
      queryClient.clear();
      await clearPersistedQueries();
    });
    return () => registerCacheReset(null);
  }, [queryClient]);
  const session = useSession((s) => s.session);
  const signedIn = !!session;
  const onboarding = signedIn && session.needsOnboarding;

  // Вихід під час відновлення кешу з диска міг би скинути кеш, а відновлення, що ще триває, потім повернуло б
  // у нього дані попереднього користувача. Тому екрани з'являються лише після відновлення (зазвичай десятки мс).
  // Таймер страхує від порожнього екрана, якщо жоден із зворотних викликів не спрацював.
  const [restored, setRestored] = useState(!persistCache);
  useEffect(() => {
    if (restored) return;
    const timer = setTimeout(() => setRestored(true), 3000);
    return () => clearTimeout(timer);
  }, [restored]);

  if (!isHydrated) {
    return null;
  }

  const content = restored ? (
    <>
      <StatusBar style="auto" />
      <AppErrorBoundary>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
          <Stack.Protected guard={onboarding}>
            <Stack.Screen name="onboarding" />
          </Stack.Protected>
          <Stack.Protected guard={signedIn && !onboarding}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="substitution" />
          </Stack.Protected>
        </Stack>
      </AppErrorBoundary>
    </>
  ) : null;

  return (
    <SafeAreaProvider>
      {persistCache ? (
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: queryPersister,
            maxAge: PERSIST_MAX_AGE_MS,
            buster: PERSIST_CACHE_VERSION,
            dehydrateOptions: { shouldDehydrateQuery: (query) => shouldPersistQuery(query) },
          }}
          onSuccess={() => setRestored(true)}
          onError={() => setRestored(true)}
        >
          {content}
        </PersistQueryClientProvider>
      ) : (
        <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>
      )}
    </SafeAreaProvider>
  );
}
