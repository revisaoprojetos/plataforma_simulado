# Plano de Execução — Backend-First (Performance & Egress) · COMPLETO

> Processo em fases para migrar **toda** a plataforma ao padrão de `docs/ARQUITETURA-BACKEND-FIRST.md`.
> Escopo = **páginas (aluno + admin), APIs, layouts, loaders compartilhados, documentos/thumbs,
> acessos/integrações e infra**. Nada de cálculo no render; tudo lido de snapshot/cache; cálculo no
> worker/na escrita; egress mínimo. Cada fase só começa quando o **portão** da anterior passa.

## 0. Como ler este plano

- **Workstreams (A–H):** frentes transversais que atravessam as fases (ex.: "snapshots por aluno").
- **Fases (0–7):** sequência de entrega; cada fase puxa itens dos workstreams para áreas concretas.
- **Técnicas:** `SNAP` (tabela snapshot read-through + write-behind + roll), `REM` (`remember` Redis),
  `SQL` (agregação/count no banco), `PAG` (`.range()`+count), `CHUNK` (`.in()` chunk 80),
  `PROJ` (projeção mínima de colunas), `IDX` (índice), `WARM` (cron de aquecimento/roll no worker).

---

## 1. Workstreams (frentes transversais)

### A. Layout & loaders compartilhados (o ganho mais barato — roda em TODA navegação)
- `app/aluno/(portal)/layout.tsx`: hoje faz `Promise.all` de **tema + counts da sidebar + gamificação + personalização + pendências de leitura** a CADA navegação. → `REM` por aluno (TTL curto) + por tenant (tema/rótulos). Contagens via `SQL`/`count`.
- `app/admin/**/layout.tsx`: idem (tema, permissões, menu). → `REM`.
- Loaders compartilhados a padronizar (cache + projeção): `getTenantTheme`, `getCurrentTenant`, `resolverLoginConfig`, `resolverSidebarRotulos`, `lerAparenciaAuth`, `resumoGamificacao`, `gamAtivaParaAluno`, `totalPendenciasLeitura`, `lerPersonalizacaoEstudante`.
- **Alvo:** o chrome do portal/admin para de recomputar por navegação.

### B. Snapshots por aluno (dashboards)
- Tabelas `simulado_<area>_snapshot` (jsonb + `dia`/dimensões) para: **Painel ✅**, Início, Desempenho, Perfil, Cursos (catálogo), Comunidade (resumo), Cronograma (hoje/semana).
- Read-through + write-behind (ações) + roll no worker (`WARM`, gated por atividade).

### C. Rankings & agregações (maior ofensor de latência legado)
- `/api/stream/online` (board online: **11–22s** hoje → `SQL` agregado), rankings (`/api/aluno/gamificacao/ranking`, `/api/aluno/leitura/ranking`, `/api/jurisprudencia/ranking`, `/admin/relatorios/ranking`), board ao vivo (`/api/stream/ao-vivo`).
- **Técnica:** snapshot de ranking por `(tenant, escopo/liga/módulo)` recomputado por `SQL` no worker; página/stream lê pronto. Anonimização (só iniciais de terceiros) no snapshot. `Promise.all` onde ainda houver leitura sequencial.

### D. Endpoints/APIs operacionais (hit no banco por chamada)
- Leitura: `/api/leitura/{progresso,ponto,anotacao,favorito,preferencias,rapida,quiz-tentativa,alteracoes}` → write idempotente + invalidar snapshot do aluno; projeção mínima.
- Gamificação: `/api/aluno/gamificacao/{resumo,ping,ranking,celebracao,bau-trilha}` → `REM`/snapshot; `ping` barato.
- Sessões: `/api/sessoes/{resposta,finalizar,tempo,current,avaliar,resposta-discursiva,reportar-*}` → auto-save idempotente (já desenhado), confirmar sem leitura pesada; finalizar dispara snapshot/ranking.
- Busca/listagens: `/api/aluno/{buscar-simulados,notificacoes,minhas-plataformas,comparativo,favoritos,cadernos}` → `PAG`+`SQL`+`REM`.
- HUD/ao-vivo: `/api/simulado/{hud,info}`, `/api/maratona/estado` → `REM` curto.

### E. Documentos, Biblioteca & thumbs (EGRESS)
- `arvoreBibliotecaAluno` (árvore inteira por render) → `REM` por `(aluno,pasta)` + `PROJ` (sem `html_rico`).
- `carregarLeitura`/`carregarLeituraPdf` → `REM` por `(doc,versão)`; grifos por `(doc,aluno)`.
- **Thumbs:** guardar **path** no snapshot e **assinar no read** (URL curta) OU TTL maior; nunca base64 na resposta; `gerarThumbDocumento` só gera se faltar (já faz) — mover geração para worker/na escrita.
- `biblioteca-sql.ts` (SQL agregado já existe) → garantir uso; `simulado_conteudo_documentos` com `PROJ`.

