export const config = {
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret',
  allowedEmailDomain: 'lnu.edu.ua',
  accessTokenTtl: '15m',
  refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  // Фейковий вхід дозволений ЛИШЕ в тестовому режимі. У проді він завжди вимкнений.
  fakeAuth: process.env.NODE_ENV === 'test' && process.env.AUTH_MODE === 'fake',
} as const;
