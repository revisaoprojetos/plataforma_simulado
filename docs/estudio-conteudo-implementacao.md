# Estúdio de Conteúdo — Plano de Implementação (designer → código real)

**Data:** 31/10/2026 · **Autor:** engenharia Revisão
**Escrito para:** quem vai implementar (dev + designer que vai encaixar as telas no backend).
**Fontes:** pacote do designer `revisao-admin-conteudos` (48 telas + AUDITORIA/INVENTARIO/MAPA-DE-ACOES + tokens) × código real `apps/web` (Next.js App Router + Supabase service-role) × `docs/estudio-conteudo-blueprint.md` (mapeamento prévio Curseduca→tabelas reais).

> Este documento é o **passo a passo de execução**. O blueprint (`estudio-conteudo-blueprint.md`) continua sendo a especificação funcional por área (§8); aqui a gente **encaixa o designer** e define **o que reusar, o que criar, em que ordem e por qual agente**.

---

## 0. Resumo de uma página

O designer entregou um **Admin › Conteúdos** completo (48 telas) inspirado na Curseduca, escrito numa premissa **greenfield + NestJS + migração total da Curseduca**. O sistema real é **Next.js + server actions + Supabase service-role**, com tabelas `simulado_*` e **a maior parte dessa área já construída** (há um `/admin/biblioteca` que já é um navegador estilo Drive/Curseduca com upload, versões, grifos, soft-delete e auditoria).

**Portanto a "implementação" é 70% encaixe/reskin e 30% construção nova.** As regras do projeto valem: **reuso exato, nunca lookalike** · **backend-first** (nada de cálculo no front) · **tokens, nunca hex** · nada vai a commit/deploy sem o usuário.

**Adaptações já decididas neste doc (a confirmar as 2 marcadas 🟠):**
1. API = **server actions / route handlers**, não NestJS.
2. **Não criar** as tabelas greenfield do designer que já têm par real — mapear para as `simulado_*`.
3. Rota da área = manter o padrão real `/admin/...` (o item "Conteúdos" já aponta p/ `/admin/biblioteca`); o designer usa `/admin/conteudos/*` só como sugestão.
4. ✅ **Currículo (módulo→aula→vídeo):** **DECIDIDO = leve por referência** (31/10). Módulo→item que aponta a recurso existente (documento da Biblioteca / vídeo por URL/Panda / simulado / quiz); **sem** hospedar vídeo / sem Waid Player no MVP (ver §5, Etapa 5).
5. ✅ **Oferta/combo:** **DECIDIDO = fino sobre regras de liberação** (31/10). Agrupar produtos p/ liberação reusando `simulado_liberacao_regras`; **sem** preço/checkout/cupom.
6. ✅ **Execução:** **DECIDIDO = Etapa 0 primeiro, 1 peça por vez**, com revisão antes de abrir os builders L2.

---

## 1. O que o designer entregou (as-is)

| Parte | Conteúdo | Uso na implementação |
|---|---|---|
| `AUDITORIA.md` | Especificação: arquitetura, 6 componentes compartilhados, modelo SQL, API, regras, 7 fases, aceite, 6 pontos em aberto | Spec de comportamento; **ignorar NestJS/SQL greenfield** (ver §3) |
| `INVENTARIO.md` | **48 telas** com rota, origem Curseduca e "abre sobre/volta" | Lista de telas a entregar |
| `MAPA-DE-ACOES.md`/`acoes.json` | Cada botão → destino | **Checklist de aceite por tela** (nenhum controle sem ação) |
| `telas/*.html` + `runtime.js` | Protótipo clicável | Entender estados/comportamento e medir layout. **Não é código de produção** |
| `telas-png/*.png` | Página inteira | **Alvo visual** (comparar na revisão) |
| `design-system/tokens.css` | roxo `#5B3FD0` + dourado `#F1C232`, Plus Jakarta, dark por `[data-theme]` | **Já batem** com os tokens reais (ver §4) |

**48 telas em 7 blocos:** Produtos (19) · Materiais [Aulas · Biblioteca · Banco · Arquivos] (13) · Flashcards (5) · Trilhas (3) · Oferta (2) · Classificação (2) · Grupos (2) · Seletores (2).

