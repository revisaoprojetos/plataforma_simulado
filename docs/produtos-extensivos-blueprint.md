# Blueprint — Produtos / Extensivos (gestão na plataforma)

> Mapa completo para **criar e gerenciar "produtos/extensivos" dentro da nossa plataforma**, de forma
> **provider-agnóstica** (Curseduca + Guru + integrações futuras) **e com gestão manual interna** dos alunos.
> Escrito para a equipe de produto/dev. Não altera nada; é o desenho a implementar.
>
> **Escopo do que o extensivo entrega (importante):** NÃO é só simulado. Um extensivo é um **programa de
> estudo completo** que agrupa **conteúdo** (Biblioteca), **videoaulas**, **simulados**, e também desafios
> (Lei Seca/Juris), cronograma e cadernos. As "videoaulas" e os materiais de estudo vivem na Biblioteca
> (`simulado_conteudo_documentos`, inclusive `tipo_origem='video'`) e/ou nos cursos/desafios — por isso o
> produto libera por **itens de catálogo** (§2.3), não por um único tipo.

Fontes deste mapa: estrutura real da Curseduca (conector Waid) + auditoria do código de integração
(`lib/curseduca/*`, `lib/integracoes/*`) e dos gates de acesso.

---

## 0. Diagnóstico (ponto de partida)

- **Curseduca não tem "produto" nativo.** A API expõe só **grupos/turmas + `hasAccess`** (100% PULL, sem webhook de produto). Um "extensivo" lá = **grupo de acesso** (nome + validade LIFETIME/custom + lista de cursos) + uma **área de membros** (showcase/branding) + uma **oferta** (plano/link/checkout externo que concede 1 `accessGroupId`).
- **Guru tem produtos reais** (via webhook) — já tratados pelo sistema novo de integrações.
- **Nossa plataforma NÃO tem** entidade "produto/extensivo". O mais perto hoje:
  - `simulado_integracao_mapeamentos` (`fonte_ref` → `classificacao`/`grupo_id`/`pasta_id`/`simulado_id`) — fonte→destino, 1 linha por grupo Curseduca / produto Guru.
  - `simulado_estudantes.classificacao` (`passaporte` | `vitalicio` | `normal`) — o "tier" do aluno.
  - `simulado_assinaturas` (aluno×produto: `provider`, `produto_ref`, `status`, `inicio_em`, `expira_em`).
- **Acesso de verdade mora em** (cadeia já funcional): `grupo → simulado_pasta_grupos → banco/pasta → simulado_matriculas → simulados` (+ Biblioteca via `acesso-efetivo`; + Cronograma via `*_pacote_grupos`). Entrar num grupo propaga por `propagarGrupoAosBancos` (`lib/simulado/propagar-grupo.ts`). Concessão/revogação genérica em `lib/integracoes/engine.ts` (`conceder`/`revogar`).

**Conclusão:** "Produto/Extensivo" na nossa plataforma é **uma camada nossa** que (1) agrega 1..N **fontes** de entrada (grupos Curseduca / produtos Guru / **manual**) e (2) define o **catálogo** que libera (bancos, simulados, biblioteca, desafios, cronograma), com **validade** e **tier**. Todas as peças de gate já existem — falta a **entidade agregadora + a tela**.

---

## 1. Conceito

**Produto/Extensivo** = pacote comercializável/organizável que, ao ser concedido a um aluno, libera um conjunto de conteúdos por um período, independente de ONDE o aluno veio.

```
            ┌────────── FONTES (como o aluno ENTRA) ──────────┐
 Curseduca grupo ─┐                                            │
 Guru produto ────┼──►  PRODUTO / EXTENSIVO  ──► materializa ─►┤ grupo_membros
 Manual (admin) ──┘        (nome, tipo,          ACESSO        │ pasta_estudantes
 Futuro provider ─┘         validade, tier)                    │ matriculas
                           │                                   │ cronograma_estudantes
                           └── ITENS que LIBERA ───────────────┘ (origem=produto)
                               bancos · simulados · biblioteca · desafios · cronograma
```

- A **fonte** diz *quem entra* (um grupo/produto externo, ou inserção manual).
- Os **itens** dizem *o que ganha*.
- A **validade/tier** dizem *por quanto tempo / em que nível*.
- A concessão **materializa** nas tabelas de acesso que já existem → **nenhum gate novo em runtime**.

---

## 2. Modelo de dados (aditivo, RLS por `simulado_tenant_acessos`, service-role bypass)

