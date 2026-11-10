# Observabilidade — Gerenciador de Vídeo

Base: `services/video/docs/operacao.md` (seção Monitoramento). Este documento adapta ao Swarm e acrescenta as métricas novas do worker.
O projeto ainda não tem Prometheus/Alertmanager provisionado: abaixo está o que subir (ou colar no que já existir).

## 1. Endpoints de métricas

Todos exigem `Authorization: Bearer <METRICS_TOKEN>` (sem token configurado respondem 404). **Nenhum é público**: o Traefik bloqueia `/metrics` e `/mcp` em `video-api.revisaopge.com.br` (403); o scrape é pela rede overlay `video_internal` (`attachable`).

| Alvo | Endereço (dentro da rede `video_internal`) |
|---|---|
| API | `tasks.video_api:3000/metrics` (uma série por réplica) |
| Consolidador | `tasks.video_consolidator:9102/metrics` |
| Worker | `tasks.video_worker:9100/metrics` |

`tasks.<serviço>` é o DNS do Swarm que devolve o IP de cada réplica (necessário para somar réplicas; o nome do serviço sozinho cairia em balanceamento).

## 2. Scrape (Prometheus)

O Prometheus (em qualquer stack) precisa estar na rede `video_internal` declarada como externa:
```yaml
# na stack do Prometheus
networks:
  video_internal:
    external: true
    name: video_internal
```
```yaml
# prometheus.yml (trecho)
rule_files: [/etc/prometheus/rules/video.yml]
scrape_configs:
  - job_name: video-api
    metrics_path: /metrics
    authorization: { credentials_file: /etc/prometheus/video_metrics_token }   # conteúdo = METRICS_TOKEN
    dns_sd_configs:
      - { names: [tasks.video_api], type: A, port: 3000, refresh_interval: 30s }
  - job_name: video-consolidator
    authorization: { credentials_file: /etc/prometheus/video_metrics_token }
    dns_sd_configs:
      - { names: [tasks.video_consolidator], type: A, port: 9102, refresh_interval: 30s }
  - job_name: video-worker
    authorization: { credentials_file: /etc/prometheus/video_metrics_token }
    dns_sd_configs:
      - { names: [tasks.video_worker], type: A, port: 9100, refresh_interval: 30s }
```
Nome do serviço = `<stack>_<serviço>`; se a stack não se chamar `video`, ajuste os `tasks.*`.

## 3. Métricas

Existentes (API/consolidador/worker): ver tabela em `services/video/docs/operacao.md`. Principais: `http_request_duration_seconds`, `heartbeats_total{result}`, `progress_events_queue_length`, `progress_consolidation_failures_total`, `transcode_queue_jobs{state}`, `transcode_jobs_total{status}`, `transcode_duration_seconds`, `transcode_jobs_active`.

Novas no worker (Fase 2.4):

| Métrica | Significado |
|---|---|
| `transcode_jobs_total{status="requeued"}` | job devolvido à fila por SIGTERM (deploy/rollback) — normal em deploy |
| `transcode_jobs_total{status="timeout"}` | job passou de `JOB_TIMEOUT_MS` (falha definitiva) |
| `transcode_workdir_free_bytes` / `transcode_workdir_total_bytes` | disco da pasta de trabalho (volume `worker_tmp`), atualizado a cada 30 s |

## 4. Alertas

