# Runbook — Gerenciador de Vídeo (Swarm / Portainer / Traefik / GHCR)

Complementa `docs/runbook-deploy-e-incidentes.md` (mesmas regras: SHA completo, nunca `:latest` em branch).
Stack: `docker-compose.video.portainer.yml` (raiz). Variáveis: `services/video/.env.video.example`.
Plano e fases: `docs/video/PLANO-GERENCIADOR-VIDEO.md`. Métricas e alertas: `docs/video/OBSERVABILIDADE.md`.

> Estado: nada foi deployado nem criado em produção. Tudo abaixo é passo manual do operador.

## 1. Mapa

| Serviço Swarm (stack `video`) | Papel | Onde roda | Estado |
|---|---|---|---|
| `video_api` (2 réplicas) | API NestJS, HLS/chave/heartbeat | `node.role == worker` | stateless; Traefik `VIDEO_API_HOST` |
| `video_consolidator` | grava heartbeats do Redis no Postgres | `node.role == worker` | stateless |
| `video_worker` | transcode ffmpeg | nó `video-worker=true` | volume `worker_tmp` (/tmp, originais) |
| `video_migrate` | `prisma migrate deploy` (execução única) | `node.role == worker` | termina e fica "Complete" |
| `video_postgres` | banco dedicado (alias `video-postgres`) | nó `video-data=true` | volume `video_pgdata` |
| `video_redis` | fila + heartbeats (alias `video-redis`) | nó `video-data=true` | volume `video_redisdata` (AOF) |

Imagens: `ghcr.io/revisaoprojetos/plataforma_simulado-video-api:<SHA>` (api, consolidator e migrate usam a mesma) e
`...-video-worker:<SHA>`. Workflow: `.github/workflows/docker-publish-video.yml` (só dispara com mudança em `services/video/**`).

## 2. Primeiro deploy (uma vez)

1. **GHCR:** rodar o workflow (Actions > "Build e Push Video para GHCR") e deixar os 2 pacotes **públicos**.
2. **S3:** chave dedicada ao bucket `revisaopge-videos` (D1); aplicar CORS (`npm run s3:cors -w apps/api` com as credenciais) e a política de multipart abandonado (§6).
3. **DNS:** A `video-api.revisaopge.com.br` -> IP da VPS.
4. **Rótulos de nó** (no manager):
   ```bash
   docker node update --label-add video-worker=true <no-com-cpu>
   docker node update --label-add video-data=true   <no-dos-volumes>   # Postgres e Redis ficam fixos aqui
   ```
5. **Portainer > Stacks > Add stack** (nome `video`), colar `docker-compose.video.portainer.yml`, preencher as variáveis do `.env.video.example` (`VIDEO_TAG` = SHA completo).
   Sem `VIDEO_TAG`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `S3_*`, `JWT_*`, `CORS_ORIGINS` ou `METRICS_TOKEN` a stack **recusa subir** (mensagem aponta a variável).
6. Aguardar `video_postgres`/`video_redis` ficarem `healthy` e `video_migrate` concluir (`docker service logs video_migrate`). Se a API subiu antes da migration, ela se recupera sozinha no próximo healthcheck/reinício (`docker service update --force video_api`).
7. Criar o primeiro operador da plataforma (o seed não roda em produção):
   ```bash
   docker run --rm --network video_internal \
     -e DATABASE_URL="postgresql://video:<POSTGRES_PASSWORD>@video-postgres:5432/video" \
     -e PLATFORM_ADMIN_EMAIL=voce@revisaopge.com.br -e PLATFORM_ADMIN_PASSWORD='<senha longa e unica>' \
     ghcr.io/revisaoprojetos/plataforma_simulado-video-api:<SHA> \
     node_modules/.bin/tsx prisma/create-platform-admin.ts
   ```
   Depois: criar as empresas (`POST /v1/platform/tenants`), habilitar `accessEndpointEnabled` por empresa e emitir a chave de integração (passos 5 e 6 do plano).