**6 componentes compartilhados (construir/confirmar antes das telas):** Shell · Navegador breadcrumb · `<DataTable>` · `<FilePicker>` · Menus ⋮ · Modais/diálogos/avisos ✓.

---

## 2. Mapa de reuso — tela/área → código real (o encaixe)

Legenda: **REUSO** (usar o que existe) · **PARCIAL** (existe base, falta casca/campo) · **NOVO**.

### 2.1 Fundação & componentes compartilhados
| Item do designer | Real | Arquivo→função | Veredito |
|---|---|---|---|
| Shell do admin + item "Conteúdos" | menu por array + gate por permissão | `components/admin/sidebar.tsx` (`navGroups` ~:120-272; item Conteúdos já em :254-260); `app/admin/layout.tsx` (`AREA_PERM` :30-59) | **REUSO** (push no array) |
| Tokens/fonte | roxo/dourado/Plus Jakarta | `lib/brand/brand-tokens.ts` (:42,:140-141); `app/globals.css` (:62,:99,:144-177); `app/layout.tsx` (:3,:16-18,:39) | **REUSO** (já batem) |
| `<DataTable>` (seleção+lote 48px+ordenação/paginação **server**+5/10/25/50+altura fixa+⋮) | tabelas client-side página fixa 10 | reusar `components/admin/th-ordenavel.tsx` (`useOrdenacao`/`Th`) + receita server de `app/admin/questoes/page.tsx` (:88-110 `.range`+`count:'exact'`) + visual de seleção de `components/admin/questoes-tabela-base.tsx` | **NOVO** (genérico, extraindo peças) |
| `<FilePicker>` unificado (4 abas) | só peças | `components/admin/drive-novo.tsx` (`DriveUploadPanel`/`DriveNovoButton`) + `lib/storage/index.ts` (`getStorage`/`uploadArquivo`) + `biblioteca-client.tsx` (árvore/breadcrumb/⋮) | **NOVO** (embrulhar as peças num picker modal) |
| Modais/diálogos/avisos ✓ | prontos | `components/ui/confirm-dialog.tsx` (`confirmar`/`pedirTexto`); `components/ui/dialog.tsx`; `sonner` toast | **REUSO** |
| Lixeira + soft-delete | pronto, sem purge | `lib/soft-delete.ts` (`softDelete`/`softRestore`/`SOFT_DELETE_TABELAS`); `app/admin/lixeira/*` | **REUSO** + **NOVO** cron purge 30d; incluir `simulado_conteudo_documentos` na lista |
| Auditoria (`content_audit`) | genérica pronta | `lib/audit.ts` (`registrarAudit` → `simulado_audit_logs`); UI `/admin/auditoria` | **REUSO** (filtrar por entidade `simulado_conteudo%`) |

### 2.2 Biblioteca (bloco Materiais) — **tudo REUSO**
Tabelas: `simulado_conteudo_documentos` (doc-mãe) · `_versoes` (imutáveis, sha1) · `_trechos` · `_anotacoes` (grifos text-quote) · `_avisos` · `_vinculos` · `simulado_pastas (folder_area='conteudo'|'conteudo_modelo')` · acesso `_documento_grupos/_estudantes` + `_pasta_grupos/_estudantes`. Bucket **`conteudos`**.

| Tela | Arquivo→função | Veredito/Gap |
|---|---|---|
| Biblioteca / BibliotecaPasta | `app/admin/biblioteca/actions.ts` (`listarArvore` :52; `criarPasta` :240, `renomearPasta` :251, `definirCorPasta` :261, `moverPasta` :271, `removerPasta` :282) | **REUSO** (só reskin ao PNG; nunca vazar `folder_area/is_folder` à UI) |
| BibliotecaNovo (upload) | `prepararUploadConteudo` :494 + `importarDeStorage` :509; `criarDocumentoBranco` :529; `lib/conteudo/ingestao.ts` (`guardarOriginal` :136) | **REUSO** (docx/pdf/html/pptx/xlsx/video/audio) |
| AulasVinculadas ("usado em") | `lib/conteudo/vinculos.ts` (`listarVinculosDoDocumento` :48, `vincularDocumento` :23) | **PARCIAL** (sem tipo "aula" materializado — coerente) |
| Substituir (versão + manter grifos + avisar) | `publicarNovaVersao` :570 → `criarVersao` + `reconciliarVersao` (`lib/conteudo/reconciliacao.ts` :36, alinha uids) + `definirVersaoAtual` | **REUSO** (propaga a todos os vínculos modo `'ultima'`); **gap**: lote p/ reapontar vínculos `'fixada'` + notificação por vínculo |
| Tags no documento | só questões têm etiqueta | — | **NOVO** (etiqueta N:N p/ documentos) |

