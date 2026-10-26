# Plano definitivo — Redução de egress + latência no SISTEMA INTEIRO (v2, sem quebrar nada)

> Escrito para: devs/agentes que vão executar. **Constrói sobre** `docs/auditoria-egress-e-otimizacao.md`
> (set/2026) — não repete a análise de causa-raiz; aqui é o **plano de aplicação definitiva** + o que é NOVO.
> Branch atual: `feat/discursivas-correcao-ocr`. Regra do projeto: nada de deploy/commit sem pedido.

## 0. O que já está resolvido e o que MUDOU desde o audit de set/2026

- ✅ **O lever #1 (A1) agora está destravado:** `DATABASE_URL` ESTÁ setado (antes ausente). Logo o **SQL
  agregado dos relatórios** (`lib/data/sql.ts` → `sqlQuery`, `*.repo.ts`/`*-api.ts`) deve estar ATIVO.
  **Ação imediata:** abrir um relatório e confirmar no log `sqlDisponivel() → ATIVO` (F13). Se disser
  INATIVO, conferir `REPORT_SQL` (vazio = on) e `REDIS_URL` no `web` e no `worker`.
- ✅ **Storage migrado para Hetzner** (cópia 100%, verificada) — muda o quadro de egress de Storage: ao
  **flipar `STORAGE_PROVIDER=s3`**, o egress de arquivos sai do Supabase. (Storage no Supabase já era só
  ~0,23 GB — o gargalo sempre foi **leitura de banco**, confirmado no audit.)
- ✅ **Guardrail anti-regressão já existe:** `scripts/check-egress-guardrails.mjs` + ratchet no CI +
  PR template (baseline `selectStar:22`). Toda query nova é barrada se piorar.
- 🆕 **Área NOVA não coberta pelo audit: a BIBLIOTECA/Modelos inteira** (redesign desta sessão). Ela usa
  **PostgREST (`fetchAll`/`.in()`) para tudo** — contagens da árvore, acesso, sidebar, gerenciamento. É o
  novo foco de egress/latência. Já foi **paralelizada** nesta sessão (menos round-trips), mas **ainda não
  usa SQL agregado nem cache** — é a Fase 1 deste plano.

## 1. Princípio-mestre (recap do audit) + a REGRA de "não quebrar nada"

Egress = **bytes que SAEM** do Supabase. Reduz-se de 4 formas: (a) ler menos LINHAS (agregar no banco),
(b) ler menos COLUNAS (projeção), (c) ler menos VEZES (cache/menos chamadas), (d) baixar menos ARQUIVOS
(cache/CDN). `pg` direto vs PostgREST: para o MESMO dado corta **latência** (sem overhead HTTP); o corte de
**egress** vem de (a)+(b)+(c).

**Garantia de não-quebrar — o padrão de migração segura (já existe no projeto, generalizar):**
1. **Flag por área + modo SHADOW.** Como o `REPORT_SQL=shadow` (roda SQL **e** PostgREST, compara os
   resultados, **loga divergências** e serve o PostgREST). Cada query migrada roda em shadow primeiro →
   zero divergência por N dias → só então flipa para servir o SQL. Rollback = voltar a flag.
2. **Fallback sempre.** Toda função SQL cai no PostgREST em erro (`try/catch`), como os loaders de relatório
   já fazem. Se o `DATABASE_URL` cair, o sistema continua (mais lento, mas vivo).
3. **Forma de retorno imutável.** Nunca muda o shape que o componente consome — só a FONTE. (Foi o que fiz
   nos loaders da Biblioteca: paralelizei por dentro, retorno igual.)
4. **Ratchet do guardrail + `tsc`/`build` verdes** a cada etapa. Nada deployado sem o usuário.
5. **Uma área por vez** (faseamento abaixo), cada uma entregável e reversível sozinha.

## 2. Inventário de ALAVANCAS por área (o que aplicar onde)