8. **Validar:** `curl -fsS https://video-api.revisaopge.com.br/health` (`db`, `redis`, `s3` = `up`); `curl -i https://video-api.revisaopge.com.br/metrics` deve dar **403** (bloqueado na borda); idem `/mcp`.
   `docker service ls | grep video_` com tudo `n/n`; `docker service logs video_worker` com "worker pronto".

## 3. Deploy de nova versão (por SHA)

1. Push -> aguardar o workflow **verde** (typecheck + testes + 2 imagens).
2. `git rev-parse HEAD` -> **SHA completo (40 caracteres)**. SHA curto = imagem inexistente = serviço não sobe.
3. **Migrations primeiro** (aditivas por regra):
   ```bash
   docker service update --image ghcr.io/revisaoprojetos/plataforma_simulado-video-api:<SHA> --force video_migrate
   docker service logs -f video_migrate        # esperar "All migrations have been successfully applied"/"No pending migrations"
   ```
   Se falhar: **não** avançar. A versão atual continua atendendo (migrate não toca nos outros serviços). Corrigir e repetir.
4. Portainer > stack `video` > Environment variables: `VIDEO_TAG=<SHA>` > **Update the stack**. (Ou serviço a serviço: `docker service update --image ...:<SHA> video_api`, `video_consolidator`, `video_worker`.)
   - `api`/`consolidator`: `start-first` + rollback automático se a task nova não ficar saudável em 45 s.
   - `worker`: `stop-first`. O SIGTERM drena até `VIDEO_SHUTDOWN_DRAIN_MS` (2 min); o que sobrar tem o ffmpeg cancelado e o **job volta à fila sem gastar tentativa**, o vídeo volta para `queued` e é reprocessado do zero pelo worker novo.
5. Validar como no §2.8 e olhar `transcode_queue_jobs{state="failed"}` e `progress_events_queue_length`.

## 4. Rollback

- **Imagem:** repetir o passo 4 com o `VIDEO_TAG` anterior que funcionava. O Swarm também reverte sozinho (`failure_action: rollback`) quando a task nova não sobe.
- Manual imediato: `docker service rollback video_api` (idem `video_consolidator`, `video_worker`).
- **`:latest` = rollback para a main.** Só é atualizado na main; nunca usar de uma branch.
- **Migrations não voltam.** Como são aditivas, a versão anterior do código convive com o schema novo. Migration destrutiva exige "expandir e contrair" em dois deploys, ou restore (§6).
- **Rollback de produto (aula):** voltar o provedor da aula para YouTube/Vimeo (plano 5.4); não depende deste stack.

## 5. Rotação de segredos

Todos entram por variável de ambiente da stack (a API ainda não lê `*_FILE`). Atualizar no Portainer e **Update the stack**.

| Segredo | Efeito | Procedimento |
|---|---|---|
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | encerra todas as sessões (alunos recebem novo JWT na próxima abertura do player; operadores relogam) | trocar, atualizar stack; avisar operadores. Se vazou, fazer antes de qualquer outra coisa |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | sem impacto se feito na ordem certa | criar chave nova no Hetzner > atualizar stack > conferir `/health` e um upload > **revogar a antiga** |
| `METRICS_TOKEN` | Prometheus passa a receber 401 até atualizar | trocar na stack **e** no `credentials_file` do Prometheus no mesmo momento |
| `POSTGRES_PASSWORD` | exige alterar no banco e na stack | `docker exec -it $(docker ps -q -f name=video_postgres) psql -U video -c "ALTER USER video PASSWORD '<nova>'"` > atualizar `POSTGRES_PASSWORD` > update da stack (reinicia api/consolidator/worker/migrate). Janela curta de erro de conexão |
| `REDIS_PASSWORD` | idem | atualizar a variável e fazer update da stack (todos reiniciam juntos; a fila em AOF é mantida) |
| Chave de integração (`gvmcp_...`) | só o servidor Next usa | emitir nova (`POST /v1/me/mcp-tokens`, escopo `access:manage`) > atualizar `VIDEO_INTEGRATION_KEY` no `apps/web` > revogar a antiga |

Se uma credencial vazou: **revogar primeiro, reemitir depois**.

