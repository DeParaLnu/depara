# ДеПара

Мобільний застосунок з розкладом для студентів ЛНУ. Репозиторій містить бекенд (`backend/`) і мобільний клієнт (`mobile/`).

## Backend: локальний запуск

Потрібні Node.js 22+ і Docker.

```bash
docker compose up -d                 # Postgres + Redis
cp .env.example .env
cd backend
npm ci
npx prisma migrate deploy
npm run seed                         # тестовий розклад
npm run dev                          # http://localhost:3000/health
```

Скрипти (`backend/`): `npm run lint`, `npm run typecheck`, `npm run test:e2e`.

### E2E-тести

Тести ходять в API по HTTP, тому потрібні запущена база й seed з прив'язкою до поточного тижня:

```bash
cd backend
export NODE_ENV=test AUTH_MODE=fake
npm run seed -- --shift-to-current-week
npm run test:e2e
```

`AUTH_MODE=fake` вмикає вхід за фейковим токеном `test:<email>` і працює лише при `NODE_ENV=test`.

## Структура backend/src

```
app.ts            збирає модулі
config.ts         конфігурація
db.ts             Prisma-клієнт
lib/              допоміжні функції
plugins/          авторизація та інші хуки Fastify
routes/           ендпоінти за фічами (auth, profile, schedule, classrooms)
```
