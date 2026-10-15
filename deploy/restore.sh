#!/usr/bin/env bash
# Відновлення бази з дампу. ПЕРЕЗАПИСУЄ поточні дані.
# Використання: deploy/restore.sh /шлях/до/depara-....dump
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

main() {
  local file="${1:-}"
  if [ -z "$file" ] || [ ! -f "$file" ]; then
    die "вкажіть існуючий файл дампу: deploy/restore.sh <файл>"
  fi
  require_env

  log "Буде перезаписано базу даними з $file"
  read -r -p "Введіть yes, щоб продовжити: " answer
  [ "$answer" = yes ] || die "скасовано"

  # Запобіжний дамп поточного стану. Якщо база зовсім зламана, це не вдасться, і це нормально
  "$DEPLOY_DIR/backup.sh" pre-restore || log "увага: запобіжний дамп не створено"

  docker compose up -d postgres redis
  docker compose stop api
  docker compose exec -T postgres pg_restore -U depara -d depara --clean --if-exists --no-owner <"$file"
  docker compose up -d api
  wait_api_healthy 150 || die "API не став healthy після відновлення: docker compose logs api"
  log "відновлено з $file"
}

main "$@"
