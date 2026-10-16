#!/usr/bin/env bash
# Перевірка стану стеку: контейнери працюють, не перезапускались і не вбиті через пам'ять, диск не повний.
# Використання: deploy/check.sh        (код виходу 0 = усе гаразд, 1 = є проблеми)
# Раз на 30 хвилин через cron: */30 * * * * /opt/depara/deploy/check.sh >> $HOME/backups/check.log 2>&1
# Якщо в deploy/.env задано CHECK_PING_URL, результат шлеться в моніторинг: проблема дає /fail, і сервіс сповіщає.
# RestartCount скидається при повторному створенні контейнера (кожен деплой), тож ненульове значення
# означає, що контейнер перезапускався сам після останнього деплою: це й є crash loop або OOM.
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

DISK_LIMIT="${DISK_LIMIT:-85}"

main() {
  require_env
  local problems=0 cid name status restarts oom used

  while read -r cid; do
    [ -n "$cid" ] || continue
    name="$(docker inspect -f '{{.Name}}' "$cid" | sed 's#^/##')"
    status="$(docker inspect -f '{{.State.Status}}' "$cid")"
    restarts="$(docker inspect -f '{{.RestartCount}}' "$cid")"
    oom="$(docker inspect -f '{{.State.OOMKilled}}' "$cid")"
    if [ "$status" != running ]; then
      log "ПРОБЛЕМА: $name має статус $status"
      problems=$((problems + 1))
    fi
    if [ "$restarts" -gt 0 ]; then
      log "ПРОБЛЕМА: $name перезапускався $restarts раз(и) після останнього деплою"
      problems=$((problems + 1))
    fi
    if [ "$oom" = true ]; then
      log "ПРОБЛЕМА: $name був убитий через нестачу памʼяті (OOM)"
      problems=$((problems + 1))
    fi
  done < <(docker compose ps -aq)

  used="$(df --output=pcent / | tail -n1 | tr -dc '0-9')"
  if [ "${used:-0}" -ge "$DISK_LIMIT" ]; then
    log "ПРОБЛЕМА: диск заповнений на ${used}% (ліміт ${DISK_LIMIT}%)"
    problems=$((problems + 1))
  fi

  ping_monitor CHECK_PING_URL "$problems"
  if [ "$problems" -eq 0 ]; then
    log "усе гаразд"
  else
    return 1
  fi
}

main "$@"