## 6. Backup, restore e lifecycle

**Backup diário** (`services/video/apps/api/scripts/backup-pg.sh`) no nó `video-data=true`:
```bash
sudo install -m 700 services/video/apps/api/scripts/backup-pg.sh /opt/video/backup-pg.sh
sudo install -m 700 services/video/apps/api/scripts/restore-test-pg.sh /opt/video/restore-test-pg.sh
sudo sh -c 'cat > /etc/video-backup.env' <<'EOF'   # chmod 600; chave de um bucket SEPARADO do de vídeos
BACKUP_S3_ENDPOINT=https://hel1.your-objectstorage.com
BACKUP_S3_BUCKET=revisaopge-videos-backup
BACKUP_S3_ACCESS_KEY=...
BACKUP_S3_SECRET_KEY=...
BACKUP_RETENTION_DAYS=14
EOF
echo '15 3 * * * root /opt/video/backup-pg.sh >> /var/log/video-backup.log 2>&1' | sudo tee /etc/cron.d/video-backup
```
O script faz `pg_dump -Fc`, valida com `pg_restore --list`, envia para `s3://<bucket>/pg/video-<UTC>.dump` e apaga os mais velhos que `BACKUP_RETENTION_DAYS`.
Alerta de backup: conferir `tail /var/log/video-backup.log` diariamente nas primeiras semanas; ideal: monitor externo (healthchecks.io) chamado no fim do script.

**Teste de restauração (mensal e após mudar o backup):** `/opt/video/restore-test-pg.sh [video-<UTC>.dump]` restaura num Postgres **descartável**, exige tabelas e `_prisma_migrations` e lista as maiores tabelas. Não toca na produção.

**Restore real (desastre):**
1. `docker service scale video_api=0 video_consolidator=0 video_worker=0`
2. Baixar o dump (`aws s3 cp ... --endpoint-url ...`) e restaurar: `docker exec -i $(docker ps -q -f name=video_postgres) pg_restore -U video -d video --clean --if-exists --no-owner < video-<UTC>.dump`
3. `docker service update --force video_migrate` (garante o schema), depois escalar de volta (2 / 1 / 1).
4. Perde-se o que foi gravado desde o dump (no máx. 24 h de progresso de alunos e metadados). Os vídeos estão no S3, não no banco.

**Lifecycle do S3** (multipart abandonado e retenção do bucket de backup). Verificar antes se o Hetzner aceita lifecycle no seu projeto:
```bash
aws --endpoint-url https://hel1.your-objectstorage.com s3api put-bucket-lifecycle-configuration \
  --bucket revisaopge-videos --lifecycle-configuration file://services/video/apps/api/scripts/s3-lifecycle-videos.json
aws --endpoint-url https://hel1.your-objectstorage.com s3api put-bucket-lifecycle-configuration \
  --bucket revisaopge-videos-backup --lifecycle-configuration file://services/video/apps/api/scripts/s3-lifecycle-backup.json
```
Se não suportar, o job de expiração da Fase 1.12 e `npm run s3:audit -w apps/api` cobrem os multiparts.
Vídeos: ativar versionamento/replicação no provedor conforme a política da empresa (o bucket é a única cópia dos originais).

## 7. Reprocessar vídeo

- Pela API (preferido): `POST /v1/videos/:id/reprocess` (estados `uploaded`, `failed` ou `ready`) com JWT de admin/professor da empresa. O job é idempotente (apaga a saída anterior e regera tudo).
- Falha definitiva (`failed`): ler `error` no vídeo. Causas comuns: "arquivo inválido" (ffprobe), "excedeu o tempo limite" (`JOB_TIMEOUT_MS`), "não cabe na pasta de trabalho" (original maior que o disco do nó do worker).
- Vídeo preso em `processing` sem job ativo (worker morto à força e job perdido): conferir `transcode_queue_jobs{state="active"}`; se 0 e passaram >15 min:
  ```sql
  UPDATE videos SET status = 'uploaded', error = NULL WHERE id = '<id>' AND status = 'processing';
  ```
  e então `POST /v1/videos/:id/reprocess`. (Executar no Postgres do vídeo, `docker exec -it $(docker ps -q -f name=video_postgres) psql -U video`.)