### 2.3 Banco de Questões (bloco Materiais) — **REUSO exceto a casca**
Tabelas: `simulado_questoes` · `_alternativas` · `_competencias` · N:N `_questao_pasta` / `_questao_etiquetas`. **Banco = `simulado_pastas (is_folder=false, tipo)`**.

| Tela | Arquivo→função | Veredito/Gap |
|---|---|---|
| Questoes (acervo) | `components/admin/questoes-tabela-base.tsx` (`QuestoesTabelaBase`); `app/admin/questoes/*` | **REUSO** |
| Questão (editor) | `app/admin/questoes/actions.ts` (create/update; reconcilia alternativas) | **REUSO**; grava disciplina/assunto por NOME (get-or-create → duplica) |
| Banco (lista de bancos) | `app/admin/banco-questoes/page.tsx` = **`redirect('/admin/simulados')`** | **NOVO** (casca "lista de bancos"; filtro `lib/simulado/pasta-area.ts:ehPastaBanco`) |
| Importar (CSV) | `banco-questoes/actions.ts` (`analisarQuestoesImport` :896, `confirmarImportQuestoes` :928) | **REUSO** |
| anulada / desatualizada | `simulado_etiquetas.funcao` + `anular-questao-button.tsx` | **REUSO** (já funcionais) |

### 2.4 Produtos (bloco Produtos)
Tabelas: `simulado_produtos` (+ `_produto_fontes/_itens/_secoes/_avisos`). Editor por abas: **Identidade · Vitrine · Acesso · Membros · Avisos**.

| Tela | Arquivo→função | Veredito/Gap |
|---|---|---|
| Produtos (lista) / NovoProduto / Renomear | `lib/produtos/produtos.ts` (`listarProdutos` :9); `app/admin/produtos/actions.ts` (`salvarProdutoAction` :34, `excluirProdutoAction` :64) | **REUSO** (lista é FLAT) |
| Pasta / MoverPasta de produtos | padrão `simulado_pastas (is_folder/folder_area/pai_id)` de outros módulos | **PARCIAL** (produto não tem `pai_id/is_folder`; reusar o padrão, não criar `content_folder`) |
| Produto › Informações | `salvarProdutoAction` (cor/tema/logo/banner já modelados) | **REUSO** |
| Produto › Conteúdos | `simulado_produto_secoes` (vitrine) + `_itens` (`salvarVitrineAction` :100, `salvarItensAction` :87; `ItemTipo` em `lib/produtos/tipos.ts` :8) | **PARCIAL** (é referência a recursos, **não currículo** — ver 🟠 §5 Etapa 5) |
| Produto › Grupos | `simulado_produto_itens` (tipo grupo) `salvarGruposAction` :124 | **REUSO** |
| Concessão de acesso (efeito) | `lib/produtos/conceder.ts` (`concederProduto` :64, `revogarProduto` :136) | **REUSO** |
| Instrutores / E-mails do produto | — | **NOVO** (`product_instructor`; e-mails ≈ `simulado_produto_avisos`) |

### 2.5 Grupos de acesso (acessados por Produto/Oferta)
Tabelas: `simulado_grupos` (is_mestre=pasta, pai_id) · `_grupo_membros` · `_pasta_grupos`.