### F. Acessos & Integrações (reconciliação pesada)
- Curseduca (`/api/cron/curseduca-sync` lê ~18k canais/tick), grupos→bancos, guru-reconcile, matrículas, `acesso-efetivo.ts` → manter incremental + gating (já parcial); cache de `temAcessoDesafio`/acesso por `(aluno,recurso)`.
- `/api/aluno/minhas-plataformas`, `tenant_acessos`, SSO handoff → `REM`.

### G. Admin — listagens & relatórios
- Relatórios (`/admin/relatorios/*`) já usam `remember`+`warm-cache`: **estender** a cobertura e cobrir áreas novas.
- Listagens sem paginação forte → `PAG`+`SQL`+busca/filtro no banco: `estudantes`, `matriculas`, `banco-questoes`, `questoes`, `simulados`, `grupos`, `comentarios`, `feedbacks`, `auditoria`, `cadernos-teste`, `cronogramas/*`, `leitura/analise`, `gamificacao/publico`, `correcao/*`, Atendimento/Demandas/Novidades/Flashcards (criados agora).

### H. Infra, Observabilidade & Governança
- `IDX` para cada snapshot e para os filtros das listagens; revisar PgBouncer/Redis; `DATABASE_URL`/`REPORT_SQL`/`REDIS_URL`/`CRON_SECRET` obrigatórios.
- `WARM`/roll crons para TODAS as chaves novas (worker), gated por atividade; `egress-monitor` estendido.
- Checklist de PR (arquitetura §8) como item obrigatório de revisão; CI roda `tsc`.

---

## 2. Fases (sequência de entrega)

### Fase 0 — Padrão + Template · **CONCLUÍDA**
Docs + Painel (SNAP ponta a ponta) + `/api/cron/painel-roll` no worker. **Portão:** Painel lê 1 linha, write-behind, 0 cálculo no render. ✔

### Fase 1 — Chrome do portal + Núcleo /nova (workstreams A, B)
Páginas: `nova/inicio`, `nova/cursos` + `[cursoId]`/`central`/`extensivo`/`avulso`, `nova/cursos/central/questoes/*`, `nova/desempenho`, `nova/painel/cronograma/*`.
Trabalho: cache do **layout do portal** (A); SNAP de Início/Desempenho/Cursos; matar `carregarCatalogoCursos` no render (reusar query leve do Painel); counts/stats por `SQL`.
**Portão:** cada página do núcleo ≤2 queries; layout sem recomputo por navegação; sem `fetchAll` no render.