| Área | Hoje | Alavanca | Egress↓ | Latência↓ |
|---|---|---|---|---|
| **Relatórios/rankings** | SQL agregado (A1) — confirmar ATIVO | manter + cache Redis (`relatorio_cache`) | já alto | já |
| **Biblioteca/Modelos (admin)** | `fetchAll` de TODOS os docs p/ contar; acesso por `fetchAllByIn`; sidebar/gerenciamento N queries | **SQL agregado** (GROUP BY/COUNT/EXISTS) p/ contagens+acesso; **cache `remember`** por (tenant,área); paralelizado (feito) | **Alto** | Alto |
| **Biblioteca (aluno) / Leitura** | árvore varre docs publicados por request; cache `remember` 90s por aluno | cache por (tenant,pasta) + gate por cima; projeção | Médio | Médio |
| **Listas/boards** (questões, simulados, cadernos) | `select('*')` + texto/HTML/jsonb que a lista não usa (22 casos) | **projeção** (T2) + **texto lazy** ao abrir (T7) | Alto | Médio |
| **SSR/navegação** | cada navegação re-consulta | `revalidate`/`unstable_cache`/Redis nas RSC quentes; `react-query` no client; cache de tenant/tema | Médio | Alto |
| **Storage/arquivos** | migrado Hetzner; capa lazy+sem thumb no load (feito) | **flipar `s3`** + **Cloudflare CDN** na frente (cache-hit alto, 3× mais barato) | Médio | Alto |
| **Crons/worker** | já reduzidos (F1/F8/F11) | incremental onde falta (`sincronizar-grupos-bancos`) | Baixo | — |
| **Índices** | T9 pendente | índices nas colunas de filtro quente | indireto | Alto |

## 3. Faseamento DEFINITIVO (cada fase: shadow → confirmar → flipar → ratchet)

### Fase 0 — Confirmar levers + medir (1 dia, sem código de risco)
- Confirmar `sqlDisponivel() → ATIVO` no log (abrir 1 relatório). Se INATIVO, corrigir env (A1).
- Pegar o **breakdown de egress por TIPO** no Supabase (Reports/Usage) — A0 do audit, ainda pendente.
- Rodar o guardrail (`lint:egress:ratchet`) p/ baseline atual.

### Fase 1 — BIBLIOTECA/Modelos para SQL agregado + cache (a área nova, maior ganho novo)
- Criar `lib/data/biblioteca.repo.ts` (+ `*-api.ts` seguindo o padrão de `relatorios.repo.ts`):
  - **Contagens da árvore:** `SELECT pasta_id, count(*) … GROUP BY` + `EXISTS` p/ restrito (hoje `listarArvore`
    puxa TODOS os docs da área só pra contar no JS — `actions.ts`).
  - **Acesso agregado da pasta:** `count(distinct grupo_id/estudante_id)` (hoje `fetchAllByIn`).
  - **Sidebar:** contagens (leituras/grifos já são `count head` — ok) e acesso por SQL.
- Envelopar com `remember(chave, ttl)` por (tenant, categoria[, pasta]); **invalidar** no mutate (criar/mover/
  renomear/excluir/publicar) — as actions já chamam `revalidatePath`; adicionar `invalidar()` da chave.
- **Shadow primeiro**: SQL × PostgREST, logar divergência, servir PostgREST; flipar após 0 divergências.
- Projeção: `listarDocumentos` já é enxuto; conferir que nenhum select da Biblioteca traz `html_rico`/trechos
  grandes na LISTA (texto só ao abrir).

### Fase 2 — Projeção de colunas no sistema (T2, 22 casos) — "ler menos colunas"
- Trocar `select('*')` por projeção nos hot paths listados no audit §7/T2 (leitura/actions, questoes, simulados,
  banco-questoes, cadernos, compartilhamento) + os singletons (higiene). Baixar o baseline do guardrail (`--save`).
- Risco médio: conferir o consumo a jusante de cada um antes de cortar coluna.

### Fase 3 — Texto/HTML lazy nas listas (T7) + confirmar relatórios (T1)
- Listas trazem resumo; `enunciado`/HTML completo carrega ao abrir o item.
- Confirmar que TODOS os relatórios/ranking/comparativo passam por `sqlQuery` (não caem no `fetchAll`).

