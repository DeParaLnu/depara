// Секрет за замовчуванням дозволений лише в test і development. На сервері без JWT_SECRET
// застосунок не стартує, бо відомий секрет дозволив би підробляти токени (зокрема адміна).
function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  const env = process.env.NODE_ENV;
  if (env === 'test' || env === 'development') return 'dev-only-secret';
  throw new Error('JWT_SECRET is required. Set it in .env (див. .env.example).');
}

const positiveInt = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

export const config = {
  jwtSecret: resolveJwtSecret(),
  allowedEmailDomain: (process.env.ALLOWED_EMAIL_DOMAIN ?? 'lnu.edu.ua').trim().toLowerCase(),
  accessTokenTtl: '15m',
  refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
  // Refresh одноразовий. Якщо відповідь на refresh загубилась по дорозі (слабка мережа), клієнт повторює запит зі
  // старим токеном: протягом цього вікна сервер віддає ту саму нову пару, але лише того самого пристрою і поки
  // нова пара не використана. 0 вимикає вікно (повторний refresh завжди відхиляється).
  // Ціле число секунд: Redis відхиляє дробове EX
  refreshReuseGraceSeconds: Math.max(0, Math.floor(Number(process.env.REFRESH_REUSE_GRACE_SECONDS ?? 30)) || 0),
  // Вхід через Microsoft Entra. Поки тенант не зареєстровано, обидві змінні порожні і /auth/microsoft відповідає 503.
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID ?? '', // aud ID-токена (Application/Client ID)
  microsoftTenantId: process.env.MICROSOFT_TENANT_ID ?? '', // tid організації, з якої пускаємо
  // Ліміти запитів на хвилину. Звичайні запити рахуються на користувача (за токеном), без токена на IP; вхід і
  // refresh (без токена) на IP. Студенти ЛНУ часто сидять за спільним IP кампусу, тож ліміт входу щедрий:
  // це страховка від зловживань, а не обмеження звичайного використання.
  rateLimitPerMinute: positiveInt(process.env.RATE_LIMIT_PER_MINUTE, 600),
  rateLimitAuthPerMinute: positiveInt(process.env.RATE_LIMIT_AUTH_PER_MINUTE, 300),
  rateLimitImportPerMinute: positiveInt(process.env.RATE_LIMIT_IMPORT_PER_MINUTE, 30),
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
  // Фейковий вхід дозволений ЛИШЕ в тестовому режимі. У проді він завжди вимкнений.
  fakeAuth: process.env.NODE_ENV === 'test' && process.env.AUTH_MODE === 'fake',
} as const;
