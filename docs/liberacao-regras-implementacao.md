# Regras de Liberação de Acesso (webhooks de venda) — Relatório de Implementação

> Público: engenheiros que vão manter/estender este sistema.
> Status: implementado (Fases 1–4), **não commitado/deployado** no momento deste documento.
> Spec de origem: `PROMPT_REGRAS_LIBERACAO_ACESSO.md`.

## 1. Objetivo

Liberar/revogar acesso a **produtos** da plataforma automaticamente a partir de **vendas** em
plataformas de infoproduto (Hotmart, Guru, Kiwify, Hubla, …), por meio de **regras configuráveis**:
o admin define *quando* uma venda concede *o quê* (e por *quanto tempo*), o sistema recebe o webhook,
casa contra as regras e materializa o acesso — criando o aluno se não existir.

## 2. Decisão de arquitetura: duas camadas complementares (unificação)

Este recurso foi construído em paralelo por duas frentes que convergiram numa arquitetura única de
**duas camadas que se encaixam** (não concorrem):

| Camada | Onde | Papel |
|---|---|---|
| **Catálogo de produtos** | `lib/produtos/*`, `app/admin/produtos/*` | Define o produto (tipo, tier, validade), **como** o aluno entra (`fontes`) e **o que** ele libera (`itens`). Materializa acesso. |
| **Motor de regras** | `lib/integracoes/liberacao/*`, `app/admin/liberacao/*` | Casa a venda contra **regras AND** configuráveis e gera **concessões** (`access_grants`) com data de início/fim e ciclo de vida. |

**Prioridade de gatilho** (decisão de produto: *"regras por cima, auto-map de fallback"*):
1. Uma venda chega → o motor de regras tenta casar. **Regra casou → manda** (gera `access_grants`).
2. **Nada casou →** cai no caminho existente (`aplicarEntitlement`): auto-mapeamento 1:1
   (`simulado_integracao_mapeamentos`) **+** o hook do catálogo (`aplicarProdutosPorFonte`), que
   concede produtos cujas **fontes** batem com o produto da plataforma.

Ambos os caminhos concedem **o mesmo produto** e materializam pelos **mesmos itens** — há um só
caminho de materialização (o `conceder.ts` do catálogo). Isso garante que **todos os gates de acesso
do aluno que já existem continuam valendo sem nenhuma alteração** neles.

## 3. Modelo de dados

### 3.1 Catálogo (migração `20261030000000_produtos_extensivos.sql` + `..._produtos_colunas` para colunas ricas)
- **`simulado_produtos`** — `nome, slug, tipo, descricao, tier (passaporte|vitalicio|normal),
  validade_tipo (vitalicio|dias|data_fixa), validade_dias, validade_data, ativo, cor, capa_url, ordem`.
- **`simulado_produto_fontes`** — `provider, fonte_ref, fonte_nome, ativo` — *como* o aluno entra
  (grupo Curseduca / produto Guru / manual). `fonte_ref` null = manual.
- **`simulado_produto_itens`** — `tipo_item (grupo|banco|simulado|biblioteca_pasta|biblioteca_doc|
  desafio|cronograma), item_id, permissoes jsonb, ativo` — *o que* o produto libera.
- **`simulado_assinaturas`** (+`produto_id`, +`origem`) — ciclo de vida das concessões por **fonte/manual**.

### 3.2 Regras (migração `20261030000001_liberacao_regras.sql`)
- **`simulado_liberacao_regras`** — `nome, status (active|paused|canceled), prioridade, filtros jsonb,
  inicio jsonb, fim jsonb, paused_at, canceled_at`.
- **`simulado_liberacao_regra_produtos`** — N:N regra → `simulado_produtos` (os produtos que a regra concede).
- **`simulado_liberacao_pedidos`** — pedido/venda normalizado + `processing_state (pending|granted|
  no_matching_rule|blocked_by_paused_rule|revoked|ignored)`. `UNIQUE(provider, pedido_id)` (idempotência).
- **`simulado_access_grants`** — **fonte de verdade** da concessão por **regra**: `estudante_id,
  produto_id, pedido_id, regra_id, inicio_em, fim_em (null=vitalício), status (scheduled|active|
  expired|revoked), motivo_revogacao`. `UNIQUE(pedido_id, regra_id, produto_id)` (idempotência).
