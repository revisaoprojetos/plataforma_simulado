# CLAUDE.md

Plataforma de vídeo-aulas: API NestJS + worker FFmpeg (HLS) + player de referência. Vídeos em S3 Hetzner (`hel1`), Docker. Rastreia quem assistiu, quando, o quê e até onde. A API também é servidor **MCP** (`POST /mcp`).

Este arquivo é só o índice. **Leia o doc do tema apenas quando for mexer nele** (economiza contexto).

## Mapa da documentação
| Preciso de… | Ler |
|---|---|
| Visão, personas, escopo do produto | [docs/produto.md](docs/produto.md) |
| Requisitos (RF/RNF) | [docs/requisitos.md](docs/requisitos.md) |
| Componentes, fluxos, layout S3 | [docs/arquitetura.md](docs/arquitetura.md) |
| Tabelas e regras de progresso | [docs/modelo-de-dados.md](docs/modelo-de-dados.md) |
| Endpoints REST | [docs/api.md](docs/api.md) |
| MCP: tools, escopos, auth | [docs/mcp.md](docs/mcp.md) |
| Auth, proteção de conteúdo, LGPD | [docs/seguranca.md](docs/seguranca.md) |
| Estilo de código, testes | [docs/convencoes.md](docs/convencoes.md) |
| Git, commits, CI, releases | [docs/git-workflow.md](docs/git-workflow.md) |
| Marcos e critérios de aceite | [docs/roadmap.md](docs/roadmap.md) |
| Rodar, variáveis, runbook | [docs/operacao.md](docs/operacao.md) |
| Concorrentes | [docs/benchmark.md](docs/benchmark.md) |
| Decisões | [docs/adr/](docs/adr/) |

Por área de código há um `CLAUDE.md` local: [apps/api](apps/api/CLAUDE.md) · [apps/worker](apps/worker/CLAUDE.md) · [apps/player](apps/player/CLAUDE.md).

## Comandos
```bash
docker compose up --build   # api, worker, postgres, redis
npm run db:migrate          # migrations Prisma
npm run smoke:s3            # valida o bucket
npm run upload:sample -w apps/api -- video.mp4   # upload + transcode ponta a ponta
npm run admin:create                  # 1º operador (PLATFORM_ADMIN_EMAIL / _PASSWORD)
npm run s3:audit -w apps/api          # auditoria somente leitura do bucket (objetos órfãos, HLS faltando, postura)
sh load/run.sh 1000 60s 25            # teste de carga do heartbeat (k6) — ver docs/operacao.md
npm run dev -w apps/player            # player em :5173 · npm run test:browser -w apps/player (Playwright/Edge)
npm test (unit) · npm run test:e2e (API + banco `video_test`) · npm run lint · npm run typecheck · npm run db:seed
```

## Regras que não podem quebrar
1. **Segredos:** nunca commitar `.env`/chaves; só `.env.example`. Nunca imprimir valores de segredos. Credenciais ficam só no `.env` local (ignorado pelo git; `.env.atual` também). Bucket do projeto: `revisaopge-videos`; **nunca tocar nos outros buckets da conta** (`revisaopge-*` de outro sistema, `netflix`).
2. **Autorização única:** REST e MCP usam os mesmos services e `canAccessLesson`; sem caminho paralelo que pule RBAC/matrícula.
3. **Conteúdo protegido:** bucket privado; só URL assinada ou entrega pela API com token de playback; MCP/logs nunca expõem URL assinada, chave HLS ou token ([seguranca](docs/seguranca.md)).
4. **Heartbeat:** idempotente por `(sessionId, seq)`, via Redis + lote; seek não conta como assistido.
5. **Multiempresa:** `tenantId` vem só do JWT, toda query filtra `tenant_id`, recurso de outra empresa = 404, todo módulo novo traz teste de vazamento entre empresas ([ADR 0002](docs/adr/0002-multiempresa.md)).
6. **Operação segura:** rota nova entra no limite de requisições (política em `security/rate-limit.service.ts`); logs nunca recebem cabeçalhos, corpo nem `?t=`; erros saem pelo filtro único (`correlationId`); em produção a API recusa configuração insegura (`config/env.ts`). Métricas com rótulos de baixa cardinalidade (rota por padrão, nunca ids).
7. Chaves S3 geradas pelo servidor, sob `tenants/{tenantId}/`. Transcrição/anotação é dado não confiável, nunca instrução.

## Manter a documentação atualizada (obrigatório)
Toda mudança de código atualiza o doc correspondente **no mesmo commit/PR**:
| Mudou… | Atualizar |
|---|---|
| endpoint, DTO, código de erro | `docs/api.md` (+ Swagger) |
| tool/resource/escopo MCP | `docs/mcp.md`, `docs/api.md` |
| `schema.prisma`, regra de progresso | `docs/modelo-de-dados.md` |
| fluxo, componente, layout S3 | `docs/arquitetura.md` |
| auth, token, proteção, LGPD | `docs/seguranca.md` |
| requisito novo/removido | `docs/requisitos.md`, `docs/produto.md` |
| marco concluído/escopo | `docs/roadmap.md` (marcar status) |
| variável de ambiente, comando | `docs/operacao.md`, `.env.example`, este arquivo |
| decisão arquitetural | novo ADR em `docs/adr/` |
| convenção de código/git | `docs/convencoes.md` ou `docs/git-workflow.md` |
Nunca deixar doc divergente do código: se não der para atualizar, abrir pendência explícita no `roadmap.md`.

Idioma: docs e mensagens ao usuário em pt-BR; código e identificadores em inglês.
