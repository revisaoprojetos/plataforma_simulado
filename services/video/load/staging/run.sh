#!/bin/sh
# Wrapper SOMENTE-STAGING para os cenarios k6 de carga do video.
#   sh load/staging/run.sh <seed|playback|heartbeat|live-peak> [args extras do k6]
#
# Variaveis obrigatorias: I_KNOW_THIS_IS_STAGING=1, API_URL, INTEGRATION_KEY (+ COURSE_ID p/ seed, LESSON_ID p/ os demais).
# Opcionais: STUDENTS, VUS, DURATION, RAMP_S, HOLD_S, ORIGIN, METRICS_TOKEN, ALLOW_PROD_DOMAIN_HOST.
# Este script NAO chama load/reset.sh nem load/cleanup.sql (sao do ambiente de DEV local; nunca use em staging/prod).
set -eu

if [ "${I_KNOW_THIS_IS_STAGING:-}" != "1" ]; then
  echo "RECUSADO: defina I_KNOW_THIS_IS_STAGING=1 (somente staging)." >&2
  exit 2
fi
if [ -z "${API_URL:-}" ]; then
  echo "RECUSADO: defina API_URL (ex.: https://video-api-staging.exemplo.com)." >&2
  exit 2
fi

# host = sem esquema, sem caminho, sem porta, em minusculas
HOST=$(printf '%s' "$API_URL" | sed -e 's#^[a-zA-Z]*://##' -e 's#[/:?#].*$##' | tr 'A-Z' 'a-z')
if [ -z "$HOST" ]; then
  echo "RECUSADO: API_URL invalida." >&2
  exit 2
fi
if [ "$HOST" = "video-api.revisaopge.com.br" ]; then
  echo "RECUSADO: $HOST e o host de PRODUCAO (sem override)." >&2
  exit 2
fi
case "$HOST" in
  revisaopge.com.br | *.revisaopge.com.br)
    ALLOW=$(printf '%s' "${ALLOW_PROD_DOMAIN_HOST:-}" | tr 'A-Z' 'a-z')
    if [ "$ALLOW" != "$HOST" ]; then
      echo "RECUSADO: $HOST esta sob revisaopge.com.br. Se for staging de verdade: ALLOW_PROD_DOMAIN_HOST=$HOST" >&2
      exit 2
    fi
    ;;
esac

DIR=$(cd "$(dirname "$0")" && pwd)
CENARIO=${1:-}
[ -n "$CENARIO" ] || { echo "uso: sh load/staging/run.sh <seed|playback|heartbeat|live-peak>" >&2; exit 2; }
shift

case "$CENARIO" in
  seed) FILE="$DIR/seed-students.js" ;;
  playback | heartbeat | live-peak) FILE="$DIR/$CENARIO.js" ;;
  *) echo "cenario desconhecido: $CENARIO" >&2; exit 2 ;;
esac

command -v k6 >/dev/null 2>&1 || { echo "k6 nao encontrado (https://grafana.com/docs/k6/)." >&2; exit 2; }

# Repassa so as variaveis conhecidas ao k6 (nada de herdar o ambiente inteiro como -e).
ARGS=""
for V in I_KNOW_THIS_IS_STAGING API_URL INTEGRATION_KEY COURSE_ID LESSON_ID STUDENTS STUDENT_PREFIX VUS DURATION \
  RAMP_S HOLD_S HB_INTERVAL_S RENEW_S SEGMENTS RENDITION ORIGIN METRICS_TOKEN ALLOW_PROD_DOMAIN_HOST ACCESS_DAYS SETUP_PACE_S THINK_S; do
  eval "VAL=\${$V:-}"
  [ -n "$VAL" ] && ARGS="$ARGS -e $V=$VAL"
done

echo ">> staging: $HOST | cenario: $CENARIO"
# shellcheck disable=SC2086
exec k6 run $ARGS "$@" "$FILE"
