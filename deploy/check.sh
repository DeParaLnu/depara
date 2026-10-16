#!/usr/bin/env bash
# Перевірка стану стеку: усі сервіси існують і працюють, healthcheck зелений, контейнери не перезапускались
# самі і не вбиті через пам'ять, диск не повний.
# Використання: deploy/check.sh        (код виходу 0 = усе гаразд, 1 = є проблеми)
# Раз на 30 хвилин через cron: */30 * * * * /opt/depara/deploy/check.sh >> $HOME/backups/check.log 2>&1
# Якщо в deploy/.env задано CHECK_PING_URL, результат шлеться в моніторинг: проблема дає /fail, і сервіс сповіщає.
#
# Перезапуски: RestartCount не скидається, поки контейнер не створено заново (а `compose up -d` перестворює лише
# змінені сервіси). Тому ми порівнюємо з попереднім значенням у deploy/.state/restarts.<сервіс> і сигналимо лише
# при зростанні: разовий збій дає один сигнал, crash loop дає сигнал на кожній перевірці.
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

DISK_LIMIT="${DISK_LIMIT:-85}"
SERVICES=(caddy api postgres redis)

PROBLEMS=0
problem() { log "ПРОБЛЕМА: $*"; PROBLEMS=$((PROBLEMS + 1)); }

check_service() {
  local svc="$1" cid status health restarts oom state_file previous
  cid="$(docker compose ps -aq "$svc" 2>/dev/null | head -n1 || true)"
  if [ -z "$cid" ]; then
    problem "сервіс $svc не знайдено (стек зупинено або контейнер видалено)"
    return
  fi

  status="$(docker inspect -f '{{.State.Status}}' "$cid")"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$cid")"
  restarts="$(docker inspect -f '{{.RestartCount}}' "$cid")"
  oom="$(docker inspect -f '{{.State.OOMKilled}}' "$cid")"

  [ "$status" = running ] || problem "$svc має статус $status"
  [ "$health" != unhealthy ] || problem "$svc unhealthy (healthcheck не проходить)"
  [ "$oom" != true ] || problem "$svc був убитий через нестачу памʼяті (OOM)"

  state_file="$STATE_DIR/restarts.$svc"
  if [ -f "$state_file" ]; then
    previous="$(cat "$state_file")"
    [ "$restarts" -le "$previous" ] || problem "$svc перезапускався сам: RestartCount $previous → $restarts"
  fi
  printf '%s\n' "$restarts" >"$state_file"
}

main() {
  require_env

  # Без цього недоступний docker дав би порожній список і хибне «усе гаразд»
  docker compose ps -aq >/dev/null 2>&1 || problem "docker недоступний або compose-проєкт не читається"

  if [ "$PROBLEMS" -eq 0 ]; then
    local svc
    for svc in "${SERVICES[@]}"; do check_service "$svc"; done
  fi

  # Перевіряємо розділ, де лежать образи і томи Docker; якщо його немає, кореневий
  local disk_path=/ used
  [ -d /var/lib/docker ] && disk_path=/var/lib/docker
  used="$(df --output=pcent "$disk_path" 2>/dev/null | tail -n1 | tr -dc '0-9' || true)"
  if [ -z "$used" ]; then
    problem "не вдалося визначити заповнення диска ($disk_path)"
  elif [ "$used" -ge "$DISK_LIMIT" ]; then
    problem "диск ($disk_path) заповнений на ${used}% (ліміт ${DISK_LIMIT}%)"
  fi

  ping_monitor CHECK_PING_URL "$PROBLEMS"
  if [ "$PROBLEMS" -eq 0 ]; then
    log "усе гаразд"
  else
    return 1
  fi
}

main "$@"
