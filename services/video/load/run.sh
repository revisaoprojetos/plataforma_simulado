#!/bin/sh
# Roda o teste de carga do heartbeat de ponta a ponta e imprime o resumo (cliente k6 + servidor).
#   sh load/run.sh [VUS] [DURACAO] [USERS]      ex.: sh load/run.sh 1000 60s 25
# Pré-requisitos: stack de dev no ar com a sobreposição de carga:
#   docker compose -f docker-compose.yml -f docker-compose.load.yml up -d --build api consolidator
# (alunos de teste "load-N" são criados automaticamente; remova-os com load/cleanup.sql)
VUS=${1:-1000}
DURATION=${2:-60s}
USERS=${3:-25}
TOKEN=carga-metrics-token-0123456789
OUT=$(mktemp)

docker compose -f docker-compose.yml -f docker-compose.load.yml up -d --force-recreate api consolidator >/dev/null 2>&1
for i in $(seq 1 30); do curl -s -m 3 localhost:3010/health | grep -q '"ok"' && break; sleep 2; done
docker exec -i gerenciador_video-postgres-1 psql -U video -d video < load/cleanup.sql >/dev/null 2>&1
sh load/reset.sh >/dev/null

docker run --rm -i --network gerenciador_video_default \
  -e API=http://api:3000 -e VUS="$VUS" -e DURATION="$DURATION" -e USERS="$USERS" -e METRICS_TOKEN=$TOKEN \
  grafana/k6 run - < load/heartbeat.js > "$OUT" 2>&1

echo "=== k6 (visão do cliente) ==="
grep -E "setup ok|fila de progresso" "$OUT" | sed 's/.*msg=//'
grep -E "✓|✗" "$OUT" | grep -E "p\(95\)|rate" | sed 's/^ *//'
grep -E "heartbeat\}\.+:|heartbeats_accepted" "$OUT" | sed 's/^ *//'
echo "=== servidor (histograma da API) ==="
curl -s -H "Authorization: Bearer $TOKEN" localhost:3010/metrics | MSYS_NO_PATHCONV=1 node load/percentiles.cjs v1/progress/heartbeat
rm -f "$OUT"