| Tela | Arquivo→função | Veredito/Gap |
|---|---|---|
| GrupoEditar | `app/admin/grupos/actions.ts` (`criarGrupo` :54, `editarGrupo` :134, `moverGrupo` :92, `excluirGrupo` :151) | **REUSO** |
| GrupoMembros | `adicionarMembros` :189, `importarMembros` :238 (cola/CSV/xlsx), `removerMembro` :363, `engajamentoGrupo` :337 | **REUSO**; **NOVO**: validade/`expira_em` por membro ("validade em lote") + **export CSV** de membros |
| VincularGrupo | `lib/simulado/propagar-grupo.ts` (`propagarGrupoAosBancos` :9); `matricular-banco.ts` (:12); `reconciliar-grupos-bancos.ts` (:22 cron) | **REUSO** |

### 2.6 Acesso/Liberação & Matrículas (motor já pronto)
| Função | Arquivo→função | Veredito |
|---|---|---|
| Regras de liberação (CRUD/ciclo) | `app/admin/liberacao/*`; motor puro `lib/integracoes/liberacao/motor.ts` (`temAcessoEfetivo` :278) | **REUSO** |
| Aplicação/reconciliação/crons | `lib/integracoes/liberacao/engine.ts` (`aplicarPedidoComRegras` :209, `processarTransicoesGrants` :289) | **REUSO** |
| Matrículas manuais | `app/admin/matriculas/actions.ts` | **REUSO** |
| **Painel "quem tem acesso e por quê"** | **`lib/acesso/aluno-efetivo.ts` (`acessoEfetivoDoEstudante` :29, `resumoAcessoLote` :97)** | **REUSO** (é a visão de acesso do designer) |
| Gate runtime do aluno | `app/api/auth/embed/identify/route.ts` (`verificarAcesso` :384) | **REUSO** (gate por **simulado**, não produto) |

### 2.7 Classificação / Taxonomia
Tabelas-entidade: `simulado_disciplinas` · `_assuntos` (árvore pai_id) · `_bancas` · `_orgaos`. Valores-texto em `simulado_questoes`: cargo/ano/assunto_detalhe/nivel.

| Tela | Arquivo→função | Veredito/Gap |
|---|---|---|
| Classificacao / Categoria | `app/admin/questoes/taxonomia-actions.ts`; `disciplinas-actions.ts` (`unificarDisciplinas` :62) | **PARCIAL** (hoje vive em abas de `/admin/questoes`; **NOVO**: tela standalone + fim do get-or-create) |
| category/content_type/product_line | só enum `simulado_produtos.tipo` | **NOVO** (se virarem entidades próprias) |

### 2.8 Áreas majoritariamente NOVAS
| Área | Base real | Veredito |
|---|---|---|
| **Flashcards** (top-level) | schema+lib+actions prontos: `supabase/migrations/20261027000000_flashcards.sql` (`simulado_flashcards`/`_flashcard_revisoes`); `lib/flashcards/*`; aba em `app/admin/biblioteca/conteudo/[id]/gerenciar/flashcards-tab.tsx` | **REUSO** do backend; **NOVO**: área/menu top-level + conceito "baralho/deck" nomeado (hoje é por documento) |
| **Trilhas** (learning path) | "trilha" no código é outra coisa (trilha de simulados / leitura / cronograma adaptativo) | **NOVO** (tabela + CRUD; reusar como referência a lógica de estado de `lib/leitura/trilha.ts`) |
| **Oferta/combo** | não há preço/checkout/cupom; "oferta" só como filtro em regras de liberação | **NOVO** 🟠 (ver §5) |
| **FilePicker / SeletorVideo (Waid Player)** | só stub `components/biblioteca/gestao/aba-fonte-link.tsx` (2 abas); provedores YouTube/Vimeo/Panda/Drive; **não há "Waid Player"** | **NOVO** (seletor unificado; pipeline de vídeo = fase posterior) |
| **Materiais › Aulas (149.300)** | não existe (Curseduca) | **não criar** — mapear "aula" → documento da Biblioteca / Simulado |

---

## 3. Adaptações da especificação do designer (o "já adaptando")

