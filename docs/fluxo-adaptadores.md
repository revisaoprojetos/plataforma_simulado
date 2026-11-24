# Editor de fluxo: como criar um adaptador

O canvas (React Flow / `@xyflow/react`) e o painel de edição são **genéricos** (`apps/web/components/admin/fluxo/*`).
Cada domínio pluga um **adaptador** (`apps/web/lib/admin/fluxo/adaptador.ts` → `FluxoAdaptador`).

## Peças

| Peça | Onde | Papel |
|---|---|---|
| Contratos | `lib/admin/fluxo/adaptador.ts` | `DiagramaFluxo` (nós/arestas como dado), `CampoSchema`, `EdicaoNo`, `DadosFluxo`, `FluxoAdaptador` |
| Registro | `lib/admin/fluxo/registro.ts` | lista central; **uma linha** por adaptador |
| Server action | `app/admin/fluxo/fluxo-actions.ts` (`salvarFluxo`) | resolve o adaptador, checa `permEditar`, delega ao `salvar` dele |
| Páginas | `app/admin/fluxo/[adaptador]/page.tsx` e `PaginaFluxo` | rota genérica `/admin/fluxo/<id>` e reuso nas abas "Fluxo" |
| UI | `FluxoEditor`, `CanvasFluxo` (lazy, ssr:false), `PainelNo`, `QuadroSvg` (fallback) | não conhecem domínio |
| Extras | `components/admin/fluxo/extras` | complementos opcionais por nome (`DadosFluxo.extras`), ex.: `simulador-faixa` |

## Passo a passo

1. **Módulo puro** (testável, sem I/O) com duas funções:
   - `montarFluxoX(dados): DiagramaFluxo[]` — nós com `id` único, `tipo` (`inicio|etapa|decisao|resultado|rejeicao|aberto`), `col/row` (o layout vem do dado), `valor` vigente e `link` "Editar em …".
   - `camposDoNoX(noId, dados): EdicaoNo | null` — para cada nó editável, os `CampoSchema` (`chave` opaca, `tipo` int/real/bool/lista/texto/opcao/cor, `min/max`, `opcoes`, `valor` atual, `grupo`). `null` = nó só leitura.
2. **Adaptador** em `lib/admin/fluxo/adaptadores/<id>.ts` (`import 'server-only'`):
   - `permVer` / `permEditar` (ex.: `cronogramas:view` / `cronogramas:update`);
   - `carregar(ctx)`: lê os dados do domínio (só leitura) e devolve `DadosFluxo` (`diagramas`, `edicao` por nó, `versao`, `motivo`, `podeEditar`, `extras?`);
   - `salvar(ctx, patch, versaoEsperada, motivo, confirmarRisco)`: **delega à server action existente** do domínio (que já faz versão otimista, auditoria e validação). Valide as chaves do patch por **lista branca** e reaplique a validação oficial do domínio; nunca grave direto no banco. Para pedir confirmação de risco, devolva `{ ok:false, confirmar:{titulo,mensagem} }` — o painel pergunta e reenvia com `confirmarRisco=true`.
3. **Registrar**: acrescente o adaptador em `ADAPTADORES` (`registro.ts`).
4. **Expor**: a rota `/admin/fluxo/<id>` já funciona. Para uma aba "Fluxo" no módulo, crie `page.tsx` com `<PaginaFluxo adaptadorId="<id>" />` + `loading.tsx` (`EsqueletoFluxo`) e inclua o item na navegação do módulo.
5. **Testes** (vitest): ids únicos/arestas coerentes, toda `chave` devolvida passa na lista branca, patch aplicado continua válido na validação oficial, nó sem edição devolve `null`.

## Regras

- A page só **lê**; nenhum cálculo no render. Cores só por tokens. `'use client'` apenas nos componentes de UI; a action só exporta funções `async`.
- O grafo BASE e os valores das regras continuam do domínio. Etapas/regras NOVAS vivem na **camada do usuário** (overlay, seção abaixo), nunca no grafo base.
- Sem versionamento no domínio → `versao: 0` e `motivo: 'nenhum'` (o painel esconde o campo; a gravação é "última escrita vence").

## Adaptadores existentes

