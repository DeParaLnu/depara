#!/usr/bin/env bash
# Створює GitHub Issues для ZenHub з плану «тести, CI, деплой, SSO» (жовтень 2026).
# ZenHub підтягує Issues автоматично; залежності (Blocked by) ставляться потім у ZenHub,
# список з реальними номерами скрипт друкує в кінці і зберігає в issues-map.txt.
#
# Потрібно: gh (GitHub CLI) і вхід: gh auth login
# Запуск з кореня репо: bash tools/create-issues.sh
# Сухий прогін без створення: DRY_RUN=1 bash tools/create-issues.sh
set -euo pipefail

REPO="${REPO:-DeParaLnu/depara}"
MAP="issues-map.txt"
: > "$MAP"
declare -A NUM

mk() { # mk <ID> <назва> <опис>
  local id="$1" title="$2" body="$3" url
  if [ "${DRY_RUN:-}" = 1 ]; then
    NUM[$id]="?$id"
  else
    url="$(gh issue create --repo "$REPO" --title "[$id] $title" --body "$body")"
    NUM[$id]="${url##*/}"
  fi
  printf '%s #%s %s\n' "$id" "${NUM[$id]}" "$title" | tee -a "$MAP"
}

# ---------- Інфра і деплой ----------
mk I1 "Домен і VPS для бекенда" "Купити/виділити VPS (Ubuntu, 2 vCPU, 4 ГБ) і домен (api.<домен>), A-запис на IP сервера.
Готово, коли: є SSH-доступ за ключем, домен резолвиться на сервер, відкриті лише 22, 80, 443.
Інструкція: docs/deploy-vps.md."

mk I2 "Перший деплой бекенда на VPS" "Налаштувати сервер за docs/deploy-vps.md: deploy/.env (паролі, JWT_SECRET, DOMAIN, TRUST_PROXY=true), секрети DEPLOY_* у GitHub, змінна DEPLOY_ENABLED=true, перший deploy.sh.
У проді НЕ задавати NODE_ENV=test і AUTH_MODE=fake.
Готово, коли: https://<домен>/health відповідає, бекапи йдуть за cron."

mk I3 "Публічний API_URL" "Зафіксувати адресу https://<домен> як API_URL: змінна DEPLOY_URL у GitHub, API_URL для прод-збірок мобілки, документ API для мобільного розробника.
Готово, коли: адреса записана в README і змінних репо."

mk I4 "Smoke-перевірка проду після першого деплою" "Запустити deploy/smoke.sh https://<домен>: /health 200, /dev 404, фейковий вхід test:<email> відхилено, є x-request-id. Після кожного деплою те саме робить deploy.yml (потрібна змінна DEPLOY_URL).
Готово, коли: smoke зелений вручну і в deploy.yml."

mk I5 "Мобільні збірки з прод API" "Збірка APK (preview) з API_URL=https://<домен> без E2E=1 і розсилка команді.
Готово, коли: APK ставиться на телефон і показує дані з проду."

# ---------- Бекенд для мобільних екранів ----------
mk B1 "Бекенд: ознака «розклад опубліковано»" "GET /schedule/week повертає прапорець (наприклад published: boolean), щоб відрізнити порожній тиждень від неопублікованого (відкрите питання у specs/f3-schedule.md). Оновити спеку і E2E F3."

mk B2 "Бекенд: адреса корпусу в розкладі і пошуку" "Building.address уже є в моделі. Повертати адресу в парах GET /schedule/week і в GET /classrooms (поле building.address). Тільки додавання полів, без перейменування. Оновити спеки F3/F5 і E2E."

mk B3 "Бекенд: фільтр аудиторій за корпусом" "GET /classrooms?q=&building=<код> (відкрите питання у specs/f5-search.md). Невідомий корпус дає порожній список, а не 500. E2E у f5-classrooms.test.ts."

# ---------- Мобільні екрани ----------
mk M1 "Мобілка: екран «Тиждень»" "Пари по днях пн–нд з useWeek, заміни виділені (specs/f3-schedule.md).
testID за контрактом у docs/mobile-e2e-runner.md: tab-week, week-screen, week-day-YYYY-MM-DD, lesson-card, lesson-card-YYYY-MM-DD-N.
Також додати testID tab-today/tab-week/tab-rooms/tab-profile кнопкам навігації (tabBarButtonTestID або власний tabBarButton)."

mk M2 "Мобілка: екран «Аудиторії» (пошук)" "Поле пошуку з GET /classrooms?q=, список з корпусом; без запиту показується список (specs/f5-search.md).
testID: rooms-screen, rooms-search-input, rooms-results, room-item, room-item-<label з / замість ->, room-building-<...>, rooms-error."

