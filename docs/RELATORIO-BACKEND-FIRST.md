# Relatório — Migração Backend-First (área do aluno)

> Execução do plano em `docs/PLANO-BACKEND-FIRST.md`, sob o padrão de `docs/ARQUITETURA-BACKEND-FIRST.md`.
> Objetivo do usuário: **tirar TODO processamento do front/render** e levar para o backend
> (snapshot precomputado + cache + worker), eliminando latência e estouro de egress.
> Data: 2026-10-28. **Status geral: código completo e `tsc` verde (web + worker). NÃO deployado. Migrações NÃO aplicadas em prod.**

---

## 1. O que foi feito (processo, por fase)

### Fase 0 — Template provado no "Meu painel de estudos"
Estabeleceu o padrão reusado em todas as demais áreas:
- **Tabela** `simulado_painel_snapshot` (jsonb por aluno, `unique(estudante_id)`, RLS) — migr `20261028010000`.
- **Serviço** `lib/painel/snapshot.ts`: `computarPainel` (session-independent) + `carregarPainel` (read-through: lê 1 linha; recomputa se `dia != hoje`/ausente) + `atualizarPainelSnapshot` (write-behind).
- **Página** `nova/painel/page.tsx` reescrita **fina** (só lê o snapshot; zero cálculo no render).
- **Ação** `concluirMetaPainel` (fronteira client→server limpa) + **cron** `api/cron/painel-roll` (CRON_SECRET, TETO=200) + agendamento no worker.
- Correções embutidas: renome "Meu painel de **estudos**"; card "Continue de onde parou" agora aponta ao último estudo real; remoção de dados fictícios (meta de hoje / resumo de cronograma); fix da **tela de erro ao iniciar meta** (action dedicada + botão cru); substituição de `carregarCatalogoCursos` (carregava a árvore inteira da Biblioteca, ~8s) por light-query em `simulado_conteudo_leitura_progresso`.

### Fase 1 — Snapshots por aluno nas demais áreas
Mesmo template para **Início**, **Desempenho**, **Cursos** e **Perfil/Comunidade**:
- Tabelas `simulado_home_snapshot` / `_desempenho_snapshot` / `_cursos_snapshot` / `_perfil_snapshot` (migr `20261028020000`→`050000`).
- Serviços `lib/home/snapshot.ts`, `lib/desempenho/snapshot.ts`, `lib/nova/cursos-snapshot.ts`, `lib/perfil/snapshot.ts` (computar/carregar/atualizar).
- Páginas `/nova/inicio`, `/nova/desempenho`, `/nova/cursos`, `/nova/comunidade[/perfil]` reescritas finas.
- `carregarBannersHome` em `remember('home-banners:{t}', 120)`; `catalogoRaizAluno` novo (pastas-raiz **sem** thumbs/prévias) para Cursos.
- `desempenho` com `VERSAO` de shape: ao mudar os campos, snapshot velho vira MISS e recomputa (nunca serve shape defasado).

### Fase 2 — Egress do layout e do leitor
- `aluno/(portal)/layout.tsx`: os 5 blocos `Promise.all` passaram a `remember` (`portal-tenant:{t}` 120s; `portal-aluno:{est}:*` 15–30s).
- `lib/conteudo/leitor.ts`: `carregarLeitura`/`carregarLeituraPdf` em `remember('leitura-doc|pdf:{t}:{doc}:{versao}', 300)` com grifos à parte.

### Fase 3 — Rankings por SQL/cache (fim das leituras sequenciais)
- `lib/simulado/ao-vivo.ts` + `api/stream/online`: `onlinePorSimuladoCache` (`relatorio:{t}:online:{hash}`, 15s) **compartilhado** com o SSR do board.
- `lib/gamificacao/leitura.ts`: base do leaderboard cacheada (45s).
- `lib/jurisprudencia/ranking.ts` + `api/jurisprudencia/ranking`: `progressoDesafioCache` (30s).
- Privacidade preservada: ranking de terceiros só com **iniciais** (anonimização no loader).

