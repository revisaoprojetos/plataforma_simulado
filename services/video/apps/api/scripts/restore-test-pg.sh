#!/usr/bin/env bash
# Teste de restauração: baixa um dump do bucket de backup e restaura num Postgres DESCARTÁVEL,
# conferindo que há tabelas e migrations. NUNCA toca no banco de produção.
# Uso:  ./restore-test-pg.sh [video-YYYYmmddTHHMMSSZ.dump]   (padrão: o mais recente)
# Rodar ao menos 1x por mês e depois de qualquer mudança no backup. Config: /etc/video-backup.env
set -euo pipefail

ENV_FILE="${BACKUP_ENV_FILE:-/etc/video-backup.env}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
: "${BACKUP_S3_ENDPOINT:?}" "${BACKUP_S3_BUCKET:?}" "${BACKUP_S3_ACCESS_KEY:?}" "${BACKUP_S3_SECRET_KEY:?}"
REGION="${BACKUP_S3_REGION:-hel1}"
PREFIX="pg"
WORK="$(mktemp -d)"
NAME="video-restore-test-$$"
log() { echo "[$(date -u +%FT%TZ)] $*"; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

aws_s3() {
  docker run --rm \
    -e AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY" -e AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_KEY" \
    -e AWS_DEFAULT_REGION="$REGION" \
    -e AWS_REQUEST_CHECKSUM_CALCULATION=when_required -e AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
    -v "$WORK:/data" \
    amazon/aws-cli --endpoint-url "$BACKUP_S3_ENDPOINT" "$@"
}

KEY="${1:-}"
if [ -z "$KEY" ]; then
  KEY="$(aws_s3 s3 ls "s3://$BACKUP_S3_BUCKET/$PREFIX/" | awk '{print $4}' | grep -E '^video-.*\.dump$' | sort | tail -n1)"
fi
[ -n "$KEY" ] || { log "ERRO: nenhum dump encontrado em s3://$BACKUP_S3_BUCKET/$PREFIX/"; exit 1; }

log "baixando $KEY"
aws_s3 s3 cp "s3://$BACKUP_S3_BUCKET/$PREFIX/$KEY" "/data/$KEY" --only-show-errors

log "subindo Postgres descartável ($NAME)"
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=teste -e POSTGRES_USER=video -e POSTGRES_DB=video postgres:16-alpine >/dev/null
for _ in $(seq 1 30); do docker exec "$NAME" pg_isready -U video -d video >/dev/null 2>&1 && break; sleep 1; done

log "restaurando"
docker exec -i "$NAME" pg_restore -U video -d video --no-owner --exit-on-error < "$WORK/$KEY"

TABLES="$(docker exec "$NAME" psql -U video -d video -tAc "select count(*) from information_schema.tables where table_schema='public'")"
MIGS="$(docker exec "$NAME" psql -U video -d video -tAc "select count(*) from _prisma_migrations where finished_at is not null")"
log "tabelas: $TABLES · migrations aplicadas: $MIGS"
[ "$TABLES" -ge 5 ] && [ "$MIGS" -ge 1 ] || { log "FALHOU: restauração incompleta"; exit 1; }
docker exec "$NAME" psql -U video -d video -c "select relname as tabela, n_live_tup as linhas from pg_stat_user_tables order by n_live_tup desc limit 10"
log "OK: $KEY restaurou e é consistente"