1. **Stack:** trocar toda a seção "API (NestJS)" da AUDITORIA por **server actions `'use server'` + route handlers** (há casos de server action rejeitada em domínio custom → usar **rota de API**). Autorização sempre server-side (`checkPermission` + service role).
2. **Modelo de dados:** **descartar** as tabelas greenfield que têm par real (ver §2). Criar **só**: `simulado_trilhas`/`_trilha_itens`; etiqueta de documento; coluna/visão de "deck" de flashcards (se nomeado); (🟠) oferta; (🟠) currículo. Seguir o padrão real: isolamento manual por `tenant_id` (service-role **bypassa RLS**), escritas **tolerantes a coluna ausente** (`if (/column/.test(e))`), `deletado/deletado_em/deletado_por`, auditar via `registrarAudit`.
3. **Migração da Curseduca (AUDITORIA §9):** **não** é migração total/"desligar a Curseduca". O aluno **continua acessando por iframe Curseduca**; nós **espelhamos pessoas/acesso** (`lib/curseduca/import-core.ts`), não aulas. "Migrar" aqui = só o que a decisão 🟠-currículo definir.
4. **`legacy_id`/"cód.":** onde já houver origem externa, reusar `codigo_externo`/`external_id`/`simulado_integracao_mapeamentos` em vez de criar `legacy_id`.
5. **Lixeira 30 dias:** criar cron de purge (padrão `app/api/cron/*`, ex. `assinaturas-expirar`); confirmar 30 dias com a coordenação (ponto em aberto do designer).
6. **Rotas:** manter `/admin/*` real; mapear as rotas `/admin/conteudos/*` do INVENTARIO para as reais na tabela de §2.

---

## 4. Regras de execução (não-negociáveis, do projeto)

- **Reuso exato, nunca lookalike:** importar o componente/action real (ex. `QuestoesTabelaBase`, `DriveUploadPanel`, `confirmar`, `acessoEfetivoDoEstudante`), nunca recriar parecido.
- **Backend-first:** nada de cálculo no front/render; `.range()`+`count`+filtro no banco; cálculo em server/SQL/snapshot. Toda tela nova **nasce otimizada** (egress).
- **Cores sempre via tokens** (`--brand`/`--primary` + `color-mix`), nunca hex (exceto semânticas). Dark/light. **Sem faixas laterais** (largura cheia, `w-full` sem `max-w` central). Abas = sublinhado. **Nunca ícone Sparkles.** Consultar a skill `design-ui`.
- **Tabelas** = busca + filtros (chip "Todos") + ordenação; a canônica de questões é `QuestoesTabelaBase`.
- **Toda escrita** chama `registrarAudit` e respeita `checkPermission`.
- **Nada vai a commit/push/deploy sem o usuário.** Todo push bumpa `APP_VERSION`+CHANGELOG (o usuário informa a versão). Migrações são aplicadas pelo usuário (+ NOTIFY pgrst quando muda schema). Escrita direta no banco não revalida → pedir reload.

---

## 5. Passo a passo em etapas (REUSO-primeiro, greenfield-por-último)

Cada etapa fecha com: **checklist de aceite do MAPA-DE-ACOES** (todo controle faz algo real) + **comparação com o PNG** + `tsc`/`build` verde + revisão dos 2 revisores (§6).

### Etapa 0 — Fundação (caminho crítico, destrava tudo)
- `<DataTable>` genérico server-driven (page/perPage 5/10/25/50, sort, q via searchParams; seleção + barra de lote 48px; altura fixa; ⋮) — extrair de `th-ordenavel` + receita `questoes/page.tsx` + visual `QuestoesTabelaBase`.
- Wire do shell: confirmar item "Conteúdos" e sub-abas (Produtos · Materiais · Flashcards · Trilhas · Oferta · Classificação) no `sidebar.tsx` + `AREA_PERM`.
- Lixeira: cron de purge 30d + incluir `simulado_conteudo_documentos` em `SOFT_DELETE_TABELAS`.
- **RBAC — papel `professor`** e semear permissões que faltam (`produtos`, `liberacao`, `biblioteca:*`, `flashcards`, `trilhas`, `classificacao`), alinhando `rbac-catalogo.ts` × seed do banco (pré-requisito do self-service).
- **Pronto quando:** uma lista qualquer responde paginada/ordenada no servidor pela `<DataTable>`; professor consegue ver os menus da área.

