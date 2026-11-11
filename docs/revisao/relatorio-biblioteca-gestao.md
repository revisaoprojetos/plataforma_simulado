# Relatório: Biblioteca (Pedagógico) com gestão de pastas, seleção e colunas do legado

Tela: `/admin/revisao/biblioteca`. Fonte da verdade do legado: `/admin/biblioteca` (`biblioteca-client.tsx` + actions).
Legenda de verificação: **N** = verificado no navegador (Playwright, dados reais) | **C** = só por código/tsc | **API** = verificado por chamada à rota.

## 1. O que o legado tem (mapeado)

- Pastas e subpastas: criar, renomear, mover (sem ciclo), cor, excluir (filhos e documentos voltam para a raiz), capa e página inicial, acesso (árvore estilo Drive), disciplina do cronograma (+ classificação essencial/complementar/específica), tipo de material da subpasta (PDFull/PDFight/PDFlash/LegProc/JurisClub/Questões), legenda LegProc. Breadcrumb e contagem por pasta.
- Convenção real no banco (tenant com 881 docs): disciplina = pasta raiz com `disciplina_id` → subpastas tipadas (`cronograma_tipo_material`) → documentos.
- Colunas da lista (menu "Colunas", preferência local): Tipo, Status, Disciplina, Assunto específico, Tribunais, Informativo, Ano, Estado de origem, Selos, Atualização. Filtros por metadado, Exportar/Importar planilha, Preparar PDFs. Acesso Todos/Restrito.
- Menu do documento: gerenciar, detalhes/versões, acesso, capa e página inicial, editar no OnlyOffice, copiar link, duplicar, baixar, renomear, mover, arquivar (soft-delete).
- **O legado NÃO tem seleção múltipla nem ações em massa.** Os metadados só se editam por planilha.

## 2. Matriz legado × nova

