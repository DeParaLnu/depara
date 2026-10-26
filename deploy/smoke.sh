#!/usr/bin/env bash
# Smoke-перевірка проду після деплою: API живий, а все тестове в ньому вимкнене.
#   1. GET  /health          -> 200 {"status":"ok"}
#   2. GET  /dev             -> 404 (демо-консоль існує лише при AUTH_MODE=fake)
#   3. POST /auth/microsoft з фейковим токеном test:<email> -> НЕ 200 (очікуємо 401 або 503;
#      404 теж гаразд, коли після переходу на Microsoft цей маршрут приберуть)
#      Якщо тут 200, на проді увімкнено NODE_ENV=test і AUTH_MODE=fake: будь-хто увійде будь-ким.
#   4. Відповідь містить x-request-id (Caddy і API зіставляють логи)
# Використання: deploy/smoke.sh https://api.example.com   (код виходу 0 = усе гаразд)
# Запускається з deploy.yml після кожного деплою; вручну — з будь-якої машини з curl.
set -euo pipefail

base="${1:-${DEPLOY_URL:-}}"
[ -n "$base" ] || { echo "Використання: $0 https://<домен API>" >&2; exit 2; }
base="${base%/}"

fail=0
ok() { printf 'OK    %s\n' "$1"; }
bad() { printf 'FAIL  %s\n' "$1" >&2; fail=1; }

# Статус-код запиту; тіло відповіді кладемо в тимчасовий файл
body="$(mktemp)"
headers="$(mktemp)"
trap 'rm -f "$body" "$headers"' EXIT
status() { curl -s -o "$body" -D "$headers" -w '%{http_code}' --max-time 15 "$@"; }

# 1. /health (кілька спроб: після деплою Caddy може ще отримувати сертифікат)
code=000
for _ in 1 2 3 4 5; do
  code="$(status "$base/health" || true)"
  [ "$code" = 200 ] && break
  sleep 5
done
if [ "$code" = 200 ] && grep -q '"status":"ok"' "$body"; then ok "/health 200"; else bad "/health відповів $code"; fi

# 4. x-request-id (з тієї ж відповіді /health)
if grep -qi '^x-request-id:' "$headers"; then ok "x-request-id є"; else bad "немає заголовка x-request-id"; fi

# 2. /dev
code="$(status "$base/dev" || true)"
if [ "$code" = 404 ]; then ok "/dev 404"; else bad "/dev відповів $code, очікували 404: перевірте NODE_ENV і AUTH_MODE"; fi

# 3. Фейковий вхід
code="$(status -X POST -H 'content-type: application/json' \
  -d '{"idToken":"test:smoke@lnu.edu.ua","deviceId":"smoke-check"}' "$base/auth/microsoft" || true)"
case "$code" in
  401 | 404 | 503) ok "фейковий вхід відхилено ($code)" ;;
  200) bad "фейковий вхід ПРАЦЮЄ на проді (200): негайно приберіть NODE_ENV=test / AUTH_MODE=fake" ;;
  *) bad "POST /auth/microsoft відповів $code, очікували 401 або 503" ;;
esac

if [ "$fail" = 0 ]; then echo "Smoke пройдено: $base"; else echo "Smoke НЕ пройдено: $base" >&2; fi
exit "$fail"
