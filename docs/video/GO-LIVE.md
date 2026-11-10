# Go-live do Gerenciador de Vídeo — ordem, gates e matriz de aceite (5.5)

Documentos da Fase 5: [CARGA-E-EGRESS.md](CARGA-E-EGRESS.md) (5.1, 5.2) · [SEGURANCA-CHECKLIST.md](SEGURANCA-CHECKLIST.md) (5.3) · [PILOTO-E-ROLLBACK.md](PILOTO-E-ROLLBACK.md) (5.4). Plano geral: [PLANO-GERENCIADOR-VIDEO.md](PLANO-GERENCIADOR-VIDEO.md).

Regras: nada é executado em produção por automação. Todos os comandos abaixo rodam em **staging** (ou localmente), salvo os marcados `[prod-readonly]`. Comandos de rollback ficam em `PILOTO-E-ROLLBACK.md`.

## 1. Ordem de execução

1. Operador conclui os **passos manuais** do plano (chave S3 dedicada + CORS, DNS `video-api`, rótulo do nó do worker, segredos no Portainer, migration `simulado_video_*` aditiva revisada).
2. Matriz de aceite das fases 0–4 (§2) verde em staging.
3. Segurança: `SEGURANCA-CHECKLIST.md` 100% marcado.
4. Carga: `CARGA-E-EGRESS.md` §3 atingida em 3 execuções seguidas; modelo de egress com preços **preenchidos pelo operador**.
5. Backup + restore testados; rollback ensaiado.
6. Piloto (1 tenant, poucos vídeos, testadores) -> decisão go/ajustar/abortar.
7. Expansão gradual: um tenant por vez; CDN só se algum critério de `CARGA-E-EGRESS.md` §5.6 for atingido.

## 2. Matriz de aceite por fase

Executar a partir de `services/video/` (exceto onde indicado). "Aceite" = resultado esperado.

### Fase 0 — Decisões e preparação

| Verificação | Comando | Aceite |
|---|---|---|
| Documento do plano e decisões D1–D8 presentes | `test -f ../../docs/video/PLANO-GERENCIADOR-VIDEO.md && echo ok` | `ok` |
| Serviço fora do workspace pnpm (lockfile da raiz intacto) | `grep -n "services" ../../pnpm-workspace.yaml; git -C ../.. status --short pnpm-lock.yaml` | sem `services/video` no workspace; lockfile sem modificação |
| Serviço instala e compila isolado | `npm ci && npm run typecheck` | 0 erros |
| Passos manuais D1/D3/D5 registrados | revisão humana do plano (§Passos manuais) | cada passo com responsável e data |

### Fase 1 — Endurecer o serviço

| Verificação | Comando | Aceite |
|---|---|---|
| Tipos, lint e unitários | `npm run typecheck && npm run lint && npm test` | verdes |
| E2E (precisa Postgres+Redis: CI ou staging) | `npm run test:e2e` | verde; cobre 1.1–1.16 (matrícula não zera prazo, unenroll suave, sessionId no servidor, CORS dinâmico, revogação, rate limit fail-closed) |
| Migration aditiva (índices `lesson_progress`, `enrollments`) | `npx prisma migrate status --schema prisma/schema.prisma` (staging) | todas aplicadas, nenhuma destrutiva |
| `TRUST_PROXY` obrigatório em produção | subir a API com `NODE_ENV=production TRUST_PROXY=0 TRUST_PROXY_REQUIRED=true` em staging | boot **falha** com mensagem clara |
| Produção recusa config fraca | subir com `JWT_ACCESS_SECRET=changeme...` ou `CORS_ORIGINS=http://localhost` em `NODE_ENV=production` | boot **falha** (`assertProductionSafe`) |
| Isolamento entre empresas | testes e2e de vazamento + ADR 0006 | verdes; ADR registrado |
| GC e auditoria do bucket | `npm run s3:audit -w apps/api` (staging) | exit 0, sem `ACHADO`/`AVISO` |

### Fase 2 — Infraestrutura

| Verificação | Comando | Aceite |
|---|---|---|
| Arquivos entregues | `test -f ../../docker-compose.video.portainer.yml && test -f ../../.github/workflows/docker-publish-video.yml && test -f .env.video.example && test -f ../../docs/video/RUNBOOK.md && echo ok` (ajustar caminhos do `.env.video.example` ao local real) | `ok` |
| Compose válido e sem `build`/`depends_on` condicional | `docker compose -f ../../docker-compose.video.portainer.yml config -q` ; `grep -nE "build:|condition:" ../../docker-compose.video.portainer.yml` | config válida; grep vazio |
| Imagens por SHA publicadas | `gh run list --workflow docker-publish-video.yml -L 3` (após push do operador) | último run `success`; imagem `:<sha>` existe no GHCR |
| Serviços de pé no Swarm (staging) | `docker service ls \| grep video` | `video-api N/N`, `video-consolidator 1/1`, `video-worker 1/1`, `video-postgres 1/1`, `video-redis 1/1` |
| Saúde | `curl -fsS https://<staging>/health` | `{"status":"ok"...}` |
| TLS/roteamento | `curl -sI https://<staging>/health \| head -1` ; `curl -s -o /dev/null -w "%{http_code}" https://<staging>/mcp` | 200; `/mcp` bloqueado (403/404) |
| Worker gracioso | `docker service update --force <stack>_video-worker` durante um job | job volta à fila e conclui após reinício (sem perda) |
| Métricas e alertas | `curl -s -H "Authorization: Bearer $METRICS_TOKEN" https://<staging>/metrics \| grep -c http_request_duration` | > 0; alertas `ConsolidadorAtrasado` carregados no Prometheus |
| Backup + restore | rodar o script de `pg_dump` e restaurar em instância descartável (RUNBOOK) | API sobe no restore e `/health` ok |
| `s3:cors` e smoke | `npm run s3:cors -w apps/api && npm run smoke:s3 -w apps/api` (staging) | CORS aplicado; smoke ok |

