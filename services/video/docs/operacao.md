# Operação

Índice: [Desenvolvimento](#desenvolvimento) · [Variáveis](#variáveis) · [Produção](#produção) · [Monitoramento](#monitoramento) · [Teste de carga](#teste-de-carga) · [LGPD](#lgpd-atendendo-o-titular) · [Runbook](#runbook) · [Bucket e CORS](#bucket-e-cors)

## Desenvolvimento

```bash
cp .env.example .env        # preencher S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY (nunca commitar)
docker compose up -d --build
npm run db:migrate          # migrations Prisma
npm run db:seed             # usuários e curso de exemplo
npm run smoke:s3            # valida put/get/presigned/multipart/CORS no bucket
```

Portas no host (todas em 127.0.0.1, escolhidas para não colidir com outros projetos locais): API **3010**, Postgres **5441**, Redis **6380**. Swagger em `http://localhost:3010/docs`, saúde em `http://localhost:3010/health`.
Para rodar comandos do host (Prisma, seed, smoke) o `.env` deve usar `DATABASE_URL=...@localhost:5441/video` e `REDIS_URL=redis://localhost:6380`; dentro do compose a API recebe `postgres:5432` e `redis:6379` automaticamente. No compose de desenvolvimento a API roda com `NODE_ENV=development` (a imagem é `production`) para liberar CORS em localhost e o Swagger.

### Dados de desenvolvimento
`npm run db:seed` (idempotente) cria o `platform_admin` (`plataforma@exemplo.local`) e, para as empresas `empresa-a` e `empresa-b`, um `admin@`, `professor@` e `aluno@` em cada uma (ex.: `admin@empresa-a.local`; senha `dev12345` ou `SEED_PASSWORD`), um curso publicado e a matrícula do aluno. Nunca roda com `NODE_ENV=production`.

### Testes
- `npm test`: unitários (sem infraestrutura).
- `npm run test:e2e`: sobe a API em memória contra o Postgres/Redis do compose (`docker compose up -d postgres redis`). Usa o banco **`video_test`** (criado e migrado automaticamente) e o **Redis db 15**, para nunca tocar nos dados de desenvolvimento nem competir com o consolidador da stack em execução (que lê a fila do db 0). O limite de requisições fica desligado nos testes, exceto em `security.e2e-spec`.
- `npm run test:browser -w apps/player`: Playwright no Edge instalado (precisa da stack no ar e de um vídeo pronto).

### Tela de desenvolvimento: listar, enviar e assistir
```bash
docker compose up -d --build        # api (:3010), worker, postgres, redis
npm run dev -w apps/player          # http://localhost:5173
```
Entre com `professor@empresa-a.local` / `dev12345` (empresa `empresa-a`) e abra **Biblioteca de vídeos** (`#/library`). Crie uma aula, escolha o arquivo (há um exemplo em `apps/player/e2e/fixtures/teste-20s.mp4`), acompanhe "Enviando → Na fila → Processando → Pronto" e clique em **▶ Assistir**. O envio vai direto ao S3; o CORS do bucket já libera `http://localhost:5173`. Swagger (só fora de produção): <http://localhost:3010/docs> (também há o link "Swagger" no cabeçalho do player em `npm run dev`; use **Authorize** com o `accessToken` do login). Em produção o Swagger fica desligado (`SWAGGER_ENABLED`), e a biblioteca é uma tela de referência, não um painel administrativo pronto.

### Enviar um vídeo de teste (ponta a ponta, S3 real)
```bash
docker compose up -d --build api worker
npm run upload:sample -w apps/api -- caminho/video.mp4 [--lesson <id>]
```
Faz login (padrão: `professor@empresa-a.local`), envia as partes direto ao S3, finaliza e acompanha o worker até `ready`. Variáveis opcionais: `API_URL`, `TENANT`, `EMAIL`, `PASSWORD`. Worker: `docker compose logs -f worker`.

### Testar o playback na mão
O playback de empresa com `allowedDomains` exige o cabeçalho `Origin` (o seed usa `localhost:5173`):
```bash
curl -X POST localhost:3010/v1/lessons/<aula>/playback -H "authorization: Bearer <jwt>" -H "Origin: http://localhost:5173" -H "content-type: application/json" -d "{}"
ffplay "http://localhost:3010<manifestUrl>"   # toca só pela API
```
Sessões abertas contam no limite de telas por 10 min; encerre com `POST /v1/playback/end`.

### Player de referência
```bash
npm run dev -w apps/player     # http://localhost:5173  (login: empresa-a · aluno@empresa-a.local · dev12345)
```
A porta **5173 é fixa**: é a origem liberada no CORS da API (`CORS_ORIGINS`) e em `allowedDomains` das empresas do seed. `VITE_API_URL` muda a URL da API (padrão `http://localhost:3010`). O teste de navegador cria um aluno novo a cada execução e usa o Edge porque o Chromium embutido do Playwright não decodifica H.264/AAC.

### Fila de progresso (Redis)
Chaves: `progress:events` (lista de heartbeats a consolidar), `hb:{sessionId}` (último heartbeat), `pm:{sessionId}` (duração em cache), `ps:{userId}` (sessões de reprodução), `rl:{política}:{chave}` (contadores de limite). Se `progress_events_queue_length` só cresce, o consolidador está falhando — veja os logs (`ProgressConsolidator`). Teto de 500.000 eventos; acima disso novos heartbeats são descartados (e contados em `heartbeats_total{result="queue_full"}`).

## Variáveis

| Variável | Padrão | Descrição |
|---|---|---|
| `NODE_ENV` | `development` | `production` ativa a recusa de configuração insegura |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` | — | `https://hel1.your-objectstorage.com` · `hel1` · `revisaopge-videos` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | — | credenciais (prefira chave restrita ao bucket) |
| `S3_FORCE_PATH_STYLE` | `false` | `true` para MinIO |
| `DATABASE_URL` / `REDIS_URL` | — | em produção o compose monta a partir de `POSTGRES_PASSWORD`/`REDIS_PASSWORD` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | — | 32+ caracteres, **diferentes** entre si |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | `15m` / `7d` | |
| `PLAYBACK_TOKEN_TTL` / `HLS_SEGMENT_URL_TTL` | `5m` / `1h` | token de playback e URLs assinadas de segmento/poster |
| `MAX_CONCURRENT_STREAMS` | `2` | telas simultâneas por aluno |
| `MAX_UPLOAD_BYTES` | 10 GiB | por vídeo |
| `CORS_ORIGINS` | `http://localhost:5173` | origens do front, separadas por vírgula (localhost é recusado em produção) |
| `RATE_LIMIT_ENABLED` | `true` | recusado como `false` em produção |
| `TRUST_PROXY` | `0` | nº de proxies reversos à frente da API |
| `LOG_LEVEL` | `info` | `fatal…trace`, `silent` |
| `METRICS_TOKEN` | — | Bearer para `/metrics` (16+ caracteres); vazio = `/metrics` responde 404 |
| `SWAGGER_ENABLED` | ligado fora de produção | `/docs` |
| `PROGRESS_FLUSH_INTERVAL_MS` | `5000` | timer de consolidação dentro da API; **`0` quando há o serviço `consolidator`** |
| `CONSOLIDATOR_PORT` | `9102` | `/health` e `/metrics` do consolidador |
| `WORKER_CONCURRENCY` | `1` | vídeos em paralelo por worker (CPU-bound) |
| `FFMPEG_PRESET` / `FFMPEG_TIMEOUT_MS` | `veryfast` / 2 h | |
| `METRICS_PORT` | `9100` | `/health` e `/metrics` do worker |

## Produção

### Visão geral
> **A aplicação web (`apps/player`) é só de desenvolvimento e não faz parte do deploy.** Ela é a referência de como um front consome a API (login, player, biblioteca, analytics, tela do aluno) e serve para testar tudo na mão. Nada dela vai para a produção: o `docker-compose.prod.yml` não a tem, o CI não a empacota e o `.dockerignore` a exclui das imagens. Quando houver um front de produção, ele será um site à parte (outro domínio, liberado em `CORS_ORIGINS` e em `allowedDomains` de cada empresa).

`docker-compose.prod.yml` sobe: `postgres` · `redis` (senha, `appendonly`, `noeviction`) · `migrate` (aplica as migrations e termina) · `api` · `consolidator` · `worker`. Só a `api` publica porta (`API_BIND`, padrão `127.0.0.1:3000`); o TLS fica num proxy reverso à frente. Containers rodam como usuário não-root, sem capabilities, com sistema de arquivos somente leitura e `no-new-privileges`.

### Primeiro deploy
1. Servidor com Docker 24+ / Compose v2 e DNS apontando para ele.
2. `cp .env.prod.example .env.prod` e preencha (gere segredos com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Use senhas só com letras e números (entram em URLs de conexão). `.env.prod` fica fora do git.
3. Libere a origem do front no CORS do bucket (ver [Bucket e CORS](#bucket-e-cors)).
4. Suba: `docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build`. Se faltar variável obrigatória o compose para com uma mensagem; se a configuração for insegura a API se recusa a iniciar (veja `docker compose logs api`).
5. Crie o primeiro operador (o seed não roda em produção):
   ```bash
   docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm --no-deps -T \
     -e PLATFORM_ADMIN_EMAIL=voce@suaempresa.com -e PLATFORM_ADMIN_PASSWORD='uma-senha-longa-e-unica' \
     --entrypoint "" migrate npx tsx prisma/create-platform-admin.ts
   ```
   É idempotente e não imprime a senha. Faça login em `POST /v1/auth/login` **sem** `tenant` e cadastre as empresas com `POST /v1/platform/tenants`.
6. Confira: `curl localhost:3000/health` (`db`, `redis`, `s3` = `up`) e `docker compose ... ps` (tudo `healthy`).

### Proxy reverso com TLS (exemplo Caddy)
```caddyfile
api.suaempresa.com {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000
}
```
Com um proxy à frente, `TRUST_PROXY=1`. **Teste no primeiro deploy**: o IP que aparece nos logs deve ser o do cliente, não o do proxy (senão todos dividem o mesmo limite de login). O upload de vídeo vai direto ao S3, sem passar pelo proxy.

### Atualizar e voltar atrás
- **Atualizar:** faça backup (abaixo), `git pull`, `docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build`. A etapa `migrate` roda antes da API e do worker; se falhar, eles não sobem e a versão anterior continua atendendo.
- **Voltar:** `git checkout <tag anterior>` e o mesmo `up -d --build`. Migrations são só para frente: voltar o código é seguro para migrations aditivas (a regra do projeto); para uma migration destrutiva, planeje "expandir e contrair" em dois deploys, ou restaure o backup.

### Backup e restauração
```bash
# diário (cron): banco
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U video -Fc video > /backups/video-$(date +%F).dump
# restaurar (em banco vazio ou com --clean)
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U video -d video --clean --if-exists < /backups/video-2026-10-26.dump
```
Guarde cópias fora do servidor e **teste a restauração** periodicamente. O Redis tem `appendonly` (a fila de transcode sobrevive a reinícios); perder heartbeats pendentes custa segundos de histórico, não dados de aulas. Vídeos: ative versionamento/replicação no provedor de S3 conforme a política da empresa.

### Escala
- **API:** sem estado; rode N réplicas atrás do proxy (balanceamento por DNS do serviço `api`). Cada réplica abre um pool de conexões ao Postgres (confira `max_connections`).
- **Consolidador:** 1 réplica comporta milhares de eventos/s; mais réplicas são seguras (travas por aluno/aula).
- **Worker:** `docker compose ... up -d --scale worker=N` e/ou `WORKER_CONCURRENCY`; é limitado por CPU e usa disco em `/tmp` (volume `worker-tmp`: espaço para os originais).
- **Postgres/Redis:** vertical. Mantenha `noeviction` no Redis.

### Segredos
Rotacionar `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` encerra as sessões de login (tokens existentes deixam de valer) — avise os usuários. Chaves S3: crie a nova, atualize `.env.prod`, `up -d`, revogue a antiga. Se uma chave vazou: revogue primeiro, depois reemita.

## Monitoramento

Métricas (Bearer `METRICS_TOKEN`): API `:3000/metrics`, worker `:9100/metrics`, consolidador `:9102/metrics` (as duas últimas só na rede interna).

```yaml
# prometheus.yml (trecho)
scrape_configs:
  - job_name: video-api
    metrics_path: /metrics
    authorization: { credentials_file: /etc/prometheus/video_metrics_token }
    static_configs: [{ targets: ['api:3000'] }]
  - job_name: video-worker
    authorization: { credentials_file: /etc/prometheus/video_metrics_token }
    static_configs: [{ targets: ['worker:9100'] }]
  - job_name: video-consolidator
    authorization: { credentials_file: /etc/prometheus/video_metrics_token }
    static_configs: [{ targets: ['consolidator:9102'] }]
```

| Métrica | O que mostra |
|---|---|
| `http_request_duration_seconds{method,route,status}` | latência por rota (padrão da rota, sem ids); varreduras de URL aparecem em `/v1/*` |
| `heartbeats_total{result}` | `accepted`, `ignored` (duplicado/fora de ordem), `too_fast`, `queue_full` |
| `progress_events_queue_length` | heartbeats esperando consolidação |
| `progress_events_consolidated_total`, `progress_consolidation_duration_seconds`, `progress_consolidation_failures_total` | saúde do consolidador |
| `transcode_queue_jobs{state}` | fila de transcode (da API: segue visível mesmo com o worker parado) |
| `transcode_jobs_total{status}`, `transcode_duration_seconds`, `transcode_jobs_active` | worker |
| `playback_sessions_started_total`, `rate_limited_total{policy}` | uso e abuso |
| `process_*`, `nodejs_*` | CPU, memória, atraso do event loop, GC |

Alertas sugeridos:
```yaml
- alert: ConsolidadorAtrasado
  expr: progress_events_queue_length > 20000
  for: 5m
- alert: ConsolidadorFalhando
  expr: increase(progress_consolidation_failures_total[10m]) > 0
- alert: HeartbeatLento
  expr: histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{route="/v1/progress/heartbeat"}[5m])) by (le)) > 0.1
  for: 10m
- alert: ErrosNaAPI
  expr: sum(rate(http_request_duration_seconds_count{status=~"5.."}[5m])) / sum(rate(http_request_duration_seconds_count[5m])) > 0.01
  for: 5m
- alert: TranscodeComFalhas
  expr: transcode_queue_jobs{state="failed"} > 0
- alert: TranscodeParado
  expr: transcode_queue_jobs{state="waiting"} > 0 and transcode_jobs_active == 0
  for: 30m
- alert: ForcaBrutaNoLogin
  expr: sum(rate(rate_limited_total{policy=~"login.*"}[10m])) > 1
```
Logs: JSON no stdout (`docker compose logs -f api`); cada linha tem `req.id` = `X-Correlation-Id`. Para investigar um erro de usuário, peça o `correlationId` da resposta e filtre por ele.

## MCP (agentes de IA)
- Endpoint `POST /mcp` na mesma API; o proxy deve repassar `Authorization` e `Accept`. Cada usuário cria o próprio token em `POST /v1/me/mcp-tokens` (ver [mcp.md](mcp.md#como-obter-e-usar-um-token)).
- **Revogar com urgência:** o usuário faz `DELETE /v1/me/mcp-tokens/:id`; o operador pode suspender a empresa ou, no banco, `UPDATE api_tokens SET revoked_at = now() WHERE user_id = '…'`. Vale na próxima chamada (não há cache).
- **Auditar:** `SELECT at, tool, ok, token_id FROM audit_log WHERE tenant_id = '…' AND actor_id = '…' ORDER BY at DESC LIMIT 100;`. A tabela só cresce: arquive/apague linhas antigas conforme a política da empresa (ex.: `DELETE FROM audit_log WHERE at < now() - interval '1 year'`).
- **Sintomas:** `429` no MCP = passou de 120 chamadas/min no token; `401` = token inválido/revogado/expirado, usuário excluído ou empresa suspensa (o cliente não distingue o motivo de propósito).

## API de integração (matrícula e sessão do aluno)
Recurso **opcional**, desligado por padrão. Para usar com o seu sistema de origem:
1. No ambiente da API: `ACCESS_ENDPOINT_ENABLED=true` (e reinicie). Sem isso as rotas respondem 404.
2. O operador habilita a empresa: `PATCH /v1/platform/tenants/:id` com `{"accessEndpointEnabled": true}`.
3. O admin da empresa cria a chave: `POST /v1/me/mcp-tokens` com `{"name":"área de membros","scopes":["access:manage"],"expiresInDays":365}`. Guarde o valor `gvmcp_…` (aparece uma vez) **no servidor** do sistema de origem.
4. O sistema de origem chama `POST /v1/access/enrollments` quando o aluno compra/entra (com `externalRef` = id do pedido, para ser repetível), `…/revoke` ao cancelar/reembolsar e `POST /v1/access/sessions` quando o aluno abrir a área de aulas.
5. Se o navegador do aluno falar direto com esta API (usando o `accessToken` da sessão), libere o domínio do front em `CORS_ORIGINS` e nos `allowedDomains` da empresa; se só o servidor do sistema de origem chamar, nada disso é preciso.
- **Cortar a integração:** revogue a chave (`DELETE /v1/me/mcp-tokens/:id`), desabilite a empresa ou desligue `ACCESS_ENDPOINT_ENABLED`; vale na próxima chamada. As matrículas e o histórico ficam.
- **Auditar:** `SELECT at, tool, ok, detail FROM audit_log WHERE via = 'access-api' AND tenant_id = '…' ORDER BY at DESC LIMIT 100;`.
- **Sintomas:** `404` em tudo = trava global ou da empresa desligada; `401` = chave inválida/revogada/sem `access:manage`; `409` = `externalId` ou `externalRef` já usados por outro; `422` = o e-mail é de professor/admin; `429` = passou de 600 chamadas/min na chave.

## Teste de carga

Meta (RNF10): **≥ 1.000 heartbeats/s com p95 < 100 ms em uma instância da API.** Cada sessão de teste envia 1 heartbeat por segundo (10× mais que um player real, que envia a cada ~10 s): 1.000 sessões ≈ 10.000 alunos assistindo ao mesmo tempo.

```bash
docker compose -f docker-compose.yml -f docker-compose.load.yml up -d --build api consolidator
sh load/run.sh 1000 60s 25      # sessões, duração, alunos de teste
docker exec -i gerenciador_video-postgres-1 psql -U video -d video < load/cleanup.sql   # remove os alunos "load-N"
```
O `docker-compose.load.yml` (só para teste) libera muitas telas por aluno, confia no `X-Forwarded-For` (o k6 simula um IP por aluno, senão o limite de login por IP barraria o setup) e roda o consolidador em processo próprio. Requer um vídeo pronto na `empresa-a` (`upload:sample`) e o seed.

**Resultado (máquina de desenvolvimento, Docker Desktop, 1 instância da API, k6 no mesmo host):**

| | **1.000 sessões** | 1.500 sessões | 2.000 sessões |
|---|---|---|---|
| Vazão sustentada | ~1.000 hb/s | ~1.400 hb/s | ~1.480 hb/s (não acompanha o pedido) |
| Erros | 0% | 0% | 0% |
| Servidor p50 / p95 / p99 | 3,6 / **36** / 99 ms | 8,8 / 204 / 429 ms | 314 / 927 / 999 ms |
| Servidor ≤ 100 ms | 99,0% | 91,7% | 27,4% |
| Cliente (k6) p95 | **67 ms** | 446 ms | 1,49 s |
| CPU da API (amostrado) | 70–85% de um núcleo | não amostrado | não amostrado |
| Fila de progresso ao parar → 15 s depois | 216 → 0 | 0 → 0 | 1.279 → 0 |

**Conclusão de capacidade:** a meta é atendida com folga a 1.000 hb/s. O "joelho" de **uma réplica** da API fica entre 1.000 e 1.500 hb/s (o processo Node, de uma só thread, satura; nenhum erro, mas a latência explode e a vazão deixa de acompanhar). **Planeje ≤ ~1.000 hb/s por réplica** e escale a API horizontalmente: como um aluno real envia 1 heartbeat a cada ~10 s, isso equivale a **~10.000 alunos assistindo simultaneamente por réplica**. O consolidador (1 réplica) drenou a fila nos três pontos.

Como ler: "servidor" vem do histograma `http_request_duration_seconds` (sem ruído do gerador); "cliente" é o que o k6 mede (inclui rede do Docker e a CPU do próprio k6). Foi o teste que mostrou que a primeira versão **não** atingia a meta (p95 de 559 ms e consolidação 4× mais lenta que a chegada), o que levou à reescrita descrita no [ADR 0004](adr/0004-endurecimento-e-capacidade.md). Rode de novo após qualquer mudança no caminho do heartbeat e compare.

## LGPD: atendendo o titular

1. **Identifique** o usuário (empresa + e-mail) e a empresa controladora dos dados; o pedido é dela, a plataforma é operadora.
2. **Cópia dos dados:** o próprio titular usa `GET /v1/me/data-export`; ou um admin da empresa, `GET /v1/users/:id/data-export`. Entregue o JSON por canal seguro.
3. **Eliminação:** o titular usa `DELETE /v1/me` (confirma a senha) ou o admin usa `DELETE /v1/users/:id?mode=anonymize` (padrão: remove a identidade e mantém estatísticas sem identificação) ou `?mode=erase` (apaga também o histórico). Se der 409, transfira os cursos que a pessoa possui ou crie outro administrador antes.
4. **Registre**: a remoção gera o log `lgpd.removal` (sem dados pessoais) com o `correlationId`; guarde-o como evidência.
5. **Retenção do histórico** (se a empresa definir um prazo): `DELETE FROM watch_sessions WHERE tenant_id = '<id>' AND started_at < now() - interval '24 months';` e, se for o caso, o mesmo para `watch_ranges`/`lesson_progress` (agende por cron com backup antes).

## Runbook

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `/health` 503 | `db`, `redis` ou `s3` = `down` no corpo | Ver o serviço indicado; `docker compose ps`; credenciais/rede do S3 |
| Container `api` unhealthy | processo travado (liveness `/health/live` falha) | `docker compose logs api`; `up -d --force-recreate api` |
| Deploy não sobe, `migrate` com erro | migration falhou ou banco inacessível | `docker compose logs migrate`; a versão anterior segue no ar; corrigir e repetir |
| API se recusa a iniciar | configuração insegura/ausente | a mensagem lista cada problema (segredo curto, CORS localhost…) |
| Vídeo preso em `processing` | worker caiu no meio | logs do worker; `POST /v1/videos/:id/reprocess` |
| Vídeo `failed` | arquivo inválido ou erro do FFmpeg | campo `error` do vídeo; reenviar o original |
| `transcode_queue_jobs{waiting}` crescendo | worker parado/lento | subir/escalar o worker; checar CPU e disco de `/tmp` |
| `progress_events_queue_length` crescendo | consolidador parado ou falhando | logs do `consolidator`; Postgres lento; subir mais uma réplica |
| Alunos veem 429 em massa | IP do proxy sendo contado como um só | conferir `TRUST_PROXY` e o IP nos logs |
| Usuário "travado" no login (429) | 8 erros em 15 min na conta | espera até o `Retry-After`, ou destrave: `redis-cli DEL "rl:loginAccount:<empresa>\|<email>"` |
| Playback 403 | sem matrícula, domínio não autorizado (falta `Origin`), empresa suspensa | conferir `allowedDomains` da empresa e a matrícula |
| Playback 409 "limite de sessões" | aluno com telas abertas | aguardar ~10 min ou o player chamar `playback/end`; ajustar `MAX_CONCURRENT_STREAMS` |
| Upload falha no navegador | CORS do bucket sem a origem do front | `npm run s3:cors` (abaixo) |
| Muitos 401 depois de trocar segredos JWT | esperado: tokens antigos invalidados | usuários entram de novo |
| Imagem de player não carrega/CSP | cabeçalho da API em recurso errado | a API só serve JSON; hospede o front em outro domínio |

## Bucket e CORS

- Bucket da aplicação: **`revisaopge-videos`** (privado, região `hel1`). Os demais buckets da conta (`revisaopge-*` do sistema PGE, `netflix`) **não pertencem a este projeto — não ler nem escrever neles**.
- CORS atual: origens `http://localhost:5173` e `http://localhost:3000`; métodos `GET, PUT, HEAD`; expõe `ETag` (necessário no multipart). **Ao definir o domínio de produção, adicione a origem**:
  ```bash
  npm run s3:cors -w apps/api -- https://cursos.suaempresa.com http://localhost:5173 --dry-run   # só mostra
  npm run s3:cors -w apps/api -- https://cursos.suaempresa.com http://localhost:5173             # aplica (substitui as regras)
  ```
- A credencial atual enxerga todos os buckets do projeto Hetzner (chaves são por projeto, não por bucket). Ver [limites do isolamento](seguranca.md#limites-do-isolamento-do-bucket-hetzner). Use uma chave por sistema; o isolamento real é um projeto separado só para vídeos.
- **Auditoria de integridade** (somente leitura, sem custo relevante): `npm run s3:audit -w apps/api`. Compara o bucket com o banco e sai com código 1 se achar objeto desconhecido, empresa desconhecida, legenda órfã ou vídeo `ready` sem `master.m3u8`/`key.bin`; também avisa se o bucket tem ACL pública ou se a chave enxerga outros buckets (aviso, não falha). Agende (cron/CI) e alerte no código ≠ 0. **Não detecta leituras**: o Hetzner não tem log de acesso.
- `npm run smoke:s3` valida acesso, put/get, URL assinada, multipart e CORS.
