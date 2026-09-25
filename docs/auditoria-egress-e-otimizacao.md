# Auditoria & Plano Completo — Incidente de Egress do Supabase + Saúde do Sistema

> Documento único: **análise** (o que houve, causa raiz, o que foi investigado) **+ plano de correção**
> minucioso de todos os pontos falhos, com fontes. Branch `feat/discursivas-correcao-ocr` —
> **código não commitado/pushado**. Atualizado: 2026-09-25.
> Status: ✅ feito · 🟡 parcial · ⏳ pendente · 🔒 infra/manual (fora do código).

---

## 1. Sumário executivo

- **O que houve:** o projeto Supabase de **produção** foi **restrito pelo provedor** (Fair Use / "Egress Exceeded", HTTP **402**). Efeito em cascata: o app não conseguia ler o banco → `getCurrentTenant()` voltava `null` → alunos viam **"Plataforma não encontrada"** no login e **erro 500** no embed do Desafio de Lei Seca (Curseduca).
- **Diagnóstico:** **não** foi bug de código, deploy, tenant nem das mudanças de mobile. Foi **billing/infra** — a organização estourou a cota de egress do ciclo. O "login estranho / plataforma não encontrada" era apenas o **estado de fallback** que aparece quando o tenant não resolve (confirmado no código: `login-config.ts` título padrão + `api/aluno/login/route.ts` retorna 404 quando `tenantId` é nulo).
- **Correção imediata (feita):** desligar o **Spend cap** no Supabase → restrição cai na hora.
- **Correção estrutural (este plano):** cortar o egress na raiz para **nunca mais** estourar e reduzir o custo de excedente.
- **⚠️ Custo — a CONFIRMAR:** o print de billing mostrava "**20 GB incl., depois US$ 0,50/GB**" e "cobrança deste metric só começa em 2027". Então o excedente pode ser **~US$ 600/ciclo** (a ~1200 GB) **ou** estar em carência. **Conferir taxa e carência reais na página de Billing** — a estimativa inicial ("alguns dólares") estava errada.

**Nota atual do sistema: ~6/10** (ver §12). Meta pós-plano: **~8,5**.

---

## 2. Confiança & limitações (o que é MEDIDO × INFERIDO)

Honestidade metodológica — parte é medição, parte é inferência da auditoria de código:

- ✅ **MEDIDO (fato):**
  - Egress **por PROJETO** (billing): `app-simulado` = **1211,64 GB** · `revisao` = 4,74 GB · `app-mentoria` = 3,23 GB.
  - ⚠️ **Nomes de cobrança TROCADOS vs refs:** cobrança **"app-simulado" = ref `twdrtlxkjvunkdobudev` = a PRODUÇÃO REAL** (o banco que o código usa). "revisao" = ref `tlaxvhcqswiotzibulyo` = projeto antigo/ocioso (sondagem deu "fetch failed" = pausado). **Logo os 1211 GB são a produção de verdade.**
  - Contagem de linhas (produção): respostas_objetivas **169.700** · leitura_respostas 31.335 · xp_eventos 44.740 · estudantes 19.209 · sessoes_prova 3.734 · questoes 3.032 · audit_logs 6.153 · arquivos 432.
  - Padrões no código: `select('*')` (22), pollings de rede (8), crons (frequências), uploads sem cache, `fetchAll` nos relatórios.
- ❓ **INFERIDO (a confirmar → AÇÃO A0):** a **distribuição do egress por TIPO** (Database/API × Storage × Realtime × Auth × Supavisor) **não foi medida** no painel. A ordem de causas na §4 é **hipótese** baseada no código; é plausível que **Storage** (imagens/PDF a 19k alunos) dispute o topo com os **relatórios**. **Pegar esse breakdown antes de cravar a prioridade.**

---

## 3. O que foi analisado (escopo da auditoria)

1. **Auditoria de egress do `plataforma_simulado`** em 5 frentes (agentes de exploração): selects/over-fetch; `fetchAll`/relatórios; pollings/SSE/realtime; crons/worker; Storage/imagens/PDF.
2. **Billing do Supabase** (uso por projeto) → identificou o projeto real e desfez a confusão de nomes/refs.
3. **Contagem real das tabelas** (produção) para dimensionar impacto.
4. **Auditoria arquitetural completa do `app-mentoria`** (app do dev sênior, ~3 GB) para comparar padrões (§10).
5. **Pesquisa em fontes** (Supabase oficial + casos reais) das formas comprovadas de reduzir egress (§11).

