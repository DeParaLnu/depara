// Секрет за замовчуванням дозволений лише в test і development. На сервері без JWT_SECRET
// застосунок не стартує, бо відомий секрет дозволив би підробляти токени (зокрема адміна).
function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  const env = process.env.NODE_ENV;
  if (env === 'test' || env === 'development') return 'dev-only-secret';
  throw new Error('JWT_SECRET is required. Set it in .env (див. .env.example).');
}

export const config = {
  jwtSecret: resolveJwtSecret(),
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
  // За Caddy довіряємо його X-Forwarded-For, щоб у логах був IP клієнта. Вмикається лише в проді (compose).
  trustProxy: process.env.TRUST_PROXY === 'true',
  // Фейковий вхід дозволений ЛИШЕ в тестовому режимі. У проді він завжди вимкнений.
  fakeAuth: process.env.NODE_ENV === 'test' && process.env.AUTH_MODE === 'fake',
} as const;
