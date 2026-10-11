export const config = {
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret',
  allowedEmailDomain: '@lnu.edu.ua',
  accessTokenTtl: '15m',
  // Фейковий вхід дозволений ЛИШЕ в тестовому режимі. У проді він завжди вимкнений.
  fakeAuth: process.env.NODE_ENV === 'test' && process.env.AUTH_MODE === 'fake',
} as const;
