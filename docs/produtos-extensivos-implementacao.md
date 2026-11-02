# Produtos / Extensivos — Implementação (catálogo + vitrine)

> Registro técnico do que foi construído. A feature reconstrói a gestão de produtos/extensivos
> **baseada na área real da Curseduca** (construtor de VITRINE por seções + identidade visual),
> adaptada ao conteúdo da nossa plataforma (simulados, Biblioteca/videoaulas, desafios, cronograma).
> Complementa o planejamento em `docs/produtos-extensivos-blueprint.md`.

## 1. Visão geral e divisão de responsabilidade

Duas frentes convivem e são **complementares** (coordenadas entre sessões):
- **CATÁLOGO (este doc):** `lib/produtos/*` + `app/admin/produtos/*` + `app/aluno/(portal)/extensivos/*`.
- **REGRAS de liberação (frente paralela):** `lib/integracoes/liberacao/*` + `app/admin/liberacao/*` (webhooks de venda → `access_grants`). Reusa `concederItem/revogarItem` do catálogo.

Um produto/extensivo = **um pacote** com identidade visual própria, que define o que o aluno VÊ (vitrine)
e o que GANHA (acesso), concedido por 3 caminhos: **integração** (Curseduca/Guru por fonte), **regra**
(venda) ou **manual** (admin). A concessão materializa o acesso nas tabelas que já existem — **nenhum
gate novo em runtime**.

## 2. Modelo de dados (migrations aplicadas no banco vivo)

| Tabela / coluna | Papel |
|---|---|
| `simulado_produtos` | entidade. Colunas: nome, slug (NOT NULL), tipo, descricao, **tier** (passaporte/vitalicio/normal), **validade_tipo/validade_dias/validade_data**, ativo, **cor, cor_secundaria, tema, logo_url, capa_url, banner_url, banner_mobile_url, gamificacao**, ordem. |
| `simulado_produto_itens` | o que o produto **libera** (canônico, compartilhado com as regras). `tipo_item` ∈ grupo\|banco\|simulado\|biblioteca_pasta\|desafio\|cronograma + `item_id`. |
| `simulado_produto_fontes` | **de onde o aluno entra** (provider + fonte_ref). `manual` sem ref. UNIQUE(tenant,provider,fonte_ref). |
| `simulado_produto_secoes` | **vitrine**: seções ordenadas. `tipo` banner\|carrossel, `nome`, `tamanho`, `ordenacao`, `config` jsonb ({imagem,imagem_mobile,link} ou {itens:[{tipo_item,item_id}]}). |
| `simulado_produto_avisos` | **avisos/anúncios** por produto (titulo, corpo, fixado, ativo). |
| `simulado_assinaturas` (+ `produto_id`, `origem`) | aluno × produto (status/inicio/expira). |

Migrations: `20261030000000_produtos_extensivos` · `20261030000002_produtos_colunas` (ALTER das colunas
ricas; o CREATE original virou no-op por colisão de timestamp) · `20261030000003_produto_avisos` ·
`20261030000004_produto_vitrine`. Todas RLS por `simulado_tenant_acessos` (service role bypassa).

## 3. Admin — editor rico (`/admin/produtos` → `[id]`)

Lista (busca + filtro por tipo) → editor com **5 abas de linha**:

1. **Identidade** — formulário de branding (nome, tipo, descrição, tier, **tema** claro/escuro, **cor
   primária + secundária**, **logo/capa/banner/banner_mobile** por URL, **gamificação**, ativo) **+ preview
   ao vivo** (banner + pôster + chips + mini-carrossel) aplicando tema/cores do produto.
2. **Vitrine** — **construtor de seções** (estilo área de membros da Curseduca): adicionar **Banner**
   (imagem desktop/mobile + link) ou **Carrossel** (nome + **tamanho** [vertical/horizontal, pequeno/grande,
   destaque] + ordenação + **picker de itens**: Simulados, Pastas/Biblioteca/Desafios, Cronogramas).
   Reordenar ↑/↓ e remover. **Salvar vitrine** → `salvarVitrineAction` substitui as seções E **deriva os
   itens de conteúdo liberados** (união dos itens dos carrosséis, exceto grupos).
