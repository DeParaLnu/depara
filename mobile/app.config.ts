import type { ConfigContext, ExpoConfig } from 'expo/config';

// Змінні збірки (CI задає E2E і API_URL у mobile-e2e.yml) потрапляють у застосунок через extra.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  extra: {
    ...config.extra,
    e2e: process.env.E2E === '1',
    apiUrl: process.env.API_URL ?? 'http://localhost:3000',
  },
});
