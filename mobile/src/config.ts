import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as { e2e?: boolean; apiUrl?: string };

export const config = {
  apiUrl: extra.apiUrl ?? 'http://localhost:3000',
  // У збірці з E2E=1 вхід іде з фейковим токеном (бекенд приймає його лише при AUTH_MODE=fake)
  e2e: extra.e2e === true,
  e2eIdToken: 'test:student@lnu.edu.ua',
};