### Etapa 1 — Biblioteca + Seletor (REUSO + 1 novo)
- Reskin da `/admin/biblioteca` ao PNG do designer (Biblioteca, BibliotecaPasta, BibliotecaNovo, AulasVinculadas, Substituir) — **sem reescrever** o backend.
- `<FilePicker>` unificado (abas Biblioteca / Enviar / Vídeo[Link] / Link externo) embrulhando `DriveUploadPanel` + `getStorage` + árvore da `biblioteca-client`. Aba "Waid Player" = placeholder honesto (pipeline de vídeo é fase posterior).
- Tags em documentos (etiqueta N:N nova) + lote p/ reapontar vínculos `'fixada'`.
- **Pronto quando:** trocar um PDF propaga às aulas vinculadas (`'ultima'`); escolher da biblioteca **liga, não copia**.

### Etapa 2 — Banco de Questões (REUSO + casca)
- "Lista de bancos" (hoje redirect) como 1ª classe (`simulado_pastas` is_folder=false; `ehPastaBanco`).
- Reskin de Questoes/Questão/Importar reusando `QuestoesTabelaBase` + actions de import.
- **Pronto quando:** importar CSV com prévia/erros e editar questão com classificação.

### Etapa 3 — Produtos + Acesso (REUSO forte)
- Produtos: lista + pastas (padrão `simulado_pastas`) + editor (Informações/Vitrine/Grupos reusando as actions atuais).
- **Painel "quem tem acesso e por quê"** com `acessoEfetivoDoEstudante`/`resumoAcessoLote` + botão de reconciliação (hoje é cron/script).
- Grupos/Membros: validade por membro (**novo**) + export CSV (**novo**).
- **Pronto quando:** abrir um produto e ver quem tem acesso, por qual origem, e reconciliar em 1 clique.

### Etapa 4 — Classificação standalone + Flashcards + Trilhas
- Classificação: tela própria (disciplinas/assuntos/bancas/órgãos) + fim do get-or-create (escolher do cadastro).
- Flashcards: área/menu top-level + "baralho" nomeado (reusar `lib/flashcards`), publicar/importar.
- Trilhas: tabela + CRUD (NOVO), reusando lógica de estado de `lib/leitura/trilha.ts` como referência.
- **Pronto quando:** publicar um baralho e ordenar uma trilha.

### Etapa 5 — 🟠 Currículo (decisão) + 🟠 Oferta (decisão)
- **Currículo módulo→aula:** só se confirmado. Recomendação = **leve por referência**: `simulado_produto_modulos`/`_modulo_itens` onde cada "aula" aponta para um recurso existente (documento da Biblioteca / vídeo por URL/Panda / simulado / quiz), **sem** hospedar vídeo. Disponibilidade por módulo reusa o padrão de datas/intervalo. (Alternativa A: não construir, manter currículo na Curseduca; Alternativa B: LMS completo com pipeline de vídeo — grande, fora do MVP.)
- **Oferta:** só se confirmado. Recomendação = **fino sobre regras de liberação** (agrupar produtos p/ liberação, sem checkout/preço), ou fora do MVP.

### Etapa 6 — Conferência + entrega
- Conferir contagens/consistência; `tsc`+`build`; revisão final; **usuário** define versão e dispara commit/deploy.

---

## 6. A equipe de agentes (níveis, funções prioritárias, como trabalham juntos)

Instanciada em `.claude/agents/` (ver os arquivos). Hierarquia de 4 níveis; **L1 é caminho crítico** (destrava o resto), **L2 roda em paralelo**, **L3 é contínuo**.

```
L0  Maestro / Tech Lead ........ orquestra, integra, roda tsc/build, aplica gates. NÃO commita/push sozinho.
L1  Fundação (PRIORITÁRIO)
    ├─ fundacao-dados ........... migrations reuso, content_audit, lixeira purge, read-model acesso, RBAC professor, contratos/tipos
    └─ plataforma-ui ........... <DataTable>, <FilePicker>, wire do shell, tokens/dark, modais
L2  Builders de domínio (paralelos, dependem de L1)
    ├─ builder-biblioteca ...... Biblioteca + Seletor + versões/substituir + tags doc
    ├─ builder-questoes ........ Banco (casca) + Questão + Importar + Classificação standalone
    ├─ builder-produtos ........ Produtos + pastas + vitrine/itens + grupos vínculo
    ├─ builder-acesso .......... Grupos/Membros/validade + Matrículas + Liberação + painel "quem tem acesso" + Oferta
    └─ builder-novas-areas ..... Flashcards top-level + Trilhas + (currículo, se aprovado)
L3  Revisores transversais (contínuos, função prioritária de qualidade)
    ├─ revisor-reuso-backend ... reuso exato + backend-first/egress + RLS/isolamento/auditoria
    └─ revisor-ui-design ....... tokens/dark/acessibilidade + fidelidade ao PNG (skill design-ui)
```