### Fase 4 — Storage: flip Hetzner + CDN (T5/T12)
- Flipar `STORAGE_PROVIDER=s3` (storage já copiado) → egress de arquivos sai do Supabase.
- **Cloudflare na frente** do Hetzner (cache-hit alto; os alunos acessam via iframe Curseduca sem CDN hoje —
  [[acesso-aluno-via-curseduca-obrigatorio]]). Servir imagens/PDF com `Cache-Control` longo + path por hash.

### Fase 5 — Cache/ISR no SSR + cliente (T13) — "ler menos vezes"
- `unstable_cache`/`revalidate`/Redis nas RSC quentes; `react-query` no client; cache de resolução de
  tenant/tema (TTL curto + invalidação no save). É o padrão que mantém o `app-mentoria` barato (audit §10).

### Fase 6 — Índices (T9) + guardrails permanentes
- Índices nas colunas de filtro quente (validar no schema): `simulado_conteudo_documentos(tenant_id, categoria,
  deletado)`, `_versoes(documento_id, numero)`, tabelas de acesso por `documento_id`/`pasta_id`,
  `respostas_objetivas(tenant_id, sessao_id)`, `sessoes_prova(simulado_id, status)`.
- Guardrail: estender `check-egress-guardrails.mjs` p/ também pegar **`fetchAll` sem agregação em hot path** e
  **`.in()` sem chunk**; manter o ratchet. PR checklist já existe.

## 4. Receita por query (o passo-a-passo que todo item segue)
1. Medir: quantas linhas/bytes a query traz hoje (o log `[egress] leitura grande` de F9 já ajuda).
2. Reescrever em SQL agregado (`sqlQuery` em `lib/data/<area>.repo.ts`) OU projetar colunas OU paginar.
3. Envelopar com `remember`/cache onde repete; invalidar no mutate.
4. Rodar em **shadow** (compara com o atual, loga divergência, serve o antigo).
5. 0 divergência por N dias → flipar a flag para servir o novo.
6. `tsc` + `build` + ratchet verdes. Sem deploy sem aprovação.

## 5. Verificação / métricas
- **Antes/depois por área:** o tempo das actions aparece no log do Next (`ƒ nome in Xms`) — comparar.
- **Egress global:** Supabase → Reports/Usage (por tipo, A0) — meta: << 1211 GB/ciclo e << cota.
- **Divergência shadow:** log deve ficar **zerado** antes de flipar.
- **Sem regressão funcional:** login, embed Curseduca, simulado, leitura, relatórios, Biblioteca (abrir pasta,
  sidebar, editor, gerenciar) — smoke manual a cada fase.

## 6. Riscos e mitigação
- **SQL divergir do PostgREST** (RLS/tenant): o shadow pega antes de servir; o fallback mantém vivo.
- **Cache servir dado velho:** invalidação no mutate (as actions já revalidam) + TTL curto.
- **`DATABASE_URL`/pooler cair:** fallback PostgREST automático (mais lento, não quebra).
- **Flip de storage com URL antiga:** nada é apagado no Supabase → URLs antigas seguem até a reescrita (opcional).
- **Latência local alta (~1-2s/query neste ambiente):** é da conexão desta máquina com o Supabase remoto; em
  produção (VPS perto do pooler) cai muito. Não confundir "lento no meu PC" com "lento em prod".

## 7. Ordem de execução recomendada
Fase 0 (confirmar A1 + medir A0) → **Fase 1 (Biblioteca SQL+cache — maior ganho novo)** → Fase 2 (projeção) →
Fase 3 (lazy + confirmar relatórios) → Fase 4 (flip Hetzner + CDN) → Fase 5 (cache SSR/cliente) → Fase 6
(índices + guardrail). Cada fase pode ser disparada em **agentes com ownership isolado** (uma área por agente),
com shadow + `tsc`/`build` verdes, sem deploy.
