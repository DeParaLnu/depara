# Мобільні E2E: де і як вони бігають

## Коротко

- Сценарії: `mobile/e2e/specs/` (F1 вхід, F3 «відкрити тиждень», F5 «знайти аудиторію N1»).
- Дані: бекенд з `NODE_ENV=test AUTH_MODE=fake` і `npm run seed -- --shift-to-current-week`.
  Застосунок зібраний з `E2E=1` і входить фейковим токеном `test:student@lnu.edu.ua`.
- На PR мобільні E2E стартують лише після зеленого `backend-e2e` (job `mobile-e2e` у `ci.yml`).
- Вмикаються змінною репозиторію `MOBILE_E2E_ON_PR=true`. Доки сценарії не зеленіють стабільно
  (орієнтир: 5 запусків поспіль без падінь), змінна не задана і на PR бігає лише бекенд.
- Обов'язковою перевіркою в ruleset `mobile-e2e` робимо лише після цього, не раніше.

## Яку машину обрати

| Варіант | Плюси | Мінуси | Висновок |
|---|---|---|---|
| `ubuntu-latest` (хмара GitHub) | Для публічного репо хвилини безкоштовні, KVM є, нічого не адмініструємо | Повільно: збірка APK і старт емулятора 15–25 хв | Працює вже зараз, стартова точка |
| Окремий Linux-ПК / міні-ПК команди | Швидко (кеш Gradle і SDK), повний контроль, вимога техліда «локальний runner» | Має бути увімкнений, хтось його обслуговує | **Рекомендовано** для Android |
| Ноутбук учасника команди | Нічого не купувати | Вимикається, коли людина йде; CI «зникає» | Лише для експериментів |
| Прод-VPS | Вже є | Чужий код поруч із продом і базою; у більшості VPS немає вкладеної віртуалізації (KVM) | **Ні** |
| Mac (macOS) | Єдиний варіант для iOS-симулятора | Потрібен Mac з Xcode | Лише якщо будемо тестувати iOS; не для MVP |

Рішення для MVP: Android на окремому Linux-ПК, а поки його немає — `ubuntu-latest`.
iOS-сценарії відкладаємо: для них потрібен окремий runner на macOS з мітками `[self-hosted, macOS]`.

## Вимоги до Linux-машини

- Ubuntu 22.04/24.04, x86_64, процесор з VT-x/AMD-V (перевірка: `kvm-ok` або `ls /dev/kvm`).
- 4+ ядра, 16 ГБ RAM, 60+ ГБ вільного диска.
- Docker (для сервісів Postgres і Redis у workflow), Node.js 22, JDK 17, Android SDK
  (`platform-tools`, `emulator`, `system-images;android-34;google_apis;x86_64`).
- Користувач runner у групі `kvm` і `docker`.

## Встановлення runner

1. GitHub → Settings → Actions → Runners → New self-hosted runner → Linux. Виконати показані команди
   на машині, при `./config.sh` додати мітки: `--labels android-emulator`.
2. Встановити як сервіс, щоб стартував після перезавантаження: `sudo ./svc.sh install && sudo ./svc.sh start`.
3. Перевірити, що runner «Idle» на сторінці Runners.
4. Settings → Secrets and variables → Actions → Variables: `MOBILE_E2E_RUNNER=self-hosted`.
   Прибрати змінну, щоб повернутися на `ubuntu-latest`.

## Безпека: репозиторій публічний

GitHub не радить ставити self-hosted runner на публічний репозиторій: PR з форку може виконати
довільний код на нашій машині. Тому:

- `ci.yml` не запускає мобільні E2E для PR з форків (перевірка `head.repo.full_name`).
- Settings → Actions → General → «Require approval for all external contributors».
- На машині runner немає секретів, SSH-ключів до проду і особистих акаунтів.
- Окремий користувач ОС лише для runner.

## Запуск локально без CI

```bash
# Термінал 1: бекенд у тестовому режимі
docker compose up -d
cd backend
export NODE_ENV=test AUTH_MODE=fake ADMIN_EMAILS=e2e.admin@lnu.edu.ua
npx prisma migrate deploy
npm run seed -- --shift-to-current-week
npm run start:test

# Термінал 2: збірка APK з фейковим входом і адресою хоста для емулятора
cd mobile
E2E=1 API_URL=http://10.0.2.2:3000 npx expo run:android --variant debug   # або ./gradlew assembleDebug в android/
npm run e2e                                                                # усі сценарії
npx wdio run e2e/wdio.conf.ts --spec e2e/specs/f5-rooms.e2e.ts             # один сценарій
```

Повторний запуск на тій самій базі: студент уже має групу, тому `loginAsStudent()` пропускає онбординг.
Сценарій F1 очікує саме онбординг, тож перед ним перезапустіть seed на чистій базі
(`docker compose down -v && docker compose up -d`, далі міграції і seed).

## Контракт testID для екранів

Сценарії шукають елементи за `testID`. Мобільний розробник додає їх разом з екранами:

| testID | Де |
|---|---|
| `tab-today`, `tab-week`, `tab-rooms`, `tab-profile` | Кнопки нижньої навігації (`src/app/(tabs)/_layout.tsx`) |
| `week-screen` | Корінь екрана «Тиждень», коли дані завантажені |
| `week-day-YYYY-MM-DD` | Заголовок дня (лише дні з парами) |
| `lesson-card` | Кожна картка пари (`LessonCard`) |
| `lesson-card-YYYY-MM-DD-N` | Картка конкретної пари: дата і номер пари (обгортка навколо `LessonCard`) |
| `rooms-screen` | Корінь екрана «Аудиторії» |
| `rooms-search-input` | Поле пошуку |
| `rooms-results` | Список результатів (також при порожньому запиті) |
| `room-item` | Кожен рядок результату |
| `room-item-<label>` | Рядок аудиторії, `label` з API з заміною `/` на `-`: `room-item-N10-Б` |
| `room-building-<label>` | Підпис корпусу в рядку: `room-building-N10-Б` |
| `rooms-error` | Стан помилки |

Якщо в двох місцях потрібен і загальний, і конкретний testID (`room-item` і `room-item-N10-Б`), один
ставиться на зовнішній `View`, другий на внутрішній `Pressable`.

## Smoke на проді

`deploy/smoke.sh https://<домен API>` перевіряє: `/health` 200, `/dev` 404, фейковий вхід `test:<email>`
відхилено (401/503, або 404), є заголовок `x-request-id`.
Запускається автоматично в `deploy.yml` після кожного деплою, якщо задано змінну `DEPLOY_URL`.