Arquivo `/etc/prometheus/rules/video.yml`:
```yaml
groups:
  - name: video-api
    rules:
      - alert: VideoApiForaDoAr
        expr: up{job="video-api"} == 0
        for: 2m
        labels: { severity: critical }
        annotations: { summary: "Réplica da video-api sem scrape ({{ $labels.instance }})" }
      - alert: VideoApiSemReplicas
        expr: absent(up{job="video-api"} == 1)
        for: 2m
        labels: { severity: critical }
        annotations: { summary: "Nenhuma réplica da video-api respondendo" }
      - alert: ErrosNaAPI
        expr: sum(rate(http_request_duration_seconds_count{job="video-api",status=~"5.."}[5m])) / sum(rate(http_request_duration_seconds_count{job="video-api"}[5m])) > 0.01
        for: 5m
        labels: { severity: warning }
        annotations: { summary: "Mais de 1% de respostas 5xx na video-api" }
      - alert: HeartbeatLento
        expr: histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="video-api",route="/v1/progress/heartbeat"}[5m])) by (le)) > 0.1
        for: 10m
        labels: { severity: warning }
        annotations: { summary: "p95 do heartbeat acima de 100 ms (meta da Fase 5)" }
      - alert: ForcaBrutaNoLogin
        expr: sum(rate(rate_limited_total{policy=~"login.*"}[10m])) > 1
        for: 10m
        labels: { severity: warning }
        annotations: { summary: "Muitas requisições limitadas em rotas de login" }

  - name: video-consolidador
    rules:
      - alert: ConsolidadorForaDoAr
        expr: absent(up{job="video-consolidator"} == 1)
        for: 2m
        labels: { severity: critical }
        annotations: { summary: "Consolidador de progresso parado" }
      - alert: ConsolidadorAtrasado
        expr: max(progress_events_queue_length) > 20000
        for: 5m
        labels: { severity: warning }
        annotations: { summary: "Fila de heartbeats acumulando (>20k)" }
      - alert: FilaDeHeartbeatPertoDoTeto
        # teto de 500.000 (MAX_QUEUE_LENGTH); acima disso a API descarta heartbeats (Fase 1.16)
        expr: max(progress_events_queue_length) > 400000
        for: 2m
        labels: { severity: critical }
        annotations: { summary: "Fila de heartbeats a 80% do teto: novos heartbeats serão descartados" }
      - alert: HeartbeatsDescartados
        expr: increase(heartbeats_total{result="queue_full"}[5m]) > 0
        labels: { severity: critical }
        annotations: { summary: "Heartbeats sendo descartados (fila cheia)" }
      - alert: ConsolidadorFalhando
        expr: increase(progress_consolidation_failures_total[10m]) > 0
        labels: { severity: warning }
        annotations: { summary: "Falhas na consolidação de progresso" }

  - name: video-transcode
    rules:
      - alert: WorkerForaDoAr
        expr: absent(up{job="video-worker"} == 1)
        for: 5m
        labels: { severity: warning }
        annotations: { summary: "Nenhum worker de transcode ativo (nó video-worker=true?)" }
      - alert: TranscodeComFalhas
        expr: max(transcode_queue_jobs{state="failed"}) > 0
        for: 5m
        labels: { severity: warning }
        annotations: { summary: "Há vídeos com transcode falhado (ver campo error do vídeo)" }
      - alert: TranscodeParado
        expr: max(transcode_queue_jobs{state="waiting"}) > 0 and sum(transcode_jobs_active) == 0
        for: 30m
        labels: { severity: warning }
        annotations: { summary: "Fila de transcode com itens e nenhum job ativo há 30 min" }
      - alert: TranscodeTimeout
        expr: increase(transcode_jobs_total{status="timeout"}[1h]) > 0
        labels: { severity: warning }
        annotations: { summary: "Job de transcode estourou JOB_TIMEOUT_MS" }
      - alert: TranscodeLento
        expr: histogram_quantile(0.95, sum(rate(transcode_duration_seconds_bucket[1h])) by (le)) > 3600
        for: 1h
        labels: { severity: info }
        annotations: { summary: "p95 de transcode acima de 1 h (avaliar CPU/preset/concorrência)" }
      - alert: DiscoDoWorkerBaixo
        expr: transcode_workdir_free_bytes < 5 * 1024^3
        for: 10m
        labels: { severity: warning }
        annotations: { summary: "Menos de 5 GiB livres na pasta de trabalho do worker" }
      - alert: MuitosRequeues
        # deploys geram alguns; muitos em pouco tempo = worker reiniciando em loop
        expr: increase(transcode_jobs_total{status="requeued"}[30m]) > 3
        labels: { severity: warning }
        annotations: { summary: "Jobs sendo devolvidos à fila repetidamente (worker reiniciando?)" }

  - name: video-recursos
    rules:
      - alert: EventLoopAtrasado
        expr: nodejs_eventloop_lag_p99_seconds > 0.5
        for: 10m
        labels: { severity: warning }
        annotations: { summary: "Event loop com atraso alto em {{ $labels.job }}" }
      - alert: MemoriaAlta
        expr: process_resident_memory_bytes{job=~"video-api|video-consolidator"} > 800 * 1024^2
        for: 15m
        labels: { severity: warning }
        annotations: { summary: "Memória alta em {{ $labels.job }} (limite do container: 1 GiB / 512 MiB)" }
```
Rotear `severity=critical` para WhatsApp/e-mail e `warning` para e-mail diário (Alertmanager do operador).

## 5. Postgres, Redis e backup (sem exporter)

Não há exporters nesta etapa. Cobertura indireta:
- API `/health` (readiness: `db`, `redis`, `s3`) — monitor externo (UptimeRobot/Healthchecks) em `https://video-api.revisaopge.com.br/health` a cada 1 min.
- Redis: `progress_events_queue_length` (llen) e erros de escrita aparecem em `heartbeats_total`/logs.
- Backup: o script `backup-pg.sh` termina com `backup concluído`; ideal chamar uma URL de monitor de "dead man's switch" ao final (pendência do operador).
- Para métricas nativas depois: `postgres_exporter` e `redis_exporter` na rede `video_internal`.

## 6. Dashboards sugeridos (Grafana)

1. **Alunos ao vivo:** `playback_sessions_started_total` (taxa), `heartbeats_total{result="accepted"}` (taxa), p95 do heartbeat.
2. **Consolidação:** `progress_events_queue_length`, `progress_consolidation_duration_seconds` (p95), falhas.
3. **Transcode:** `transcode_queue_jobs` por estado, `transcode_jobs_active`, duração p50/p95, `transcode_workdir_free_bytes`.
4. **API:** taxa de 5xx, p95 por rota, `rate_limited_total`, CPU/memória/event loop por réplica.

## 7. Logs

JSON no stdout (driver `json-file`, 3 x 10 MB por container). `docker service logs -f video_api`. Cada linha da API traz `req.id` = `X-Correlation-Id`; investigar erro de aluno pelo `correlationId` da resposta. Para retenção maior, apontar o driver para Loki/Graylog depois (não incluso).