- **`simulado_status_mappings`** — mapa editável `status bruto → positive|negative|neutral`
  (por plataforma ou global `''`).

Todas as tabelas têm `tenant_id` + **RLS** por `public.user_tenant_ids()`; o app usa `createAdminClient`
(service role) que bypassa a RLS, validando `tenant_id` na mão.

> **Nota de migração:** a migração de regras foi renomeada para `...0001` para rodar **depois** do
> catálogo (`...0000`) — havia colisão de timestamp. Ela também dá `DROP TABLE IF EXISTS
> simulado_produto_entitlements` (tabela de uma 1ª tentativa, abandonada em favor de `simulado_produto_itens`).

## 4. Motor de regras (puro e determinístico)

`lib/integracoes/liberacao/motor.ts` — **sem DB, sem relógio externo** (tudo por parâmetro), 100%
testável. `lib/integracoes/liberacao/tipos.ts` tem os tipos.

### 4.1 Casamento `match(pedido, filtros)` — §6.1 do spec
- **AND estrito:** a regra casa só se **todas** as dimensões *configuradas* casarem.
- Dimensão **vazia = curinga**; dimensão preenchida nunca é curinga.
- Dentro de uma dimensão com vários valores → **OU** (basta um).
- Critério `id` compara **só** com o ID (string exata, após trim; nunca número). Critério `nome`
  compara **só** com o nome (igual/contém/começa, sem acento/caixa). **Sem fallback** entre id e nome.
- Valor vazio no pedido **nunca** casa com filtro configurado.
- `id` de produto/oferta **exige plataforma** (IDs só valem dentro da plataforma) — validado no cadastro.
- Período compara a **data da compra** (nunca a data do webhook), limites inclusivos, em America/Sao_Paulo.
- Retorna avaliação **por dimensão** (`casou`/`falhou` + detalhe) → base da auditoria e do simulador.

### 4.2 Classificação de status — §5
`classificarStatus(bruto, overrides)`: normaliza (minúsculas/sem acento/`_`), aplica `status_mappings`
do tenant (precedência) e depois os conjuntos padrão (positivos liberam, negativos revogam). Status
nunca visto → **neutral** (não concede nem revoga; sinaliza para revisão).

### 4.3 Datas da concessão — §6.2/§6.3
`calcularInicio`/`calcularFim`: `immediate` / `after_days` (N dias a partir da compra) / `fixed_date`
(dia inteiro BRT) / `lifetime` (fim null). `estadoInicialGrant`: futura→`scheduled`, vencida→`expired`,
senão `active`. `temAcessoEfetivo`: união das concessões ativas; vale até o **maior** `fim_em`.

### 4.4 Validação de cadastro
`validarRegra`: id exige plataforma; recusa regra totalmente aberta sem flag `aplicarATudo`; período
coerente; datas de início/fim coerentes; dias não negativos.

## 5. Fluxo em runtime

### 5.1 Entrada de uma venda
`lib/integracoes/liberacao/engine.ts::aplicarPedidoComRegras()` (chamado por
`orquestrador.processarEvento`, que recebe o webhook Guru e o reprocessamento de inbox):

```
classifica status (status_mappings + padrões)
grava o PEDIDO normalizado (simulado_liberacao_pedidos, upsert idempotente por provider+pedido_id)
neutral → processing_state='ignored', fim.
resolve/cria o estudante (dedupe cross-provider: pessoas → matricula_externa → email → cpf)
avalia regras ATIVAS (match):
  POSITIVO + casou → para cada (regra × produto): cria/atualiza access_grant (datas calculadas)
                     → reconcilia(estudante, produto) → processing_state='granted'
  POSITIVO + nada casou → processing_state='no_matching_rule' | 'blocked_by_paused_rule'
                     → FALLBACK aplicarEntitlement (auto-map + hook de produtos-por-fonte)
  NEGATIVO → revoga os grants do pedido → reconcilia → processing_state='revoked'
             (se nunca teve grant de regra → auto-map revoke)
```

