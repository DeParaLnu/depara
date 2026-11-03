#!/usr/bin/env bash
# Перевірка, що бекап справді відновлюється. Береться найновіший дамп (або вказаний), розгортається в ТИМЧАСОВУ
# базу поруч із робочою (робоча не чіпається), перевіряються таблиці й кількість записів, база видаляється.
# Також падає, якщо найновіший дамп застарів: це ловить мертвий cron бекапу.
# Використання: deploy/verify-backup.sh [файл.dump]
# Змінні: BACKUP_DIR (за замовчуванням ~/backups/depara), MAX_BACKUP_AGE_HOURS (за замовчуванням 36).
# Раз на тиждень через cron: 0 5 * * 0 /opt/depara/deploy/verify-backup.sh >> $HOME/backups/verify.log 2>&1
# Якщо в deploy/.env задано VERIFY_PING_URL, результат шлеться в моніторинг (збій дає /fail).
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

VERIFY_DB=""
finish() {
  local rc=$?
  if [ -n "$VERIFY_DB" ]; then
    docker compose exec -T postgres psql -U depara -d postgres -qAt -c "DROP DATABASE IF EXISTS \"$VERIFY_DB\"" >/dev/null 2>&1 || log "увага: не вдалося видалити тимчасову базу $VERIFY_DB"
  fi
  ping_monitor VERIFY_PING_URL "$rc"
  return 0
}
trap finish EXIT

psql_db() { docker compose exec -T postgres psql -U depara -d "$1" -qAt -v ON_ERROR_STOP=1 "${@:2}"; }

main() {
  local dir="${BACKUP_DIR:-$HOME/backups/depara}"
  local max_age_hours="${MAX_BACKUP_AGE_HOURS:-36}"
  local file="${1:-}"

  if [ -z "$file" ]; then
    # Найновіший дамп за часом зміни (лише справжні дампи, без .tmp)
    file="$(find "$dir" -maxdepth 1 -name 'depara-*.dump' -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -n1 | cut -d' ' -f2- || true)"
  fi
  [ -n "$file" ] && [ -f "$file" ] || die "дампів немає в $dir"

  # Свіжість: застарілий бекап означає, що щоденний cron мовчить
  local age_hours=$(( ($(date +%s) - $(stat -c %Y "$file")) / 3600 ))
  [ "$age_hours" -le "$max_age_hours" ] || die "найновіший дамп $file має $age_hours год (ліміт $max_age_hours): бекап не робиться?"

  VERIFY_DB="depara_verify_$(date +%s)"
  log "відновлюю $file у тимчасову базу $VERIFY_DB (вік дампу $age_hours год)"
  psql_db postgres -c "CREATE DATABASE \"$VERIFY_DB\"" >/dev/null
  docker compose exec -T postgres pg_restore -U depara -d "$VERIFY_DB" --no-owner --exit-on-error <"$file" \
    || die "pg_restore не зміг відновити дамп"

  # Таблиці, без яких застосунок не працює, і журнал міграцій
  local table
  for table in app_user lesson study_group building pair_time _prisma_migrations; do
    [ "$(psql_db "$VERIFY_DB" -c "SELECT to_regclass('public.\"$table\"') IS NOT NULL")" = t ] || die "у відновленій базі немає таблиці $table"
  done
  local migrations users lessons groups
  migrations="$(psql_db "$VERIFY_DB" -c 'SELECT count(*) FROM _prisma_migrations')"
  [ "$migrations" -gt 0 ] || die "журнал міграцій порожній"
  users="$(psql_db "$VERIFY_DB" -c 'SELECT count(*) FROM app_user')"
  lessons="$(psql_db "$VERIFY_DB" -c 'SELECT count(*) FROM lesson')"
  groups="$(psql_db "$VERIFY_DB" -c 'SELECT count(*) FROM study_group')"

  log "відновлення працює: міграцій $migrations, груп $groups, пар $lessons, користувачів $users"
}

main "$@"
