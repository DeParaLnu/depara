# ДеПара: як додати ці файли в репозиторій

Цей набір кладеться в корінь вашого репозиторію `depara`. Усе, що тут є, вже налаштоване під структуру `backend/` і `mobile/`.

## Що всередині

| Файл | Навіщо |
|---|---|
| `.github/workflows/ci.yml` | CI на кожен PR: lint + tsc, потім E2E backend |
| `.github/workflows/mobile-e2e.yml` | Appium на Android-емуляторі (поки тільки вручну) |
| `.github/pull_request_template.md` | Шаблон опису PR |
| `.github/CODEOWNERS` | Автоматичний рев'юер (треба змінити нік) |
| `.gitignore`, `.env.example` | Що не комітити, і які змінні потрібні |
| `backend/package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, `package-lock.json` | Налаштування backend |
| `backend/prisma/schema.prisma` | Схема БД |
| `backend/prisma/seed/schedule.seed.json`, `seed.ts` | Тестовий розклад і скрипт імпорту |
| `backend/src/app.ts`, `server.ts` | Мінімальний API: `/health`, вхід, групи, розклад, аудиторії |
| `backend/test/e2e/*` | E2E-сценарії F1, F3, F5 |
| `mobile/e2e/*` | Заготовка Appium (конфіг, хелпер, сценарій F1) |

## Що потрібно мати

- Node.js 22, git, Docker (для локальної бази).
- Створений репозиторій `depara` на GitHub (див. розділ 2 документа).

## Крок 1. Розпакувати в репозиторій

```bash
git clone git@github.com:<організація>/depara.git
cd depara
git checkout develop        # якщо гілки ще немає: git checkout -b develop
git checkout -b feature/ci-setup
```

Скопіюйте вміст папки `depara/` з архіву в корінь репозиторію. Важливо, щоб скопіювалися і приховані файли та папки (`.github`, `.gitignore`, `.env.example`). У Finder показати їх можна через Cmd+Shift+., у Провіднику Windows через «Вигляд → Показати → Приховані елементи».

Перевірте, що вийшло:

```bash
ls -a
# має бути: .github  .gitignore  .env.example  backend  mobile  INSTALL.md
```

## Крок 2. Змінити нік у CODEOWNERS

Відкрийте `.github/CODEOWNERS` і замініть `@НІК-ТЕХЛІДА` на справжній GitHub-нік техліда. Якщо автоматичний рев'юер не потрібен, видаліть файл.

## Крок 3. Запустити локально

Підніміть базу:

```bash
docker run --name depara-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=depara -p 5432:5432 -d postgres:16
```

Підготуйте backend:

```bash
cd backend
cp ../.env.example .env
npm ci
npx prisma generate
npx prisma migrate dev --name init
```

Остання команда створить папку `backend/prisma/migrations`. **Її обов'язково треба закомітити**, інакше CI не зможе створити таблиці.

Наповніть базу і запустіть сценарії.

macOS / Linux:

```bash
npm run seed -- --shift-to-current-week
NODE_ENV=test AUTH_MODE=fake JWT_SECRET=local npm run test:e2e
```

Windows PowerShell:

```powershell
npm run seed -- --shift-to-current-week
$env:NODE_ENV="test"; $env:AUTH_MODE="fake"; $env:JWT_SECRET="local"; npm run test:e2e
```

Якщо все гаразд, побачите зелені тести F1, F3, F5. Якщо seed попередить про корпус «З» (аудиторія `3/3`), це очікувано: літера корпусу на скріншоті нечітка, і ці дві пари ще треба виправити в JSON.

Перед комітом корисно ще виконати:

```bash
npm run lint
npm run typecheck
```

## Крок 4. Закомітити і відкрити PR

```bash
cd ..
git add .
git status        # переконайтесь, що там немає .env і node_modules
git commit -m "ci: каркас backend, E2E F1/F3/F5, GitHub Actions"
git push -u origin feature/ci-setup
```

На GitHub відкрийте Pull Request у `develop`. Через 2–3 хвилини в PR з'являться два статуси: `backend-lint-typecheck` і `backend-e2e`. Дочекайтесь зеленого.

## Крок 5. Увімкнути захист гілок

Тільки після першого зеленого запуску: Settings → Rules → Rulesets → New branch ruleset для `develop` і `main`. Вимоги:

- Require a pull request, 1 approval.
- Require status checks: `backend-lint-typecheck` і `backend-e2e`.
- Require branches to be up to date.
- Block force pushes, Restrict deletions.

Потім замерджте PR кнопкою Squash and merge.

## Крок 6. Підключити Appium (коли будуть екрани)

1. У `mobile/` встановіть залежності:
   ```bash
   cd mobile
   npm i -D @wdio/cli @wdio/local-runner @wdio/mocha-framework @wdio/spec-reporter @wdio/appium-service
   ```
2. Встановіть Android Studio, JDK 17 і Appium: `npm i -g appium && appium driver install uiautomator2`.
3. Додайте `testID="login-google-button"` на кнопку входу і `testID="faculty-list"` на список факультетів.
4. Зберіть debug APK (`cd android && ./gradlew assembleDebug`), запустіть емулятор і виконайте `npx wdio run e2e/wdio.conf.ts`.
5. Коли сценарій проходить локально, запустіть workflow вручну: Actions → mobile-e2e → Run workflow.
6. Коли він кілька тижнів стабільно зелений, розкоментуйте `pull_request` і `schedule` у `mobile-e2e.yml`.

## Що ще не зроблено

- Справжня перевірка Google-токена: зараз працює лише фейковий вхід `test:<email>` у режимі `AUTH_MODE=fake`. У проді `POST /auth/google` повертає 501.
- Сценарії F4, F6 і F7, а також ендпоінти для них.
- CD (автодеплой): залежить від вибору хостингу.
- Приклад коду всередині `app.ts` написаний як стартовий каркас, його можна перенести у ваші модулі.
