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
    // Кілька запитів можуть отримати 401 одночасно: пишемо про скидання лише раз, коли сесія ще була
    if (error.status === 401 && useSession.getState().session) {
      log.warn('auth', 'сервер відповів 401: сесію скинуто, повернення на екран входу');
      useSession.getState().signOut();
    }
    // Гість обрав групу, якої вже немає (видалили на сервері): просимо обрати заново
    if (error.code === 'GROUP_NOT_FOUND' && useSession.getState().guest?.groupId) {
      log.warn('guest', 'обрана гостем група не знайдена: повернення до вибору групи');
      useSession.getState().setGuestGroup(null);
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
  const guest = useSession((s) => s.guest);
  const signedIn = !!session;
  const isGuest = !signedIn && !!guest;
  // Онбординг потрібен новому користувачу (без групи в профілі) і гостю, який ще не обрав групу
  const onboarding = (signedIn && session.needsOnboarding) || (isGuest && !guest.groupId);
  // Вкладки відкриті користувачу з групою і гостю з обраною групою (розклад без входу)
  const inApp = (signedIn && !session.needsOnboarding) || (isGuest && !!guest.groupId);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="auto" />
        <AppErrorBoundary>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Protected guard={!signedIn && !isGuest}>
              <Stack.Screen name="sign-in" />
            </Stack.Protected>
            <Stack.Protected guard={onboarding}>
              <Stack.Screen name="onboarding" />
            </Stack.Protected>
            <Stack.Protected guard={inApp}>
              <Stack.Screen name="(tabs)" />
            </Stack.Protected>
          </Stack>
        </AppErrorBoundary>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