**Funções prioritárias (ordem de ataque):** `fundacao-dados` + `plataforma-ui` primeiro (Etapa 0). Só então os builders. Os revisores agem a cada tela fechada.

**Como trabalham juntos (protocolo):**
1. **Contratos primeiro:** `fundacao-dados` publica os tipos/contratos e o `plataforma-ui` publica `<DataTable>`/`<FilePicker>`. Os builders **programam contra esses componentes** (não reimplementam).
2. **1 área por vez por builder**, fechando o checklist do MAPA-DE-ACOES + PNG.
3. **Toda escrita** passa por `registrarAudit` + `checkPermission`; **toda tabela** usa `<DataTable>`; **todo campo de arquivo** usa `<FilePicker>`.
4. **Gates de sincronização** ao fim de cada etapa (L0 roda `tsc`/`build`, revisores aprovam).
5. **Entregáveis não vão a commit/deploy** sem o usuário; versão é informada por ele.

---

## 7. Decisões (resolvidas em 31/10)

1. ✅ **Currículo módulo→aula = leve por referência.**
2. ✅ **Oferta/combo = fino sobre regras de liberação** (sem preço/checkout).
3. ✅ **Execução = Etapa 0 primeiro, 1 peça por vez**, com revisão antes dos builders L2.
4. ✅ **Cutover = coexistir**: Estúdio construído por fora em `/admin/conteudos/*`, menu novo ao lado dos atuais; telas antigas vivas até o cutover final.
5. ✅ **Disponibilidade = nomes do designer**: Na matrícula · Data específica · Intervalo após matrícula · Data + intervalo · Dia da semana + intervalo.
6. ✅ **Lixeira = 30 dias** (env-configurável) + **"selecionar todos"** pede confirmação acima de **1.000** itens.
7. ✅ **Fechamento = sem commit**: entregar código + **lista única de migrações a aplicar** + resumo; usuário revisa e decide deploy. Migrações são aplicadas pelo usuário (+ NOTIFY pgrst).

---

## 8. Status de execução (31/10/2026) — Etapas 0→5 construídas

Construído **por fora** em `app/admin/conteudos/*` (produção intacta; cutover depois). `tsc` verde. Build sendo verificado. **Nada commitado.**

### 8.1 Fundação (Etapa 0) — componentes aditivos
- `components/admin/data-table.tsx` — `<DataTable>` genérico server-driven (seleção+barra 48px, ordenação/paginação server 5/10/25/50, altura fixa, ⋮).
- `components/admin/file-picker.tsx` + `lib/biblioteca/video-provedor.ts` — `<FilePicker>` 4 abas (Biblioteca liga-não-copia; vídeo YouTube/Vimeo/Panda/Drive; hospedagem própria = placeholder).
- Shell: `app/admin/conteudos/{layout,page}.tsx` + abas (`conteudos-tabs.tsx`, `materiais-tabs.tsx`) + item de menu "Estúdio de Conteúdo" (`sidebar.tsx`) + `AREA_PERM` (`layout.tsx`).
- RBAC: papel `professor` + permissões novas (`rbac-catalogo.ts`, `onboard-tenant.ts`, `seed-rbac.mjs`).
- Lixeira: cron `app/api/cron/lixeira-purge` (30d, env `LIXEIRA_PURGE_DIAS`) + `soft-delete.ts` (inclui `simulado_conteudo_documentos`, `simulado_flashcard_baralhos`, `simulado_trilhas`) + `lixeira/actions.ts` (CFG/paths).