| Item | Legado | Nova tela | Como | Verificação |
|---|---|---|---|---|
| Árvore de pastas/subpastas (expandir, contagem por aba, "Sem pasta", "Todas") | cards + breadcrumb | painel à esquerda | `PastasPainel` + `arvoreBiblioteca` (cache 30 s) | N |
| Filtrar documentos por pasta (+ subpastas, opção desligável) | navegação | sim | SQL `pasta_id = ANY(subárvore)` | N + API |
| Criar pasta/subpasta | `criarPasta` | sim (botão no painel e no "Novo") | action legada | C |
| Renomear, cor, mover, excluir pasta | `MenuPasta` | sim | **o mesmo `MenuPasta`** (extraído) + mesmas actions | menu aberto: N; execução: C |
| Disciplina do cronograma, tipo de material, legenda | `MenuPasta` | sim | idem | menu: N; execução: C |
| Capa e página inicial (pasta/doc) | `CapaPaginaDialog` | sim | mesmo componente | C |
| Acesso da pasta (Drive) | `DriveAcessoWrapper` | sim | extraído para `menus-drive.tsx` | C |
| Acesso do documento | `DocumentoAcesso` | sim | mesmo componente | C |
| Coluna Acesso (Todos/Restrito) + filtro | selo no card | coluna + filtro | `acesso_geral` | N + API |
| Colunas Tipo, Status, Disciplina, Assunto, Tribunais, Informativo, Ano, UF, Selos, Atualização | lista | sim, mesmo menu "Colunas" (`useColunasLista`) | `BarraMetadados` reutilizada | N |
| Filtros de metadado (valores distintos) | `BarraMetadados` (só docs da pasta) | sim, valores calculados no servidor para a aba | prop nova `opcoesFiltro` (retrocompatível) | N + API |
| Exportar/Importar planilha, Preparar PDFs | `BarraMetadados` | sim, escopo = pasta atual | mesmo componente | botões presentes: N |
| Coluna Pasta (caminho completo) | breadcrumb | nova | `pastaCaminho` | N |
| Ordem/Aula/Páginas/Tempo (PDFull), nº questões, v{n}, trocar arquivo, histórico, switch Visível, excluir | já existia na nova | mantidos | | N |
| Ordenação por coluna (título, pasta, tipo, status, páginas, acesso, atualização, 7 metadados) | só 3 opções client-side | clique no cabeçalho, no servidor | `ORDER BY` com whitelist | N + API |
| Filtros status / visibilidade / acesso | status no legado | sim | SQL | API |
| Busca (título, disciplina da pasta, metadados) | título | sim, debounce 300 ms | `ILIKE` | N + API |
| Paginação 10/25/50/100 com total | sem (tudo na pasta) | sim | `LIMIT/OFFSET` + `count(*) OVER()` | N |
| **Seleção** (checkbox por linha, selecionar página, persiste entre páginas) | não tinha | sim | estado cliente | N |
| **Ações em massa**: mostrar/ocultar ao aluno, mover, publicar, marcar LegProc, arquivar, excluir (Lixeira) | não tinha | sim, barra flutuante | actions legadas em loop (5 em paralelo, progresso, falhas ficam selecionadas) | barra, confirmação de excluir, diálogo de mover: N; execução: **C (não executei, dados reais)** |
| **Editar metadados em massa** (7 campos, vazio mantém, "-" apaga) | só planilha | sim | rota nova `POST /api/admin/revisao/biblioteca/lote` (valida com `validarCampoMeta`, audita) | diálogo e validação do botão: N; gravação: C |
| Detalhes/versões (drawer) | `BibliotecaDocSidebar` | menu ⋮ da linha | mesmo componente | C |
| Duplicar, baixar, editar OnlyOffice, renomear, mover (linha) | `MenuDoc` | sim | **o mesmo `MenuDoc`** | menu: C |
| Upload de arquivos/pasta, documento em branco, conjunto de questões, nova pasta | `DriveNovoButton` | botão "Novo" nas abas de documento | mesmo `DriveNovoButton`/`DriveUploadPanel`; pipeline em `use-importar-arquivos.tsx` (PUT direto por URL assinada, sem base64) | menu abre: N; upload: C |
| Cartões: Flashcards | n/a | aba Flashcards + "Novo baralho" (link `/admin/conteudos/flashcards`, como no Estúdio) | | N (link) |

## 3. Criar simulado (requisito adicional)

- Mapeado: o Estúdio › Produtos usa o botão "Novo simulado" (`produtos-estudio-client.tsx`) que leva ao fluxo de `/admin/simulados`; `/admin/simulados` usa `NovoSimuladoDialog` (escolha "Criar novo simulado" → `/admin/simulados/criar/personalizar`, ou "A partir de um já pronto" → `/admin/simulados/novo`; grava por `criarSimuladoCompletoAction`). Permissão: `simulados:create` (mesma checagem de `conteudos/produtos/page.tsx`).
- Na aba **Simulados** da Biblioteca entrou o botão **Novo simulado** com o **mesmo `NovoSimuladoDialog`** (sem cópia). Só aparece com `simulados:create`. **N**: botão presente e diálogo abre com as 2 opções. Não avancei para o wizard nem gravei.
- Limitação: o `destino` do `NovoSimuladoDialog` é pasta de simulados (`folder_area = simulado`), outra árvore das pastas da Biblioteca (`conteudo`). Por isso o simulado **não herda a pasta/disciplina aberta na Biblioteca**; ele aparece na lista da aba (ordem por data de criação) depois de criado. Ligar as duas árvores exige decisão de modelo.
- Demais abas: PDFull/PDFlash/PDFight/LegProc/JurisClub/Questões usam o "Novo" do Drive (upload, em branco, conjunto de questões em Conteúdos; sem "Conjunto de questões" no JurisClub, como no legado). O destino é a **pasta aberta no painel**. O tipo do item vem do tipo da subpasta, então criar numa pasta de outro tipo faz o item aparecer em outra aba. Flashcards: link para criar baralho.