### Fase 2 — Conteúdo, Biblioteca & Documentos (workstream E) · EGRESS
Páginas/loaders: `biblioteca` + `[id]`, Leitor (`nova/painel/leitor/[materialId]`, leitura/*), `nova/cursos/central/legproc` e `jurisclub`, thumbs.
Trabalho: `REM` da árvore/leitura; thumbs via path+sign/worker; `PROJ` em documentos.
**Portão:** egress da Biblioteca/Leitor cai (monitor); nenhuma árvore por render.

### Fase 3 — Rankings, Ligas, Perfil, Comunidade (workstream C)
Páginas/APIs: `nova/comunidade/*`, `perfil`, `ligas`, `/api/stream/online`, `/api/stream/ao-vivo`, `/api/aluno/gamificacao/ranking`, `/api/aluno/leitura/ranking`, `/api/jurisprudencia/ranking`, board.
Trabalho: snapshot de ranking por `SQL` no worker; perfil SNAP; stream lê pronto; anonimização no snapshot.
**Portão:** board/ranking sem leituras sequenciais; `/api/stream/online` < ~1s; perfil 1 linha.

### Fase 4 — Desafios & Leitura (Lei Seca/Juris) + endpoints (workstreams B, D)
Páginas/APIs: `nova/cursos/central/desafios/*`, `leitura`/`jurisprudencia` (legado), `/api/leitura/*`, `/api/aluno/gamificacao/*`, `/api/sessoes/*`, `/api/maratona/estado`, `maratona`.
Trabalho: SNAP de trilha/desafio por aluno; endpoints idempotentes + invalidação + `REM` curto.
**Portão:** abrir desafio/leitura lê pronto; endpoints sem leitura pesada por chamada.

### Fase 5 — Simulados (catálogo, realizados, resultado) + escala janela fixa (workstreams B, D)
Páginas/APIs: `nova/cursos/central/questoes/{realizados,resultado,banco}`, `simulados`/`realizados`/`simulado/[id]` (legado + nova), `simulados/personalizados/*`, `/api/aluno/buscar-simulados`, `/api/simulado/hud`.
Trabalho: SNAP/`REM` do catálogo e do resultado; `buscar` com `SQL`; `WARM` pré-janela (estende o de relatórios) ao que o aluno abre na abertura.
**Portão:** carga ~1000 simultâneos sem degradar; auto-encerramento intacto.

### Fase 6 — Admin (listagens & relatórios) (workstream G)
Todas as listagens admin com `PAG`+`SQL`+busca no banco; estender `warm-cache`/`remember` às áreas novas (Atendimento/Demandas/Novidades/Flashcards) e reforçar relatórios.
**Portão:** nenhuma listagem admin traz tudo; counts no banco.

### Fase 7 — Acessos/Integrações + Infra/Observabilidade (workstreams F, H)
Curseduca/grupos/guru/matrículas incrementais + cache de acesso; `IDX` dos snapshots; crons de warm/roll cobrindo tudo; `egress-monitor` estendido; checklist no PR.
**Portão:** painel de métricas (p95, egress) estável; checklist aplicado em 100%.

---

## 3. Inventário completo → técnica → fase (resumo)

| Área / rota | Ofensor hoje | Técnica | Fase |
|---|---|---|---|
| `(portal)/layout.tsx` (chrome) | Promise.all por navegação | A: `REM` | 1 |
| `nova/painel` | — | ✅ SNAP | 0 |
| `nova/inicio` | cronograma+gam+banners/render | SNAP+REM | 1 |
| `nova/cursos/**` | `carregarCatalogoCursos` (árvore) | SNAP+query leve | 1 |
| `nova/cursos/central/questoes/**`, `simulados` | catálogo+stats/render | SNAP+SQL | 1/5 |
| `nova/desempenho`, `perfil` | relatório/analytics/render | SNAP | 1/3 |
| `nova/painel/cronograma/*` | abrirEmissao/render | SNAP (reusa painel) | 1 |
| `biblioteca`+`[id]`, Leitor, LegProc, JurisClub | árvore+thumbs (egress) | REM+PROJ+thumb path | 2 |
| `nova/comunidade/*`, `ligas`, board, `/api/stream/*` | rankings sequenciais | SQL ranking snapshot | 3 |
| `/api/aluno/gamificacao/*`, `leitura/ranking`, `jurisprudencia/ranking` | por chamada | REM/SNAP | 3/4 |
| desafios lei-seca/juris, `leitura`, `maratona`, `/api/leitura/*`, `/api/sessoes/*` | trilha/render + endpoints | SNAP+idempotente | 4 |
| simulados/realizados/resultado + personalizados + `/api/aluno/buscar-simulados` | catálogo/resultado/render | SNAP/REM+SQL+WARM | 5 |
| admin: estudantes/matriculas/banco-questoes/questoes/simulados/grupos/comentarios/feedbacks/auditoria/cronogramas/*/leitura-analise/correcao/* + relatorios/* | listagens sem PAG forte | PAG+SQL+REM/WARM | 6 |
| curseduca/grupos/guru/matrículas/acesso-efetivo, `/api/cron/*` | reconciliação pesada | incremental+cache | 7 |
| snapshots/listagens | índices/infra | IDX+PgBouncer/Redis+monitor | 7 |

---

## 4. Definição de pronto (por área)

- Página/endpoint: **≤2 queries leves**; sem loop/árvore/`fetchAll`/remontagem no render.
- Serviço `lib/<area>/snapshot.ts` (ou `remember`) + migração com `notify pgrst`.
- Mutações invalidam/atualizam o snapshot; `WARM`/roll no worker (gated).
- `PROJ`/`SQL`/`PAG`/`CHUNK` aplicados; sem `select('*')`.
- `tsc` 0; sem dado de exemplo como real; checklist de PR marcado.

## 5. Regras do processo

- **1 fase por vez**, portão aprovado antes da próxima; PR isolado por área; produção intacta até o flip.
- **Nada commitado/deployado sem pedido.** Migrações listadas e aplicadas em ordem (+ `notify pgrst` + hard refresh).
- Toda área nova nasce backend-first (a partir de agora, sem exceção).

## 6. Migrações pendentes (ordem de aplicação)
1. `20261027000000_flashcards` · 2. `20261027010000_duvidas_requerimentos` · 3. `20261027020000_demandas_material` ·
4. `20261028000000_novidades` · 5. `20261028010000_painel_snapshot` · (+ novas por fase).