### 8.2 Builders (Etapas 1–5)
- **Biblioteca** (`materiais/biblioteca|aulas|arquivos`): navegador, upload, AulasVinculadas (+ reapontar fixados em lote), Substituir (mantém grifos), Tags em documento. Reusa `biblioteca/actions.ts` inteiro.
- **Questões + Classificação** (`materiais/questoes`, `classificacao`): lista de bancos 1ª classe, detalhe, editor/importar CSV reusando `QuestoesTabelaBase`/`ImportarQuestoesTab`; taxonomia standalone com curadoria do cadastro.
- **Produtos** (`produtos`): lista+pastas, Informações (+instrutores), **Conteúdos = currículo leve por referência** (módulo→item aponta a doc/vídeo/simulado/quiz), Grupos. Reusa `produtos/actions.ts`.
- **Acesso & Comercial** (`grupos`, `acesso`, `ofertas`): grupos/membros (validade por membro + export CSV), painel **"quem tem acesso e por quê"** (`acessoEfetivoDoEstudante`/`resumoAcessoLote`) + reconciliação 1-clique, oferta fina sobre liberação.
- **Flashcards + Trilhas** (`flashcards`, `trilhas`): baralhos nomeados (editor/publicar/importar), trilhas novas (CRUD, ordem manual/data).

### 8.3 Migrações a aplicar (NA RAIZ `supabase/migrations/`, em ordem, + `NOTIFY pgrst, 'reload schema';`)
1. `20261031000000_rbac_professor_conteudos.sql` — papel professor + permissões. *(depois: `node scripts/seed-rbac.mjs [tenantId]` p/ tenants existentes)*
2. `20261031010000_conteudo_etiquetas.sql` — tags em documento.
3. `20261031030000_estudio_produtos_curriculo.sql` — produtos: `pasta_id` + instrutores + módulos + módulo_itens.
4. `20261031040000_grupo_membro_validade.sql` — `expira_em` por membro de grupo.
5. `20261031040001_liberacao_oferta.sql` — oferta fina (requer `20261030000001` já aplicada + `LIBERACAO_REGRAS_ATIVO`).
6. `20261031050000_flashcard_baralhos.sql` — baralhos nomeados (requer base `*_flashcards`).
7. `20261031051000_trilhas.sql` — trilhas + itens.

Todas idempotentes e guardadas; o app é tolerante a tabela/coluna ausente (mostra aviso até aplicar).

### 8.4 Limitações conhecidas (honestas, para próxima passada)
- Editor de questão / importar CSV (reuso exato) **redirecionam para `/admin/questoes`** ao salvar (saem do shell do Estúdio) — forkar exigiria tocar produção.
- Produto › Informações não cobre campos sem coluna real (marca d'água, certificado, lançamento, visibilidade/direcionamento…).
- Vídeo: **sem hospedagem própria** (só URL externa); "gerar flashcards do JurisClub/LegProc" = placeholder.
- `simulado_produto_modulos/_itens` fazem soft-delete inline mas **não** entram no purge cron (adicionar a `SOFT_DELETE_TABELAS` depois, se quiser).
- Fidelidade ao PNG = **funcional-primeiro**; refinamentos visuais pontuais pendentes.
- Árvore de migração: consolidei na raiz; a base de flashcards (`20261027000000`) estava em `apps/web/supabase/migrations/` — confirme seu pipeline.

### 8.5 Cutover
Coexiste: menu "Estúdio de Conteúdo" novo ao lado dos atuais; `/admin/biblioteca`, `/admin/produtos`, `/admin/questoes`, `/admin/grupos` intactos. Troca final quando você aprovar.

---

## Apêndice — âncoras
- Spec funcional por área: `docs/estudio-conteudo-blueprint.md` (§3.3 equivalência, §8 por área, §10 NOVO×REUSO).
- Pacote do designer: `C:\Users\joooa\Downloads\revisao-admin-conteudos\revisao-admin-conteudos` (telas-png = alvo visual).
- Memórias: `estudio-conteudo-reorganizacao`, `simulado-grupo-banco-propagacao`, `produtos-extensivos-catalogo-vs-regras`, `liberacao-regras-venda-sistema`, `biblioteca-*`, `reuso-exato-nunca-lookalike`, `backend-first-sem-compute-no-render`.
