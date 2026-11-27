import type { ConfigContext, ExpoConfig } from 'expo/config';
import { withAndroidManifest, type ConfigPlugin } from 'expo/config-plugins';

const e2e = process.env.E2E === '1';
// Збірка для знімків екранів (workflow app-screenshots) теж ходить у локальний бекенд по http, але без E2E-кнопок
const allowHttp = e2e || process.env.ALLOW_HTTP === '1';

// E2E-збірка (release APK, щоб JS був усередині) ходить у тестовий бекенд по http://10.0.2.2:3000,
// а release-збірки Android блокують HTTP без TLS. Дозволяємо його лише в збірках з E2E=1 або ALLOW_HTTP=1.
const withE2eCleartext: ConfigPlugin = (cfg) =>
  withAndroidManifest(cfg, (mod) => {
    const app = mod.modResults.manifest.application?.[0];
    if (app) app.$['android:usesCleartextTraffic'] = 'true';
    return mod;
  });

// Змінні збірки (CI задає E2E і API_URL у mobile-e2e.yml; MOCK=1 вмикає вбудовані дані без бекенда) потрапляють у застосунок через extra.
export default ({ config }: ConfigContext): ExpoConfig => {
  const expoConfig: ExpoConfig = {
    ...(config as ExpoConfig),
    extra: {
      ...config.extra,
      e2e,
      mock: process.env.MOCK === '1',
      apiUrl: process.env.API_URL ?? 'http://localhost:3000',
      privacyUrl: process.env.PRIVACY_URL,
    },
  };
  return allowHttp ? withE2eCleartext(expoConfig) : expoConfig;
};