### 2.1 `simulado_produtos` — a entidade central
| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | RLS |
| `nome` | text | ex.: "Extensivo Black Novembro 2026" |
| `slug` | text? | opcional, p/ futura área/showcase própria |
| `tipo` | text | `extensivo` \| `assinatura` \| `pre_edital` \| `sprint` \| `amostra` \| `mentoria` \| `avulso` \| `outro` |
| `descricao` | text? | |
| `tier` | text | `passaporte` \| `vitalicio` \| `normal` — herda p/ `simulado_estudantes.classificacao` ao conceder |
| `validade_tipo` | text | `vitalicio` \| `dias` \| `data_fixa` |
| `validade_dias` | int? | quando `dias` (a partir da concessão) |
| `validade_data` | timestamptz? | quando `data_fixa` |
| `ativo` | bool | |
| `cor` / `capa_url` | text? | identidade visual opcional |
| `ordem`, `criado_em`, `atualizado_em` | | |

### 2.2 `simulado_produto_fontes` — como o aluno ENTRA (provider-agnóstico)
| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `produto_id` | uuid FK → produtos | ON DELETE CASCADE |
| `provider` | text | `curseduca` \| `guru` \| `manual` \| futuros |
| `fonte_ref` | text? | id do grupo Curseduca / id do produto Guru; **null** quando `manual` |
| `fonte_nome` | text? | rótulo legível (auto-curado no sync) |
| `ativo` | bool | |
| UNIQUE | (`tenant_id`,`provider`,`fonte_ref`) | 1 fonte externa pertence a 1 produto |

> Substitui/absorve o papel de `simulado_integracao_mapeamentos` (hoje `fonte_ref`→destino espalhado). **Decisão (ver §6):** migrar `mapeamentos` para cá, ou `fontes` referenciar `mapeamentos`. Recomendado: `produto_fontes` é a verdade; um mapeamento vira "fonte de um produto".

### 2.3 `simulado_produto_itens` — o que o produto LIBERA
| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `produto_id` | uuid FK → produtos | CASCADE |
| `tipo_item` | text | `grupo` \| `banco` (pasta) \| `simulado` \| `biblioteca_pasta` \| `biblioteca_doc` \| `desafio` \| `cronograma` |
| `item_id` | uuid | id do recurso correspondente |
| `permissoes` | jsonb? | p/ biblioteca: `{ler,baixar,grifar}` (default tudo) |
| `ativo` | bool | |
| UNIQUE | (`produto_id`,`tipo_item`,`item_id`) | |

> Conveniência: `tipo_item='grupo'` reaproveita direto `propagarGrupoAosBancos` (um produto pode simplesmente "ser" um grupo + extras).

### 2.4 Aluno × produto — **reusar `simulado_assinaturas`**
Já existe e cobre o ciclo de vida. Acrescentar:
- `produto_id` uuid FK? → `simulado_produtos` (liga a assinatura ao produto interno).
- `origem` text (`integracao` | `manual`) — igual ao padrão de `grupo_membros`/`matriculas` (migration `20260926000000_integracao_origem.sql`).

Colunas já existentes aproveitadas: `provider`, `produto_ref` (= `fonte_ref`), `external_id`, `status` (`ativo`/`cancelado`/`reembolsado`/`expirado`), `inicio_em`, `expira_em`, `confirmado_curseduca`.

### 2.5 Nada muda nas tabelas de ACESSO
`simulado_grupos`, `simulado_grupo_membros`, `simulado_pasta_grupos`, `simulado_pasta_estudantes`, `simulado_matriculas`, `simulado_cronograma_*`, `simulado_estudantes.classificacao` continuam sendo o **destino materializado**. O produto só orquestra a concessão nelas (com `origem`).

---

## 3. Fluxos

### 3.1 Criar/editar produto (admin)
1. Geral: nome, tipo, validade, tier, ativo.
2. Fontes: adicionar (provider + ref). Curseduca → picker dos ~335 grupos (`listarGruposCurseduca`); Guru → picker de produtos; Manual → sem ref.
3. Libera: adicionar itens (bancos, simulados, biblioteca, desafios, cronograma) — pickers já existentes.
4. Salvar → grava produto + fontes + itens (server action, `checkPermission`, auditoria).

### 3.2 Entrada por INTEGRAÇÃO (Curseduca PULL / Guru webhook)
No import/sync (`executarImport` curseduca, `aplicarEntitlement`/`processarEvento` guru):
1. Membro chega por uma **fonte** (grupo/produto) com `hasAccess`.
2. Descobre **produto(s)** daquela fonte (`produto_fontes` por `provider`+`fonte_ref`).
3. Cria/atualiza **assinatura** (`origem=integracao`, `produto_id`, `inicio/expira` = validade do produto ou do membro).
4. **Concede os itens** → materializa acesso (reusa `conceder()` + `propagarGrupoAosBancos`), seta `classificacao` = `tier`.
5. Respeita landmines atuais: `hasAccess` como verdade, "não remover acesso manual", reconciliação de identidade (matrícula+email+cpf+secundários), vitalício tem prioridade sobre passaporte.

### 3.3 Entrada MANUAL (interno)
1. Admin abre o produto → aba **Membros** → "Adicionar alunos" (busca/seleção em lote, ou colar e-mails).
2. Cria **assinatura** `origem=manual`, `provider=manual`, validade conforme o produto (ou override manual).
3. Concede os itens (mesma materialização). Nunca é apagado por sync de integração.

