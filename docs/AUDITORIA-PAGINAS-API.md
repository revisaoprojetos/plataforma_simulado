# Auditoria de páginas — eficiência de carregamento / "rodar na API"

> Revisão: 2026-08-05. Base: 88 `page.tsx` em `apps/web/app` + 52 route handlers `/api/*`.
> Objetivo do pedido: "pegar todas as páginas, checar uma a uma e configurar para rodarem na API,
> para maior eficiência de carregamento".

---

## 0. Realidade da arquitetura (o que "rodar na API" significa AQUI)

Ver `docs/ARQUITETURA.md`. Resumo que muda a estratégia:

- **Quem é a "API" hoje é o próprio Next.js (`apps/web`)**: server components + server actions + route handlers `/api/*`, indo **direto no PostgREST/Supabase**. Não existe um backend REST único por onde toda página passa.
- **O `apps/api` (NestJS) é um serviço DEDICADO só de relatórios** (`/v1/relatorios/*`), **atrás da flag `RELATORIOS_API_URL`**. Ele NÃO é um gateway geral de páginas.
- **O maior limitador histórico de escala foi o PostgREST** (round-trips sequenciais + teto de 1000 linhas + sem pooling). As fases já construídas atacam isso: **cache Redis**, **Postgres direto** (`packages/data`, `DATABASE_URL`+`REPORT_SQL`) e **SSE**.

> **Conclusão:** "configurar cada página para rodar na API" **não** é migrar 88 páginas para o NestJS
> (que é reports-only). O ganho de carregamento real está em **3 alavancas por página**:
> **(A) paralelizar** as consultas, **(B) cachear** leituras pesadas, **(C) Postgres direto** nos relatórios.

---

## 1. Diagnóstico (números)

| Sinal | Qtde |
|---|---|
| Total de páginas (`page.tsx`) | **88** |
| Páginas com config de render (`dynamic`/`revalidate`/`fetchCache`) | 36 |
| Páginas **sem** config de render | **52** |
| Páginas que acessam o banco **direto** (`createAdminClient`/`createServiceClient` no server component) | **61** |
| Páginas que usam `fetchAll` (paginação PostgREST) | 15 |
| Páginas que usam a **cache de relatório** | **apenas 3** |
| Route handlers `/api/*` | 52 (19 com `dynamic`, 7 com `runtime`) |

### Por que "adicionar `force-dynamic` nas 52" NÃO é o ganho
As 52 páginas sem config lêem **sessão/cookies/tenant** (`getSessaoAluno`, `getCurrentAccess`, `getTenantTheme`) → o Next.js **já as renderiza dinamicamente por padrão** (server-rendered on demand). Marcar `dynamic='force-dynamic'` seria, na maioria, **no-op** — não acelera o carregamento e não "coloca na API". O que pesa é o **número de idas ao banco em série** dentro da página.

---

## 2. Hotspots — onde está o ganho real (páginas mais pesadas)

Contagem de consultas ao banco por página (`.from(` / `fetchAll` / `await svc`):

| Consultas | Página | Alavanca recomendada |
|---:|---|---|
| **22** | `admin/estudantes/[id]` | A (paralelizar) + B (cache do perfil/histórico) |
| 17 | `imprimir/caderno/[id]` | A + já é render de PDF (worker/Gotenberg) |
| **16** | `aluno/(portal)/questoes` | A + B (catálogo de questões por tenant) |
| **14** | `aluno/(portal)` (home) | A (várias já em `Promise.all`) + B (recentes/banners) |
| 13 | `admin/auditoria` | A + paginação server-side (já tem teto) |
| 12 | `admin/grupos/[id]` | A + B (engajamento já é sob demanda) |
| 12 | `admin/estudantes/[id]/simulado/[simuladoId]` | A + C (é relatório de sessão) |
| 11 | `imprimir/resultado/[st]` | A |
| 11 | `admin/cadernos/[id]` | A |
| 11 | `admin/banco-questoes/[id]` | A + B |
| 10 | `aluno/(portal)/simulados/[id]` | A |
| 10 | `admin` (dashboard) | A + **C/cache** (KPIs = relatório) |
| 8–9 | `super/plataformas/[id]`, `aluno/recomendado`, `aluno/cadernos/[id]`, `admin/estudantes` | A + B pontual |

**Relatórios** (`admin/relatorios/*`) já têm o caminho certo montado (`_dados.ts` + cache + Postgres direto), mas **só 3 páginas no sistema usam a cache** — vale conferir se todos os loaders de relatório estão de fato passando pela cache/Postgres-direto.

---