`Entitlement` ganhou `ofertaRef/ofertaNome/dataCompra/statusBruto` (em `lib/integracoes/tipos.ts` +
preenchidos em `normalizar-mapa.ts` + campos em `mapa-campos.ts`) — fluem pelo adapter da Guru **sem
editá-lo** (o `parseWebhook` devolve o `entitlement` direto do normalizador).

### 5.2 Reconciliador (grants → acesso real)
`reconciliarEstudanteProduto(estudante, produto)`:
- Se há grant **ativo** cobrindo agora → materializa os **itens do produto** via `concederItem` do
  catálogo (grupo→propaga aos bancos; banco/pasta→`pasta_estudantes` + matrícula nos simulados vivos;
  simulado→matrícula; cronograma→matrícula) e eleva o **tier** (classificação do aluno).
- Senão → remove os itens que **nenhuma outra fonte ativa** (outro grant **ou** assinatura) ainda
  garante — via `cobertosPorOutros` (estendido para enxergar `access_grants` + `simulado_assinaturas`)
  e `revogarItem`. Tudo com `origem='integracao'` (nunca apaga acesso manual).

### 5.3 Transições de calendário (cron)
`processarTransicoesGrants(tenant)` promove `scheduled→active` quando chega a hora e `active→expired`
quando vence, reconciliando o acesso. Exposto em `app/api/cron/liberacao-transicoes/route.ts`
(protegido por `CRON_SECRET`) e disparado pelo worker a cada **5 min** (`apps/worker/src/main.ts`).

## 6. Reprocessamento retroativo e ciclo de vida (§7.1/§7.2)

Em `engine.ts`:
- **`reprocessarPendentes(tenant, {dry, desdeDataCompra?})`** — reavalia pedidos positivos em
  `no_matching_rule`/`blocked_by_paused_rule` contra as regras ativas e concede os que passaram a casar.
  Usa o **estado atual** do pedido (reembolsado não concede). `dry` só conta (não escreve, não cria aluno).
- **`reconciliarRegra(tenant, regraId, {dry})`** — ao **editar** uma regra: recalcula datas, revoga
  (`motivo='rule_changed'`) produtos removidos ou pedidos que deixaram de casar, (re)concede os que
  ficam, e varre os pendentes que passaram a casar.
- **`pausarRegra`** — só impede novas concessões; grants existentes permanecem; reembolso ainda revoga.
- **`retomarRegra(aplicarDuranteaPausa, dry)`** — por padrão não concede retroativo; opcionalmente
  aplica às compras feitas durante a pausa (`data_compra ≥ paused_at`).
- **`cancelarRegra(dry)`** — terminal: revoga **todas** as concessões da regra (`motivo='rule_canceled'`)
  respeitando a união (mantém o que outra fonte garante). Não volta a ativar.
- **`simularPedido(tenant, pedido)`** — dry-run puro: quais regras casam (avaliação por dimensão) e os
  produtos que seriam liberados. Não escreve.

## 7. Painel admin — `/admin/liberacao`

`app/admin/liberacao/{page,actions,liberacao-client,regra-editor}.tsx` + `lib/integracoes/liberacao/dados.ts`.
Quatro abas (tabs sublinhado, largura cheia, tokens de cor, dark/light):
- **Regras** — lista + CRUD. O editor (`regra-editor.tsx`) monta os filtros (plataformas em chips,
  critérios de produto/oferta com `id`×`nome`+modo, período), início/fim e os produtos concedidos.
  Pausar / Retomar (com a opção "aplicar às compras da pausa") / Cancelar (com dry-run do impacto) /
  Excluir — tudo com confirmação.
- **Pedidos** — chips por `processing_state` com contagem no banco, busca, paginação server-side,
  botão **Reprocessar pendentes** (mostra o impacto antes de aplicar).
- **Simulador** — formulário de pedido de teste → mostra o casamento por dimensão e o que seria concedido.
- **Mapa de status** — CRUD dos `status_mappings`.

**Autorização:** permissão `liberacao:view` / `liberacao:manage` (em `lib/rbac-catalogo.ts`), gate de
rota em `app/admin/layout.tsx` (`AREA_PERM`), item na sidebar (grupo "Conexões"). Mutações = server
actions com `checkPermission` → `createAdminClient` → `registrarAudit` → `revalidatePath`.