### Fase 4 — Desafios / Leitura (cache read-through)
Cache dentro dos próprios loaders (todos os call sites se beneficiam; páginas intactas), namespace `relatorio:{t}:*`:
- **Progresso por aluno** (30s): `carregarTrilhaLeituraAluno`, `carregarModuloCompleto`, `carregarGamRail`, `desafiosDoAluno`.
- **Conteúdo por tenant** (60s): pastas de leitura e de jurisprudência (beneficia de graça `totalPendenciasLeitura`/`statusAulaAluno`).

### Fase 5 — Catálogo de simulados
- Loader novo `lib/aluno/catalogo-simulados.ts` → `carregarCatalogoSimulados` em `remember('catalogo-sim:{t}:{est}', 60)` (contrato idêntico: `{itens, grupos, grupoPorSim}`).
- `/nova/.../questoes` consome o loader (removido compute inline).
- **Invalidação** `invalidarCatalogoSimulados` em `api/sessoes/finalizar` (ao finalizar, muda "recentes"→"feitos").
- `api/aluno/buscar-simulados` já buscava no banco (`ilike`+`limit`), mantido.

### Fase 6 — Listagens do admin (auditoria)
Auditadas 11 listagens pesadas. **Já OK** (range+count+filtro no banco): estudantes, matriculas, questoes, grupos, comentarios, feedbacks, auditoria, cadernos-teste. Sem `select('*')`; sem `.in()` grande sem chunk. **Nenhuma edição necessária.**

### Fase 7 — Infra
- Migração `20261028060000_snapshots_indices_roll.sql`: índices que servem o scan do roll (`(dia, atualizado_em)` para painel/home/desempenho/perfil; `(atualizado_em)` para cursos). O índice `(tenant_id, atualizado_em desc)` existente não servia (roll não filtra tenant e ordena asc).
- Worker (`apps/worker/src/main.ts`): 5 roll-crons agendados (painel/home/desempenho/cursos/perfil, 1h, idempotentes, TETO=200). `egress-monitor` (6h) já presente.

### Write-behind (freshness no mesmo dia)
`atualizar*Snapshot` plugado **após** cada mutação relevante (best-effort, nunca bloqueia):
| Mutação | Arquivo | Atualiza |
|---|---|---|
| Finalizar sessão | `api/sessoes/finalizar` | Home + Desempenho + Perfil (encadeado após XP) |
| Resgate de baú | `api/aluno/gamificacao/bau-trilha` | Home + Perfil (só se `awarded`) |
| Conclusão de aula | `api/leitura/progresso` | Home + Perfil (1ª conclusão, não testador) |
| Progresso Biblioteca | `lib/conteudo/leitor` (`registrarLeituraAluno`) | Cursos (continue) |
| Marcar meta cronograma | `cronograma/checks-actions` (`alternarCheckMeta`) | Painel + Home (ponto compartilhado: painel **e** página de cronograma) |

---

## 2. Correções feitas (bugs reais)
1. **"Meu painel"** → "Meu painel de estudos" (nome).
2. **"Continue de onde parou"** levava ao destino errado → agora ao último estudo real do aluno.
3. **Dados fictícios** em meta de hoje / resumo de cronograma → removidos; tudo dado real da plataforma.
4. **Tela de erro ao iniciar meta** → action dedicada `concluirMetaPainel` + botão cru (fronteira limpa).
5. **Lentidão do painel** (~8s) → light-query substituindo a carga da árvore inteira da Biblioteca.
6. **Página de cronograma não refrescava snapshot** ao marcar meta → agora coberta no ponto compartilhado.
7. **tsc**: ajustes de contrato (`Col` com children; `SEL_ADMIN` literal em novidades; import `../actions`); `desempenho/snapshot.ts` reconfirmado completo.

---

## 3. Melhorias (ganhos estruturais)
- **Zero compute pesado no render** das áreas do aluno migradas: a página lê 1 linha pronta.
- **Egress**: leitor, layout do portal, rankings, trilhas e catálogo agora servem de cache; projeção mínima; `fetchAllByIn` chunk 80 com `.order('id')`.
- **Rankings** deixaram de ler sequencialmente (SQL agregado/`Promise.all` + cache curto compartilhado SSR↔API).
- **Resiliência**: tudo degrada sem Redis (fallback em memória) e sem a migração (tabela ausente → computa direto).
- **Índices** do roll casando com o predicado real.

---

