# Gerenciador de Vídeo — plano de integração à produção

Origem: `gerenciador-video-main.zip` (NestJS + Prisma + Redis/BullMQ + FFmpeg + S3 Hetzner). Código importado em
`services/video/` (FORA do workspace pnpm: `pnpm-workspace.yaml` só lista `apps/*` e `packages/*`, então o
lockfile do monorepo NÃO é afetado; o serviço usa npm e tem o próprio `package-lock.json`).

Status: nada commitado, nada deployado, nenhum bucket/serviço criado. Regras do projeto: sem commit/push/imagem
automáticos; tudo que toca produção é passo manual do operador (seção "Passos manuais").

## Arquitetura alvo (opção A — serviço separado)

```
Aluno (iframe Curseduca) ─► simulado.revisaopge.com.br (Next, apps/web)
                              ├─ rota API  /api/aluno/video/*   (server-side; chave de integração NUNCA vai ao browser)
                              │     └─► video-api  POST /v1/access/sessions → JWT 15 min do aluno
                              └─ player React (hls.js) ─► video-api (HLS manifest/chave/heartbeat, Bearer + token de playback)
                                                          └─► segmentos direto do S3 Hetzner (URL assinada)
Estúdio (admin) ─► apps/web (rotas API server-side) ─► video-api (upload multipart, status, analytics)
Regras de liberação (Guru/Curseduca) ─► job nosso ─► video-api POST /v1/access/enrollments|revoke
Swarm: video-api (N réplicas) · video-consolidator · video-worker (nó com CPU) · video-postgres · video-redis · video-migrate (job)
```

Decisões estruturais: Postgres e Redis DEDICADOS ao serviço (heartbeats não vão ao Supabase — egress); 1 "empresa"
(tenant) do serviço por plataforma (tenant) nossa; MCP desligado; integração de acesso ligada (trava dupla).

## Fase 0 — Decisões e preparação (feito neste repositório)

| # | Decisão | Padrão adotado (reversível) | Depende do operador? |
|---|---|---|---|
| D1 | Bucket/credencial | Bucket `revisaopge-videos`, **chave S3 dedicada** (idealmente projeto Hetzner só de vídeo) | SIM — criar chave/projeto no console |
| D2 | CDN | Sem CDN no início; medir egress/aluno-hora na Fase 5; só então Bunny/Cloudflare | decidir após medição |
| D3 | Domínio da API | `video-api.revisaopge.com.br` (A + Traefik + certresolver) | SIM — DNS |
| D4 | MCP | **Desligado** (rota existe mas sem tokens; bloquear no Traefik) | não |
| D5 | Banco/Redis | Containers dedicados no Swarm com volume; backup diário do dump | SIM — volumes/nó |
| D6 | Mapeamento de tenants | `simulado_tenants.id` ↔ empresa do serviço (slug = slug do tenant) | criar empresas via platform admin |
| D7 | Autenticação do aluno | Servidor Next chama `/access/sessions` (JWT 15 min, sem refresh) e entrega ao player | não |
| D8 | Anti-fraude de progresso | Conclusão = prova fraca; NÃO usar para certificado sem regra extra | não |

Entregáveis da Fase 0: este documento, `services/video/` importado, `.env.example` de produção revisado (Fase 2),
inventário de riscos (auditoria no chat), lista de passos manuais (fim deste arquivo).

## Fase 1 — Endurecer o serviço (`services/video/apps/api`, `prisma/`)