## 4. Desempenho

- Uma rota `GET /api/admin/revisao/biblioteca` por troca (aba/pasta/busca/filtro/ordem/página). A página só entrega o 1º quadro.
- Servidor: 1 SQL com `count(*) OVER()` e versão/nº de questões em subselects (1 ida ao banco), árvore e opções de filtro em cache 30 s, resumo em cache 30 s, pastas resolvidas em cache 30 s (`limparCacheGestao` após mutações). Sem `.in()` sem chunk, sem N+1.
- Cliente: cache de 60 s por consulta + pré-carga da próxima página + pré-carga ao passar o mouse em aba/pasta.
- Medido (dev, banco remoto): **cache: 200 a 370 ms** (abas, pastas, páginas). **Frio: ~0,8 a 1,3 s** por consulta nova (latência do banco remoto em dev). Meta de <300 ms vale **após o 1º carregamento**; o primeiro clique numa combinação nunca vista depende do hover (pré-carga) e da latência do banco. Em produção, mesma região, deve ser menor, **não medido**.

## 5. Arquivos alterados/criados

Novos: `app/admin/revisao/biblioteca/{biblioteca-app,pastas-painel}.tsx`, `app/api/admin/revisao/biblioteca/route.ts`, `.../lote/route.ts`, `lib/admin-revisao/biblioteca-gestao.ts`, `components/biblioteca/{menus-drive,use-importar-arquivos}.tsx`.
Alterados: `app/admin/revisao/biblioteca/{page,materiais-tabela}.tsx`, `lib/admin-revisao/{biblioteca,biblioteca-tipos}.ts`, `components/biblioteca/metadados-toolbar.tsx` (prop opcional), `app/admin/biblioteca/biblioteca-client.tsx` (extração de `MenuPasta`, `MenuDoc`, `MoverConteudoDialog`, `Overlay`, `DriveAcessoWrapper`, `SeloCronograma` e constantes para `menus-drive.tsx`, sem mudar comportamento; tsc limpo).

## 6. Migrations

Nenhuma nova. No banco atual já existem `oculto`, `metadados`, `modo_acesso`, `acesso_geral`, `cronograma_tipo_material`, `legproc_ocultar_legenda` (verificado por consulta). Mantida a tolerância a coluna ausente: sem `oculto` (migration `20261026000000`) o switch/filtro de visibilidade ficam desligados com aviso; sem SQL direto (`DATABASE_URL`) a lista cai no modo reduzido com aviso.

## 7. Lacunas e riscos (honestos)

- **Nenhuma ação destrutiva foi executada.** Testei até confirmação/cancelamento (excluir, mover, metadados). Criar/renomear/mover pasta, ações em massa, upload, capa, acesso e gravação de metadados em massa estão **só por código**. Antes do deploy, vale testar com itens de teste.
- Excluir pasta (legado) reparenta subpastas e documentos para a raiz: a mensagem de confirmação foi ajustada para dizer isso.
- "Arquivar" no menu da linha chama `removerDocumento` (Lixeira), igual ao legado; "Arquivar" em massa usa `arquivarConteudo` (status "arquivado"). Diferença herdada do legado.
- Seleção em massa cobre os ids marcados (persiste entre páginas), não "todos os N resultados"; limite de 500 por edição de metadados.
- Abas Flashcards e Simulados não têm painel de pastas (não são documentos de pasta); sem seleção em massa.
- Páginas: documentos .docx não têm contagem de páginas (coluna "—"; tempo do PDFull vira 0h), comportamento já existente.
- Bug de ambiente: o dev server da porta 3000 estava fora do ar durante parte do trabalho; os testes finais rodaram nele depois que voltou.
- Sem coluna "Link do material" do protótipo (não existe no modelo de dados).
- O pipeline de upload foi **duplicado** em `use-importar-arquivos.tsx` (o do legado continua inline no `biblioteca-client.tsx`); migrar o legado para o hook é um passo futuro.
