# Arquitetura

```
Front/Player (hls.js) ──► API NestJS ──► Postgres
Agente de IA (MCP) ────►  (REST /v1 + /mcp) ├──► Redis (heartbeats, cache, filas BullMQ)
                                            ├──► S3 Hetzner (originais, HLS, VTT, thumbs)
                                            └─ fila ─► Worker FFmpeg (container separado)
```

## Multiempresa
Um banco/schema com `tenant_id` em toda tabela; um bucket com prefixo `tenants/{tenantId}/`; o tenant vem do JWT. Ver [ADR 0002](adr/0002-multiempresa.md).

## Componentes
- **apps/api** — NestJS (REST) e, com outro ponto de entrada (`consolidator.main.js`), o **consolidador de progresso**: auth, catálogo, upload, playback, progresso, notas, analytics, storage, health, **mcp**.
- **apps/worker** — consumidor BullMQ; pipeline FFmpeg/ffprobe.
- **apps/player** — aplicação web **só de desenvolvimento** (não é implantada em produção; vira um site à parte quando houver front real). Player de referência (Vite + TypeScript + hls.js, sem framework): login por empresa, cursos/aulas, player com controles próprios, painéis de transcrição/anotações/capítulos. Serve de contrato para o front real: o fluxo `playback → hls.js → heartbeat → renew → end` está em `src/player.ts`.
- **packages/shared** — DTOs/tipos.
- **prisma/** — schema, migrations, seed.

## Fluxos
**Upload:** `POST /uploads` cria `video` (uploaded) e inicia multipart → front envia partes direto ao S3 → `POST /uploads/:id/complete` → job `transcode`.

**Transcode (worker):** consome a fila `transcode` (BullMQ, 3 tentativas com backoff; arquivo inválido falha na hora) → baixa o original → `ffprobe` (duração, resolução, rotação, áudio) → escada 240p–1080p **limitada à origem** (nunca faz upscale) → uma passada de FFmpeg por qualidade: H.264 Main + AAC, segmentos de 6 s com keyframes alinhados entre qualidades, HLS VOD com **AES-128** (chave de 16 bytes e IV aleatórios por vídeo; a playlist grava o marcador `__KEY_URI__`, que a API troca pela URL da chave no playback) → `master.m3u8` → poster 640 px e sprite de miniaturas (≤ ~100, 160×90) com `sprite.vtt` → apaga a saída anterior e publica em `tenants/{tenantId}/videos/{videoId}/` → grava `ready` + duração + renditions. Falha definitiva grava `failed` + mensagem (500 caracteres).

**Playback:** `POST /lessons/:id/playback` reconsulta usuário/empresa/matrícula, confere vídeo `ready` e domínio, abre a sessão no Redis (`ps:{userId}`, sorted set, limite atômico) e devolve token de 5 min. O player busca o master na API (qualidades com `?t=`), cada playlist de qualidade (segmentos → URLs assinadas do S3, chave → `/hls/key`) e baixa os segmentos direto do S3. `renew` a cada ~4 min; `end` ao sair.

**Tracking:** o player envia `POST /progress/heartbeat` (token de playback) → Lua no Redis decide se o trecho conta e enfileira o evento (resposta 204 sem tocar no Postgres) → o consolidador (em produção, o serviço `consolidator`, um processo próprio; em desenvolvimento, o timer de 5 s dentro da API; e sempre antes de qualquer leitura) grava em lote em `watch_ranges`, `lesson_progress` e `watch_sessions`. Detalhes e garantias em [modelo-de-dados.md](modelo-de-dados.md).

**Analytics:** relatórios por aula, curso e aluno calculados na hora em SQL sobre `watch_sessions`, `watch_ranges` e `lesson_progress` (sempre filtrando por empresa), depois de esvaziar a fila de heartbeats; a curva de retenção usa `generate_series` de 5 s. Sem tabelas agregadas — [ADR 0003](adr/0003-analytics-sob-demanda.md).

**Integração (opcional):** o sistema de origem, onde o aluno já está logado, chama `POST /access/enrollments` (e `revoke`) com a chave de integração para liberar ou cortar acesso a um curso, com prazo, e `POST /access/sessions` para obter um JWT curto do aluno e consumir catálogo/playback/progresso por ele. A API só conhece o e-mail (e o `externalId`) do aluno; a senha dele fica no sistema de origem. Trava dupla e detalhes em [api.md](api.md#integração--matrícula-genérica-e-sessão-do-aluno--marco-9-) e [ADR 0005](adr/0005-api-de-integracao.md).

**MCP:** `POST /mcp` (Streamable HTTP, stateless). Cada tool chama os mesmos *services* da API REST, passando o usuário autenticado, então RBAC, matrícula e filtros de dados valem igualmente. Ver [mcp.md](mcp.md).

## Processos em produção
`api` (stateless, N réplicas atrás do proxy) · `consolidator` (grava heartbeats no Postgres; réplicas seguras) · `worker` (FFmpeg; escale por vídeos em paralelo) · `postgres` · `redis` (senha, `appendonly`, `noeviction`) · `migrate` (uma vez por deploy). Só a API é exposta (via proxy com TLS). Decisões e medições: [ADR 0004](adr/0004-endurecimento-e-capacidade.md).

## Layout S3
```
tenants/{tenantId}/originals/{videoId}/source.ext
tenants/{tenantId}/videos/{videoId}/hls/master.m3u8, {rendition}/index.m3u8, seg_*.ts
tenants/{tenantId}/videos/{videoId}/hls/key.bin   (somente via /hls/key)
tenants/{tenantId}/videos/{videoId}/thumbs/poster.jpg, sprite.jpg, sprite.vtt
tenants/{tenantId}/subtitles/{lessonId}/{lang}.vtt
```

## Riscos
| Risco | Mitigação |
|---|---|
| Hetzner sem CDN nativo | URLs assinadas desde o início; CDN plugável depois |
| S3 parcialmente compatível (CORS, multipart presigned) | `smoke:s3` no Marco 0 |
| Transcode lento/caro | Fila + worker isolado, retry/backoff, timeout, concorrência |
| "Assistido" inflado por seek/abas | Intervalos únicos + idempotência `(sessionId, seq)` + teto por `rate × Δt` |
| Vazamento por link | Token curto + segmentos assinados + AES-128 + marca d'água (não é DRM) |
| MCP expor dados indevidos | Mesmo RBAC, escopos, sem URLs/segredos, auditoria, rate limit |
| Escopo grande | Marcos entregáveis com PR e critério de aceite |

## Stack
NestJS 10 · TypeScript · Prisma/Postgres 16 · Redis 7 + BullMQ · AWS SDK v3 · FFmpeg · Passport-JWT + argon2 · `@modelcontextprotocol/sdk` · Swagger · pino · Jest/Supertest/Testcontainers · Vite + hls.js · Playwright · k6.