## 4. O que falta / follow-ups

### Ação do usuário (bloqueia o deploy)
- **Aplicar migrações em prod** (+ `notify pgrst`): `20261028010000` painel, `020000` home, `030000` desempenho, `040000` cursos, `050000` perfil, `060000` índices. (As de `20261027*`/`20261028000000` — flashcards/dúvidas/demandas/novidades — já foram aplicadas: "sqls ok".)
- **Deploy**: bump `APP_VERSION`+`CHANGELOG`, CI/GHCR, Portainer por SHA (não `:latest`). *Nada disso feito por mim, conforme a regra.*

### Lacunas técnicas conhecidas — RESOLVIDAS (2026-10-28, 2ª onda)
Verificação de integridade no disco confirmou que toda a 1ª onda está corretamente aplicada; as 5 lacunas foram então fechadas (tsc web+worker=0):
1. ✅ **Invalidação explícita da leitura**: `invalidarLeituraAluno(t, est)` novo em `lib/leitura/cache.ts` (`esquecer` de trilha-leitura/gam-rail/juris-desafios + `esquecerPrefixo` novo p/ `modulo-completo:{est}:*` via Redis SCAN) chamado em `api/leitura/resposta|quiz-tentativa|rapida|progresso`. Módulo-completo invalidado por **prefixo** (não TTL).
2. ✅ **Freshness de prática (barato, sem recompute)**: helpers `marcar{Home,Desempenho,Perfil}Desatualizado` (1 UPDATE leve `dia→'2000-01-01'` com guard `.neq` ≈idempotente) → read-through recomputa depois. Plugado em `finalizar` (sessão pessoal, ramo `else if finalizouAgora`) e `questao-resposta` (banco avulso, que não finaliza). Caminho oficial (`!pessoal`) segue com write-behind pesado intacto.
3. ✅ **Legado `/aluno`**: `carregarCatalogoLegado` (`catalogo-legado:{t}:{est}`, 60s) em `lib/aluno/catalogo-simulados.ts` serve as 2 telas (home + `/aluno/simulados`); `fetchAllByIn` chunk 80 substituiu `.in()` cru da tela de Realizados. `invalidarCatalogoSimulados` estendida p/ limpar as 2 chaves (sim + legado) no mesmo ponto do finalizar.
4. ✅ **Admin `banco-questoes/[id]`**: agregação da "Visão geral" movida p/ SQL `GROUP BY` (`bancoContagensSql` em `packages/data`), fallback em memória sem leitura extra, visual idêntico. A aba "Questões" mantém a lista completa (reordenação client — não mexida). **Board `/admin/simulados`: mantido** — é board por natureza (contagem recursiva de pastas + vistas), já otimizado (projeção + remember + SQL agg); paginar quebraria o catálogo.
5. ✅ **egress-monitor**: passou a checar frescura dos snapshots (`count` HEAD de defasados por área; `snapshotsOk`/`snapshotsDefasadosTotal`; limiar 500 ou 100%-defasado; tolerante a migração não-aplicada; `ok` rebaixado sem quebrar contrato).

### Decisões de projeto mantidas (não são bugs)
- Hot paths de alta frequência (`ping`) seguem **sem** tocar snapshot — stale-mark/recompute ali seria ruído; freshness por virada de dia/roll.
- Board `/admin/simulados` permanece não-paginado (ver item 4).

---

## 5. Inventário de artefatos
**Migrações (6, pendentes de aplicar):** `20261028010000`→`20261028060000`.
**Serviços novos:** `lib/{painel,home,desempenho,perfil}/snapshot.ts`, `lib/nova/cursos-snapshot.ts`, `lib/aluno/catalogo-simulados.ts`.
**Crons novos:** `api/cron/{painel,home,desempenho,cursos,perfil}-roll`.
**Worker:** 5 `setInterval` de roll em `apps/worker/src/main.ts`.
**Páginas finas:** `/nova/{painel,inicio,desempenho,cursos,comunidade[,/perfil]}`.
**Caches adicionados:** layout do portal, `leitor.ts`, rankings (online/leitura/juris), trilhas/módulo/gam-rail, pastas leitura/juris, catálogo de simulados.
**Verificação:** `tsc` web = 0, worker = 0.
