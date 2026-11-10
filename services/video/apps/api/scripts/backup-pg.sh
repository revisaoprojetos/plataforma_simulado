#!/usr/bin/env bash
# Backup diário do Postgres do vídeo -> S3 (bucket SEPARADO do de vídeos) + retenção.
# Rodar no NÓ rotulado video-data=true (onde o container do Postgres vive), via cron do host:
#   15 3 * * *  root  /opt/video/backup-pg.sh >> /var/log/video-backup.log 2>&1
# Config em /etc/video-backup.env (chmod 600), ver services/video/.env.video.example (seção Backup).
# Requer: docker no host (usa a imagem amazon/aws-cli só para falar com o S3).
set -euo pipefail

ENV_FILE="${BACKUP_ENV_FILE:-/etc/video-backup.env}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

: "${BACKUP_S3_ENDPOINT:?defina BACKUP_S3_ENDPOINT}"
: "${BACKUP_S3_BUCKET:?defina BACKUP_S3_BUCKET}"
: "${BACKUP_S3_ACCESS_KEY:?defina BACKUP_S3_ACCESS_KEY}"
: "${BACKUP_S3_SECRET_KEY:?defina BACKUP_S3_SECRET_KEY}"
REGION="${BACKUP_S3_REGION:-hel1}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
FILTER="${BACKUP_PG_CONTAINER_FILTER:-name=video_postgres}"
TMP_DIR="${BACKUP_TMP_DIR:-/var/tmp}"
PREFIX="pg"

log() { echo "[$(date -u +%FT%TZ)] $*"; }

aws_s3() {
  docker run --rm \
    -e AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY" \
    -e AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_KEY" \
    -e AWS_DEFAULT_REGION="$REGION" \
    -e AWS_REQUEST_CHECKSUM_CALCULATION=when_required \
    -e AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
    -v "$TMP_DIR:/data:ro" \
    amazon/aws-cli --endpoint-url "$BACKUP_S3_ENDPOINT" "$@"
}

CID="$(docker ps -q -f "$FILTER" | head -n1)"
[ -n "$CID" ] || { log "ERRO: container do Postgres não encontrado (filtro: $FILTER). Este é o nó video-data?"; exit 1; }

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$TMP_DIR/video-$STAMP.dump"
trap 'rm -f "$FILE"' EXIT

log "pg_dump -> $FILE"
# -Fc = formato custom (já comprimido; permite pg_restore seletivo/paralelo).
docker exec "$CID" pg_dump -U video -d video -Fc > "$FILE"

# Valida que o dump é legível ANTES de subir (pg_restore --list lê o índice do arquivo).
docker exec -i "$CID" pg_restore --list < "$FILE" > /dev/null
SIZE="$(wc -c < "$FILE")"
[ "$SIZE" -gt 1024 ] || { log "ERRO: dump suspeito de tão pequeno ($SIZE bytes)"; exit 1; }

log "enviando s3://$BACKUP_S3_BUCKET/$PREFIX/video-$STAMP.dump ($SIZE bytes)"
aws_s3 s3 cp "/data/$(basename "$FILE")" "s3://$BACKUP_S3_BUCKET/$PREFIX/video-$STAMP.dump" --only-show-errors

# Retenção: apaga dumps com data (no nome) anterior ao corte. Nomes: video-YYYYmmddTHHMMSSZ.dump
CUTOFF="$(date -u -d "-$RETENTION_DAYS days" +%Y%m%dT%H%M%SZ 2>/dev/null || date -u -v-"${RETENTION_DAYS}"d +%Y%m%dT%H%M%SZ)"
log "retenção: removendo dumps anteriores a $CUTOFF (${RETENTION_DAYS} dias)"
aws_s3 s3 ls "s3://$BACKUP_S3_BUCKET/$PREFIX/" | awk '{print $4}' | grep -E '^video-[0-9]{8}T[0-9]{6}Z\.dump$' | while read -r key; do
  ts="${key#video-}"; ts="${ts%.dump}"
  if [[ "$ts" < "$CUTOFF" ]]; then
    log "  apagando $key"
    aws_s3 s3 rm "s3://$BACKUP_S3_BUCKET/$PREFIX/$key" --only-show-errors
  fi
done

log "backup concluído"