### Fase 3 — Integração (`apps/web` + migration)

Executar na raiz do monorepo (`apps/web`), pnpm.

| Verificação | Comando | Aceite |
|---|---|---|
| Cliente server-only existe e não vaza chave | `test -f apps/web/lib/video/client.ts && git grep -n "VIDEO_INTEGRATION_KEY" -- apps/web` | só aparece em módulos server-side (`import "server-only"`), nunca em `"use client"` ou `NEXT_PUBLIC_*` |
| Migration nova aditiva e com RLS | `ls supabase/migrations \| grep -i video` e revisão do SQL | cria `video_empresas`, `video_aulas`, `video_matriculas_sync` com RLS por tenant; sem `DROP` |
| Typecheck e lint do web | `pnpm --filter web exec tsc --noEmit` (ou `pnpm typecheck`) e `pnpm lint` | verdes |
| Rotas protegidas | `grep -rn "checkPermission" apps/web/app/api/admin/video apps/web/app/api/aluno/video` (ajustar caminhos) | toda rota admin com `checkPermission`; rotas do aluno exigem sessão |
| Playback fim a fim (staging) | login de aluno de teste -> `POST /api/aluno/video/playback` | devolve `manifestUrl` + token; sem a chave de integração no payload |
| Sync de acesso | conceder/revogar via regra de liberação de teste | `video_matriculas_sync` passa a `ok`; revogado perde acesso em <= 30 s; reconciliação corrige divergência |
| Permissões e auditoria | `video:view/manage` no RBAC; ação de admin gera linha em `content_audit` | presentes |

### Fase 4 — Front (player e Estúdio)

| Verificação | Comando | Aceite |
|---|---|---|
| Componentes existem | `test -f apps/web/components/aluno/video/lesson-player.tsx && ls apps/web/app/admin/conteudos/videos` | arquivos presentes |
| Build do Next isolado (landmine `use server`) | `pnpm --filter web build` | build verde antes de qualquer push |
| Regras de UI | `git grep -nE "#[0-9a-fA-F]{6}" -- apps/web/components/aluno/video` ; `git grep -n "Sparkles" -- apps/web/components/aluno/video apps/web/app/admin/conteudos/videos` | sem hex fixo (exceto semânticas) e sem `Sparkles` |
| hls.js só no cliente, via `import()` | `git grep -n "hls.js" -- apps/web/components/aluno/video` | carregamento dinâmico |
| Playback em navegadores | roteiro manual: Chrome, Safari/iOS, Android, **dentro do iframe Curseduca** | toca, fullscreen, retoma, renova token, legenda, velocidade |
| Heartbeat com retry | desligar rede 30 s no meio da aula | progresso é enviado ao voltar (`visibilitychange`/fila) |
| Estúdio | upload multipart com retomada; status; reprocessar; analytics paginado | funcionam; tabela com busca/filtro/ordenação server-side |
| Integração ao currículo | provedor "Vídeo próprio" em `video-provedor.ts`/`file-picker` | aula usa o player novo; trocar de volta ao YouTube funciona (ensaio de rollback) |

### Fase 5 — Validação

| Verificação | Comando | Aceite |
|---|---|---|
| Scripts de carga válidos | `for f in load/staging/*.js; do node --check $f; done; sh -n load/staging/run.sh` | sem erro |
| Travas de staging | `sh load/staging/run.sh playback` ; `I_KNOW_THIS_IS_STAGING=1 API_URL=https://video-api.revisaopge.com.br sh load/staging/run.sh playback` | ambos **recusados** (exit 2) |
| Carga | `CARGA-E-EGRESS.md` §2–§4 | heartbeat p95 < 100 ms a 1.000 hb/s/réplica; live-peak sem `live_refused` |
| Egress | `npx tsx apps/api/scripts/egress-estimate.ts --days 7` | gera GB por aluno-hora; preços `PRECO_*` preenchidos pelo operador |
| Segurança | `SEGURANCA-CHECKLIST.md` | 100% marcado |
| Piloto | `PILOTO-E-ROLLBACK.md` §3 | métricas atendidas 7 dias; rollback ensaiado |
| Estado final `[prod-readonly]` | `npm run s3:audit -w apps/api` com env de produção, **somente leitura** | exit 0 |

## 3. Assinaturas

| Gate | Responsável | Data | Evidência |
|---|---|---|---|
| Fases 0–4 verdes | | | |
| Segurança | | | |
| Carga | | | |
| Backup/restore + rollback ensaiados | | | |
| Piloto aprovado | | | |
| Decisão de CDN (sim/não + critério) | | | |
