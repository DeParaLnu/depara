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

Після `cp .env.example .env` відкрийте `.env` і додайте свою пошту в `ADMIN_EMAILS`. `GOOGLE_CLIENT_ID` уже заповнений у шаблоні (це не секрет). Справжні секрети (`JWT_SECRET` на сервері, паролі БД, ключі FCM) у репозиторій не потрапляють: вони живуть у змінних хостингу та GitHub Secrets. Файл `.env` у `.gitignore` і ніколи не комітиться.

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

## Деплой

Образ бекенда збирається з `backend/Dockerfile`. Інструкція, змінні середовища і приклад хостингу: [docs/deploy.md](docs/deploy.md).

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

## Демо-консоль

Проста сторінка-«застосунок» для ручного тестування API в браузері (вхід, вибір групи, розклад, заміни, пошук аудиторій, ролі та імпорт).
Доступна лише в тестовому режимі, на проді її немає:

```bash
cd backend
export NODE_ENV=test AUTH_MODE=fake ADMIN_EMAILS=admin@lnu.edu.ua
npm run seed -- --shift-to-current-week
npm run dev        # відкрийте http://localhost:3000/dev
```
