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
  allowedEmailDomain: (process.env.ALLOWED_EMAIL_DOMAIN ?? 'lnu.edu.ua').trim().toLowerCase(),
  accessTokenTtl: '15m',
  refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
  // Вхід через Microsoft Entra. Поки тенант не зареєстровано, обидві змінні порожні і /auth/microsoft відповідає 503.
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID ?? '', // aud ID-токена (Application/Client ID)
  microsoftTenantId: process.env.MICROSOFT_TENANT_ID ?? '', // tid організації, з якої пускаємо
  // Origin веб-адмінки (через кому). Порожньо = CORS вимкнений. Мобільному застосунку CORS не потрібен.
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  // Пошти, які отримують роль ADMIN при вході (перший адмін; далі ролі міняє PATCH /admin/users/:id/role).
  adminEmails: (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  // За Caddy довіряємо його X-Forwarded-For, щоб у логах був IP клієнта. Вмикається лише в проді (compose).
  trustProxy: process.env.TRUST_PROXY === 'true',
  // Гостьовий режим: розклад, групи й аудиторії без входу (/public/*). PUBLIC_API=off вимикає все (404),
  // якщо університет не погодить відкриті дані. Ліміт запитів на IP за хвилину захищає від масового вивантаження.
  publicApi: (process.env.PUBLIC_API ?? 'on').trim().toLowerCase() !== 'off',
  publicRateLimitPerMinute: Number(process.env.PUBLIC_RATE_LIMIT_PER_MINUTE) > 0 ? Number(process.env.PUBLIC_RATE_LIMIT_PER_MINUTE) : 60,
  // Фейковий вхід дозволений ЛИШЕ в тестовому режимі. У проді він завжди вимкнений.
  fakeAuth: process.env.NODE_ENV === 'test' && process.env.AUTH_MODE === 'fake',
} as const;
