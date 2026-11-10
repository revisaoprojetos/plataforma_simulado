# Roadmap

Cada marco = 1 branch + PR + tag `v0.N.0` + critério de aceite. Detalhes de endpoints em [api.md](api.md).

## Marco 0 — Fundação · `chore/foundation` — ✅ concluído
Entregue: git, monorepo, config zod, storage S3, Prisma schema + migration `init` + seed, `/health` (db/redis/s3 = ok no Docker), Dockerfiles/compose, `smoke:s3` 100% OK no bucket `revisaopge-videos`, ESLint/Prettier, husky + lint-staged + commitlint, CI (GitHub Actions; roda após o primeiro push). Pendente apenas: remoto no GitHub e proteção da `main`.
Git, monorepo npm workspaces, TS/ESLint/Prettier, husky; docker-compose (api, worker, postgres, redis, minio opcional) + Dockerfiles multi-stage; config validada (zod) + `.env.example`; módulo `storage` (put/get/delete, presigned GET, multipart); `smoke:s3` contra o bucket real (put/get, presigned, multipart, CORS); Prisma schema + migration + seed; `/health`; Swagger; CI.
**Aceite:** `docker compose up` saudável; `smoke:s3` passa; CI verde.

## Marco 1 — Auth + catálogo + multiempresa · `feat/auth-catalog` — ✅ implementado (aguardando PR)
Entregue: empresas (`/platform/tenants`, `/tenant`), login por empresa com refresh rotativo, guards/roles, usuários, cursos, módulos, aulas, matrículas, `/me/courses`, políticas de acesso puras (`access/policy.ts`) + `AccessService` (base do futuro `canAccessLesson`), seed multiempresa. 23 testes e2e + 7 unitários, incluindo vazamento entre empresas. Verificado no Docker (login real, 401 sem token).
Tenants (`/platform/tenants`), login por empresa (`tid` no JWT), isolamento por `tenant_id` em toda query; Users + argon2; login/refresh rotativo/logout; guards e `@Roles`; CRUD cursos/módulos/aulas; matrículas; `canAccessLesson`.
**Aceite:** e2e de permissões aluno × professor × admin **e de isolamento entre empresas** (empresa A nunca lê/escreve dados da B; empresa suspensa não loga).

## Marco 2 — Upload + transcode · `feat/upload-transcode` — ✅ implementado (aguardando merge)
Entregue e verificado com S3 real: upload multipart (criar/retomar/finalizar/abortar), fila BullMQ, worker em Docker gerando HLS AES-128 em 4 qualidades + poster + sprite, reprocess idempotente (sem lixo no bucket), falha de arquivo inválido sem retries. 34 e2e (API, storage e fila falsos) + 22 unitários. Vídeo de 20 s 720p: 4 qualidades decodificam 600/600 frames.
Multipart presigned; fila `transcode`; worker ffprobe → HLS multi-qualidade → thumbs/sprite; estados e `reprocess`.
**Aceite:** MP4 de fixture vira HLS válido e toca no hls.js; falha simulada é reprocessável.

## Marco 3 — Playback seguro · `feat/secure-playback` — ✅ implementado (aguardando merge)
Entregue e verificado com S3 real: token de playback, manifests reescritos, chave AES só via API, segmentos assinados, domínios permitidos, limite de telas (Redis/Lua), renovação com revalidação, marca d'água em overlay (texto), CORS configurável. 22 testes e2e de playback (56 no total) + 31 unitários. FFmpeg tocou o vídeo inteiro (600 frames) apenas via API; segmento sem assinatura = 403.
Token de playback + manifest assinado; AES-128; renovação; domínios permitidos; limite de sessões simultâneas; marca d'água dinâmica.
**Aceite:** sem matrícula = 403; token/segmento expirado falha; 2ª sessão acima do limite = 409.

## Marco 4 — Progresso e histórico · `feat/progress-tracking` — ✅ implementado
Entregue e verificado na stack real: heartbeat atômico em Lua (204 sem tocar no Postgres), regras de trecho assistido (seek, velocidade, pausa, duplicados, vários dispositivos), consolidação em lote com lock por aluno/aula, conclusão a 90% de cobertura, retomada, continuar assistindo, histórico de sessões, progresso por curso, leitura por professor/admin com isolamento entre empresas. 21 e2e novos (78 no total) + 6 unitários (37). **Pendente para o Marco 7:** teste de carga k6 do heartbeat (meta RNF10).
Heartbeat idempotente; Redis → Postgres em lote; ranges; continue-watching; histórico; fechamento por timeout/`sendBeacon`.
**Aceite:** testes de duplicidade, fora de ordem, seek, múltiplos dispositivos; retomada exata.