| Id | Tarefa | Ref. |
|---|---|---|
| 1.1 | Matrícula integrada **não pode zerar prazo/reativar** quando chamada sem datas e sem `externalRef`: sem datas => manter janela existente; reativar só com `reactivate:true` explícito | `access-integration.service.ts:76-98`, `courses.service.ts:116` |
| 1.2 | `unenroll` manual vira revogação suave (`revokedAt`), não DELETE | `courses.service.ts:123` |
| 1.3 | `sessionId` gerado NO SERVIDOR (ignorar o do cliente) | `playback.controller.ts:29`, `session.store.ts` |
| 1.4 | `TRUST_PROXY` obrigatório em produção (falha de boot se 0 e `TRUST_PROXY_REQUIRED=true`); default doc = 1 | `env.ts`, `app.setup.ts` |
| 1.5 | Revogação imediata: guard JWT confere (cache curto 15–30 s no Redis) usuário ativo/empresa ativa; trocar senha/desativar revoga refresh e `ps:` | `guards.ts`, `users.service.ts` |
| 1.6 | Remover `flush()` das rotas de leitura; consistência eventual ≤ 5 s (exceto `?consistent=1` no player) | `progress.service.ts:23`, `analytics.service.ts:50` |
| 1.7 | Paginação/limites nos relatórios e `listEnrollments`; teto de linhas; cache Redis (TTL 60 s) nos relatórios por aula/curso | `analytics.service.ts:394-420`, `courses.service.ts:96` |
| 1.8 | Analytics: filtrar só `role=aluno` e matrícula vigente; `student` respeita janela | `analytics.service.ts` |
| 1.9 | CORS/`allowedDomains` dinâmicos por empresa (multi-domínio dos nossos tenants), com cache; vazio em produção = negar | `app.setup.ts`, `origin.ts` |
| 1.10 | Cache do `readyVideo` no HLS (TTL curto) — evita 1 query por segmento/manifest | `playback.service.ts` |
| 1.11 | Prisma: `directUrl` no schema + doc de `DATABASE_URL`/`DIRECT_URL`; índices `lesson_progress(lesson_id)`, `(tenant_id,lesson_id)`, `enrollments(course_id)` (migration aditiva) | `prisma/schema.prisma` |
| 1.12 | GC de vídeos: excluir aula/módulo/curso chama `VideosService.discard`; job de expiração de multipart abandonado; `s3:audit` agendável | `lessons.service.ts:104`, `videos.service.ts` |
| 1.13 | Upload: validar magic bytes no worker (ffprobe já falha; registrar motivo), cota por empresa (`MAX_TENANT_STORAGE_BYTES`), tamanho máx. declarado no `POST /uploads` | `videos.dto.ts`, `videos.service.ts` |
| 1.14 | LGPD: autoexclusão para aluno sem senha (via sessão de integração + confirmação); anonimização limpa `externalId`, `first_access_tokens`, `externalRef` | `privacy.service.ts:109,149` |
| 1.15 | Rate limit: falhar fechado nas rotas de auth quando Redis cai; lockout por conta combinado com IP | `rate-limit.service.ts` |
| 1.16 | Fila de heartbeat: alerta/métrica quando perto do teto (80%) e política documentada | `progress.events.ts` |
| 1.17 | Isolamento no banco: **RLS opcional** (migration `rls_tenant` com `app.tenant_id` via `SET LOCAL`) OU suíte de testes e2e de vazamento ampliada; decisão registrada em ADR 0006 | `prisma/migrations` |
| 1.18 | Testes e2e novos para cada correção 1.1–1.16 + rodar suíte existente | `apps/api/test` |

Aceite: typecheck + lint + unitários verdes; e2e verdes quando Postgres/Redis estiverem disponíveis (se não, ficam
escritos e o relatório diz que não rodaram).

## Fase 2 — Infraestrutura (Swarm / Portainer / Traefik / GHCR)

| Id | Tarefa |
|---|---|
| 2.1 | `docker-compose.video.portainer.yml` (raiz): serviços api, consolidator, worker, postgres, redis, migrate (job `replicas:0`/`restart_policy none` + instrução), sem `build`, sem `depends_on condition`, `deploy.resources`, healthchecks, labels Traefik (`Host(video-api...)`, entrypoint websecure, certresolver), rede externa `network_swarm_public` + rede interna, placement do worker em nó rotulado `video-worker=true`, `stop_grace_period` 10 min |
| 2.2 | Workflow `.github/workflows/docker-publish-video.yml`: build/push `ghcr.io/<repo>/video-api`, `video-worker` por SHA (gatilho por mudanças em `services/video/**`); NÃO altera `docker-publish.yml` existente |
| 2.3 | Dockerfiles: alvo `runtime` único para migrate (sem devDeps no deploy; `prisma migrate deploy` via `npx prisma` incluído), usuário não-root, healthcheck |
| 2.4 | Worker: SIGTERM gracioso (devolver job à fila sem perder), `lockDuration`/`stalledInterval` revisados, checagem de espaço em `/tmp`, timeout por job (não por rendition), `ffmpeg -threads` configurável |
| 2.5 | `.env.video.example`: todas as variáveis, obrigatórias vs opcionais, `TRUST_PROXY=1`, `ACCESS_ENDPOINT_ENABLED=true`, `METRICS_TOKEN`, S3 |
| 2.6 | Backup: script/cron de `pg_dump` para S3 (bucket separado) + política de retenção; lifecycle do multipart; doc de restore testável |
| 2.7 | Observabilidade: scrape Prometheus, alertas (`ConsolidadorAtrasado` etc.) no formato do projeto |
| 2.8 | Runbook `docs/video/RUNBOOK.md`: deploy por SHA, rollback (`:latest`), rotação de segredos, reprocessar vídeo, incidentes |

## Fase 3 — Integração com a plataforma (`apps/web` + migration)