### 3.4 Expiração (cron)
- Job varre assinaturas `expira_em < now()` → marca `expirado` → **revoga** itens, **mas só** se nenhuma outra assinatura ativa do aluno ainda os concede (`engine.outraAtivaConcede`). Nunca mexe em acesso `origem=manual` puro.

### 3.5 Revogação / remoção
- Remover aluno do produto, ou desligar o produto → `revogar()` dos itens cuja única origem era esse produto. Acesso manual direto (fora do produto) permanece.

---

## 4. UI admin

- **Novo nó "Produtos / Extensivos"** — grupo **"Alunos"** ou **"Conexões"** da sidebar (`components/admin/sidebar.tsx`), `perm: 'estudantes:view'` (ou nova `produtos:view`), com entrada no `AREA_PERM` do `app/admin/layout.tsx`.
- **Lista**: tabela padrão (busca + filtros chip "Todos" por tipo/tier/ativo + ordenação) — ref. `estudante-assinaturas.tsx`. Colunas: Nome · Tipo · Tier · Validade · Fontes (chips provider) · Nº alunos · Ativo.
- **Editor** (abas de linha / sublinhado): **Geral · Fontes · Libera · Membros**.
  - Fontes: lista (provider + ref + nome) + picker por provider.
  - Libera: seções por tipo com pickers reaproveitados (grupos, simulados, pastas/bancos, biblioteca, desafios, cronograma).
  - Membros: tabela de alunos (nome, origem, validade, status) + "Adicionar manual" em lote + ver quem veio de integração.
- Reaproveita: `salvarMapeamento`/`listarMapeamentos` (hoje Guru), pickers de grupos/simulados, e os componentes Curseduca (`curseduca-*`).

---

## 5. Faseamento

- **Fase 1 — Núcleo (MVP):** tabelas `simulado_produtos` + `produto_fontes` + `produto_itens`; `simulado_assinaturas` ganha `produto_id`/`origem`; tela CRUD (Geral/Fontes/Libera/Membros); wire no import Curseduca + eventos Guru + manual; concessão/expiração/revogação reusando `engine`.
- **Fase 2 — Área/Showcase por produto:** hoje o portal do aluno é 1 por tenant; dar "cara" própria por produto (branding/menu/vitrine) — equivalente à "área de membros" da Curseduca. Maior; separado.
- **Fase 3 — Comercial/relatórios:** relatório por produto (alunos, engajamento, expiração próxima); e, se um dia internalizar venda, oferta/checkout concedendo o produto.

---

## 6. Decisões (TRAVADAS — seguir recomendações, 2026-10-30)

1. **`simulado_integracao_mapeamentos` → `produto_fontes`:** coexistem; `produto_fontes` é a verdade do vínculo fonte→produto. Migração de dados dos mapeamentos existentes para fontes em passo separado (não bloqueia a Fase 1; o engine passa a consultar `produto_fontes` primeiro, caindo em `mapeamentos` enquanto não migra).
2. **Aluno×produto:** **reusar `simulado_assinaturas`** (+ `produto_id` + `origem`). Sem tabela nova.
3. **Tier:** **manter `simulado_estudantes.classificacao`** (setado na concessão a partir do `tier` do produto). Gates existentes seguem lendo a coluna.
4. **1 fonte externa → 1 produto** (UNIQUE `tenant_id,provider,fonte_ref`). Conteúdo compartilhado entre produtos vai pelos ITENS, não por fontes multi-produto.
5. **Permissão própria `produtos:view` / `produtos:manage`** (nova no catálogo de permissões), com fallback de visibilidade p/ quem já tem `estudantes:*`/`integracoes:*` no seed.

---

## 7. Peças reusáveis (não reconstruir)

| Precisa | Já existe em |
|---|---|
| Resolver credenciais provider | `lib/integracoes/config.ts`, `lib/curseduca/cfg.ts` |
| Importar/sincronizar | `lib/curseduca/import-core.ts`, `lib/integracoes/orquestrador.ts` |
| Conceder/revogar acesso | `lib/integracoes/engine.ts` (`conceder`/`revogar`/`outraAtivaConcede`) |
| Propagar grupo → bancos/simulados | `lib/simulado/propagar-grupo.ts` |
| Gate runtime (não mudar) | `lib/simulado/desafio-acesso.ts`, `lib/conteudo/acesso-efetivo.ts`, matrículas |
| Reconciliação de identidade | `import-core.ts` (matrícula+email+cpf+secundários), `engine.resolverEstudante` |
| `origem` manual/integracao | migration `20260926000000_integracao_origem.sql` |
| Fonte→destino (base do produto) | `simulado_integracao_mapeamentos` |
| Ciclo aluno×produto | `simulado_assinaturas` |
| Pickers/telas admin | `app/admin/integracoes/*`, `app/admin/grupos/*`, componentes `curseduca-*` |