## Marco 5 — Player de referência · `feat/reference-player` — ✅ implementado
Backend de conteúdo (legendas WebVTT → transcrição, busca, capítulos, anotações privadas; 13 e2e) e o player em `apps/player`. Verificado em **navegador real** (Edge + Playwright, 3 testes): toca com frames decodificados, velocidade, qualidade, legendas, transcrição com busca, capítulos, anotações, atalhos, marca d'água, heartbeat gravado, retomada após recarregar, continuar assistindo, bloqueio da 3ª tela e acessibilidade básica. **Pendente:** RF27 (estilo de legenda por usuário) e execução dos testes de navegador na CI.
hls.js, sprite, atalhos, velocidade, qualidade, legendas (+estilo), transcrição clicável, anotações, capítulos, próxima aula; integração com tracking; E2E Playwright.
**Aceite:** E2E verde; acessibilidade básica (teclado, contraste).

## Marco 6 — Analytics · `feat/analytics` — ✅ implementado
Entregue e verificado na stack real: relatórios por aula (views, únicos, tempo, conclusão, série diária, retenção a cada 5 s, 3 maiores abandonos, velocidade, qualidade, dispositivo), por curso (engajamento, ranking, destaques), alunos inativos, resumo do aluno e 3 exportações CSV, com permissões e isolamento entre empresas. Calculado sob demanda ([ADR 0003](adr/0003-analytics-sob-demanda.md)); sessões passam a guardar segundos por velocidade/qualidade. 20 e2e novos (112 no total) + 14 unitários. **Também corrigido:** testes passaram a usar Redis db 15 (o consolidador da stack em execução roubava eventos).
`analytics_daily`, `retention_buckets`; endpoints aula/curso/aluno; inativos; CSV.
**Aceite:** dataset sintético bate exatamente.

## Marco 7 — Hardening · `feat/hardening` — ✅ implementado (`v0.7.0`)
Entregue e verificado numa stack de produção real (compose próprio, banco novo): limite de requisições (força bruta, IP, usuário, sessão), helmet, `correlationId`, logs sem tokens, `/metrics` (API, worker, consolidador), LGPD (exportar/anonimizar/excluir), recusa de configuração insegura, healthchecks, containers sem privilégios, `admin:create`, consolidador em processo próprio e teste de carga k6. **Meta de capacidade atingida** (p95 36 ms no servidor a 1.000 heartbeats/s); o primeiro teste falhou e levou à reescrita da consolidação ([ADR 0004](adr/0004-endurecimento-e-capacidade.md)). Nesta etapa ainda **não** há MCP, então o `v1.0.0` fica para o fim do Marco 8.
Rate limit, helmet, LGPD, métricas, correlation-id, k6 (RNF10), compose de produção, runbook, CHANGELOG.
**Aceite:** suíte completa verde; meta de carga atingida; compose de produção validado. *(A `v1.0.0` sai com o Marco 8.)*

## Marco 8 — MCP · `feat/mcp-server` — ✅ implementado (`v1.0.0`)
Entregue: `McpModule` (`POST /mcp`, Streamable HTTP stateless, SDK oficial); tokens pessoais `gvmcp_…` com escopos, expiração e revogação imediata (`api_tokens`, `/v1/me/mcp-tokens`); 12 tools que chamam os mesmos services da REST; resources `course://` e `transcript://lesson/`; prompts `summarize_lesson` e `course_health_report`; auditoria por chamada (`audit_log`, só hash dos argumentos); limite de 120/min por token; barreira de saída que bloqueia URL assinada/segredo; LGPD revoga os tokens. 24 e2e com o cliente MCP do SDK + 1 de limite + 8 unitários.
Não feito (decisão): binário `stdio` (`npm run mcp:stdio`) — o endpoint HTTP atende os clientes atuais; fica como Fase 2 se houver demanda.
**Aceite (atendido):** e2e com cliente MCP — escopos respeitados, aluno não vê dados alheios, nenhuma resposta com URL assinada/segredo.

## Marco 9 — Integração com sistema de origem · `feat/access-enrollment` — ✅ implementado
Entregue: `POST /v1/access/enrollments` (matrícula genérica por e-mail, cria o aluno sem senha, prazo, idempotência por `externalRef`), `…/enrollments/revoke`, `POST /v1/access/sessions` (JWT curto do aluno para o sistema de origem), `POST /v1/auth/first-access` (login direto, futuro), chave de integração (token pessoal de admin com `access:manage`), dupla trava (`ACCESS_ENDPOINT_ENABLED` + habilitação por empresa), prazo/revogação em toda checagem de acesso, auditoria com detalhes. 23 e2e + 10 unitários.
Descartado por decisão: webhooks de plataformas, adapters, status de pedido e motor de regras.

## Pendências de armazenamento
- [ ] **Projeto Hetzner separado** só para o bucket de vídeos, com chave própria (ação do operador no console); depois eu migro os objetos, `.env`, CORS e docs. Hoje a chave do projeto enxerga 9 buckets, inclusive os do outro sistema.
- [ ] Chave S3 por sistema (API+worker × outros) e revogação da chave compartilhada.
- [x] `npm run s3:audit` (integridade e postura do bucket; sem log de acesso no provedor).
- Decidido não fazer: chave AES no banco cifrada por chave-mestra (risco de perda da mestra).

## Fase 2
Whisper (legenda/transcrição automáticas) · busca full-text (Postgres FTS/Meilisearch) · ladder por título · áudio múltiplo/dublagem · quizzes · comentários · CTAs · dashboards · certificados · CDN · DRM comercial.
