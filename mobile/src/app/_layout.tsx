import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '../api';
import { useSession } from '../features/auth/session';

// 401 від сервера = сесія недійсна. Оновлення токена через /auth/refresh додамо окремою задачею,
// а поки повертаємо на екран входу. Мережеві помилки сюди не потрапляють: вони не вилогінюють.
const onError = (error: unknown) => {
  if (error instanceof ApiError && error.status === 401) useSession.getState().signOut();
};

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError }),
        mutationCache: new MutationCache({ onError }),
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
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
