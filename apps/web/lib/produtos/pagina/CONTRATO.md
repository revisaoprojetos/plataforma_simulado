# Contrato — página do extensivo (editor visual)

Fonte única de verdade para P1 (shell/canvas/dnd), P2 (propriedades/inline/estilos), P3 (renderers) e P4 (rascunho/histórico/presets/preview).
Tudo em `lib/produtos/pagina/`. Arquivos **sem** `server-only` (usáveis no cliente): `tipos.ts tokens.ts registro.ts catalogo.ts normalizar.ts dados.ts`. **Server-only**: `loader.ts`, `actions-base.ts` (`'use server'`).

## Modelo
```ts
PaginaV1 { v:1, blocos: BlocoAny[], tema?: { cor?, fundo?: TokenCor; raio?; espaco? } }
BlocoV1<T> { id, v:1, tipo:T, variacao:string, ativo, nome?, conteudo:ConteudoPorTipo[T],
             estilo:{ cor?, fundo?: TokenCor; espaco?:'sm'|'md'|'lg'; raio?; alinhamento? },
             visib:{ desktop, tablet, mobile }, ancora? }
```
- Tipos: `hero avisos progresso continuar modulos cronograma carrossel banner texto botao divisor instrutores`.
- **Cores = só `TokenCor`** (`tokens.ts`: `produto, produto-2, primary, secondary, accent, brand-accent, foreground, card, muted, border, destructive, chart-1..5…`). Nunca hex. Converter com `corCss(token, {cor, cor2})` → `var(--primary)` (ou a cor do produto). `TEXTO_SOBRE[fundo]` dá o token de texto legível.
- `titulo da seção` de modulos/carrossel/cronograma/instrutores = `bloco.nome`. A variação de `modulos` = formato (`herdar|grade|carrossel|lista|trilha|trilha_imagem|poster`), de `cronograma` = `card|faixa|lista|semana`, de `carrossel` = tamanho do card.

## Registro de elementos (P3 implementa renderers; metadados já prontos)
```ts
import { CATALOGO, getElemento, TIPOS_ELEMENTO } from '@/lib/produtos/pagina/catalogo'
ElementoDef { tipo, rotulo, descricao, icone /*nome lucide*/, categoria, variacoes[{id,rotulo}],
              defaults(), schema: CampoDef[], podeAdicionar(ctx), unico?, fixo? }
CampoDef { chave:'nome'|'conteudo.x'|'estilo.x'|'ancora', rotulo, tipo:'texto|rich|imagem|link|token-cor|seletor|toggle|numero',
           grupo:'conteudo|estilo|avancado', opcoes?, min?, max?, max_chars?, visivelSe?:{chave,igual}, inline? }
RenderProps<T> { bloco, modo:'aluno'|'edicao', dispositivo:'desktop'|'tablet'|'mobile', dados: DadosPagina }
RendererElemento<T> = ComponentType<RenderProps<T>>   // P3 cria o mapa tipo→renderer (components/produtos/pagina/…)
```
Criar bloco novo: `criarBloco('texto')` (id novo + defaults). `instrutores.podeAdicionar` só é true com `ctx.temInstrutores` (sem tabela de instrutores ainda: `dados.instrutores` = `[]`).
Renderers **não consultam nada**: tudo vem de `dados` (`DadosPagina`: produto, avisos, progressoSimulados, curriculo, resumosCronograma[blocoId], secoes[blocoId], cor/cor2, voltar).

## Normalização (sempre use antes de gravar/renderizar dado vindo de fora)
`normalizarPagina(raw, tema?)` nunca lança: descarta tipo desconhecido, garante ids únicos, 1 por `unico`, ≤120 blocos, valida tokens/links/imagens, sanitiza HTML do `texto` (whitelist). Aceita blocos v0 (`{tipo,nome,ativo,config}`) e migra. `blocosIniciais({estrutura})` = seed = derivação atual: `hero, avisos, continuar, [progresso], …seções v0` (módulos implícitos antes do 1º banner/carrossel).

## Dados / loader (server)
```ts
carregarPaginaProduto(produtoId,{estado:'publicado'|'rascunho',tenantId,estrutura?}) → {pagina, origem:'versao'|'legado', versaoId, estado, semRascunho?}
  // publicado: versão publicada → senão legado. rascunho: rascunho → publicado → legado. Tolerante à migração ausente.
carregarDadosPagina(produtoId, pagina, {tenantId, estudanteId?, vit?, pre?, voltar?, slug?}) → DadosPagina|null
  // SEM estudanteId = AMOSTRA (edição): currículo agregado (módulos de topo, sem aulas/progresso), progresso e cronograma de exemplo.
montarItensPagina(pagina, dados, tenantId, estudanteId|null) → ItemPagina[]  // ordem final: ativos, com conteúdo, “restantes/Outros módulos”
```
Ações (`actions-base.ts`, produtos:manage + auditoria + revalidate): `lerRascunhoOuSeed(produtoId)`, `salvarRascunho(produtoId, pagina)` (1 rascunho/produto, normaliza e valida módulos), `publicarRascunho(produtoId, rotulo?)` (publicado anterior → `arquivado`).

## Persistência
`simulado_produto_pagina_versoes` (estado rascunho|publicado|arquivado; ≤1 rascunho e ≤1 publicado/produto) e `simulado_pagina_presets` (tenant_id NULL = global) — migração `20261113130000`. Produto sem linha em versões = página derivada do legado (`simulado_produto_secoes`), idêntica à anterior.

## Renderer atual (temporário)
`app/aluno/(portal)/extensivos/[slug]/render-blocos.tsx` (`PaginaAluno`, `HeroView`, `AvisosView`, `ContinuarView`, `SecaoVitrine`) ignora `estilo`, `visib` e variações; `texto/botao/divisor/instrutores` ainda não renderizam no aluno. P3 move para o registro compartilhado.
