# Runbook — Ativação e Rollout das Fases 0–4

Como ligar (e desligar) cada peça da nova arquitetura, na ordem mais segura. **Regra de ouro:
tudo é reversível por env/flag.** Sem os envs abaixo, o sistema funciona exatamente como antes
(PostgREST + polling). Ative uma coisa por vez, verifique, siga.

Ambiente: **Portainer** (serviços `web`, `worker`, e o novo `api`). Produção = tenant `twdr`
(Supabase). Imagens em `ghcr.io/revisaoprojetos/plataforma_simulado:<SHA>` (web) e `:<SHA>-worker`.

---

## 0. Pré-requisitos (uma vez)

| Item | Ação | Verificação |
|---|---|---|
| **Redis** | Já está no `docker-compose` (serviço `redis`). Nada a fazer. | `redis-cli ping` → PONG |
| **Índices SQL** (Fase 0.2) | Rodar `apps/web/prisma/migrations/20260721120000_relatorio_indices.sql` no SQL Editor (fora de janela). | `SELECT indexname FROM pg_indexes WHERE tablename='simulado_respostas_objetivas'` mostra `idx_simulado_respostas_questao*` |
| **Deploy web + worker** | Subir a imagem `web:<SHA>` e `worker:<SHA>-worker` mais recentes. | `/api/health` → 200; logs do worker mostram `[cron] agendado: ... warm-cache (300s)` |

> Sem mais nenhum env, você já ganha: **cache de relatórios (Redis), re-correção assíncrona,
> auto-encerramento em lote, webhook Curseduca enfileirado, SSE do "Ao Vivo" e do board**.
> Essas peças ligam sozinhas quando o Redis está no ar.

---

## 1. Fase 1 — Postgres direto nos relatórios (maior ganho de performance)

Troca os round-trips PostgREST (teto de 1000 linhas) por 1–2 queries SQL. **Rollout em 2 tempos.**

**Envs no serviço `web`:**
```
DATABASE_URL=postgresql://postgres.twdrtlxkjvunkdobudev:<SENHA_DB>@aws-1-us-east-1.pooler.supabase.com:6543/postgres
DATABASE_POOL_MAX=5
REPORT_SQL=shadow          # 1º: valida sem servir
```
- A `<SENHA_DB>` é a **Database password** do Supabase (Settings → Database → Reset). Porta **6543** = pooler *transaction* (recomendado).

**Passo 1 — Shadow (validação segura):** com `REPORT_SQL=shadow`, o web roda SQL **e** PostgREST,
compara e **serve o PostgREST** (não muda nada pro usuário). Abra os relatórios e veja os logs do `web`:
```
[shadow resumos] N simulados, 0 divergência(s)
[shadow estudante] ... : ok
```
**Verificação:** `0 divergência(s)` em todos. Se aparecer DIFF, **não** avance — me chame.

**Passo 2 — Ligar:** trocar `REPORT_SQL=shadow` → **remover a env** (ou `REPORT_SQL=on`). Agora os
relatórios são servidos pelo SQL direto. **Verificação:** relatórios abrindo rápido; log
`[relatorio lento]` deve sumir/ser raro.

**Rollback:** `REPORT_SQL=off` (volta tudo pro PostgREST na hora) ou remover `DATABASE_URL`.

---

## 2. Fase 3 — API dedicada (opcional; fidelidade ao desenho da imagem)

Sobe um serviço `api` (NestJS) que serve os relatórios. O `web` passa a buscar lá em vez de rodar
o SQL localmente. **Só ative depois da Fase 1 estar estável.**

**⚠️ Antes:** rode um `docker compose build api` de teste (o build da imagem não foi validado localmente).

**Serviço `api` (envs):**
```
DATABASE_URL=<mesma da Fase 1>
DATABASE_URL_REPLICA=        # opcional (Fase 4)
API_INTERNAL_SECRET=<gere um segredo forte>
```
**Verificação do serviço:** `GET http://api:3001/health` → `{"ok":true,"sql":true}`;
`GET /metrics` → estado do pool.

**Ligar no `web` (strangler):**
```
RELATORIOS_API_URL=http://api:3001
API_INTERNAL_SECRET=<o MESMO segredo do api>
```
Agora os 4 relatórios (resumos, estudante, gráficos, disciplina) vêm da API. **Fallback automático:**
se a API cair, o web volta pro SQL local → PostgREST (sem erro pro usuário).

**Verificação:** relatórios continuam corretos; `/metrics` da API mostra o pool com conexões
(`total`/`idle` > 0) conforme o uso.

**Rollback:** remover `RELATORIOS_API_URL` do `web` (volta pro SQL local, sem downtime). O serviço
`api` pode ficar de pé ou ser removido.

---

## 3. Fase 4 — Escala/observabilidade (opcional)

**Read-replica (Supabase Pro):** criar uma réplica de leitura → pegar a connection string do pooler
dela → setar no `web` **e** no `api`:
```
DATABASE_URL_REPLICA=postgresql://postgres.<ref>:<SENHA>@<host-replica>.pooler.supabase.com:6543/postgres
```
Os relatórios (só leitura) passam a ler da réplica; tira carga do primário. **Verificação:** `/metrics`
da API mostra `"replica":true`. **Rollback:** remover a env.

**Warm-cache:** já liga sozinho quando o `worker` está no ar (cron a cada 5 min, pré-aquece o cache
de resumos). **Verificação:** log do worker `[cron warm-cache]`.

**Observabilidade:** `GET /metrics` (API) = pool + uptime; log `[relatorio lento]` (web) quando um
cache-miss passa de 3s.

---

## Ordem recomendada de rollout

1. **Pré-requisitos** (índices + deploy web/worker) → ganha cache, async, SSE. *Meça alguns dias.*
2. **Fase 1 shadow** → confirme `0 divergências` → **ligue** (remova `REPORT_SQL`). *Maior ganho.*
3. **(Opcional) Fase 3** → `docker compose build api`, suba o `api`, ligue `RELATORIOS_API_URL`.
4. **(Opcional) Fase 4** → read-replica quando/se a carga de leitura justificar.

## Tabela-resumo dos flags

| Env (serviço) | O que faz | Desligar |
|---|---|---|
| `DATABASE_URL` (web, api) | Habilita SQL direto | remover |
| `REPORT_SQL` (web) | `shadow` valida / vazio=on / `off` desliga | `off` |
| `DATABASE_POOL_MAX` (web, api) | Tamanho do pool (default 5) | — |
| `RELATORIOS_API_URL` (web) | Web busca relatórios na API | remover |
| `API_INTERNAL_SECRET` (web, api) | Auth web→api (mesmo valor) | — |
| `DATABASE_URL_REPLICA` (web, api) | Lê relatórios da réplica | remover |
| `RELATORIO_CACHE` (web) | `off` desliga o cache de relatórios | (vazio=on) |
| `RELATORIO_CACHE_TTL` (web) | TTL do cache em segundos (default 600) | — |
| `RECORRECAO_SYNC_MAX` (web) | Acima disso, re-correção vai p/ fila (default 200) | — |