mk M3 "Мобілка: стани розкладу" "Екрани «Розклад ще не опубліковано», порожній тиждень, офлайн з підписом «Офлайн, оновлено о …» (specs/f3-schedule.md)."

mk M4 "Мобілка: деталі пари" "Тип, викладач, корпус, аудиторія, адреса; «Прокласти маршрут» (specs/f3-schedule.md)."

mk M5 "Мобілка: фільтр аудиторій за корпусом" "Фільтр-чіпи корпусів на екрані «Аудиторії», запит з building=<код>."

# ---------- Вхід ----------
mk A1 "Мобілка: токени в expo-secure-store і авто-refresh" "Зберігати access/refresh і стабільний deviceId у expo-secure-store; при 401 TOKEN_EXPIRED викликати POST /auth/refresh (одноразовий refresh, ротація), при невдачі вихід на екран входу. Сесія переживає перезапуск."

mk A2 "Мобілка: реальний вхід" "Справжній вхід замість E2E-токена (поки Google, далі заміна на Microsoft без зміни сесії). Збірка з E2E=1 і далі входить фейковим токеном для тестів."

mk L1 "Техлід: тенант Microsoft Entra і реєстрація застосунку" "Створити тенант, зареєструвати застосунок: Client ID, Tenant ID, redirect URI (мобілка і веб-адмінка). Рішення: ID-токен чи access-токен нашого API."

mk A3 "SSO через Microsoft (Outlook)" "Мобілка: expo-auth-session з PKCE. Бекенд: POST /auth/microsoft, перевірка через jose (JWKS, iss, aud, tid), домен з ALLOWED_EMAIL_DOMAIN. E2E на фейковому провайдері."

mk A4 "SSO на проді" "Прод-змінні Entra на сервері, redirect URI прод-збірки, smoke: вхід реальним тестовим акаунтом тенанта."

# ---------- Тести і CI ----------
mk T1 "Backend E2E за критеріями F3 і F5" "Сортування пар, підгрупи (F3); запит N1 = N10/Б і N11/Б, регістр, порожній запит, корпус, не більше 20 (F5). Файли backend/test/e2e/f3-schedule.test.ts і f5-classrooms.test.ts. Проходять на поточному develop."

mk T2 "Mobile E2E: «відкрити тиждень» (F3)" "mobile/e2e/specs/f3-week.e2e.ts: вхід (з онбордингом, якщо потрібно), вкладка Тиждень, є пари, дні й пари по порядку, пʼятниця доступна прокруткою. Дані: AUTH_MODE=fake, seed --shift-to-current-week."

mk T3 "Mobile E2E: «знайти аудиторію N1» (F5)" "mobile/e2e/specs/f5-rooms.e2e.ts: N1 дає N10/Б і N11/Б, не №9/Б, не більше 20; видно корпус; n1 те саме; порожній запит без помилки."

mk T4 "Self-hosted runner для мобільних E2E" "Linux-машина з KVM, мітки [self-hosted, linux, android-emulator], змінна MOBILE_E2E_RUNNER=self-hosted. iOS (macOS) поза MVP. Безпека для публічного репо: без PR з форків, approval для зовнішніх. Інструкція: docs/mobile-e2e-runner.md."

mk T5 "CI: мобільні E2E на кожен PR після backend E2E" "Job mobile-e2e у ci.yml (needs: backend-e2e) викликає mobile-e2e.yml. Увімкнути MOBILE_E2E_ON_PR=true після 5 зелених запусків поспіль; потім додати mobile-e2e в обовʼязкові перевірки ruleset."

# ---------- Дані ----------
mk D1 "Мок-розклад з seed для мобілки" "Фікстура у форматі відповіді GET /schedule/week, згенерована з backend/prisma/seed/schedule.seed.json (група ТЕСТ-31), для розробки екранів без бекенда і SSO."

mk D2 "Розклад на мокнутих даних" "Екрани «Сьогодні»/«Тиждень» працюють на моках D1; перемикання на реальний API без змін у верстці. Не блокується SSO."

# ---------- Залежності для ZenHub ----------
dep() { printf '#%s (%s) blocked by %s\n' "${NUM[$1]}" "$1" "$(for b in "${@:2}"; do printf '#%s (%s) ' "${NUM[$b]}" "$b"; done)"; }
{
  echo
  echo "Залежності: у ZenHub відкрити задачу -> Blocked by -> додати номери"
  dep I2 I1
  dep I3 I2
  dep I4 I2 I3
  dep I5 I3
  dep A4 I3 A3
  dep M3 B1
  dep M4 B2
  dep M5 B3
  dep A2 A1
  dep A3 A2 L1
  dep T2 M1
  dep T3 M2
  dep T5 T2 T3
  dep D2 D1
} | tee -a "$MAP"