---

## 4. Análise da causa raiz

### 4.1 Causa imediata (a cadeia do incidente)
Org excede cota de egress → Supabase aplica **Fair Use** e restringe TODOS os serviços do projeto (**402**) → `createAdminClient()` não lê `simulado_tenants` → `getCurrentTenant()` = `null` → login/embed caem no **fallback** ("Plataforma não encontrada") e páginas dão **500**. Não houve perda de dados; foi indisponibilidade por billing.

### 4.2 Causas estruturais (por que o egress ficou alto) — em ordem de impacto (hipótese, ver A0)
Egress = **bytes lidos** da API (PostgREST) + **downloads** do Storage. É cobrado por **bytes retornados** (incl. status/headers), **não por nº de queries** — por isso "ler tudo" é o vilão.

1. **Relatórios varrendo tabelas inteiras via PostgREST.** O código **tem** o caminho SQL agregado (`packages/data/src/relatorios.ts`, `analise.ts`, `sql.ts`, `sqlDisponivel()`), mas ele só liga com **`DATABASE_URL` (pooler) + `REPORT_SQL=on`**. Sem isso, cada relatório (estudante, simulado, ranking, disciplina, gráficos, resumos) faz `fetchAll` de `simulado_respostas_objetivas`/`sessoes_prova` (dezenas a centenas de milhares de linhas) por visita. Amplificado por admins atualizando + warm-cache recomputando. Alvos: `app/admin/relatorios/*/_dados.ts`, `_resumos.ts`, `lib/simulado/comparativo.ts`. **Provável maior fonte de DB egress.**
2. **Worker com crons lendo tabelas inteiras 24/7.** Ex.: auto-encerramento a cada **60s** lia todas as sessões `em_andamento` + respostas; warm-cache recomputava relatórios de todos os simulados de hora em hora (mesmo às 3h); storage-reconcile fazia BFS de todo o Storage. `apps/worker/src/main.ts` + `app/api/cron/*`.
3. **Storage sem cache longo.** Imagens (fundos de trilha ~2–8 MB, capas, símbolos) e PDFs (cadernos/relatórios) subiam com `Cache-Control` padrão de **1h** → re-baixados do origin a cada expiração por milhares de alunos (Supabase distingue egress **cacheado** ~$0,03/GB × **não-cacheado** ~$0,09/GB). `lib/storage/providers/supabase.ts` + uploads diretos.
4. **SSR/RSC re-consultando a cada navegação.** Diferente de um SPA com cache no cliente, cada página server-side refaz queries no Supabase por request.
5. **`select('*')` e colunas pesadas em listas** (`enunciado`/HTML, jsonb) em hot paths — trafega bytes que a tela não usa.
6. **Volume + tráfego reais** (19k alunos, janela fixa 1000+ simultâneos) amplificam tudo de forma não-linear. Os "outros projetos" (mentoria 3 GB) parecem baratos só porque estão **ociosos** — mesma classe de código, dados/tráfego ~zero.

> **Verificado (não é causa):** o `snapshot_gabarito` — marcado como "crítico" por um agente — na verdade é **pequeno** (`{alternativa_id, correta, letra}`) e usado como **fallback** de `alternativa_id`/`correta`. Remover daria ganho irrelevante e quebraria lógica. **Não mexer.**

### 4.3 Causa → Resolução → Fonte (comprovado em fontes)
As causas acima são **exatamente** as que a documentação do Supabase e casos reais apontam. Todos convergem em **4 correções**: projeção de colunas, paginação/agregação no banco, menos chamadas + cache, e cache/CDN de Storage.