3. **Acesso** — validade + **fontes** (Curseduca/Guru/manual + ref) + **grupos liberados** (`salvarGruposAction`).
4. **Membros** — adicionar em lote por e-mail (concede na hora, `origem=manual`), lista com origem/validade,
   remover (revogação segura), e cartões de **relatório** (total/ativos/manual×integração/expiram em 7 dias).
5. **Avisos** — publicar/fixar/remover; aparecem na página do aluno.

> `salvarProdutoAction` reescreve a linha inteira do produto (defaults no server), então Identidade e
> Acesso enviam o payload COMPLETO (função compartilhada) para não se sobrescreverem.

## 4. Concessão de acesso (materialização)

`lib/produtos/conceder.ts`: `concederProduto` / `concederItem` / `revogarProduto` / `revogarItem` +
`cobertosPorOutros`. Por item:
- `grupo` → `simulado_grupo_membros` + `propagarGrupoAosBancos`.
- `banco`/`biblioteca_pasta`/`desafio` (todos `simulado_pastas`) → `simulado_pasta_estudantes` + matrícula nos simulados vivos.
- `simulado` → `simulado_matriculas`.
- `cronograma` → `simulado_cronograma_matriculas`.

`origem` ('integracao'|'manual') carimba as linhas → revogação só remove o que o produto concedeu e **nada
que outro produto ativo ainda garante** (`cobertosPorOutros`). Tier → `simulado_estudantes.classificacao`.

## 5. Entrada do aluno (3 caminhos)

- **Integração** — `aplicarProdutosPorFonte` roda no import Curseduca (`lib/curseduca/import-core.ts`) e no
  engine Guru (`lib/integracoes/engine.ts`): aditivo, idempotente, fast-path sem fonte casando.
- **Regra de venda** — frente paralela (`access_grants`), reusa `concederItem`.
- **Manual** — aba Membros do editor.

## 6. Área do aluno

- **Hub `/aluno/extensivos`** — cards branded dos extensivos do aluno (das assinaturas ativas).
- **Página `/aluno/extensivos/[slug]`** — **vitrine renderizada**: cabeçalho branded (banner/cor/logo),
  **avisos** (fixados primeiro), **progresso** nos simulados + **"continuar de onde parou"**, e as **seções**
  (banner full-width + carrosséis de cards dimensionados por tamanho). Fallback quando a vitrine não foi
  montada (lista do que foi liberado). Gate: só abre se o aluno tem o produto ativo.
- Menu **"Meus Extensivos"** abaixo de Simulados (sidebar nova + clássica da Revisão + VND/MEQ via navCanonico).

## 7. Permissão, navegação, serviço

- RBAC: `produtos:view` / `produtos:manage` (`lib/rbac-catalogo.ts`), `AREA_PERM` e sidebar (grupo Alunos).
- Serviço: `lib/produtos/{tipos,produtos,conceder,aluno}.ts`.

## 8. Como testar (dev / localhost:3000)

1. `/admin/produtos` → criar produto → aba **Identidade** (cor/capa/banner) → **Vitrine** (adicionar
   carrosséis com simulados/pastas) → **Acesso** (validade) → **Membros** (seu e-mail de aluno).
2. Como aluno → sidebar **Meus Extensivos** → abrir → ver a vitrine branded + progresso + avisos.

## 9. Pendências

- **Deploy** (não feito — requer autorização): versão + CHANGELOG + commit + imagem GHCR por SHA + Portainer;
  os 4 arquivos de migração já foram **aplicados direto no banco vivo**, mas precisam entrar no pipeline p/ outros ambientes.
- Upload de imagens (hoje logo/capa/banner por URL) — enhancement.
- Covers reais nos cards da vitrine do aluno (hoje gradiente por cor) — enhancement.
