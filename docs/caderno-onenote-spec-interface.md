# Caderno estilo OneNote — especificação de interface (alvo: réplica fiel, tema da plataforma)

Fonte: pesquisa sobre o OneNote (Microsoft 365 desktop + Web). Itens marcados [?] não foram verificados; seguir o comportamento mais comum.
A cor roxa do OneNote é SUBSTITUÍDA pelos tokens de tema do tenant (nunca hex). Cores de SEÇÃO são identidade da seção (paleta fixa de ~16 cores, independente do tema).

## 1. Layout (tela cheia, cobre o shell do portal — padrão do editor do OnlyOffice: `fixed inset-0 z-50`)
De cima para baixo:
1. **Barra da plataforma** (tema/marca do tenant): logo, "Meus Cadernos", botão Voltar ao portal, indicador de salvo, busca. (É a "top bar com o tema da plataforma".)
2. **Barra de título do caderno**: nome da página + "· Caderno", Desfazer/Refazer, indicador "Salvo", Compartilhar (fase 2).
3. **Ribbon** (faixa de opções): linha de abas de texto + painel de grupos da aba ativa (rótulo do grupo pequeno embaixo, separadores verticais finos). Modos: clássico (grupos com rótulo) e simplificado (uma linha, ícones, botão "…"); menu "Opções de exibição": Mostrar sempre / Só abas / Ocultar automaticamente.
4. **Área principal em 3 colunas**: esquerda = painel de navegação (cadernos/seções, recolhível ~220px/48px); centro = faixa de abas de seção (topo) + canvas da página; direita = lista de páginas (~220px, redimensionável, ocultável).

## 2. Ribbon — abas e grupos (ordem esquerda→direita)
- **Arquivo** (menu/backstage simples): Novo caderno/seção/página, Exportar (PDF), Imprimir, Opções.
- **Página Inicial**: Área de Transferência (Colar ▾[Colar, Colar sem formatação], Recortar, Copiar, Pincel de Formatação) · Texto Básico (Fonte, Tamanho, Negrito, Itálico, Sublinhado, Tachado, Subscrito/Sobrescrito, Realce, Cor da fonte, Marcadores, Numeração, Diminuir/Aumentar recuo, Alinhamento, Limpar formatação) · Estilos (Título 1–3 [até 6 na lista], Título da Página, Citação, Código, Normal) · Marcas (A Fazer, Importante, Pergunta, Lembrar-se, Definição + "Localizar marcas").
- **Inserir**: Espaço Extra · Tabela · Arquivos (Anexar arquivo) · Imagens (Imagem) · Links (Link Ctrl+K; ligação entre páginas com `[[`) · Marcas de Tempo (Data, Hora, Data e Hora) · Símbolos (Símbolo) · Linha horizontal.
- **Desenhar**: Ferramentas (Selecionar objetos/texto, Laço, Borracha ▾[pequena/média/grande, apagar traço], Texto) · Canetas (galeria de canetas e marca-texto; clicar na ativa abre cor ~16 + espessura) · Formas (fase 2) · Desenhar com toque (alternar toque/mouse).
- **Histórico**: Versões da página, Lixeira do caderno (Notas excluídas), Marcar lido/não lido (fase 2).
- **Revisão**: (fase 2) Ortografia, Proteger seção com senha.
- **Exibir**: Exibições (Normal, Tela Cheia, Modo Imersivo) · Página (Cor da página [~16 cores, padrão branco], Linhas de régua: Sem/Estreita/Média/Larga/Extra larga e Grades pequena/média/grande) · Zoom (Ampliar, Reduzir, 100%, Largura da página) · Painéis (mostrar/ocultar navegação e lista de páginas).
- **Ajuda**: atalhos de teclado.

## 3. Abas de seção (horizontais, acima do canvas)
- Cada seção = aba com cor própria; ativa em cor cheia (texto com contraste), inativas em tom claro da mesma cor; cantos superiores arredondados, "colada" ao canvas.
- Setas de rolagem quando não cabem; botão **+** no fim (Ctrl+T) cria seção com cor automática; arrastar aba reordena; arrastar página sobre uma aba move a página.
- Menu de contexto: Nova seção, Renomear, Excluir, Mover/Copiar, Cor da seção, (grupos de seções e senha = fase 2).
- Seções automáticas existentes (Erros, Favoritos) continuam, somente leitura (ícone distinto).

## 4. Lista de páginas (direita)
- Topo: **+ Adicionar página** (Ctrl+O). Itens: título (até 2 linhas; sem título = "Página sem título").
- **Subpáginas em 2 níveis** (recuo ~16–20px): "Tornar subpágina"/"Promover subpágina" (menu e arrastar para direita/esquerda); Ctrl+Shift+Alt+N cria subpágina; recolher/expandir subpáginas.
- Menu de contexto: Excluir, Mover/Copiar (Ctrl+Alt+M, diálogo em árvore seção destino + Mover/Copiar), Copiar link para a página, Recolher/Expandir subpáginas, Versões da página (fase 2).
- Ordenar por: Manual (arrastar), Data de criação, Última modificação, Título.
- Item selecionado: fundo `brand-primary-soft`, negrito.