| # | Causa (evidência nossa) | Resolução (fonte) | O que fizemos/faremos | Fonte |
|---|---|---|---|---|
| C1 | `select('*')` em tabelas grandes (22) | Projeção — "return only what the client needs" | Guardrail proíbe novos; reduzir 22 (T2) | [Egress docs](https://supabase.com/docs/guides/troubleshooting/all-about-supabase-egress-a_Sg_e) · [#14867](https://github.com/orgs/supabase/discussions/14867) · [ReadyToRelease](https://readytorelease.online/blog/supabase-egress-optimization-select-star) |
| C2 | Result sets grandes sem paginação (relatórios `fetchAll` 169k) | Paginação + reduzir campos/linhas + **agregar no banco** | Ligar SQL agregado (A1); `fetchAll` em chunks | [Egress docs](https://supabase.com/docs/guides/troubleshooting/all-about-supabase-egress-a_Sg_e) · [#14867](https://github.com/orgs/supabase/discussions/14867) |
| C3 | Queries repetidas (crons 60s, SSR, pollings) | Reduzir chamadas + **caching** (`supabase-cache-helpers`) | Crons ↑ + early-exit; polling pausa `hidden`; cache Redis; react-query | [Egress docs](https://supabase.com/docs/guides/troubleshooting/all-about-supabase-egress-a_Sg_e) · [DEV polling+select*](https://dev.to/masatoman/how-i-burned-through-supabases-free-egress-limit-5gb-1026gb-with-polling-and-select-2e0d) |
| C4 | Storage sem cache/otimização | `cacheControl` longo + **Smart CDN** + **Image Transformations**; cacheado ~$0,03/GB | `cacheControl:1 ano` (feito); avaliar CDN/transform; re-set antigos | [Storage Bandwidth](https://supabase.com/docs/guides/storage/serving/bandwidth) · [Storage/CDN](https://supabase.com/docs/guides/storage/production/scaling) · [Blog cached egress](https://supabase.com/blog/storage-500gb-uploads-cheaper-egress-pricing) |
| C5 | Insert/Update retornando linha inteira (`.select()`) | Retornar só o necessário (ex.: `id`) | Checklist de PR + guardrail (evolução) | [#14867](https://github.com/orgs/supabase/discussions/14867) |
| C6 | Realtime/Supavisor (risco de duplo-egress) | Evitar Realtime sem necessidade | Guardrail alerta; sem Realtime novo | [Egress docs](https://supabase.com/docs/guides/troubleshooting/all-about-supabase-egress-a_Sg_e) · [Realtime FAQ](https://supabase.com/docs/guides/troubleshooting/realtime-egress-faq) |

**Casos reais idênticos:** devs relatam "**1 query virar 19 GB**" e "**estourar a cota com polling + `select=*`**" — exatamente C1+C2+C3. Ver [ReadyToRelease](https://readytorelease.online/blog/supabase-egress-optimization-select-star), [DEV/victor](https://dev.to/victor_caa_ab4153b4bcf6e/how-i-turned-a-single-supabase-query-into-19gb-of-egress-7ob), [TAMSIV −90%](https://www.tamsiv.com/en/blog/supabase-egress-reduction), [AxonBuild](https://axonbuild.com/blog/supabase-egress-limit/).

---

## 5. Resolução — o que JÁ foi feito (código na branch)

| ID | Correção | Detalhe | Arquivo(s) |
|---|---|---|---|
| F1 | Frequência dos crons | auto-encerr. 60→180s · curseduca-sync 60→300s · leitura-publicar 60→300s · grupos→bancos 180→1800s · warm 1800→3600s · leitura-engaj. 1h→3h · storage-reconcile 6h→24h | `apps/worker/src/main.ts` |
| F2 | Storage `cacheControl` no provider | imutável (hash/timestamp)=1 ano · upsert=1h | `lib/storage/providers/supabase.ts`, `types.ts` |
| F3 | `cacheControl:31536000` nos uploads diretos | trilha-fundo, símbolo, material-pdf, questões, cadernos, hospedar-imagens/base64 | 7 arquivos |
| F4 | PDFs do worker | caderno=1 ano · relatório=1 dia | `pdf-caderno.ts`, `pdf-relatorio.ts` |
| F5 | Polling progresso | 15→30s + pausa `hidden` | `components/admin/simulado-progresso.tsx` |
| F6 | Monitor manutenção | 45→90s + pausa `hidden` | `components/aluno/monitor-manutencao.tsx` |
| F7 | Guardrail de egress | script + baseline + ratchet no CI + PR template | `scripts/check-egress-guardrails.mjs`, `.egress-baseline.json`, `pr-check.yml`, `pull_request_template.md` |
| F8 | warm-cache early-exit | aquece só simulados com atividade recente (90min) OU janela abrindo em 2h; senão pula | `app/api/cron/warm-cache/route.ts` |
| F9 | Observabilidade de leitura | `fetchAll`/`fetchAllByIn` avisam no log quando leem ≥ `EGRESS_WARN_ROWS` (20k) | `lib/supabase/fetch-all.ts` |
| F10 | **Pollings de rede pausam em `hidden`** (T3 concluído) | ao-vivo, board, prova-client (sync tempo, mantendo relógio local), tela-manutenção; relógios locais marcados `egress-ok` | `simulado-ao-vivo.tsx`, `simulados-board.tsx`, `prova-client.tsx`, `tela-manutencao.tsx` (+ opt-out no guardrail) |
| F11 | **early-exit no auto-encerramento** (T4) | COUNT barato pula o `fetchAll` de sessões em ticks ociosos (0 em_andamento e 0 janela vencida) | `app/api/cron/encerrar-expirados/route.ts` |
| F12 | **Runbooks operacionais** (D4) | deploy (SHA completo/rollback), incidente egress (402), mapa projeto↔ref | `docs/runbook-deploy-e-incidentes.md` |
| F13 | **Log de status do SQL agregado** (O5) | `sqlDisponivel()` loga UMA vez ATIVO/INATIVO + motivo (`DATABASE_URL ausente`/`REPORT_SQL=off`) → confirma no log se A1 está resolvido | `packages/data/src/sql.ts` |

**Baseline do guardrail agora:** `{selectStar:22, pollingSemPausa:0, cronRapido:0, rangeGigante:0}` (polling zerado nesta rodada).
Verificação: `tsc` ✅ · ratchet ✅ · `next build` 🟡 (re-rodar antes do deploy).

---

## 6. Ações de INFRA/ENV (🔒 dependem de você — fora do código)

| ID | Problema | Correção | Verificação | Prio |
|---|---|---|---|---|
| A0 | Não sabemos a fonte real dominante | **Breakdown de egress por TIPO** (Supabase → Reports/Usage) | saber Database × Storage | P0 |
| A1 | SQL agregado desligado (maior lever) | `DATABASE_URL`(pooler 6543 `?pgbouncer=true`) + `REPORT_SQL=on` + `REDIS_URL` no `web` **e** `worker` → restart | relatório usa SQL no log | P0 |
| A2 | Deploy frágil (SHA curto → 404) | Deploy por **SHA COMPLETO** após Actions verde | site novo no ar | P0 |
| A3 | 2 projetos Supabase (custo/confusão) | Backup + **pausar `tlaxv`**; padronizar 1 projeto | tlaxv sem tráfego | P1 |
| A4 | Sem monitoramento | Checagem semanal + orçamento (< 60% da cota) | rotina/alerta | P1 |
| A5 | Spend cap aberto = conta em aberto | Após estabilizar, reativar cap OU manter com orçamento | decisão registrada | P2 |

---

## 7. Plano por DIMENSÃO de falha (fundamentado)

> Cada item: **Fundamento** (o princípio que justifica) · **Abordagem** (como, no alvo) · **Impacto/critério** · prioridade/status.
> Princípio-mestre: *egress = bytes que SAEM do Supabase*. Reduz-se de 4 formas — (a) ler menos linhas (agregar no banco), (b) ler menos colunas (projeção), (c) ler menos vezes (cache/menos chamadas), (d) baixar menos arquivos (cache/CDN). Todo item abaixo se ancora numa dessas.

### D1 — Observabilidade  *(2 → 5; teto 7)*
**Fundamento da dimensão:** o incidente durou porque **ninguém enxergava** o egress subindo — só o bloqueio avisou. Sem sinal, qualquer correção é no escuro. Observabilidade vem ANTES de otimizar (não dá pra priorizar o que não se mede).

- **O1 ✅ (F9)** — *Fundamento:* leituras gigantes eram invisíveis. *Abordagem:* `fetchAll`/`fetchAllByIn` logam `[egress] leitura grande` acima de `EGRESS_WARN_ROWS` (20k). *Impacto:* a maior leitura aparece no log com o rótulo → aponta o arquivo culpado.
- **O5 ✅ (F13)** — *Fundamento:* não sabíamos se o SQL agregado (a maior economia) estava ligado. *Abordagem:* `sqlDisponivel()` loga UMA vez ATIVO/INATIVO + motivo (`REPORT_SQL=off` ou `DATABASE_URL ausente`). *Impacto:* 1 linha de log confirma se **A1 já está resolvido** ou ainda pendente — decide o foco (relatórios × Storage).
- **O2 ⏳🔒 (A0)** — *Fundamento:* billing só mostra egress por PROJETO, não por TIPO; sem isso, priorizar relatórios × Storage é chute. *Abordagem:* Supabase → Reports/Usage → egress por categoria. *Impacto:* define a alavanca real.
- **O4 ⏳ (P2, código)** — *Fundamento:* crescimento de dados é lento e silencioso até virar egress. *Abordagem:* cron semanal registra contagem/tamanho das maiores tabelas (via RPC `pg_total_relation_size` OU `count`) e dispara webhook se crescer > X%. *Impacto:* tendência visível antes de doer.
- **O3 ⏳🔒 (A4)** — alerta de orçamento (% da cota). *Impacto:* aviso proativo, não reativo.

### D2 — Arquitetura / Egress de dados  *(4 → 5,5; teto 8)*
**Fundamento da dimensão:** SSR re-consulta o banco a cada navegação e os relatórios trazem LINHAS para agregar no app — o oposto do ideal (agregar no banco, cachear o resultado). A correção estrutural é mover cálculo para o SQL e cortar leituras repetidas.

- **T1 (P0, gate = A1)** — *Fundamento:* trazer 169k linhas para contar no app é o pior padrão; o SQL faz a agregação no banco e devolve KB. O caminho **já existe** (`packages/data/src/*`) e é **opt-out** (liga sozinho com `DATABASE_URL`). *Abordagem:* garantir que `relatorios/*/_dados.ts`, `_resumos.ts`, `comparativo.ts` chamem `sqlDisponivel()`/`sqlQuery` e só caiam no PostgREST em falha; **confirmar `DATABASE_URL` setado** (O5 diz). *Impacto:* egress do relatório de MB→KB; **maior lever se A1 estiver pendente**.
- **T2 (P1, risco médio)** — *Fundamento:* egress é por **bytes retornados**; `select('*')` traz `enunciado`/HTML/jsonb que a tela não usa. Projeção corta proporcional. *Abordagem:* por arquivo, ler o consumo a jusante e projetar só o necessário. **Alta (linha grande/quente):** `leitura/actions.ts:196,247,307,551,602` · `leitura/[id]/page.tsx:26` · `questoes/[id]/editar/page.tsx:49` · `questoes/actions.ts:368` · `simulados/actions.ts:136` · `simulados/[id]/page.tsx:59` · `banco-questoes/actions.ts:241,308` · `cadernos/actions.ts:123` · `compartilhamento/copiar.ts:117,183`. **Baixa (singleton, higiene):** `config-global.ts:23` · `gamificacao/config.ts:152` · `tenant-messages.ts:82,100` · `gamificacao/actions.ts:28` · `cronogramas/conteudos/actions.ts:413,431`. *Impacto:* baseline `selectStar` 22→0; menos bytes por request; `--save`.
- **T4 🟡→✅parcial** — *Fundamento:* cron que varre tabela inteira 24/7 é egress contínuo mesmo sem trabalho. *Abordagem/feito:* warm-cache só aquece o que tem atividade/janela (F8); auto-encerramento pula o `fetchAll` com COUNT barato em ticks ociosos (F11). *Falta:* `sincronizar-grupos-bancos` incremental (P2 — já 10× menos frequente em F1). *Impacto:* leitura ~0 nas horas sem uso.
- **T7 (P1)** — *Fundamento:* listas trazem `enunciado`/HTML completo de N itens só para exibir um título. *Abordagem:* lista projeta resumo; texto completo carrega ao abrir o item (lazy). *Impacto:* corta bytes por linha nas listas quentes.
- **T13 (P2, risco médio)** — *Fundamento:* no SSR cada navegação refaz queries; um SPA/cache serviria do cliente. *Abordagem:* `revalidate`/`unstable_cache`/Redis nas RSC quentes; `react-query` no client-side; cachear resolução de tenant/tema (TTL curto + invalidação no save). *Impacto:* menos leitura por navegação (é o padrão que mantém o mentoria barato).
- **T10 (P2)** — loops `.range()` manuais → `fetchAll`/SQL (`lib/storage/organizador.ts`, `lib/gamificacao/cache.ts`). *Fundamento:* N queries onde 1 agregada resolve.

### D3 — Storage / arquivos  *(parte de egress; uploads ✅)*
**Fundamento da dimensão:** arquivo grande servido sem cache é re-baixado por milhares de alunos → egress dispara. Cache longo + CDN transformam N downloads em 1 (cacheado ~$0,03/GB vs $0,09).
- **✅ (F2/F3/F4)** uploads imutáveis com `Cache-Control` de 1 ano.
- **T5 (P1)** — servir PDFs por rota Next com `Cache-Control` + **path versionado (hash)**. *Fundamento:* URL crua sem header re-baixa; path por conteúdo permite cache imutável com invalidação limpa na re-correção.
- **T6 🟡 (P1)** — reconcile de Storage por **evento** (upload/delete), não BFS total (já 24h em F1). *Fundamento:* varrer todo o bucket periodicamente lê metadados de tudo à toa.
- **T12 ⏳🔒 (P1, depende de A0)** — **Smart CDN** + **Image Transformations** (servir imagem no tamanho do layout). *Fundamento:* aumenta cache-hit e reduz bytes por imagem; egress cacheado é 3× mais barato.
- **T8 (P2)** — script one-off re-set `cacheControl` dos **432 arquivos antigos**. *Fundamento:* F2/F3 só valem para novos uploads.

### D4 — Resiliência / Operação  *(4 → 6; teto 7,5)*
**Fundamento da dimensão:** o incidente foi agravado por fragilidades operacionais — deploy por SHA que gera 404, 2 projetos Supabase com nomes trocados, e nenhum passo-a-passo. Runbook transforma conhecimento tácito em processo repetível.
- **R2 ✅ (F12)** · **R3 ✅ (F12)** · **R5 ✅ (F12)** — runbooks de deploy e incidente + mapa **projeto↔ref** em `docs/runbook-deploy-e-incidentes.md`. *Impacto:* elimina o 404 por SHA curto e o tempo perdido com a confusão de nomes.
- **R1 ⏳🔒 (A3)** — pausar/arquivar `tlaxv`. *Fundamento:* 2 projetos ativos somam egress/custo e confundem diagnóstico.
- **R4 ⏳🔒 (A5/A4)** — política de spend cap + orçamento. *Fundamento:* cap desligado sem orçamento = custo sem freio.

### D5 — Segurança  *(7; teto 8)*
**Fundamento:** não foi o vetor do incidente, mas a auditoria não pode assumir cobertura.
- **S1 (P2)** — revisar RLS em 100% das tabelas com `tenant_id` (isolamento é a última linha se uma query esquecer o filtro).
- **S2 🟡** — confirmar service-role só server-side; nenhum segredo em `NEXT_PUBLIC_*`/bundle.
- **S3 ⏳🔒 (outro repo, mentoria)** — `student_user_id` do corpo com token opcional (`STUDENT_TOKEN_REQUIRED` default `false`) → confirmar env em prod.

### D6 — Qualidade / Guardrails  *(6 → 7,5; teto 8,5)*
**Fundamento da dimensão:** sem trava, o egress reincide no próximo PR. O guardrail transforma a lição do incidente em regra automática (ratchet = não piora).
- **Q1 ✅ (F7)** — guardrail + ratchet no CI + PR template.
- **T3 ✅ (F10)** — pollings de rede pausam em `hidden` (ao-vivo, board, prova sync, tela-manutenção); relógios locais marcados `egress-ok`. Baseline polling 8→0.
- **Q2 ⏳** — reduzir `selectStar` (T2) e baixar o teto (`--save`).
- **Q3 ⏳ (P2)** — testes: loaders de relatório (SQL×fallback) e o próprio guardrail (garante que o gate não regride).

### D7 — Dados / Crescimento & Retenção  *(preventivo)*
**Fundamento da dimensão:** tabelas só crescem; sem índice, o filtro vira full-scan (mais leitura = mais egress); sem retenção, logs incham para sempre.
- **T9 (P2)** — índices (validar colunas no schema): `simulado_respostas_objetivas(tenant_id, sessao_id)`, `simulado_sessoes_prova(simulado_id, status)`, `(…, deleted_at)`. *Fundamento:* índice cobre o filtro → lê só o necessário.
- **DR1 (decisão)** — **arquivamento** de histórico frio (não apagar dados de negócio); logs (`audit_logs`) com retenção (ex.: 12 meses) via cron **opt-in aprovado**.

---

## 8. Não fazer / verificado (evita retrabalho e regressão)
- `snapshot_gabarito` — pequeno + fallback → **não remover**.
- Sinos de notificação — já pausam em `hidden` → **OK**.
- Poda destrutiva de dados de negócio → **não apagar** (usar índices/arquivamento).
- Cache de relatório = **Redis (TTL)** → sem retenção de banco.
- `encerrar-expirados` — já projeta colunas + 180s; early-exit ali é marginal (só o skip trivial vale).

---

## 9. Guardrails ativos & verificação global
- **Guardrail:** `check-egress-guardrails.mjs` (`select('*')`, polling de rede sem pausa, cron<60s, `.range` gigante). Baseline `{selectStar:22, pollingSemPausa:8, cronRapido:0, rangeGigante:0}`. CI (`pr-check.yml`) roda `lint:egress:ratchet` → falha se piorar. PR template com checklist.
- **Definição de pronto:** `tsc` ✅ · `build` (re-rodar) · `ratchet` ✅ · pós-deploy: A0 cai, relatórios usam SQL, Storage com `Cache-Control` longo, warm "pulado" em horas ociosas, sem regressão (login/embed/simulado/leitura/relatórios). Meta: egress << 1211 GB e << cota.

---

## 10. Comparação com o `app-mentoria` (por que fica em ~3 GB)
Não é "código melhor" — é **arquitetura + operação + escala menor**:
- **SPA estático** (Vite + nginx com gzip e cache 1 ano) → o app não sai do Supabase; no nosso SSR, cada navegação re-consulta no servidor.
- **Load-once no cliente** (AppContext) + `react-query` (cache no browser) → navegar não re-busca.
- **Sem worker de crons 24/7**; lógica pesada em **RPC/triggers/edge functions** (cálculo no banco, não puxando tabelas).
- **Sem Realtime/polling** desnecessário; **PII via RPC**.
- É **menor** em dados/tráfego.

**Adotar:** ligar SQL agregado (T1), cache/ISR + cache client (T13), assets com cache longo (feito), early-exit/menos cron (F1/F8/T4), storage por CDN (T12).

> **Achado de segurança do mentoria (avisar o dev):** `enroll-student`/`validate-student`/`submit-evaluation` aceitam `student_user_id` do corpo; o token HMAC só é obrigatório com `STUDENT_TOKEN_REQUIRED=true` (default `false`/fail-open) → risco de um aluno se passar por outro. Confirmar env em produção.

---

## 11. Roadmap ordenado
1. **A0** (medir por tipo) → confirma o foco real.
2. **A1 + A2** (SQL agregado + deploy) → maior corte.
3. **A3/A4** (pausar tlaxv + monitorar) + **R2/R3** (runbooks).
4. **P1 código:** T1 · T2 (alta) · T3 · T4 · T5/T6 · T7 · T12.
5. **P2:** T9 · T10 · T13 · Q3 · DR1 · S1.
6. Reduzir baseline (`--save`) e reavaliar a nota.

---

## 12. Avaliação do sistema (nota por dimensão)
> Notas revistas após a rodada de execução de 2026-09-25 (F8–F12). "→" mostra a evolução.

| Dimensão | Nota | O que subiu / o que falta p/ mais |
|---|---|---|
| Observabilidade | 2→**5** | +F9 (log de leitura grande) +runbook de monitoramento. Falta A0 (egress por tipo) + O4/O5 → 7 |
| Arquitetura/egress | 4→**5,5** | +T3 pollings +T4 early-exit (encerrar/warm). Falta A1 (SQL agregado) + T2 (select*) + T13 → 8 |
| Resiliência/operação | 4→**6** | +runbooks (deploy/incidente/mapa projeto↔ref). Falta A3 (pausar tlaxv) + A4 → 7,5 |
| Performance | 5→**6,5** | storage cacheado + warm/encerrar early-exit + pollings pausados. Falta SQL agregado → 8 |
| Segurança | **7** | RLS/authz ok; não foi o vetor. Falta S1 (revisão RLS 100%) → 8 |
| Qualidade/guardrails | 6→**7,5** | guardrail+ratchet+PR template + baseline polling **zerado** + opt-out preciso. Falta T2 (select*) + testes → 8,5 |
| Resposta ao incidente | **7,5** | diagnóstico correto + runbook agora documenta os deméritos (SHA curto, custo) p/ não repetir |
| Prevenção | 6→**7** | guardrails + runbooks + instrumentação. Falta monitoramento ativo (A4) → 8 |
| **GERAL** | **~6,5** (era 5,5) | trajetória: **A1/A2 (env+deploy) → ~7,5** · **T2 + A3/A4 → ~8,5** |

**Por que ainda não é 8+:** os maiores saltos restantes dependem de **2 alavancas que não são código**: **A1** (ligar o SQL agregado nas envs) e **A0/A4** (medir e monitorar o egress). Com elas + **T2** (projeção de colunas), as notas de Arquitetura/Observabilidade/Performance fecham em 8.

---

## 13. Referências (fontes)
**Supabase oficial:** [All about Egress](https://supabase.com/docs/guides/troubleshooting/all-about-supabase-egress-a_Sg_e) · [Manage Egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress) · [Storage Bandwidth/Egress](https://supabase.com/docs/guides/storage/serving/bandwidth) · [Storage Optimizations/CDN](https://supabase.com/docs/guides/storage/production/scaling) · [Blog cached egress 3x](https://supabase.com/blog/storage-500gb-uploads-cheaper-egress-pricing) · [Realtime Egress FAQ](https://supabase.com/docs/guides/troubleshooting/realtime-egress-faq) · [GitHub #14867](https://github.com/orgs/supabase/discussions/14867)
**Casos reais:** [ReadyToRelease 19GB→~0](https://readytorelease.online/blog/supabase-egress-optimization-select-star) · [DEV 1 query=19GB](https://dev.to/victor_caa_ab4153b4bcf6e/how-i-turned-a-single-supabase-query-into-19gb-of-egress-7ob) · [DEV polling+select=*](https://dev.to/masatoman/how-i-burned-through-supabases-free-egress-limit-5gb-1026gb-with-polling-and-select-2e0d) · [TAMSIV −90% cache](https://www.tamsiv.com/en/blog/supabase-egress-reduction) · [AxonBuild achar consumo](https://axonbuild.com/blog/supabase-egress-limit/)

---

## 14. Anexo — arquivos tocados (branch, não commitado)
`apps/worker/src/main.ts` · `apps/web/lib/storage/providers/supabase.ts` · `lib/storage/types.ts` · `app/api/admin/leitura/trilha-fundo/route.ts` · `app/api/admin/gamificacao/simbolo/route.ts` · `app/api/admin/material-pdf/route.ts` · `app/admin/questoes/actions.ts` · `app/admin/cadernos/actions.ts` · `lib/caderno-designer/hospedar-imagens.ts` · `lib/storage/hospedar-base64.ts` · `apps/worker/src/processors/pdf-relatorio.ts` · `pdf-caderno.ts` · `components/admin/simulado-progresso.tsx` · `components/aluno/monitor-manutencao.tsx` · `app/api/cron/warm-cache/route.ts` · `lib/supabase/fetch-all.ts` · `scripts/check-egress-guardrails.mjs` · `scripts/.egress-baseline.json` · `package.json` · `.github/workflows/pr-check.yml` · `.github/pull_request_template.md`