## 8. Transversais

- **Multitenancy/RLS:** toda tabela tem `tenant_id`; RLS por `user_tenant_ids()`; app usa service role
  com filtro de tenant explícito.
- **Idempotência:** `UNIQUE(provider, pedido_id)` nos pedidos, `UNIQUE(pedido_id, regra_id, produto_id)`
  nos grants, upserts em todo o caminho — webhook repetido não duplica nada.
- **Auditoria:** `registrarAudit` em salvar/pausar/retomar/cancelar/reconciliar (operações
  `LIBERAR`/`BLOQUEAR`/`INSERT`/`UPDATE`/`DELETE`) → aparece em `/admin/auditoria`.
- **Segurança de deploy:** se a migração de regras **não** estiver aplicada, todas as leituras das
  tabelas novas caem em `try/catch` e o fluxo degrada para "nenhuma regra" → **fallback auto-map =
  comportamento atual**. Logo, subir o código antes ou depois da migração é seguro.

## 9. Testes

`lib/integracoes/liberacao/__tests__/motor.test.ts` (Vitest, **49 testes**): matriz de casamento §6.1,
AND estrito (nenhuma dimensão isolada libera), sem-fallback, modos de nome, período BRT inclusivo,
classificação de status, cálculo de datas, estado inicial do grant e acesso efetivo (união/maior prazo).
Rodar: `cd apps/web && npx vitest run lib/integracoes/liberacao`. O restante (reconciliador, ciclo de
vida) é DB-dependente — validar manualmente após a migração.

## 10. Deploy (checklist)

1. Aplicar as migrações **na ordem**: `20261030000000_produtos_extensivos` → (ADD COLUMN das colunas
   ricas) → `20261030000001_liberacao_regras`. Rodar `NOTIFY pgrst, 'reload schema'` (já nas migrações).
2. Garantir `CRON_SECRET` + `WEB_INTERNAL_URL` no worker (o cron `liberacao-transicoes` roda a cada 5 min).
3. `next build` verde; deploy por SHA (ver regras de deploy do projeto).
4. Validar: criar um produto (catálogo) → criar uma regra que o concede → Simular um pedido →
   enviar um webhook de teste (ou reprocessar) → conferir `processing_state='granted'`, o grant e o
   acesso materializado no aluno.

## 11. O que falta (próximos passos)

- **Adapters** Hotmart/Kiwify/Hubla com `validarWebhook` real (hottok / HMAC-SHA256) — hoje só a Guru
  tem webhook; o receptor genérico `/api/webhooks/in/[token]` registra mas não processa por fonte.
- Liberação por **documento** da Biblioteca (`biblioteca_doc`) — hoje o acesso é por pasta.
- Relatório "beneficiados × prejudicados" é do fluxo de re-correção de simulado, não deste módulo.

## 12. Mapa de arquivos

```
lib/integracoes/liberacao/
  tipos.ts            # tipos puros (pedido, filtros, regra, configs, resultados)
  motor.ts            # match / classificarStatus / validarRegra / calcular datas  (PURO)
  engine.ts           # aplicarPedidoComRegras + reconciliador + transições + Fase 3 (server-only)
  dados.ts            # leituras do admin (server-only)
  __tests__/motor.test.ts
lib/integracoes/
  tipos.ts            # Entitlement ganhou ofertaRef/ofertaNome/dataCompra/statusBruto
  mapa-campos.ts      # + oferta_ref / oferta_nome / data_compra
  normalizar-mapa.ts  # preenche os campos novos
  engine.ts           # exports reusados (resolverEstudante, etc.) — o aplicarEntitlement é o fallback
  orquestrador.ts     # processarEvento → aplicarPedidoComRegras
lib/produtos/          # CATÁLOGO (outra frente): conceder.ts (concederItem/revogarItem/cobertosPorOutros)
app/admin/liberacao/   # page / actions / liberacao-client / regra-editor
app/api/cron/liberacao-transicoes/route.ts
apps/worker/src/main.ts  # intervalo de 5 min
supabase/migrations/20261030000001_liberacao_regras.sql
```
