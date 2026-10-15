#!/usr/bin/env bash
# Спільні функції для deploy.sh, rollback.sh, backup.sh, restore.sh. Не запускається напряму.
# Шлях до compose-файлу задано через COMPOSE_FILE, тому скрипти можна запускати з будь-якого каталогу.

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC2034  # використовується в скриптах, що підключають lib.sh
REPO_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"
STATE_DIR="$DEPLOY_DIR/.state"
export COMPOSE_FILE="$DEPLOY_DIR/docker-compose.prod.yml"
export COMPOSE_PROJECT_NAME=depara

mkdir -p "$STATE_DIR"

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
die() { log "ПОМИЛКА: $*" >&2; exit 1; }

require_env() {
  [ -f "$DEPLOY_DIR/.env" ] || die "немає $DEPLOY_DIR/.env (скопіюйте .env.example і заповніть)"
}

env_value() { grep -E "^$1=" "$DEPLOY_DIR/.env" | head -n1 | cut -d= -f2- || true; }

# Чекає, поки контейнер api стане healthy. Повертає 1, якщо він впав, перезапускається або не встиг.
wait_api_healthy() {
  local timeout="${1:-150}" waited=0 cid status restarts
  while [ "$waited" -lt "$timeout" ]; do
    cid="$(docker compose ps -q api 2>/dev/null || true)"
    if [ -n "$cid" ]; then
      status="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo none)"
      restarts="$(docker inspect -f '{{.RestartCount}}' "$cid" 2>/dev/null || echo 0)"
      [ "$status" = healthy ] && return 0
      [ "$status" = unhealthy ] && return 1
      [ "$restarts" -ge 2 ] && return 1
    fi
    sleep 3
    waited=$((waited + 3))
  done
  return 1
}