## 5. Pesquisa e lixeira
- Caixa de pesquisa (Ctrl+E tudo, Ctrl+L página): escopo Esta página / Esta seção / Este caderno; painel de resultados com trecho; realce na página; Próximo/Anterior (Enter/F3, Shift+F3).
- Lixeira ("Notas excluídas"): páginas/seções excluídas com restauração (~60 dias).
- Salvar automático, sem botão; indicador "Salvo"/"Salvando…".

## 6. Canvas da página
- **Título** grande (28–32px, peso leve) com linha fina embaixo; **data e hora** abaixo, em cinza (criadas automaticamente; clicar edita).
- **Tela infinita** que rola em todas as direções; página cresce com o conteúdo.
- **Contêineres**: clicar em ponto vazio cria caixa de texto ali; cada caixa tem alça de arrastar (barra no topo, 4 setas, no hover), alça de redimensionar a largura, borda fina no hover/foco, altura automática; caixas podem sobrepor.
- **Linhas de régua e cor da página** (só fundo; não fazem parte do conteúdo).
- **Imagens** (colar/arrastar, redimensionar), **tabelas** (Tab cria nova célula/linha; barra contextual: inserir/excluir linha/coluna), **arquivos** anexos (ícone+nome), **links** (Ctrl+K, URL colada vira link), **ligação entre páginas** (`[[` abre lista de páginas).
- **Marcas** (ícone na margem esquerda do parágrafo): Ctrl+1 A Fazer (caixa), Ctrl+2 Importante (estrela), Ctrl+3 Pergunta (?), Ctrl+4 Lembrar-se, Ctrl+5 Definição; Ctrl+0 remove. (Realce/Contato/Endereço/Telefone = não reproduzir.)
- **Listas**: marcadores Ctrl+. , numeração Ctrl+/ ; Tab/Shift+Tab muda nível.
- **Estilos**: Título 1–6 (Ctrl+Alt+1…6), Citação, Código, Normal.

## 7. Desenho (aba Desenhar)
- Canetas (3–5 predefinidas) e marca-texto (semitransparente, mais larga); clicar na caneta ativa abre cor (~16) e espessura; borracha (tamanhos + apagar traço); laço (seleciona/move/apaga tinta); botão Texto volta ao cursor. Stylus desenha; dedo rola quando "Desenhar com toque" está desligado; mouse desenha com caneta ativa. Tinta é objeto ancorado à página (selecionável, movível, apagável). NÃO reproduzir: tinta para texto/matemática, formas, régua, replay.

## 8. Atalhos (verificados, Windows)
Ctrl+O nova página · Ctrl+T nova seção · Ctrl+Shift+Alt+N subpágina · Ctrl+Alt+M mover/copiar · Ctrl+B/I/U · Alt+Hífen tachado · Ctrl+Shift+N limpar formatação · Ctrl+Q/R alinhar esq/dir · Ctrl+Alt+1…6 títulos · Ctrl+1…5 marcas, Ctrl+0 remove · Ctrl+. e Ctrl+/ listas · Tab/Shift+Tab nível · Ctrl+K link · Alt+Shift+D data, Alt+Shift+F data e hora, Alt+Shift+T hora · Ctrl+E/Ctrl+L pesquisa · Ctrl+Tab / Ctrl+Shift+Tab seção seguinte/anterior · Ctrl+PgDn/PgUp página seguinte/anterior · Alt+Home/End primeira/última página da seção · Ctrl++/Ctrl+- zoom · Ctrl+Z/Ctrl+Y.

## 9. Aparência (tokens)
- UI em Segoe UI (fallback system-ui); botões do ribbon 12–14px; rótulo de grupo 11–12px; título da página 28–32px leve; corpo ~15px.
- Dimensões de referência: título ~32px; abas do ribbon ~32px; corpo do ribbon ~90px (clássico); abas de seção 32–36px; lista de páginas 200–250px (itens 36–40px; recuo subpágina 16–20px); navegação 220px/48px.
- Mapeamento: `--brand-primary` (aba de ribbon ativa, foco, link, ícones), tom suave dele para selecionado/hover, superfícies cinza muito claras para ribbon e painéis, canvas branco (ou "cor da página"), bordas finas, foco de teclado 2px na cor primária. Dark mode: painéis cinza-escuro; recalcular contraste.
- Estados: hover = fundo suave + borda 1px; ativo = fundo mais forte; aba de ribbon ativa = texto na cor primária + barra inferior; caixa do canvas sem borda em repouso, borda fina no hover, alças no foco.

## 10. Priorização
- **MVP fiel**: layout 3 colunas, ribbon (Arquivo, Página Inicial, Inserir, Desenhar básico, Exibir), abas de seção coloridas com +/rolagem/arrastar, lista de páginas com subpáginas (2 níveis) e ordenação, canvas com título/data/contêineres/régua/cor da página, listas, marcas 1–5, tabela simples, imagem, links e `[[`, pesquisa com escopo, lixeira, mover/copiar página, salvamento automático com indicador, atalhos principais.
- **Fase 2**: canetas completas/laço, localizar marcas, versões da página, anexos, grupos de seções, exportar PDF, compartilhar, modo imersivo, senha por seção, integração com questões/grifos do banco.
- **Não reproduzir**: tinta→texto/matemática, formas, régua/replay, áudio/vídeo/ditado, e-mail/Outlook, equação, modelos de página, marcas pessoais, coautoria em tempo real, multi-janela.
