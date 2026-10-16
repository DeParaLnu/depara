import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '../api';
import { AppErrorBoundary } from '../components/AppErrorBoundary';
import { useSession } from '../features/auth/session';
import { log } from '../lib/logger';

// Глобальний обробник помилок запитів. Помилки API (мережа, 4xx/5xx) очікувані: рівень warn.
// Усе інше це баг: рівень error зі стеком.
// 401 від сервера = сесія недійсна. Оновлення токена через /auth/refresh додамо окремою задачею,
// а поки повертаємо на екран входу. Мережеві помилки не вилогінюють.
const onError = (error: unknown, source: string) => {
  if (error instanceof ApiError) {
    log.warn('query', `${source} не вдався: ${error.code}`, { status: error.status, requestId: error.requestId });
    if (error.status === 401) {
      log.warn('auth', 'сервер відповів 401: сесію скинуто, повернення на екран входу');
      useSession.getState().signOut();
    }
    return;
  }
  log.error('query', `${source}: неочікувана помилка`, error);
};

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: (e, query) => onError(e, `запит ${String(query.queryKey[0])}`) }),
        mutationCache: new MutationCache({
          onError: (e, _variables, _result, mutation) =>
            onError(e, `мутація ${String(mutation.options.mutationKey?.[0] ?? 'без ключа')}`),
        }),
        defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
      }),
  );
  const session = useSession((s) => s.session);
  const signedIn = !!session;
  const onboarding = signedIn && session.needsOnboarding;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
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
            </Stack.Protected>
          </Stack>
        </AppErrorBoundary>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
