#!/usr/bin/env bash
# Повертає API на попередню версію (образ уже зібраний і лежить на сервері, збирати нічого не треба).
# Використання: deploy/rollback.sh [тег]     (без тегу береться попередня версія з deploy/.state/previous)
# Тег = короткий sha коміту, його видно в логах deploy.sh або в `docker images depara-backend`.
#
# УВАГА: відкочується тільки код. Міграції бази назад не відкочуються. Якщо нова версія змінила схему
# несумісно зі старим кодом, відновлюйте базу з бекапу (deploy/restore.sh).
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

main() {
  require_env
  local target="${1:-$(cat "$STATE_DIR/previous" 2>/dev/null || true)}"
  local current
  current="$(cat "$STATE_DIR/current" 2>/dev/null || true)"
  [ -n "$target" ] || die "немає куди відкочуватись: вкажіть тег (docker images depara-backend)"
  docker image inspect "depara-backend:$target" >/dev/null 2>&1 \
    || die "образу depara-backend:$target немає на сервері"

  # Підтягуємо файли конфігурації тієї ж версії (compose, Caddyfile), щоб вони відповідали образу
  git -C "$REPO_DIR" checkout --quiet --detach "$target" 2>/dev/null \
    || log "увага: коміт $target не знайдено, конфігурація лишається з поточного коміту"

  log "відкат на $target"
  export TAG="$target"
  docker compose up -d --no-build --remove-orphans
  wait_api_healthy 150 || die "після відкату API не став healthy: docker compose logs api"

  [ -n "$current" ] && [ "$current" != "$target" ] && echo "$current" >"$STATE_DIR/previous"
  echo "$target" >"$STATE_DIR/current"
  log "відкат завершено, працює $target"
}

main "$@"
