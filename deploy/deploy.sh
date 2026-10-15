#!/usr/bin/env bash
# Збирає образ поточного коміту і запускає прод-стек. Якщо API не став healthy, сам відкочується.
# Використання (на сервері, у клоні репозиторію, вже на потрібному коміті):
#   git fetch origin && git checkout --detach <sha> && deploy/deploy.sh
# У GitHub Actions це робить .github/workflows/deploy.yml.
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

main() {
  require_env
  local tag prev domain
  tag="$(git -C "$REPO_DIR" rev-parse --short=12 HEAD)"
  prev="$(cat "$STATE_DIR/current" 2>/dev/null || true)"
  export TAG="$tag"
  log "деплой коміту $tag (зараз працює: ${prev:-нічого})"

  # Бекап перед міграціями. Без бекапу не деплоїмо. Пропускаємо лише перший запуск, коли бази ще нема
  if [ -n "$(docker compose ps -q postgres 2>/dev/null || true)" ]; then
    "$DEPLOY_DIR/backup.sh" pre-deploy
  else
    log "база ще не запущена, бекап пропущено (перший запуск)"
  fi

  docker compose build api
  docker compose up -d --remove-orphans
  # Якщо змінився Caddyfile, Caddy підхопить його без перезапуску
  docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true

  if wait_api_healthy 150; then
    [ "$prev" != "$tag" ] && [ -n "$prev" ] && echo "$prev" >"$STATE_DIR/previous"
    echo "$tag" >"$STATE_DIR/current"
    prune_images
    log "API healthy, версія $tag працює"
  else
    log "API не став healthy. Останні логи:" >&2
    docker compose logs --tail 60 api >&2 || true
    if [ -n "$prev" ] && [ "$prev" != "$tag" ]; then
      log "відкат на $prev" >&2
      "$DEPLOY_DIR/rollback.sh" "$prev" || true
    fi
    die "деплой $tag не вдався"
  fi

  domain="$(env_value DOMAIN)"
  if [ -n "$domain" ] && command -v curl >/dev/null; then
    if curl -fsS --max-time 15 "https://$domain/health" >/dev/null; then
      log "https://$domain/health відповідає"
    else
      log "увага: https://$domain/health не відповів (DNS, сертифікат або порти 80/443)"
    fi
  fi
}

# Лишаємо 5 найновіших образів бекенда, щоб було куди відкочуватись і не забивати диск
prune_images() {
  docker images depara-backend --format '{{.CreatedAt}}\t{{.Tag}}' \
    | sort -r | awk -F'\t' 'NR>5 {print $2}' \
    | while read -r t; do
        [ "$t" = "$(cat "$STATE_DIR/current" 2>/dev/null)" ] && continue
        [ "$t" = "$(cat "$STATE_DIR/previous" 2>/dev/null)" ] && continue
        docker rmi "depara-backend:$t" >/dev/null 2>&1 || true
      done
}

main "$@"