## 8. Incidentes

| Sintoma | Diagnóstico | Ação |
|---|---|---|
| API 404 do Traefik | imagem inexistente (SHA curto/CI não terminou) ou DNS/label | `docker service ps video_api --no-trunc`; refazer com SHA completo ou rollback (§4) |
| API não sobe: "Configuração insegura/inválida" | `docker service logs video_api` lista o motivo (segredo fraco, JWT iguais, CORS localhost, variável faltando) | corrigir variável e update da stack |
| Playback/CORS bloqueado | `CORS_ORIGINS` e `allowedDomains` da empresa (Fase 1.9) sem o domínio do tenant | adicionar o domínio e atualizar |
| Todos com o mesmo IP/limite de login | `TRUST_PROXY` | deve ser `1` (Traefik); ver IP nos logs |
| `ConsolidadorAtrasado` | `progress_events_queue_length` crescendo | `docker service logs video_consolidator`; escalar `VIDEO_CONSOLIDATOR_REPLICAS=2`; checar CPU do Postgres. Acima de 500.000 eventos a API descarta novos heartbeats (`heartbeats_total{result="queue_full"}`) |
| Fila de transcode parada | `transcode_queue_jobs{state="waiting"}>0` e `transcode_jobs_active=0` | `docker service ps video_worker` (rótulo `video-worker=true` no nó? task Pending?); `docker service logs video_worker` |
| Worker reinicia em loop / OOM | `docker service ps video_worker`, memória | reduzir `WORKER_CONCURRENCY`/`FFMPEG_THREADS`, subir `VIDEO_WORKER_MEMORY` |
| Disco do worker cheio | `transcode_workdir_free_bytes` baixo; erro "sem espaço livre em /tmp" (job tenta de novo com backoff) | `docker exec` no worker: `du -sh /tmp/video-*`; pastas órfãs com mais de `JOB_TIMEOUT_MS+10min` são limpas no boot; senão `docker volume rm` do `worker_tmp` com o serviço parado, ou aumentar o disco |
| Redis cheio (`OOM command not allowed`) | `noeviction` + `maxmemory` | investigar `progress:events` (consolidador parado?); subir `VIDEO_REDIS_MAXMEMORY` |
| Postgres sem conexões | `max_connections=200` | reduzir réplicas da API ou subir o limite (e a RAM) |
| Deploy do worker "perdeu" vídeos | não perde: `requeued` em `transcode_jobs_total` | conferir que voltaram a `queued` e foram processados |
| Disco do nó `video-data` cheio | volumes do Postgres/Redis | limpar logs, `VACUUM`, ampliar disco; restore só se corrompeu |

Logs: `docker service logs -f --tail 200 video_<serviço>` (JSON; cada linha da API tem `req.id` = `X-Correlation-Id`).

## 9. Pendências conhecidas (para o operador / outros agentes)

1. **`*_FILE` na API:** só o worker lê `DATABASE_URL_FILE`, `REDIS_URL_FILE`, `S3_ACCESS_KEY_FILE`, `S3_SECRET_KEY_FILE`, `METRICS_TOKEN_FILE`. A API (`services/video/apps/api/src/config/env.ts`) deve ganhar o mesmo (espelhar `applyFileSecrets` do worker) para migrar a Docker secrets; até lá os segredos ficam como env da stack (visíveis a quem lê a stack no Portainer).
2. **`DIRECT_URL`:** a stack já injeta `DIRECT_URL` (igual a `DATABASE_URL`) para quando a Fase 1.11 adicionar `directUrl` ao schema.
3. **Healthcheck da API** usa `/health/live` (não depende de banco). Considerar o readiness (`/health`) como gate do rollout depois que as migrations forem automáticas.
4. **Lifecycle do S3** depende de suporte do provedor (§6).
5. **CDN** (D2) só após medir egress na Fase 5.
6. Opcional: Prometheus/Alertmanager ainda precisam ser provisionados (ver `OBSERVABILIDADE.md`).
