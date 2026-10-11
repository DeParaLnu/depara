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
export NODE_ENV=test AUTH_MODE=fake ADMIN_EMAILS=e2e.admin@lnu.edu.ua
npm run seed -- --shift-to-current-week
npm run test:e2e
```

`ADMIN_EMAILS` потрібен для тестів адмін-ендпоінтів. `AUTH_MODE=fake` вмикає вхід за фейковим токеном `test:<email>` і працює лише при `NODE_ENV=test`.

## Структура backend/src

```
app.ts            збирає модулі
config.ts         конфігурація
db.ts             Prisma-клієнт
lib/              допоміжні функції
plugins/          авторизація та інші хуки Fastify
routes/           ендпоінти за фічами (auth, profile, schedule, classrooms, teachers, substitutions, admin)
```

## Ролі та адміністрування

- Ролі: `STUDENT`, `HEADMAN`, `ADMIN`. Роль читається з бази на кожен запит, тому зміна діє одразу.
- Перший адмін: додайте свою пошту в `ADMIN_EMAILS` і увійдіть. Далі ролі міняє `PATCH /admin/users/:id/role`.
- Імпорт розкладу: `POST /admin/schedule/import` (ADMIN). JSON у форматі `prisma/seed/schedule.seed.json` (довідники необов'язкові)
  або CSV (`Content-Type: text/csv`, колонки `group,date,pair,subject[,type,teacher,audience,subgroup,room,faculty]`).
  Імпорт атомарний: при помилці в базу не потрапляє нічого. Повторний імпорт оновлює пари, а не дублює.