## 3. Categorização das 88 páginas (por tratamento)

- **Estáticas / leves (sem banco)** — ex.: `admin/ajuda`, `aluno/(portal)/ajuda`, `lgpd/consentimento`, `login`. → Podem receber `revalidate`/estático; ganho pequeno mas grátis.
- **Autenticadas + tenant-scoped (a maioria, 61)** — já dinâmicas. Ganho = **paralelizar consultas** + **cachear** o que não precisa ser 100% fresco.
- **Relatórios** (`admin/relatorios/*`) — caminho: **cache Redis → Postgres direto → PostgREST**. Ação = garantir que todos os loaders usam essa cadeia.
- **Impressão/PDF** (`imprimir/*`) — rodam via worker/Gotenberg; foco é paralelizar as leituras que alimentam o render.
- **Runner de prova / embed** (`simulado/[token]`, `embed/simulado/[token]`) — quentes em concorrência; já usam auto-save idempotente. Cuidado: **não cachear** (dados de sessão).

---

## 4. Plano de execução recomendado (em lotes, revisável)

Em vez de editar 88 arquivos de uma vez (risco alto, ganho baixo no blanket), atacar por impacto:

- **Lote 1 — Top hotspots (maior ganho):** `admin/estudantes/[id]`, `aluno/questoes`, `aluno` (home), `admin/grupos/[id]`, `admin` (dashboard). Ação: paralelizar consultas em `Promise.all` e cachear as partes pesadas.
- **Lote 2 — Relatórios:** garantir cache + Postgres direto em todos os loaders `_dados.ts`/`_resumos.ts`.
- **Lote 3 — Config de render explícita** onde ajuda de verdade (estáticas → `revalidate`; runner → nunca cachear) + `dynamic`/`runtime` nos route handlers `/api/*` que faltam (33 sem `dynamic`).
- **Lote 4 — Varredura final** das demais páginas, uma a uma, aplicando A/B/C conforme o caso.

---

## 4.1 — Lote 1 EXECUTADO (2026-08-05)

Caminho escolhido: **(1) Otimizar no lugar (paralelizar + cache)**. Resultado por página:

| Página | Antes | Depois | Ação |
|---|---|---|---|
| `admin/estudantes/[id]` | ~22 idas em **série** (est→sessões→respostas→pastas→grupos→…) | **2 round-trips** paralelos no topo + qTipos/qp em paralelo | batch inicial de 6 queries num `Promise.all`; 2º batch (respostas‖bancos‖grupos); mats/aces reaproveitados; `qTipos`‖`qp` |
| `aluno/(portal)` (home) | visual→grupos→enunciado→grupos (4 camadas em série) | 2 camadas paralelas | `visual`‖`grupoPorSimAll`; depois `grupos`‖`enunUrls` |
| `admin/grupos/[id]` | membros → `Promise.all` → atividades (3 camadas SQL em série) | **1** `Promise.all` (membros/origem/pastas/subgrupos/atividade) | membros e atividade viraram IIFEs dentro do batch |
| `aluno/(portal)/questoes` | — | **sem mudança** | já era ótimo (3 camadas `Promise.all`, sequência obrigatória filtros→ids→detalhes) |
| `admin` (dashboard) | — | **sem mudança** | já era ótimo (`Promise.all` de 7 + nota-média memoizada no Redis via `remember` + RPC `avg`) |

`tsc --noEmit` limpo. Padrão de referência para os próximos lotes = o **dashboard** (batch único + `remember`/RPC).

---

## 4.2 — Lote 2 EXECUTADO (2026-08-05)

Auditoria dos loaders `_dados.ts`/`_resumos.ts` + páginas `admin/relatorios/*`:

- **Os 6 loaders já tinham a cadeia completa** cache Redis (`remember`) → API dedicada (`RELATORIOS_API_URL`) → **Postgres direto** (`packages/data`/repos SQL) → PostgREST. O modo `REPORT_SQL=shadow` é só rollout; **em produção o SQL-direto já é o caminho primário**.
- **Páginas de relatório**: todas roteiam o dado pesado pelo loader cacheado (`montarRelatorio*`/`resumosSimulados`) ou embrulham o bloco inline em `remember` (`disciplinas`, `nps`).
- **Único vazamento corrigido:** `admin/relatorios/estudantes` (lista, sem `estId`) varria **todas** as sessões finalizadas do tenant a cada visita para montar os agregados por aluno — agora **memoizado** em `remember(chaveRelatorio(tid,'estudantes','agregados'))`. A chave casa com o wildcard de `invalidarRelatorios` → limpa sozinha em finalização/re-correção/import.