| Id | Tarefa |
|---|---|
| 3.1 | `apps/web/lib/video/client.ts` (server-only): cliente HTTP da video-api (chave de integração, timeout, retry, correlationId), env `VIDEO_API_URL`, `VIDEO_INTEGRATION_KEY`; **sem** chamadas a partir do browser com a chave |
| 3.2 | Migration NOVA (não aplicada): `simulado_video_*` — `video_empresas` (tenant↔empresa/habilitação), `video_aulas` (nosso conteúdo ↔ `lessonId`/`videoId`/`courseId` do serviço, status), `video_matriculas_sync` (fila/estado de sincronização por regra+aluno, `externalRef`, tentativas, erro), RLS por tenant como as demais |
| 3.3 | Job de sincronização de acesso: quando liberação/regras (Guru/Curseduca) concedem/revogam, enfileira enroll/revoke com `externalRef = regra_id:aluno_id`; fila + backoff; reconciliação periódica; **ponto de gancho descrito, sem alterar arquivos já modificados no working tree** |
| 3.4 | Rotas API do aluno: `POST /api/aluno/video/playback` (server → `/access/sessions` + `/lessons/:id/playback`), `heartbeat` direto do browser com token de playback (rota do serviço) — contrato documentado |
| 3.5 | Rotas API do admin (Estúdio): criar vídeo/aula, iniciar upload multipart (URLs de parte), concluir, status, reprocessar, excluir, analytics por aula/curso (paginado) — todas com `checkPermission` + service role |
| 3.6 | Permissões RBAC novas (`video:view/manage`) e auditoria (`content_audit`) |
| 3.7 | Tipos/contratos zod compartilhados em `apps/web/lib/video/tipos.ts` |

## Fase 4 — Front (player e Estúdio)

| Id | Tarefa |
|---|---|
| 4.1 | `components/aluno/video/lesson-player.tsx` ("use client"): hls.js carregado via `import()`, tokens de cor (sem hex), claro/escuro, largura cheia, lucide (sem Sparkles), controles acessíveis (teclado, aria), velocidade, qualidade, legendas, capítulos, sprite, retomar, próxima aula, marca d'água, PiP, fullscreen, mobile; heartbeat 10 s com fila de retry e `visibilitychange`; renovação do token; `sendBeacon` no fim |
| 4.2 | Painéis: transcrição pesquisável, anotações com tempo |
| 4.3 | Integração com iframe Curseduca: `postMessage` (altura/eventos iniciou/concluiu), nota sobre `allow="fullscreen"`; **proposta de patch** para `proxy.ts`/CSP (arquivo já modificado: não editar) |
| 4.4 | Estúdio: `app/admin/conteudos/videos/*` — `<EstudioHeader>` + `<DataTable>` (busca/filtro/ordenação server-side), upload com progresso/retomada, status, reprocessar, analytics (gráficos SVG simples, cálculo no servidor) |
| 4.5 | Integrar `lesson-player` ao `file-picker` e ao currículo de produtos (`lib/produtos/curriculo.ts`) como novo provedor "Vídeo próprio" em `video-provedor.ts` |

## Fase 5 — Validação e go-live

| Id | Tarefa |
|---|---|
| 5.1 | Plano de teste de carga adaptado (`services/video/load`) para staging (heartbeat + playback + manifest), metas: 1.000 hb/s/réplica, p95 < 100 ms |
| 5.2 | Script de medição de egress por aluno-hora (HEAD/contagem por prefixo + estimativa) e critérios para decidir CDN |
| 5.3 | Checklist de segurança pré-go-live (revisor-seguranca): RLS/isolamento, CORS, chaves, rate limit, LGPD |
| 5.4 | Piloto: 1 tenant, poucos vídeos, grupo de teste (testadores globais), rollback = voltar o provedor da aula para YouTube/Vimeo |
| 5.5 | Critérios de aceite e matriz de rollback por fase |

## Passos manuais (só o operador pode/deve fazer)
1. Criar chave S3 dedicada (ou projeto Hetzner de vídeos), aplicar CORS (`npm run s3:cors`).
2. DNS `video-api.revisaopge.com.br` → VPS; rotular nó do worker (`docker node update --label-add video-worker=true <nó>`).
3. Criar segredos/variáveis no Portainer (`.env.video.example`).
4. Revisar e aplicar a migration `simulado_video_*` no SQL Editor (aditiva).
5. Commit/push/imagem (regra `cpi`), deploy por SHA, criar empresas e a chave de integração (`access:manage`).
6. Habilitar `accessEndpointEnabled` por empresa; rodar Fase 5 em staging antes do piloto.
