# Compartilhamento de conteúdo CROSS-TENANT (modelo: cópia + linhagem)

Feature para as N plataformas (Revisão, VND, MEQ, futuras) reusarem conteúdo **sem o aluno perceber** e
**sem uma alterar a outra por acidente**. Decisões travadas com o usuário (2026-09-25):
**modelo = cópia + linhagem**, **começar por questões**.

## Objetivo (requisito do usuário)
- Tenant novo começa **vazio**; ao "adicionar conteúdo" o admin pode **puxar de outra plataforma** na área correspondente.
- Cada conteúdo tem **identidade**: de qual plataforma **origina** e em **quais está** (organizado no banco).
- Ao **editar**, o sistema **pergunta (secure)**: alterar **só esta** plataforma ou **também as vinculadas**.
- **O aluno NUNCA percebe** o compartilhamento — a identidade é **só para o admin**.

## Princípio do modelo (cópia + linhagem)
- Cada conteúdo compartilhável carrega `linhagem_id` (uuid) = **identidade comum** entre plataformas.
- `origem_tenant_id` = plataforma que **criou** originalmente.
- **Cada tenant é DONO da sua cópia** (`tenant_id` = atual). Linhas que compartilham `linhagem_id` são "o mesmo conteúdo" em plataformas diferentes.
- **RLS INALTERADA** (a grande vantagem): tenant só vê `tenant_id = atual`. Aluno nunca vê linhagem. Cópias podem divergir.

## Modelo de dados
Colunas novas por tabela de conteúdo compartilhável:
| Coluna | Significado |
|---|---|
| `linhagem_id uuid` | identidade compartilhada (default `gen_random_uuid()`) |
| `origem_tenant_id uuid` | tenant que criou o conteúdo |
| `linhagem_divergente boolean` | marca cópia editada **só localmente** (difere da origem) |

- **Fase 1:** `simulado_questoes` + `simulado_alternativas` (alternativa também recebe `linhagem_id` p/ casar na propagação).
- **Backfill:** cada linha existente = linhagem própria (`gen_random_uuid()`), `origem_tenant_id = tenant_id`.
- **Índices:** `(linhagem_id)`, `(tenant_id, linhagem_id)`, `(origem_tenant_id)`.

## Segurança / permissão
- Ler/copiar/propagar **cross-tenant** só via **admin client (service role) + guard de permissão** — a RLS bloqueia por padrão (correto).
- Permissão nova sugerida: **`conteudo:compartilhar`** (super_admin já cobre; admins comuns só com a permissão).
- **Nunca** expor `linhagem_id`/`origem`/"também em" em qualquer componente do **aluno**.

## Fluxos
### 1. Adicionar de outra plataforma (copiar) — Fase 2
UI na área de questões: fonte = outras plataformas → browsar (admin client) → selecionar → "adicionar à minha plataforma".
Server action `copiarQuestoes(origem, destino, ids[])`:
- guard permissão; cria nova `simulado_questoes` (novo `id`, `tenant_id=destino`, **mesmo `linhagem_id`**, `origem_tenant_id` preservado) + copia `simulado_alternativas` (novos ids, **mesmo `linhagem_id` da alternativa**);
- **dedupe:** se o destino já tem cópia dessa linhagem, pula (não duplica);
- audit log (operacao `COMPARTILHAR`).

### 2. Identidade (badge admin-only) — Fase 1
Loader `linhagemInfo(linhagem_id)` (admin client): origem (nome do tenant) + tenants que têm cópia.
Badge no card/editor **admin**: "Origem: Revisão · também em: VND, MEQ". **Nunca no aluno.**

### 3. Editar + propagar (o "secure") — Fase 3
Ao salvar edição de questão cuja linhagem tem irmãs em outros tenants → modal:
- **"Só nesta plataforma" (padrão):** update local; marca `linhagem_divergente=true`.
- **"Propagar para as vinculadas":** update local + irmãs (admin client, transação), com **preview dos tenants afetados** (before/after, no espírito da re-correção); audit (operacao `PROPAGAR`). Alternativas: substitui as da irmã (delete+insert por linhagem) p/ evitar mismatch.

## Fases
- **F1 — Fundação (esta entrega):** migração (colunas + backfill + índices) + helper de linhagem + badge admin (só leitura). Zero risco pro aluno.
- **F2 — Copiar:** UI "adicionar de outra plataforma" + `copiarQuestoes` + dedupe + audit.
- **F3 — Propagar:** modal de escopo ao editar + motor de propagação por linhagem + preview + audit.
- **F4 — Estender:** `simulados` (+ `prova_questoes`) e Leitura (documentos/módulos) reusando a linhagem genérica.

## Landmines (registrar)
- Linhagem/origem **jamais** em UI de aluno.
- Cópia/propagação cross-tenant **só** admin client + guard (RLS bloqueia por padrão — é o esperado).
- Propagação em **transação** + audit before/after.
- **Dedupe** por `(tenant_destino, linhagem_id)` ao re-adicionar.
- Alternativas: propagar = **substituir** as da irmã (delete+insert por linhagem) p/ não bagunçar ordem.
- Migração `gen_random_uuid()` (nativo do Postgres 13+/Supabase).
