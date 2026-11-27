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

Після `cp .env.example .env` відкрийте `.env` і додайте свою пошту в `ADMIN_EMAILS`. `MICROSOFT_CLIENT_ID` і `MICROSOFT_TENANT_ID` порожні, доки не зареєстровано застосунок в Entra: локально входьте через демо-консоль у режимі `NODE_ENV=test` або запускайте API з `NODE_ENV=test AUTH_MODE=fake` (поза тестовим режимом фейковий вхід вимкнений). Справжні секрети (`JWT_SECRET` на сервері, паролі БД, ключі FCM) у репозиторій не потрапляють: вони живуть у змінних хостингу та GitHub Secrets. Файл `.env` у `.gitignore` і ніколи не комітиться.

Скрипти (`backend/`): `npm run lint`, `npm run typecheck`, `npm run test:e2e`.

### E2E-тести

Тести ходять в API по HTTP, тому потрібні запущена база й seed з прив'язкою до поточного тижня:

```bash
cd backend
export NODE_ENV=test AUTH_MODE=fake ADMIN_EMAILS=e2e.admin@lnu.edu.ua CORS_ORIGINS=http://localhost:5173
export RATE_LIMIT_IMPORT_PER_MINUTE=1000 RATE_LIMIT_AUTH_PER_MINUTE=5000 RATE_LIMIT_SUBSTITUTIONS_PER_MINUTE=1000   # E2E робить багато імпортів, входів і замін з одного IP і акаунта
export EXPO_PUSH_URL=http://localhost:4010/push PUSH_RETRY_DELAY_MS=200     # підставний Expo Push для тестів F8
npm run seed -- --shift-to-current-week
npm run test:e2e
```

`ADMIN_EMAILS` потрібен для тестів адмін-ендпоінтів, `CORS_ORIGINS` для тестів CORS веб-адмінки, `EXPO_PUSH_URL` для тестів пушів (підставний Expo піднімає сам тест; у тестовому режимі без цієї змінної пуші вимкнені). `AUTH_MODE=fake` вмикає вхід за фейковим токеном `test:<email>` і працює лише при `NODE_ENV=test`.

## Мобільний застосунок: запуск

Потрібні Node.js 22.13+ (або 24.3+, 26+; непарні 23 і 25 Expo SDK 58 не підтримує) і Expo Go для SDK 58 або симулятор. Команди з `mobile/`:

```bash
cd mobile && npm ci
MOCK=1 npx expo start                                  # вбудовані дані, без бекенда і входу
API_URL=https://api.depara.me npx expo start           # реальний бекенд (потрібен робочий вхід)
E2E=1 API_URL=http://localhost:3000 npx expo start     # локальний бекенд із AUTH_MODE=fake
```

Режим `MOCK=1` обслуговує запити з `mobile/src/mock/` (розклад групи `ТЕСТ-31` повторюється в кожному тижні, є заміна і скасування).
Вхід у ньому один дотик, групу обирають зі списку, стан живе до перезапуску. Мок-користувач є старостою, тож видно й форму заміни (F6): заміни створюються й скасовуються в памʼяті. Він потрібен для розробки екранів і демо без SSO.
Після зміни прапорців перезапустіть сервер із `--clear`, інакше Metro може віддати збірку зі старим значенням.

### APK для команди (EAS Build)

Профілі в `mobile/eas.json` збирають APK для встановлення напряму на телефон (без Google Play):

```bash
cd mobile
npx eas-cli@latest login                                  # акаунт Expo, один раз
npx eas-cli@latest build -p android --profile preview      # прод API https://api.depara.me
npx eas-cli@latest build -p android --profile preview-mock # вбудовані дані (MOCK=1), для демо без входу
```

Без акаунта Expo APK збирається локально (prebuild і Gradle) або вручну через GitHub Actions (workflow `android-apk`): покрокова інструкція в [docs/android-apk.md](docs/android-apk.md).

Після збірки EAS дає посилання і QR-код на APK. Поки на проді немає входу через Microsoft (#37), збірка `preview` доходить лише до екрана входу, тож для показу використовуйте `preview-mock`.

## Деплой

Образ бекенда збирається з `backend/Dockerfile`. Основний варіант: VPS з Docker, бекапами і відкатом, див. [docs/deploy-vps.md](docs/deploy-vps.md) (файли в `deploy/`). Змінні середовища і запасний хостинг: [docs/deploy.md](docs/deploy.md).

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

## Помилки API і ліміти запитів

Усі помилки мають вигляд `{ "error": "КОД" }`. Окремо від кодів конкретних фіч (див. `specs/`): `INTERNAL_ERROR` (500) і
`TEMPORARILY_UNAVAILABLE` (503: недоступний Redis чи база; клієнту варто повторити пізніше) містять `requestId`, за яким
запис знаходиться в логах, а текст внутрішнього винятку клієнту не віддається; `BAD_REQUEST` (400), `NOT_FOUND` (404),
`PAYLOAD_TOO_LARGE` (413), `UNSUPPORTED_MEDIA_TYPE` (415) і `RATE_LIMITED` (429, з `retryAfterSeconds` і заголовком
`Retry-After`).

Ліміти (змінні `RATE_LIMIT_*`, див. [docs/deploy.md](docs/deploy.md)): звичайні запити рахуються на користувача за
токеном, без токена на IP; вхід, refresh і вихід мають окремий щедріший ліміт на IP (студенти часто за спільним IP
кампусу); імпорт розкладу лімітується на адміна. Лічильники в Redis, а поки він недоступний, ліміт не діє, і запити
не затримуються.

## Демо-консоль

Проста сторінка-«застосунок» для ручного тестування API в браузері (вхід, вибір групи, розклад, заміни, пошук аудиторій, ролі та імпорт).
Доступна лише в тестовому режимі, на проді її немає:

```bash
cd backend
export NODE_ENV=test AUTH_MODE=fake ADMIN_EMAILS=admin@lnu.edu.ua
npm run seed -- --shift-to-current-week
npm run dev        # відкрийте http://localhost:3000/dev
```

## Демо-дані для показу

`npm run seed:demo` (з `backend/`, база задається `DATABASE_URL`) наповнює локальну або демо-базу:

- розклад чотирьох факультетів (7 груп) на 5 тижнів навколо сьогодні, з лекціями потоку, підгрупами в лабораторних і чисельником/знаменником;
- шість демо-акаунтів (`demo.student@lnu.edu.ua`, `demo.headman@lnu.edu.ua`, `demo.newcomer@lnu.edu.ua` без групи та інші) і по одній заміні кожного типу на найближчих парах групи ПМІ-31;
- групу ЮР-41 без розкладу: екран «Розклад ще не опубліковано».

Повторний запуск оновлює розклад, скидає демо-акаунти й заміни. Скрипт відмовляється працювати при `NODE_ENV=production`, адреси корпусів і прізвища викладачів у ньому вигадані або орієнтовні. Не запускайте його на базі E2E (`depara_test`): для неї є звичайний `npm run seed`. Увійти демо-акаунтом можна в демо-консолі (`/dev`, `AUTH_MODE=fake`).

