export const config = {
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret',
  allowedEmailDomain: 'lnu.edu.ua',
  accessTokenTtl: '15m',
  refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  // Пошти, які отримують роль ADMIN при вході (перший адмін; далі ролі міняє PATCH /admin/users/:id/role).
  adminEmails: (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  // Фейковий вхід дозволений ЛИШЕ в тестовому режимі. У проді він завжди вимкнений.
  fakeAuth: process.env.NODE_ENV === 'test' && process.env.AUTH_MODE === 'fake',
} as const;