- `cronograma-adaptativo` — `lib/cronograma/adaptativo/fluxo-regras.ts` (diagramas) + `fluxo-edicao.ts` (nó → campo); salva via `salvarRegrasComTrava` (versão otimista, auditoria, hash, 20 versões, trava de risco).
- `cronograma-gerador` — `lib/cronograma/fluxo-gerador.ts`; edita os **tipos de meta** via `atualizarTipo`/`alternarAtivoTipo`. O resto do pipeline (R1–R8) é regra fixa no código: aparece só para leitura.

## Construtor (camada do usuário / overlay)

O canvas também é um **construtor**: com `construir` ligado o usuário arrasta nós da paleta (início, etapa, decisão, condição, ação, aviso, resultado, nota), conecta pelos pontos laterais (rótulo sim/não), edita título/descrição/propriedades, move, duplica, oculta/exclui, cria/renomeia/exclui **diagramas**, desfaz/refaz (Ctrl+Z/Y), valida, salva com motivo, vê o histórico e carrega uma versão antiga no rascunho (restaurar = carregar + salvar → versão nova).

| Peça | Onde |
|---|---|
| Modelo + mutações puras (`OverlayFluxo`, `mesclar`, `normalizarOverlay`, `podarOverlay`, desfazer/refazer) | `lib/admin/fluxo/overlay.ts` |
| Validação do grafo (órfão, decisão sem 2 saídas, ciclo) | `lib/admin/fluxo/grafo.ts` |
| Persistência versionada (otimista, auditoria, hash, 30 versões, tolerante à ausência da tabela) | `lib/admin/fluxo/overlay-server.ts` + migração `supabase/migrations/20261130000000_fluxo_overlay.sql` |
| Actions | `app/admin/fluxo/fluxo-actions.ts`: `salvarOverlayFluxo`, `avaliarOverlayFluxo`, `listarVersoesOverlayFluxo`, `obterVersaoOverlayFluxo` |
| UI | `barra-construtor.tsx`, `painel-usuario.tsx`, `canvas-fluxo.tsx` (modo construir), `fluxo-editor.tsx` |

**Como o overlay se relaciona com o base:** `mesclar(base, overlay)` → diagramas finais. Nó base nunca é apagado: `ajustes[id]` guarda ocultar/rótulo/descrição/posição; arestas base ocultas ficam em `arestasOcultas` (`de>para`). Nós do usuário têm id `u.*`. Overlay vazio ⇒ diagramas idênticos ao base. Sem a tabela (`tabelaOk=false`) o construtor fica desligado e o fluxo base segue normal.

### Habilitar o construtor num adaptador

```ts
construtor: {
  executavel: false,                 // true só se o domínio compila condição/ação em regras reais
  tiposNo: ['inicio','etapa','decisao','aviso','resultado','nota'],   // tipos oferecidos na paleta
  escopo: 'texto exibido: o que os nós do usuário fazem neste domínio',
  // só se executavel: catalogo (variáveis/ações), avaliar() e antesDeSalvar() (ex.: trava de risco)
}
```
Sem `executavel`, os nós do usuário são **apenas documentação** (o Gerador é assim: R1–R8 são fixas no código).

### Regras executáveis (Cronograma Adaptativo)

Nós **Condição** e **Ação** ligados por aresta formam "SE … ENTÃO …". `lib/cronograma/adaptativo/regras-usuario.ts` (puro, determinístico, sem eval) **compila** o overlay em dados que o motor já entende (`RegrasMotor`) e `lerRegrasMotor` (config-regras.ts) entrega isso como `ctx.regras` — o motor não executa nada do usuário; o iframe/servidor recebem as regras prontas. Sem regra com efeito, devolve a **mesma referência** das regras (golden 125/125 intacto).

- Condições: comparações (`é, não é, <, ≤, >, ≥, está em, não está em`) sobre variáveis nomeadas: `faixa` (classe 1/2/3), `dia_semana` (0=segunda…6=domingo), `tipo_meta` (pf/fl/qu/lp/jp). E dentro do grupo, OU entre grupos; nós condição encadeados = E; aresta rotulada "não" nega (De Morgan). Máx. 64 combinações.
- Ações (catálogo fechado): `limitar_por_dia`, `bloquear`, `nao_mesmo_dia`, `nao_dias_seguidos`, `so_na_sobra`, `depois_de` (→ `restricoes[]`, com filtro novo `dias`), `ajustar_teto_pdf` (→ `faixas[].tetoPdf`), `ajustar_limite_dia` (→ `limitesDia` ou `faixas[].overrides`), `aviso` (só informa).
- Salvar roda a **trava de risco** (amostra de planos) e pede confirmação; regra inválida/conflitante bloqueia o salvamento e, em runtime, é ignorada (nunca derruba a geração).