`tsc --noEmit` limpo. **Conclusão do Lote 2: a cadeia cache+Postgres-direto está garantida em 100% dos relatórios.**

---

## 4.3 — Lote 3 EXECUTADO (2026-08-05)

**Route handlers `/api/*` (52 no total):**
- **33 handlers** ganharam `export const dynamic = 'force-dynamic'` (todos são endpoints de sessão/dados/mutação; nenhum deve ser prerender estático). Inclui 5 handlers de PDF que só tinham `runtime = 'nodejs'` e não declaravam `dynamic`.
- **19 já declaravam** `dynamic`. Agora **100% dos handlers** têm a diretiva explícita.
- Real para os `GET` (ex.: `health`, `simulado/info`, `sessoes/current`, `aluno/notificacoes`) que poderiam ser cacheados; explícito/consistente para os `POST`.

**Config de render em páginas:** blanket `force-dynamic` nas 52 páginas sem config permanece **no-op** (já dinâmicas por lerem sessão/cookies) — confirmado na seção 1. Páginas estáticas (`ajuda`, `login`, `lgpd/consentimento`) já são prerender estático por padrão (sem API dinâmica); o runner de prova já é dinâmico por ler cookies de sessão. Nada a mudar sem custo/benefício negativo.

`tsc --noEmit` limpo. **Lote 3 concluído: diretiva `dynamic` explícita em 100% dos route handlers.**

---

## 4.4 — Lote 4 EXECUTADO (2026-08-05)

Varredura das páginas restantes (8–13 consultas). Paralelização caso a caso:

| Página | Antes | Depois |
|---|---|---|
| `admin/estudantes/[id]/simulado/[simuladoId]` | est+sim → sessões → visual (3q) → tipo (4 camadas) | **1 batch** (est, sim, sessões, visual, tipo) |
| `aluno/(portal)/simulados/[id]` | sim → sess → estRow → cadernoId (≤4q) → resultado → tipo → caderno-config → NPS | **3 camadas**: `sim‖sess`; `classificação‖tipo‖NPS`; resultado+comparativo+desempenho **‖ resolução do caderno** |
| `admin/cadernos/[id]` | caderno → bancos → questões → alts → registros → tema | `caderno‖bancos‖tema`; depois `alts‖registros` |
| `admin/banco-questoes/[id]` | banco → vínculos → questões → ordem → grupos → disciplinas (6 camadas; 3 leituras da MESMA linha de pasta em série) | **1 batch** (banco, vínculos, ordem, grupos, disciplinas) → questões |
| `imprimir/resultado/[st]` | sessão → (sim,est,part) → sq → respostas → discursivas | sessão → **1 batch** de 6 |
| `super/plataformas/[id]` | tenant → batch(6) → batch(2) | tenant → **1 batch de 8** |
| `admin/auditoria` | nomes estudante→simulado em série (views sessões/eventos) | `estudantes‖simulados` |
| `aluno/(portal)/recomendado` | — | **sem mudança**: pipeline inerentemente sequencial (cada etapa alimenta a próxima); par final `alts‖favs` já paralelo |

`imprimir/caderno/[id]` (17q) é render de PDF via worker/Gotenberg — fora do caminho de navegação do usuário; deixado para uma passada específica de PDF se necessário.

`tsc --noEmit` limpo em toda a varredura.

---

## 6. Conclusão geral

Os 4 lotes cobriram os hotspots reais. Padrão aplicado em todo o repositório: **batch inicial por dependência (`Promise.all`)** para colapsar round-trips sequenciais, **cache Redis + Postgres-direto** garantido nos relatórios, e **`dynamic` explícito** em 100% dos route handlers. As alavancas A (paralelizar) e B (cachear) foram exercidas onde davam ganho; C (Postgres-direto) já estava montada nos relatórios. Páginas inerentemente sequenciais (ex.: `recomendado`) e já-ótimas (dashboard, `aluno/questoes`) foram deixadas intactas de propósito.

---

## 5. O que preciso confirmar (decisão) — RESOLVIDO

"Rodar na API" tem 2 leituras possíveis — muda tudo:
1. **Otimizar cada página no lugar** (paralelizar + cache + Postgres-direto) — é o caminho que a arquitetura pede e dá ganho real de carregamento. **(Recomendado.)**
2. **Migrar de fato para o NestJS** (mover o fetch das páginas para endpoints REST no `apps/api`) — reescrita grande, semanas, e hoje o NestJS só serve relatórios.

Sugiro seguir pelo **(1)**, começando pelo **Lote 1**.
