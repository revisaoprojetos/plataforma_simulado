# apps/api

NestJS 10 + TypeScript. Porta `PORT` (3000). Swagger `/docs`.

Leia conforme o que for mexer: [api](../../docs/api.md) · [modelo de dados](../../docs/modelo-de-dados.md) · [segurança](../../docs/seguranca.md) · [mcp](../../docs/mcp.md) · [convenções](../../docs/convencoes.md).

## Estrutura (`src/`)
`config/` (zod) · `storage/` (S3) · `health/` · `auth/` · `access/` (políticas) · `tenants/` · `users/` · `courses/` · `lessons/` · `videos/` (upload) · `queue/` (BullMQ) · `playback/` (token, sessões, HLS) · `progress/` (heartbeat, consolidação, leituras) · `analytics/` (relatórios SQL, CSV) · `security/` (limite de requisições) · `observability/` (logs, métricas) · `privacy/` (LGPD) · `mcp/` (servidor MCP, tokens pessoais, auditoria) · `consolidator.main.ts` (processo dedicado).

## Regras locais
- **Multiempresa:** `ctx.tenantId` (do JWT) em toda query; nunca receber `tenantId` do cliente.
- Controllers só validam e delegam; regra de negócio nos services. **MCP chama os mesmos services** (nunca duplicar lógica).
- Toda rota protegida usa `JwtAuthGuard` + `RolesGuard`; acesso a aula passa por `canAccessLesson`.
- Config só via `ConfigService`; falhar no boot se faltar variável.
- **Playback:** token de playback ≠ JWT de acesso (segredos distintos); nunca devolver `Buffer` direto (usar `StreamableFile`); só assinar nomes `seg_NNNNN.ts` de qualidades existentes; chaves S3 sempre `tenants/{tid do token}/…`.
- **Heartbeat:** caminho quente só no Redis (Lua) e responde 204; quem grava no Postgres é o `ProgressConsolidator`. Autentica pelo token de playback. Regra de trecho/conclusão em `progress/ranges.ts` (puro, testado) e no Lua de `heartbeat.service.ts` — mudou uma, conferir a outra e `docs/modelo-de-dados.md`.
- **Analytics:** SQL sempre com `tenant_id` (parâmetros via `Prisma.sql`, nunca concatenar); chame `consolidator.flush()` antes de ler; novas métricas seguem as definições do ADR 0003 e ganham teste com números exatos; CSV só via `toCsv` (neutraliza fórmulas). O MCP reutiliza `AnalyticsService`.
- Leituras de progresso chamam `consolidator.flush()` antes; testes e2e usam `HeartbeatService.record(claims, dto, nowMs)` com relógio fictício.
- **Hot path do heartbeat:** nada de consulta ao banco ou logger por requisição; scripts Lua via `runScript` (EVALSHA); mudou algo ali → rode `sh load/run.sh` e compare com o ADR 0004.
- **Consolidação:** `consolidation.ts` é puro (planeja); `progress.consolidator.ts` grava por conjuntos (`unnest`). Arrays numéricos vão como texto (`::text[]::float8[]`: o Prisma manda arrays só de inteiros como int8).
- Rota pública de entrega usa `@SkipRateLimit()` + limite por sessão no `PlaybackTokenGuard`.
- **MCP:** tool nova entra em `mcp/tools.ts` chamando um service existente (não vá ao Prisma para dados de negócio); declare o escopo; devolva só dados mínimos (nada de e-mail, chaves, URLs) — a barreira `mcp/sanitize.ts` é a rede de segurança, não a regra; texto de terceiros leva `notice`. Service usado pelo MCP precisa estar em `exports` do módulo. Tool nova → teste em `test/mcp.e2e-spec.ts` (inclui vazamento entre empresas) + `docs/mcp.md`.
- **Matrícula com prazo:** todo acesso do aluno a curso passa por `activeEnrollment()` / `isEnrollmentActive()` (`access/enrollment-window.ts`); não escreva `enrollments: { some: … }` sem ele. A API de integração (`access-integration/`) é opcional (dupla trava, 404 quando desligada), nunca altera quem já existe e nunca devolve segredo; mudou rota ali → `docs/api.md`, `docs/seguranca.md` e `test/access-integration.e2e-spec.ts`.
- Endpoint novo → Swagger + `docs/api.md`.

## Comandos
`npm run start:dev -w apps/api` · `npm test -w apps/api` · `npm run smoke:s3`