**Estender o catálogo:** (1) variável nova → `CATALOGO.variaveis` + `UNIVERSO` em `regras-usuario.ts` e, se precisar de contexto novo, um filtro opcional análogo a `dias` em `restricoes.ts` (rode `pnpm --filter web cronograma:motor` e o golden); (2) ação nova → `CATALOGO.acoes` (params) + o ramo correspondente em `compilarRegrasUsuario` mapeando para um campo que o motor JÁ lê; (3) teste em `__tests__/regras-usuario.test.ts` (overlay vazio == idêntico + efeito da ação). Ações que exigiriam novo comportamento no motor (priorizar/mover tipo, exigir tipo em dia, horas por dia, semanas até a prova) estão listadas em `CATALOGO.naoSuportado`.

## Layout do editor (tela cheia, 3 colunas)

`FluxoEditor` ocupa a viewport (`calc(100dvh - 10rem)` em telas largas; empilha no mobile):

1. **Esquerda, lista de diagramas** (`nav-diagramas.tsx`, recolhível; `<select>` em telas estreitas). Agrupa por `DiagramaFluxo.grupo` (o adaptador define; no Adaptativo: *Fluxograma principal*, *Árvores de decisão*, *Precedência*; diagramas do usuário vão para *Meus diagramas*). Cada item mostra nº de nós e badge de avisos/erros.
2. **Centro, canvas grande** com a barra do construtor (sempre visível) acima. Ao abrir/trocar de diagrama o canvas remonta e faz `fitView`; também reenquadra ao recolher/expandir os painéis. Nós com ícone por tipo, valor em destaque, anel de erro/aviso; arestas `smoothstep` com rótulo; fundo em grade sutil; só tokens.
3. **Direita, painel recolhível** com abas sublinhadas: **Propriedades** (valores do nó / construtor), **Verificação**, **Simular** (extras do adaptador, ex.: Simulador de faixa). O "?" no cabeçalho do canvas mostra legenda e atalhos.

## Rascunho local (sem a migração)

Sem a tabela `simulado_fluxo_overlays` (`tabelaOk=false`) a barra continua visível com a faixa "aplique a migração `20261130000000_fluxo_overlay.sql`". Quem tem `permEditar` pode **Construir** em **rascunho local**: mover, adicionar, conectar, editar, ocultar, desfazer/refazer e verificar funcionam, mas nada é gravado (Salvar e Histórico desabilitados; aviso ao sair da página com alterações). Com a tabela, tudo persiste como antes (`persistente = cons.habilitado`).

Gestos no modo construir: arrastar nó; arrastar de uma alça para conectar; duplo clique edita o título; botão direito abre o menu (editar, duplicar, conectar a…, ocultar/excluir; no fundo, adicionar nó); Delete remove/oculta; Ctrl+Z / Ctrl+Y; Ctrl+D duplica; Esc cancela.

## Verificação do sistema

`verificarFluxoSistema(adaptadorId, overlay)` (server action, exige só `permVer`, não grava) devolve `ItemVerificacao[]` (`severidade` erro|aviso|info, `categoria` grafo|regra|sistema, `diagrama`/`noId` para focar no canvas). Roda na primeira abertura da aba e no botão "Verificar agora"; o painel só exibe (marca "desatualizado" quando o rascunho muda). Composição:

- `lib/admin/fluxo/verificacao.ts` (puro): reusa `validarGrafo` (nó solto, decisão sem 2 saídas, ciclo, condição sem ação…) + nós/decisões **base** que perderam conexões, nós base ocultos, condição sem comparação, ação sem tipo.
- Regras do usuário: `construtor.avaliar` (`compilarRegrasUsuario`: erros, avisos, efeitos).
- Domínio (`construtor.verificar`, opcional): no Adaptativo `lib/cronograma/adaptativo/verificar-regras.ts` sobre as regras **efetivas**: faixas sem cobertura de horas/sobrepostas/aberta no meio, restrições conflitantes e regra inválida (via `validarRegras`), seções diferentes do padrão 2.0 (info).
