#!/usr/bin/env bash
# Дамп бази Postgres у стиснутий файл формату pg_dump -Fc.
# Використання: deploy/backup.sh [мітка]     (мітка потрапляє в назву файлу, напр. pre-deploy)
# Змінні: BACKUP_DIR (за замовчуванням ~/backups/depara), KEEP_DAYS (за замовчуванням 14).
# Копія на тому самому сервері не рятує від втрати сервера: копіюйте файли ще кудись (docs/deploy-vps.md).
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

main() {
  local label="${1:-}"
  local dir="${BACKUP_DIR:-$HOME/backups/depara}"
  local keep_days="${KEEP_DAYS:-14}"
  local file tmp

  mkdir -p "$dir"
  file="$dir/depara-$(date +%Y%m%d-%H%M%S)${label:+-$label}.dump"
  tmp="$file.tmp"
  # $tmp підставляється одразу: після виходу з main локальна змінна вже недоступна
  # shellcheck disable=SC2064
  trap "rm -f '$tmp'" EXIT

  docker compose exec -T postgres pg_dump -U depara -d depara -Fc >"$tmp"
  [ -s "$tmp" ] || die "дамп порожній"
  # Перевірка, що архів читається: дамп, який не відновиться, не є копією
  docker compose exec -T postgres pg_restore --list <"$tmp" >/dev/null || die "дамп пошкоджений"

  mv "$tmp" "$file"
  chmod 600 "$file"
  find "$dir" -name 'depara-*.dump' -type f -mtime +"$keep_days" -delete
  log "бекап збережено: $file ($(du -h "$file" | cut -f1))"
}

main "$@"
