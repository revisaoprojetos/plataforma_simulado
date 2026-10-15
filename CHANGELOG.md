# Changelog

Versionamento **semântico**: `MAJOR.MINOR.PATCH`.

- **PATCH** (`x.y.Z`) — ajuste pequeno / correção de bug.
- **MINOR** (`x.Y.0`) — área ou funcionalidade nova.
- **MAJOR** (`X.0.0`) — mudança grande (ex.: redesign geral do sistema).

**Regra (a partir de 2026-10-05):** todo push bumpa a versão em [`apps/web/lib/version.ts`](apps/web/lib/version.ts)
**e** adiciona uma seção aqui com o resumo das mudanças. Ao gerar a imagem, informamos qual versão é.
A versão aparece no rodapé esquerdo da tela de login (`v{APP_VERSION}`).

---

## 3.17.4 — 2026-10-15

**fix(home): check-in de hoje credita XP de verdade + dia correto no card de Sequência (homes branded)**

- Nos homes do visual novo (Revisão/MEQ/VND) o botão "Fazer check-in" era **mock** (`setChecked(true)` local):
  não chamava o servidor, então **não creditava XP** nem persistia. Agora usa `useCheckin` → `POST
  /api/aluno/gamificacao/ping` (mesmo fluxo do card antigo): persiste o streak, credita o XP, dispara a
  celebração e revalida (top bar/sidebar/level atualizam).
- **Dia "hoje" errado (Revisão):** o card marcava o "hoje" pelo primeiro dia não-estudado (`primeiroPendente`)
  — com o dia já feito, o anel pulava pro próximo dia. Agora usa a flag real `hoje` do servidor (último dia
  da janela), carregada de ponta a ponta (`atividadeSemana` → `home-nova` → `HomeSemanaDia.hoje`).
- NB: o valor do XP por check-in vem da config `streak.por_dia` do tenant (setada p/ 10 em Revisão/MEQ/VND).

## 3.17.3 — 2026-10-15

**fix(juris) CRÍTICO: anti-zeramento do progresso do arcade + recuperação pelo navegador**

- **Causa da perda:** a rota `POST /api/jurisprudencia/progresso` fazia upsert cego (gravava o que o cliente
  mandasse, inclusive `{}`), e o `bootstrap.js` tem um flush (`pagehide`/`visibilitychange` → `sendBeacon`)
  que POSTa o localStorage. Quando o seed do servidor falhava (GET 500/timeout/rede), o localStorage ficava
  vazio e o flush gravava `{}` **por cima do progresso real**, zerando `dom`/`best` do aluno (intermitente).
- **Guarda no servidor:** payload totalmente vazio **nunca** sobrescreve um progresso não-vazio (reset real
  continua via SQL do admin). Protege inclusive clientes antigos em cache.
- **Guarda no cliente:** `bootstrap.js` não envia POST/flush com `dom`+`best` vazios.
- **Recuperação:** se o servidor vier vazio, o arcade tenta restaurar do localStorage da CHAVE ANTIGA
  (pré-v3.15.1, `jurisclub-<idDoDesafio>`, sem o id do aluno) — intacta porque o seed novo grava noutra chave —
  e re-envia ao servidor. Recupera quem abrir no mesmo navegador.
- Cache-bust do arcade `?v=20261015a`.

## 3.17.2 — 2026-10-14

**fix(build): shim `modelos-caderno/_campos.tsx` faltando — CI do v3.17.1 falhou (`Can't resolve './_campos'`)**

- O rename `modelos-caderno/_campos.tsx → caderno-shared/campos.tsx` entrou no commit do v3.16.0, mas o
  **shim** de compatibilidade (re-export que mantém o `import './_campos'` do `modelo-editor.tsx` funcionando)
  estava **untracked** e não foi commitado. No Windows o build passava (o arquivo existia local + FS
  case-insensitive); no CI (Linux) o módulo não resolvia e o `next build` quebrava. Commitado o shim.

## 3.17.1 — 2026-10-14

**fix(simulado): link da plataforma volta na entrada do simulado (3 marcas)**

- No designer novo da entrada o nome da plataforma deixou de ser um **link**. Voltou como âncora, no formato
  **"Plataforma Revisão / MEQ / VND"**, apontando para o login da Curseduca de cada tenant:
  - Revisão → `https://revisaopge.curseduca.pro/login`
  - VND → `https://vocenadefensoria.curseduca.pro/login`
  - MEQ → `https://meqconcursos.curseduca.pro/login`
- Mapa por marca em `EntradaReal`; novos campos `plataformaRotulo` + `plataformaLoginUrl` em `SimEntradaReal`.
- Revisão (subtítulo), MEQ e VND (label do campo de e-mail) renderizam o rótulo como link (nova aba).

## 3.17.0 — 2026-10-14

**feat(juris): Regulamento configurável, bolinhas editáveis + fix do selo final e da sequência no ranking**

- **Regulamento (admin + aluno):** "Como funciona" agora puxa direto do config (`comoFunciona`); "Ganhos"
  tem editor de **toda** a pontuação — inclusive os itens que não pontuam mais — e botões 👁 para **ocultar**
  cada item e cada card (fases/matérias/vidas/tempo) via `regulamentoOcultos`.
- **Bolinhas do labirinto configuráveis:** novo bloco no admin com **pontos por bolinha** + **quantidade por
  fase** (`bolinhasQtd`, padrão 200) e **total calculado**. A quantidade também define quantas bolinhas o jogo
  gera (`BOLINHAS_ALVO` lê `CONFIG.bolinhasQtd`, com clamp 10–400). Card do aluno mostra por-bolinha e o total.
- **fix(selo final):** o dia agregado (selo) só libera quando TODOS os dias normais estiverem **publicados e
  concluídos** — antes caía no default 'publicada' e abria cedo demais (e chegou a pontuar um "dia 15" inexistente).
  `dayComplete` agora exige teses > 0.
- **fix(sequência no ranking):** `diasAtivosPorAluno` não filtra mais por `.in(estudanteIds)` (≈443 ids →
  URI too long → query falhava → todos ficavam com sequência 1); varre os marcadores do desafio e o chamador usa `.get(id)`.
- Cache-bust do arcade `?v=20261014a`.

## 3.16.0 — 2026-10-14

**feat(perfil): editor de perfil do aluno — foto, banner, cor de fundo e adesivos**

- Nova área **"Decorar perfil" / "Editar perfil"** no perfil do aluno (`perfil-editor-pro.tsx`) com prévia ao
  vivo e abas **Foto / Banner / Adesivos**, usando os dados que já existem no sistema (avatares Capi, fundos,
  cores e carimbos colecionados).
- **Banner** respeita o `perfilCapa` escolhido: imagem (fundo salvo), cor sólida (`#…`) ou o **fundo animado**
  (grid + "RUMO À PROCURADORIA") — este último agora é uma opção selecionável.
- **Adesivos** posicionáveis (arrastar/redimensionar) renderizados no banner real; tamanho em % da altura
  para ficar consistente entre a prévia e o banner.
- **Cor de fundo do avatar** (`avatarCor`) aplicada em TODAS as imagens de perfil da plataforma: card do
  perfil, top bar e barra inferior do shell.
- Editor exibido **só na Revisão** (que tem as fotos Capi); oculto em MEQ/VND.

## 3.15.4 — 2026-10-14

**fix(juris): bootstrap AUTORITATIVO do servidor — fim do vazamento/re-sync do progresso do arcade**

- O `bootstrap.js` mesclava o progresso do servidor com o localStorage e **re-sincronizava o que o local
  tinha "a mais"** → progresso de outra conta/sessão, ou um dia removido no admin, **voltava sozinho** (e era
  re-gravado no servidor). Era por isso que apagar o "dia 15"/pontos não segurava.
- Agora o **servidor é autoritativo**: o localStorage espelha o progresso do servidor (dom/best/recorde/dias),
  preservando só as preferências do aluno (som/volume/dificuldade/dia selecionado). Sem merge, sem re-sync.
  A jogada real continua persistindo (o arcade POSTa a cada save). Zerar no banco agora **segura**.

---

## 3.15.3 — 2026-10-14

**fix(juris): arcade salvar não conta mais como sequência (só a leitura conta) + recorde recomputado**

- O POST `/api/jurisprudencia/progresso` gravava um marcador de sequência a CADA save/re-sync do arcade →
  só interagir com o jogo (ou um re-sync do localStorage) já contava como "dia da sequência", mesmo sem fazer
  a aula. Removido: agora a sequência vem só da conclusão da LEITURA (ou das questões). Corrige "quem não fez
  a aula estava contabilizando".
- `recorde` recomputado do maior `best` no servidor (não confia no recorde enviado pelo cliente).
- Selo final PRESERVADO (não é bloqueado no servidor) — o "dia 15 fantasma" era o vazamento do localStorage,
  corrigido por `storageKey` por conta (v3.15.1) + limpeza dos dados.

---

## 3.15.2 — 2026-10-14

**fix(gamificação/juris): sequência da top bar conta qualquer atividade + leitura conta na sequência do juris**

- **Sequência da TOP BAR agora conta QUALQUER atividade (1×/dia):** antes só contava quiz de leitura
  (`origem='leitura'`, `ref_id='quiz:%'`) — a atividade do juris (e outras) não bumpava o streak global.
  Agora varre todo o ledger de XP e conta o dia de cada evento (dedup por dia). Quem fez juris ontem+hoje
  passa a mostrar 2 na top bar.
- **Leitura conta na SEQUÊNCIA do juris:** concluir a LEITURA do dia (sem precisar fazer as questões) agora
  grava o marcador de sequência do juris (`/api/leitura/progresso` com `desafio`).
- **Dia 15 (selo final) zerado:** removido o progresso de arcade do dia 15 (dom/best) de todas as contas
  desse desafio (dado vazado do bug anterior do storageKey). Fica "não iniciada" até ser desbloqueado.

---

## 3.15.1 — 2026-10-14

**fix(juris): vazamento de progresso entre contas + conclusão da leitura liberar o jogo**

- **BUG GRAVE — progresso do arcade vazava entre contas:** o `storageKey` do localStorage era FIXO
  (`jurisclub-desafio-v1`) para todas as contas. Ao trocar de conta no mesmo navegador, o bootstrap
  mesclava o progresso (dom/best) da conta anterior e **re-sincronizava pro servidor** da nova conta —
  o aluno "ganhava" pontos sem jogar. Agora o `storageKey` é **por aluno** (`...:<estudante_id>`),
  isolando cada conta. (Fix em `/api/jurisprudencia/conteudo`.)
- **Conclusão da leitura não liberava o jogo:** o leitor novo (`LeitorJus`) ao "Concluir leitura" só
  fechava o overlay, sem gravar `simulado_leitura_progresso` → o gate do arcade seguia bloqueado. Agora o
  host grava a conclusão (pct 100 + `concluir`) antes de fechar, e acumula tempo de leitura (heartbeat).

---

## 3.15.0 — 2026-10-14

**feat(juris): dificuldade configurável + correções do leitor/arcade**

- **Leitor do dia (jurisprudência) abria sempre o "Dia 01":** o protótipo (`leitor-jus.html`) caía no
  documento DEMO embutido quando o handshake do host atrasava (timeout de 2s) e ignorava o dia real.
  Agora, no embed, ele **sempre espera o conteúdo real** e re-anuncia "ready" até recebê-lo (sem fallback
  de demo). Todos os dias passam a abrir o conteúdo certo.
- **Tags do sumário do leitor:** removido o STF/STJ auto-derivado (não vem do editor) e o fallback de tags
  de modelo/demo. Agora o tema mostra só os selos REAIS da Biblioteca presentes no conteúdo (`data-selo`).
- **Testador exclusivo** passa a enxergar a **leitura de qualquer dia** do desafio (mesmo agendado/rascunho).
- **Dificuldade (velocidade das armadilhas):**
  - Admin define a **padrão** (Muito fácil / Fácil / Normal / Difícil) na config do desafio e pode **permitir
    o aluno escolher** (toggle). Desligado = travado na padrão.
  - Aluno, quando permitido, ajusta pelo botão **🎚 DIFIC** na barra do monitor do arcade (cicla os níveis,
    salva na conta e re-aplica na hora). "Muito fácil" também reduz a quantidade de armadilhas.

---

## 3.14.0 — 2026-10-13

**feat(caderno): ajustes de cabeçalho/rodapé, cores do card de disciplina e herança do modelo p/ o simulado**

- **Imagem de fundo da folha**: passa a preencher 100% da folha (`backgroundSize: 100% 100%`) —
  idêntico em todas as páginas A4 e sem **faixa branca** no rodapé quando a folha cresce além do A4.
- **Novos ajustes de cabeçalho/rodapé** (prévia, PDF e export Word/HTML): **encaixe** da imagem
  (preencher/inteira/esticar), **alinhamento**, **altura da faixa** independente da reserva e
  **em quais folhas** aparece (todas/só a 1ª/exceto a 1ª). Novos campos em `tipos.ts` +
  `FaixaControles` reusado no modelo-editor e no builder.
- **Card de disciplina**: cor da **fita**, do **fundo**, do **texto**, do **%** e do **X/N** agora
  são **editáveis separadamente** (antes o % acompanhava a fita e não dava p/ mudar o fundo).
- **Herança do modelo → simulado**: as edições por-card feitas no MODELO (disciplinas genéricas
  `disciplina_1..N`) são transferidas **por posição** p/ as disciplinas reais do banco
  (`herdarEdicoesDiscReais` em `previa.tsx`) — cor + alinhamento + fonte + tamanho + estilo. Edição
  feita direto no banco real tem prioridade. Corrige as cores "sumindo"/mudando ao abrir o simulado.
- Bundle também inclui trabalho em andamento de **jurisprudência** (área de questões) e **leitura**.

## 3.13.1 — 2026-10-13

**fix(simulados): link de cópia usa o domínio do tenant atual (não o global)**

- Os links copiados no admin (acesso ao simulado, snippet de embed e trilha da leitura)
  usavam `NEXT_PUBLIC_APP_URL` (global = `revisaopge`), fazendo o **VND** copiar link com
  `revisaopge.com.br` em vez de `vocenadefensoria` (e o MEQ idem).
- Agora o domínio deriva do **host atual da request** (`x-forwarded-host`) nas páginas server
  (`/admin/simulados`, `/admin/simulados/[id]`, `/admin/simulados/[id]/embed`) e de
  `window.location.origin` nos botões client (copiar link do módulo/trilha).

---

## 3.13.0 — 2026-10-13

Desafio de Jurisprudência (arcade) + Leitura rápida + Leitor novo (mobile): correções de sequência e
pontuação, botão de sair do desafio, renomes, reorganização da tela do dia e ferramentas de marcação
funcionando no celular.

- **Sequência do juris (arcade) corrigida:** o card de sequência mostrava **2** (ex.: "ontem" que não
  existiu) enquanto o relatório mostrava **1**. Causa: o arcade semeava os dias da **união servidor +
  localStorage** (datas antigas/fabricadas do cliente). Agora os dias vêm **só do ledger do servidor**
  (já filtrado); `marcarDiaAtivo` ainda conta HOJE ao jogar. Nenhum dado alterado.
- **Leitura rápida credita só as teses (decisão do usuário):** concluir a leitura rápida de um dia do
  juris passa a creditar **só os pontos das perguntas/teses** (nº teses × `pontos.tese`, ex.: 10×100 =
  **1000**) — **sem as bolinhas** do labirinto. `best = max(atual, teses)`, então quem jogar o labirinto
  ainda chega aos 3000. Novo `creditarTesesLeituraRapida`; invalida o ranking. Quem já tinha 3000 (jogou)
  não é mexido.
- **Sair do desafio (arcade):** botão **"✕"** no HUD (desktop) e **"EXIT"** no d-pad (mobile, à esquerda
  do ▲) + menu na **PAUSA** (CONTINUAR / VOLTAR PARA LEITURA) → voltam à tela do dia preservando o
  progresso (teses + melhor score).
- **Renomes + tela do dia:** "COMEÇAR" → **JOGAR**, "LEITURA RÁPIDA" → **QUESTÕES**. Botões reorganizados:
  **LEITURA DO DIA** larga em cima; **QUESTÕES** (esq.) + **JOGAR** (dir.) embaixo (grid 2 colunas, com
  espaçamento e largura ajustados; JOGAR ocupa a linha toda quando não há Questões).
- **Leitor novo (mobile) — marcação funcionando:** a barra flutuante de marcação tinha ~17 botões numa
  linha só (~510px) e **estourava a tela**; agora **quebra em linhas**, cabe na viewport e os alvos ficam
  **≥42px**. Seleção no touch garantida (`user-select:text` + supressão do menu nativo que competia) e a
  barra aparece ao **soltar o dedo**. O botão da ferramenta aciona de 1ª (trecho capturado em `pendingSel`).
  O **balão de uma marcação permanece aberto** ao modificar (trocar cor/estilo), fechando só no clique
  fora/rolagem/lixeira. Iframe do leitor com cache-bust por `APP_VERSION`.

---

## 3.12.0 — 2026-10-13

Admin do Desafio de Jurisprudência: Ranking + Relatório ricos (reuso do Lei Seca) + modal do aluno;
Relatório do Lei Seca destravado e otimizado (RPC); correção da leitura rápida (concluir + sequência).

- **Ranking rico no juris (reuso, não cópia):** a aba Ranking passou a usar o `RankingAdmin` do Lei Seca
  parametrizado de forma ADITIVA (pódio, chips, abas Pontos/Sequência/Dias, busca, filtros, export
  CSV/Excel/Word/PDF, paginação, atualizando ao vivo, ocultar contas de teste) com **nome completo**.
  Loader otimizado `carregarRankingJuris` (mesmo shape `RankingLeitura`).
- **Relatório no juris (nova aba):** reusa o mesmo `LeituraRelatorio` (KPIs + adesão por dia + tops),
  carregado sob demanda no cliente.
- **Modal do aluno (3 pontinhos) no juris:** Visão geral + **Sequência editável** (calendário do suporte:
  marcar/desconsiderar/salvar), reusando o `DetalheAlunoModal` com loaders injetáveis. O ajuste da
  sequência passa a valer (mesmo `calcularSequencia`). Migração `20261013000003_juris_sequencia_ajuste`.
- **Relatório do Lei Seca destravado + otimizado:** carregava pesado e **não abria** (puxava ~12k+
  respostas/XP e pendurava o render). Agora carrega **no cliente** (spinner + timeout) e usa uma **RPC
  agregada** (`rpc_leitura_relatorio_json`); o juris tem a sua (`rpc_juris_relatorio_json`) p/ escala.
  Fallback para o caminho antigo se a RPC não estiver aplicada.
- **Leitura rápida — concluir + sequência (correção):** o HTML do JurisClub é um slide isolado que NÃO
  reportava as respostas → nada salvava e o desafio não liberava. Agora há o botão **"Concluir leitura"**
  no player (grava o gate que libera o dia, independente da tabela da leitura rápida) e, no juris, a
  conclusão **conta na sequência** (ledger `origem='jurisprudencia'`, dia de hoje BRT).
- **Build:** `obterRankingJuris` "ao vivo" sempre fresco; invalidação de cache ao salvar sequência.

## 3.11.1 — 2026-10-13

Copiar link do Desafio de Jurisprudência + correção da sequência da leitura.

- **Copiar link (Jurisprudência):** o card do desafio (lista do admin) ganhou o botão **Copiar** (ticket e
  pôster), igual ao "Copiar link da trilha" do Lei Seca — copia o link do aluno `…/aluno/jurisprudencia?
  desafio=<id>`. E o "**Link direto**" da aba **Acessos** passou a apontar pro **Juris** (abre o jogo do
  desafio) em vez da trilha de Lei Seca — `ModuloAcesso` agora detecta a área pela rota (`usePathname`).
- **Correção da sequência (leitura):** ao responder a última questão do quiz, grava o marcador de conclusão
  (`onQuizConcluido`) na hora — antes dependia só da finalização em `/quiz-tentativa`, que nem sempre
  disparava, deixando dias SEM evento e **quebrando a sequência**. Idempotente.

## 3.11.0 — 2026-10-13

Leitura rápida, novo leitor de jurisprudência (pré-visualização), ticket do desafio padronizado e correções.

- **Leitura rápida (nova):** caminho alternativo em que o aluno lê + responde num fluxo único; persiste
  o progresso (`simulado_leitura_rapida_progresso`) p/ sair e voltar, conta streak/XP ao concluir e NÃO
  perde a sequência. Rota `/api/leitura/rapida` (GET restaura, POST salva/conclui) + player sandbox
  (iframe) com restauração via postMessage; gate na trilha (`trilha.ts`). Migração
  `20261013000000_leitura_rapida_progresso.sql` (aplicar antes de promover).
- **Novo leitor de jurisprudência (redesign — pré-visualização via `?v2=1`):** PORTE FIEL do protótipo
  rodando em iframe isolado (`public/leitura/leitor-jus.html` + host `leitor-jus.tsx` com handshake
  postMessage que injeta o HTML real do dia). Traz todo o app desenhado: barra de marcação (7 ferramentas
  × 5 cores), legenda, sumário/mini-rail, modo foco, folha espelho, caderno (Marcações/Notas), busca e voz.
  Ajustes: tags por tema vêm dos **selos reais da biblioteca** (`quiz_config.topicos`), modo foco acende a
  tese ativa, botões "Concluir leitura", rótulo "Modo de leitura", aba Revisão removida do caderno, fix da
  gaveta lateral no mobile, e leitura **sempre limpa** (seeds demo removidos; só o que o aluno faz é salvo).
- **Ticket do Desafio de Jurisprudência:** padronizado ao estilo do Lei Seca/simulados (mesmas dimensões,
  status, **barra de progresso real** dias dominados/total · %, botão Jogar/Continuar/Revisar).
- **Jogo (JurisClub):** botão "⚡ ANIMAÇÃO" por extenso (era "ANIM").
- **Editor da Leitura:** correções (aba Editor vazia ao trocar de aba, botão Justificar), blocos
  colapsáveis (cor/cabeçalho/animação), tamanho de fonte preservado ao trocar o modo de leitura.
- **Build:** `lib/pdf/browser.ts` usa `browser.connected` (propriedade) em vez de `isConnected()`
  (removido no puppeteer atual) — destravava o `next build` da imagem.

## 3.10.0 — 2026-10-12

Central de notificações rica no VND (abas/grupos), ligada a dados reais.

- **Central de notificações do VND (nova):** o VND mostrava o **sino simples** (que saía bugado no top bar
  claro); agora usa a **central rica** no padrão do design — cabeçalho com "N novas", abas
  **Todas / Não lidas / Estudos / Simulados / Ranking**, grupos **Hoje / Anteriores**, cards com ícone por
  categoria + botão de ação, marcar como lida (uma/todas) e "Ver todas as notificações". Componente novo
  `components/aluno/central-notificacoes.tsx`, **branded** (tokens via `internaTokensStyle`) e portalizado.
- **Dados reais:** ligada à API `/api/aluno/notificacoes` (não é mais mock). Categoria/ícone/ação são
  derivados do `tipo`/`link`/texto da notificação enquanto o backend não tem coluna de categoria.
- Desktop e mobile do `shell-vnd` passam a usar a central (removido o `NotificacaoBellAluno` do VND; ele
  segue na sidebar antiga da Revisão). O MEQ mantém a sua central própria.

## 3.9.1 — 2026-10-12

Correções de layout do aluno (VND/Revisão).

- **Sino de notificações (VND):** o painel do sino era desenhado para a sidebar **escura** da Revisão
  (fundo `--sidebar` + texto branco + bordas brancas). No VND o sino fica no **top bar claro**, então o
  painel saía branco com texto branco (invisível) — "toda bugada". Passou a usar tokens de
  **popover/card** (fundo/foreground/bordas que se adaptam ao claro/escuro), legível em qualquer marca.
- **Realizações e cadernos (resultado do simulado):** com muitos downloads (Caderno + Folha + Folha +
  Diagnóstico + Gabarito) a linha da realização espremia a grade de estatísticas abaixo do conteúdo e as
  colunas ficavam "uma dentro da outra". A linha agora **quebra** (os cadernos descem pra 2ª linha), a
  grade ganhou largura mínima e o nome da realização trunca. Vale pros 3 brands (`resultado/shared.tsx`).

## 3.9.0 — 2026-10-12

Desafio/Leitura: Biblioteca do Desafio, selos oficiais do JurisClub, "Temas do dia", editor do conteúdo
(marcação canetão, corte de página, espaçamento fiel) e fidelidade dos blocos importados.

- **Biblioteca do Desafio (nova área):** em Desafios → Biblioteca. Blocos de HTML prontos + **Tags (selos)**
  em **pastas/subpastas** (modelo dos simulados), global por tenant. Importar selos padrão, upload de
  imagem, código da tag padronizado com `<>`. Migração `20261012000000_biblioteca_desafio.sql`.
- **Selos = imagens oficiais (JurisClub):** as tags `<rg>`, `<essencial>`… passam a renderizar os **PNGs
  oficiais** (3 variantes: completo/compacto/ícone) em `/public/leitura/selos`, no leitor e na prévia.
  Inserção de selo no editor (botão "Selo") com tamanho (Normal/Compacto/Ícone), posição e redimensionar.
- **Temas do dia (tópicos):** na barra de índice da leitura (aluno + prévia), acima do sumário —
  numeração + nome + **tags (selos)** + nº de questões; clicar rola/centraliza/destaca (igual ao índice).
  Híbrido: tópicos automáticos dos títulos (h1–h3 **e** parágrafos negrito/centralizado/CAIXA ALTA); admin
  ajusta tags/questões/incluir na aba "Temas do dia" (quiz_config.topicos). Título mantém o tamanho no leitor.
- **Editor de conteúdo:** **marcação canetão/pincel** (traço atrás do texto, cor/estilo editáveis, adapta a
  2+ linhas), **corte de página** (divisor + quebra no PDF), "Salvar conteúdo" na barra sticky, Enter cria
  `<p>` e o editor reflete o espaçamento da leitura (WYSIWYG).
- **Fidelidade ao HTML importado:** blocos de 1 coluna (citações/artigos) deixam de receber o verde das
  tabelas comparativas e respeitam a cor da fonte (ou transparente); controle manual de cor por bloco.
  Toggle **"Preservar espaçamento do HTML"** por documento (não colapsa parágrafos vazios / linhas do Enter).

## 3.8.4 — 2026-10-12

Leitura (compartilhada Lei Seca + Jurisprudência): tabelas colapsáveis viram um bloco de cor única.

- **Tabela colapsável = card verde único, sem "Tabela":** removido o rótulo "Tabela" e o card passou a ter
  a cor do conteúdo (verde-claro), com a seta de recolher/expandir no canto superior direito.
- **Verde "mais forte" das palavras removido:** os grifos/marca-texto do Word pintam o fundo por JS com
  `!important` inline (CSS não vence), então agora o `prepararTabelasColapsaveis` zera o fundo de dentro da
  tabela por JS (depois dos grifos), mantendo texto/cores. Resultado: bloco de **cor única**.
- Vale para os **dois** leitores (é o mesmo componente/processamento) + a prévia do admin.

## 3.8.3 — 2026-10-12

Ajuste do modal "Mapa do labirinto" (Desafio de Jurisprudência): estava encostado à esquerda e grande.

- **Centralizado:** o `.mapcard` tinha `max-width` sem `margin:auto` (ficava à esquerda dentro do `.mcard`
  de largura total) — adicionado `margin-inline:auto`.
- **Menor:** `max-width` 1320→960px e o labirinto `min-width` 820→680px, com padding reduzido.

## 3.8.2 — 2026-10-12

Hotfix de **persistência** do Desafio de Jurisprudência (progresso sumia ao recarregar) + teto do score.

- **Persistência não-destrutiva (causa raiz do "reverte no reload"):** o `bootstrap` sobrescrevia o
  localStorage com o servidor no load — se o POST fire-and-forget não chegava, o reload APAGAVA o
  progresso local. Agora o seed é um **merge monotônico** (dom = união das teses/dia, best = maior/dia,
  dias = união), **nunca** apaga o local. + **sync-up** no load (reenvia o que o local tiver a mais) e
  **`sendBeacon`** ao fechar/ocultar a aba (o último estado chega ao servidor mesmo com reload imediato).
- **Teto do score:** correção dos valores de `best` **anteriores ao teto** (resíduo da era com bônus /
  merge com valor inflado): no load, cada fase é clampada ao máximo atingível (`teses×100 + 200×10`).
  O labirinto segue com **200 bolinhas** por fase (teto 3.000 p/ 10 teses).

## 3.8.1 — 2026-10-12

Desafio de Jurisprudência: sequência (streak) server-side, placar reorganizado, rework do score e vários ajustes de UI/contagem.

- **Sequência (streak) server-side, no padrão do Lei Seca:** atividade diária gravada no ledger imutável
  `simulado_xp_eventos` (`origem='jurisprudencia'`, `meta.dia` em BRT, idempotente — **sem migração**);
  cálculo reusa `calcularSequencia` (`lib/jurisprudencia/sequencia.ts`). **Coluna 🔥 Sequência** na aba
  Ranking (React), no mini-ranking lateral e no Hall da Fama do jogo; card do jogador ganhou card
  **SEQUÊNCIA + semana** (dom→sáb). Backfill por `atualizado_em` p/ quem já tinha jogado.
- **Contagem de selos corrigida:** o ranking contava "dias com qualquer tese" como selo; agora
  **SELO = MATÉRIA CONCLUÍDA** (igual ao jogo — `matDone`), via `preencherTesesPorQuiz`; API devolve `totalSelos`.
- **Score por fase = teses + bolinhas, com teto fixo:** removidos os bônus variáveis (vade mecum, armadilha,
  labirinto limpo, vidas) da pontuação contada; **200 bolinhas em todas as fases** (labirinto determinístico
  por alvo); `best` com teto por fase (corrige inflação ao refazer). **2 placares no HUD** (SCORE atual + MELHOR).
- **Placar do aluno reorganizado:** PONTOS TOTAIS + POSIÇÃO lado a lado; SELOS + TESES; barra de progresso
  com o dia atual como marcador (contorno), só dourado = concluído. **TESES DO DIA** com 2 visíveis + rolagem
  e botão **EXPANDIR** (popup estilo pergunta com todas as teses).
- **Vidas configuráveis** (quantidade ou ilimitada) no admin; **toggle ⚡ ANIM** (reduz as animações ao redor
  da tela sem perder fluidez); abas da coluna reordenadas (Aulas/Selos/Ranking/Desafios) + card "Próximas aulas".
- **Ajustes de UI:** Recorde/avatar fora da barra superior; setas do seletor de aula reencaixadas;
  posição/brilho do item Vade Mecum; leitura em embed cobre o shell (botão "Voltar").

## 3.8.0 — 2026-10-10

Integrações (webhook por domínio do tenant) + relatório de simulado com janela e gestão de testes.

- **Webhook de integração (Guru/Curseduca) usa o domínio do PRÓPRIO tenant:** a URL dedicada agora
  é montada com `tenants.dominio` (ex.: `https://simulado.vocenadefensoria.com.br/...`) em vez do
  `NEXT_PUBLIC_APP_URL` global — cada plataforma gera a URL correta para colar na Guru.
  ([admin/integracoes/[provider]/page.tsx](apps/web/app/admin/integracoes/[provider]/page.tsx))
- **Relatório de simulado — janela de aplicação:** para simulados de *janela fixa*, mostra quantos
  **finalizaram no horário previsto** vs **antes** (prováveis testes) vs **depois**.
- **Gestão de tentativas-teste:** no relatório e na página do aluno-no-simulado, dá para **marcar a
  sessão como teste** (reversível), **marcar o aluno como testador** deste simulado (cascateia e vale
  p/ futuras sessões, via `simulado_testadores`) ou **excluir** a tentativa — com permissão, auditoria
  e invalidação de cache do relatório.

## 3.7.3 — 2026-10-10

Correções URGENTES do fluxo de "continuar" simulado em andamento (pré-lançamento).

- **"Continuar" ia para resultado vazio:** o botão de simulado EM ANDAMENTO (em Realizados e no card
  "Continuar"/"Retomar" da Home) apontava para `/aluno/simulados/<id>` — a tela de RESULTADO, que só lê
  sessões finalizadas → mostrava "Você ainda não concluiu este simulado" em vez de retomar. Agora aponta
  para o runner `/simulado/<token>` (o identify reabre a sessão não-finalizada). Vale p/ todos os brands.
  Home: `HomeContinuar.fazerUrl` (novo) + botões do Revisão/VND ligados (antes iam p/ `'#'`).
- **"Aparece para começar de novo":** a entrada mostrava "Começar agora" mesmo com uma prova em andamento
  (o progresso NUNCA se perdia — clicar sempre retomava a sessão; era só o rótulo). Agora o `identify`
  (modo `validar`) devolve `emAndamento` + a questão atual; a entrada (Revisão/VND) mostra **"Continuar de
  onde você parou · Questão X de Y"** e o botão vira **"Continuar de onde parei"**. MEQ já ia direto p/ a
  prova retomada (sem modal). `SimEntradaReal.emAndamento` + captura em `entrada-real`.
- **Admin (em andamento):** relatórios de simulados + gestão de tentativas + painel de janela de testes
  (arquivos de admin incluídos no push a pedido).

## 3.7.2 — 2026-10-09

Refinamentos da área do aluno (visual interno), foco MEQ.

- **Capa real dos simulados:** o componente de capa da home MEQ (`Capa`) e do VND (`Cover`) não tinham
  suporte a imagem — só gradiente+texto. Agora renderizam a imagem real do banco (`vis.capa`) em
  recentes, pastas, continuar e "outros"; sem imagem, caem no gradiente.
- **Recentes sem os já feitos:** simulados concluídos saem de "Simulados recentes" (vão p/ Realizados);
  mantém os em andamento. Antes um feito recém-publicado poluía os recentes por 7 dias.
- **Pastas do admin na Início:** quando os simulados estão organizados por PASTA DE SIMULADO (pasta_id) e
  não por banco→pasta-pai, a Início agora lista essas pastas (antes a seção ficava vazia). Clicar abre a
  pasta (casa por `pasta_id`). Removida a aba "todas" duplicada.
- **Banca nos cards:** nova resolução da banca PREDOMINANTE via questões (`lib/aluno/banca-simulado.ts`,
  cacheada/tenant-wide) ligada na Início e em Realizados.
- **Disponibilidade real:** a linha dos recentes mostrava "Sempre disponível" fixo; agora mostra o texto
  real (`quando` — ex.: "Início 10/10 · Encerra 10/10").
- **UI dos recentes:** imagem maior/landscape; nome do simulado clicável (inicia); "Fazer agora" com ícone
  e botões maiores; download com texto "Baixar".
- **Pastas e Realizados:** cards de pasta mais largos (visão de pasta e home) + capa em paisagem (mesmo
  formato da imagem); imagens maiores em Realizados; botão "Correção" → **"Resultado"**.
- **Banner no mobile:** o hero MEQ usava `aspect-ratio 1920/500` sem override → ~90px no celular, com o
  circuito decorativo "preenchendo" tudo e o slide de texto sem caber. Mobile agora tem altura fixa
  (188px), circuito/glow decorativos escondidos e texto ajustado. Setas e botão de pausar do banner
  **sem caixa/borda** (só o ícone, com sombra p/ contraste).

## 3.7.1 — 2026-10-09

- **Diagnóstico — corte de página nos cards de pilar (com rodapé):** a linha de pilares (LEI SECA /
  JURISPRUDÊNCIA / DOUTRINA) é um bloco atômico; **com rodapé** a área útil encolhe e o bloco encostava no
  limite da folha e era **fatiado** na quebra de página (sem rodapé cabia). Fix em `previa.tsx`: `BUF` maior
  quando há rodapé/margem de base (30→48) → o bloco desce **inteiro** p/ a próxima folha antes de encostar;
  e `break-inside: avoid` na impressão (classe `cad-bloco`) como rede de segurança — nenhum bloco é cortado
  no meio. Vale p/ impressão de caderno-teste **e** modelos (componente compartilhado) e p/ o PDF do worker.

## 3.7.0 — 2026-10-09

- **Caderno-teste / Diagnóstico — cores de texto e fundo que faltavam:** o editor já tinha os controles de
  cor de texto do **Nome** e da **Nota**, mas a prévia e a exportação **Word** ignoravam (cor chumbada).
  Agora `previa.tsx`, `exportar-docx.ts` e `exportar-html.ts` leem `coresTextoParte`/`coresFundoParte` para
  Nome, Nota, faixas dos **pilares/Língua** e cabeçalho das **sugestões** (`>`/`>>` e título juntos).
- **Editor de MODELOS (`modelo-editor.tsx`) ganhou as grades de cor completas:** o editor de modelos usava só
  um "Cor" genérico; portei as grades dedicadas (Nome/Nota com fundo+texto esq/dir, pilares com
  destaque+fundo+texto, sugestões com título+`>`+`>>`, sugestão individual). Removida a duplicação do "Cor"
  genérico no pilar/Língua no builder.
- **Cópia de teste do MEQ:** novo preset `DIAG_MEQ_TESTE` (clone do `DIAG_MEQ`) + entrada
  "MEQ · teste (cópia)" no catálogo — mesmos blocos+contagem, para variar sem afetar o original.
- **Paleta de cores dos modelos padrão (por plataforma):** novo botão **"Editar cores dos padrões"** na aba
  *Modelos padrão* abre o editor sobre uma linha interna (`origem=paleta_padroes`, oculta em "Meus modelos");
  as cores definidas ali (`PaletaCores` — primária/secundária + mapas de cor por bloco) são aplicadas a
  **todos os modelos padrão** da plataforma (prévias e cópias). `novoItem`/`ajustesDeModelo` aceitam a paleta;
  `obterPaletaPadroes`/`abrirOuCriarPaletaPadroes` em `modelos-caderno/actions.ts`. Sem migração (reusa
  `simulado_caderno_modelos`). Script `scripts/_meq-paleta-semear.mjs` semeia a paleta MEQ a partir da
  cópia de teste já colorida (rodar com `--apply`).
- **Login MEQ — ticker animado (em andamento):** título do login com palavras alternáveis configuráveis
  (`LoginTicker`/`sanearTicker`, `tema.loginTicker`), liga/desliga a animação, editável na aba de aparência
  de autenticação do admin.

## 3.6.0 — 2026-10-09

- **Escala / egress (preparação p/ 1500+ alunos ao vivo):** o CONTEÚDO estático da prova (questões +
  alternativas + enunciados), IGUAL p/ todos os alunos, deixou de ser lido do banco **por aluno**:
  - `GET /api/sessoes/current` agora separa o **compartilhado (cacheado por simulado)** do **per-aluno
    (ao vivo)**. Cache em **processo de vida longa por réplica** (`lib/cache/memo-estatico.ts`, 10 min)
    **+ Redis** (`remember`) → protege o banco **mesmo sem Redis** (1500 alunos reutilizam o bundle).
  - Entrada do simulado (`/simulado/[token]` e `/aluno/login`): `info/tipo`, **capa** e **branding**
    cacheados (`remember`) — iguais p/ todos → não geram 1000× as mesmas queries. Queries paralelizadas.
  - `GET /api/sessoes/tempo` (poll do timer) cacheia `tempo_limite_min`/regras (TTL 60s).
  - Detecção de tipo CE×múltipla por **nº de alternativas** (regra do runner) incluída no cache de info.
- **Entrada do MEQ — capa + layout:** capa do simulado ao **fundo do banner** com o **enquadramento salvo**
  no editor (formato ticket/paisagem), banner mais alto, **sem fade**; `CADERNO DE PROVA · SIMULADO`
  ocultado quando há capa; **Disponibilidade/Duração/Itens** movidos p/ um card limpo abaixo do banner;
  **"Em andamento"** sobe p/ a linha da logo (fora do card).
- **Logo por tema (white-label):** tema claro usa a logo ESCURA (`logo_grande_url`), tema escuro a clara
  (`logo_url`); selo navy de fallback quando só há a logo branca. Threaded na entrada e no runner MEQ.
- **Loader de carregamento NEUTRO** no fallback de rota (`loading.tsx` de `/simulado/[token]` e
  `/aluno/login`) — não pisca mais a marca do Revisão num simulado de outra plataforma no 1º load.
- **Título da aba** de `/simulado/[token]` passa a usar o nome do tenant do **TOKEN** (não do host).
- **Rota do simulado mais leve no dev:** `generateMetadata` + `fetchSimulado`/`fetchBranding` com `cache()`
  (dedupe por request); `next/dynamic` já separava entrada × runner.
- Refinamentos em andamento de **caderno-teste/diagnóstico** e **resultado interno** entram no mesmo lote.

## 3.5.0 — 2026-10-09

- **Fluxo do simulado 100% no designer novo nas 3 marcas (runner + resultado):**
  - **Runner do VND** novo (`ProvaVndLive`, drop-in do contrato do MEQ) — antes a prova do VND caía no
    HUD legado roxo do Revisão. Fiação em `prova-client` (`isVnd`, sem gate de `internoAtivo`).
  - **Resultado** branded ligado aos **dados reais** para **VND** (`resultado-vnd-nova`) e **MEQ**
    (`resultado-meq-nova`) — antes ambos usavam o `RevisaoFinal` legado (cores roxas). Omissão graciosa
    de blocos sem fonte real (ranking/turma/histograma) — nada fabricado.
- **Carregamentos do simulado consistentes** (sem flash do Revisão; sem 2 loaders diferentes ao finalizar):
  novo `AppearanceSeed` + `primeAppearanceForce` semeiam a marca/estilo do **TOKEN** (não do host);
  `telaCarregamento` e o loader pós-identificação passam o mesmo `loadingStyle`.
- **Rota do simulado mais rápida (dev):** `EntradaReal`/`ProvaClient`/`EmbedLoginForm` via `next/dynamic`
  — a entrada deixa de compilar a árvore inteira do runner (tela "Esperando…" longa no 1º acesso).
- **MEQ — card da entrada:** "Sempre aberto · sem prazo" quando o simulado não tem janela; **Banca**
  ocultada; **Itens** com o tipo REAL (múltipla escolha × Certo/Errado, detecção por nº de alternativas =
  mesma regra do runner `ehCE`); grade responsiva (`auto-fit`). Valores antes eram chumbados.
- **MEQ — navegador de questões:** o anel da questão selecionada (ex.: a 1) não é mais cortado — `z-index`
  no botão atual + expansão da caixa de recorte do container de overflow (`margin -6` + `padding 6`).
- **MEQ — logo real do tenant** (white-label) no header do runner e no lockup da entrada; sem logo cai na
  marca genérica MEQ. `logoUrl` threaded por `ProvaMeqLiveProps`/`ProvaClient` e `SimEntradaReal`/entrada.
- **VND — faixa cinza** abaixo do conteúdo das áreas internas (Início/Realizados/Desafios/…): o `<main>`
  do shell passou a pintar o fundo temático (o `min-height:100%` do conteúdo não resolvia sob `min-h-dvh`).
- **Home VND:** card **"Sua semana"** some quando o Cronograma está desativado (flag `OCULTAR_CRONOGRAMA`,
  via `HomeData.cronogramaAtivo`); links **"Relatório"** (→ /aluno/perfil) e **"Ver todos"** (→ /aluno/simulados)
  agora funcionam (eram links mortos).
- **Sequência (streak):** anel do dia de **hoje** agora é `ring-inset` — não é mais cortado por containers.

## 3.4.10 — 2026-10-08

- **Entrada do simulado VND — ajustes de conteúdo:**
  - Simulado **sem janela** (sem data de início/fim) agora mostra **"Sempre aberto · sem prazo"** no
    lugar das tiles ABRE/ENCERRA (antes exibia a data atual como fallback, sem sentido). (`SimInfo.semJanela`.)
  - Removido o **ícone de prancheta** acima do status e o rótulo **"CADERNO DE PROVA · SIMULADO"** — o
    card mostra o status ("Em andamento") + o nome real do simulado.

## 3.4.9 — 2026-10-08

- **HUD do simulado DESATIVADA (padrão sempre).** `resolverHudConfig` passou a retornar sempre o padrão
  (flag `HUD_ATIVA = false`), ignorando a config armazenada — vale p/ login/loading/runner/embed do
  simulado. Não afeta o caderno impresso. Reversível (flag p/ `true`).
- **Carregamento do simulado mais leve (code-split por marca).** `PlatformSimulado` importava as 3
  marcas (cada uma com entrada+prova+resultado) de forma estática → toda página de simulado baixava/
  compilava as 3 (no dev, >1min no 1º acesso). Agora via `next/dynamic` só a marca usada é carregada.

## 3.4.8 — 2026-10-08

- **HUD do simulado substituída pelos modelos novos (designer novo) como PADRÃO.** Por enquanto, o
  login e o carregamento do simulado usam SÓ as telas novas, em TODOS os tenants:
  - **Login:** `/simulado/<token>` e `/aluno/login` sempre usam a **entrada branded** da marca
    (`EntradaReal`) — a HUD/`EmbedLoginForm` fica desativada no login (fallback só se o branding não
    resolver). (Reversível: era por marca/`internoAtivo`.)
  - **Carregamento:** o `loading.tsx` dessas rotas passou a usar o **`PlatformLoader`** (loader do
    designer novo, resolvido pela plataforma) no lugar do loader da HUD.
  - A HUD continua no RUNNER da prova (motor real) — só o login/carregamento foram trocados.

## 3.4.7 — 2026-10-08

- **Entrada do simulado do VND agora é FUNCIONAL (não mais mock).** O "ticket verde" do VND era só
  visual: sem campo de e-mail real, sem validação (e-mail errado abria o modal mesmo assim) e com
  título/duração chumbados. Ligado ao backend (igual ao MEQ):
  - **Campos reais** (e-mail + CPF/telefone conforme o método) ligados ao estado + **erro do backend**.
  - **Valida antes de abrir o modal** ("Tudo pronto"): e-mail errado/bloqueio mostra o erro e NÃO abre
    o modal (via `onValidar`); "Começar agora" cria a sessão de verdade (`onIdentificar`).
  - **Título real** no card (`info.titulo`, ex.: "Simulado teste") e **duração/questões reais** no modal
    (antes "4h00" fixo).
  - Estado **encerrado**: "Ver meu resultado" / "Fazer como treino" validam e navegam de verdade.
  - "Voltar" usa o destino real (`voltarHref`).

## 3.4.6 — 2026-10-08

- **Link do admin para o simulado (`/aluno/login?token=`) agora usa a entrada BRANDED da marca.** Esse
  link (gerado pelo admin) caía SEMPRE no `EmbedLoginForm` genérico (roxo/Revisão), ignorando a marca —
  por isso o simulado do VND abria com o visual do Revisão. Agora segue a mesma regra de `/simulado/
  <token>`: MEQ sempre, Revisão/VND com `internoAtivo` → `EntradaReal` (verde VND etc.).
- **Título da aba correto:** `/aluno/login` passou a ter `generateMetadata` com o nome do tenant **do
  token** (não do host) — antes, em localhost/sem subdomínio, a aba mostrava "Revisão" num simulado VND.
- **Loader neutro:** a tela de "Carregando…" de `/aluno/login` pegava a logo pelo HOST (em
  localhost/sem subdomínio → mostrava a logo do Revisão num simulado do VND). Agora é **neutra** (anel
  + ponto, sem logo de marca); o visual branded aparece na própria página.
- Fetches da rota memoizados (`cache()`) + paralelizados — menos queries por acesso.

## 3.4.5 — 2026-10-08

- **VND · entrada do simulado — "Voltar" no canto superior esquerdo + responsivo:** saiu de dentro do
  bloco centralizado e foi fixado no **canto esquerdo da tela** com `clamp()`, adaptando a posição a
  qualquer viewport e à Curseduca (iframe). O lockup "Você na Defensoria / SIMULA VND" fica centralizado.
- **VND · furos laterais do ticket reforçados:** os recortes (picote/ingresso) nas laterais do card
  ficaram maiores e com sombra interna sutil p/ ler como "furo" em qualquer fundo.

## 3.4.4 — 2026-10-08

- **VND · entrada do simulado: barra "PRÉ-VISUALIZAR ESTADO" não aparece mais no acesso real.** A barra
  de troca de estado (Aberto/Encerrado/…) é ferramenta de **preview/mock** e estava vazando no acesso
  do aluno — agora só aparece quando `preview` (rota de prévia). (MEQ/Revisão não tinham o problema.)

## 3.4.3 — 2026-10-08

- **Login do SIMULADO no VND com o design novo da marca:** ao abrir um link de simulado
  (`/simulado/<token>`) sem sessão, o **VND** estava caindo no formulário **genérico** (`EmbedLoginForm`)
  em vez da entrada branded (`EntradaReal` → `SimuladoVND`). Agora VND (quando `internoAtivo`) usa a
  mesma entrada nova da marca que o MEQ já usava. (Config: login do PORTAL do VND também foi ajustado
  para a variante **Centralizado** e o do MEQ confirmado em **Circuito** — via `tema.aparencia_auth`,
  sem deploy.)

## 3.4.2 — 2026-10-08

- **VND e MEQ · acesso ao simulado na home:** os cards de "Simulados recentes" das plataformas novas
  estavam como **mockup** (`href="#"`/`<span>`), então **"Fazer agora"/"Continuar"/"Refazer" e o
  download do caderno não funcionavam**. Agora usam os links reais (`fazerUrl` → `/simulado/<token>`,
  `cadernoUrl` → caderno em nova aba) e as **pastas** levam para `/aluno?pasta=<id>`. (O Revisão já
  estava ligado.)
- **Notificação (top bar VND/MEQ):** o balão de "X novas notificações" abria **para cima** (design da
  sidebar) e saía da tela no topo. Agora, quando o sino está no topo, o balão abre **para baixo** com a
  **seta apontando para cima** (mesma regra do dropdown).

## 3.4.1 — 2026-10-08 (hotfix de estabilidade)

Corrige a instabilidade que apareceu após a v3.4.0 (áreas abrindo mas sem carregar, logout travando,
admin lento) — causada pelo **perfil novo pesando demais no backend**.

- **Perfil · Estatísticas (dado real) agora leve:** o cálculo (`montarPerfilAnalytics`) passou a ser
  **cacheado** (TTL do relatório) e **limitado aos últimos ~6 meses** — antes carregava TODA a história
  de respostas do aluno + metadados de TODAS as questões a cada abertura (dezenas de round-trips ao
  Supabase, sem cache), o que no VPS único + pico da Curseduca martelava o banco e deixava **todas** as
  áreas lentas/travadas. A média da turma também passou a ser **cacheada por plataforma** (era até 3000
  linhas por view). Segue a regra "área nova já nasce otimizada" (sem fetchAll em caminho quente).
- **Logout resiliente (admin):** `logoutAction` nunca mais trava se o backend estiver lento — limpa a
  sessão localmente (`signOut({ scope: 'local' })`) e faz a auditoria em best-effort, sem esperar a rede.

## 3.4.0 — 2026-10-08

Foco: **adaptação dinâmica de tela** (Curseduca/tablet/iframe), **perfil do aluno reconstruído com dado
real** e **correção de configuração da Curseduca por plataforma**.

- **Perfil do aluno (visual novo) reconstruído ao design completo, 100% com dado real** — voltaram os
  blocos que tinham sido cortados: **Meta diária** e **Preferências** (funcionais, salvam em
  `simulado_estudantes.perfil_prefs`), **Resumo da semana**, **Atividade de estudo** (heatmap),
  **5 KPIs** com sparkline, **Você × média**, **Acerto por banca**, **Fortes e fracos**, **Quando você
  rende mais** (dia×hora) e **Tempo por questão**. Motor `lib/aluno/perfil-analytics.ts` (sessões +
  respostas reais, BRT). Blocos compartilhados pelas 3 marcas (`perfil/blocos.tsx`).
- **Histórico de simulados** — tabela com **ordenação por coluna** (padrão por Data) e **rolagem** com
  altura de 10 linhas, padronizada nas 3 marcas.
- **Gráfico de Evolução da nota** — rolamento horizontal + dimensionamento dinâmico, barras alinhadas
  aos rótulos, datas "DD/MM" e espaço no topo para a nota das barras mais altas não ser cortada.
- **Adaptação dinâmica ao container (não ao viewport)** via container queries / grids `auto-fill` —
  corrige cards cortados em tablet e dentro da Curseduca em: **Ligas**, **Perfil**, **Realizados**,
  **Recomendados**, **Pastas/Início** e nos cards de simulado.
- **Cards de Jurisprudência** no mesmo formato pôster da área de **Lei Seca**.
- **Desafios · Acessos exclusivos / modo teste (testadores)** — contas de admin com e-mail de estudante
  veem tudo liberado, refazem à vontade e **não contam** (sem XP/streak/ranking), por desafio.
- **Trilha (mapa) · zoom** — nós e balões ("Você está aqui"/"Libera amanhã"/ação) com escala e
  distância compensadas para ficarem proporcionais e legíveis em qualquer zoom.
- **Leitura** — tabelas colapsáveis (cabeçalho com toggle, sem card em volta) e correção das caixas de
  entendimento/divergência; texto não vaza mais da folha.
- **Login admin multi-plataforma** — seletor de plataforma aparece para quem tem o mesmo e-mail em
  vários tenants; filtro `somente_admin` libera quem está no RBAC daquela plataforma (corrige o loop
  de carregamento no MEQ).
- **Integrações · Curseduca/Guru por plataforma** — a URL do webhook exibida passa a usar o **domínio
  próprio do tenant** (quando configurado), em vez do `NEXT_PUBLIC_APP_URL` global, para o webhook
  resolver o tenant correto nas outras plataformas.

**Migrações** (aplicar + `NOTIFY pgrst, 'reload schema'`): `20261007000000_pasta_testadores_exclusivos`,
`20261008000000_perfil_prefs`.

## 3.3.1 — 2026-10-07

- **Aluno · Desafio de Lei Seca — streak (sequência) consistente entre as áreas:** o número de "dias"
  da **top bar** e o card **"Sua energia"** agora usam a MESMA fonte do ranking — o **dia imutável do
  ledger** (meta.dia dos eventos de quiz) — em vez do campo `streak_atual` armazenado (que subcontava na
  virada de meia-noite e ao refazer aula). Correções: `resumoGamificacao` recomputa o streak do ledger
  (une módulos + ajustes do suporte); o shell novo lia `0 dias` fixo (agora recebe o valor real e esconde
  os chips quando a gamificação está off); a faixa semanal do "Sua energia" marcava dias por `criado_em`
  de qualquer evento de leitura (agora por `meta.dia` dos eventos de quiz).
- **Aluno · tabela de desempenho — coluna "Feito em":** nova coluna à direita do nome da aula com o dia
  em que a aula foi concluída (mesmo dia imutável do streak), formato `DD/MM/AA`. Revisão e MEQ.

## 3.3.0 — 2026-10-07

- **Aluno · Desafio de Lei Seca (trilha) — balão de ação por aula:** clicar num dia na trilha abre um
  **balão sobre o nó** com **Iniciar aula / Continuar / Revisar** (ou "Libera em breve") linkando direto
  pra aula — some a confusão de ter que olhar só o card lateral (desktop e mobile). O balão **aparece com
  "pop"**, **pula** (bob) enquanto aberto, o **botão reage a hover/clique**, e **fecha com encolher+fade**.
  "Você está aqui" some enquanto o balão está aberto; "Libera amanhã" só some quando o balão está nesse
  mesmo nó. Vale pra Revisão e MEQ.
- **Login novo (3 marcas) · versão visível:** o número da versão (`v{APP_VERSION}`) voltou a aparecer no
  **canto superior direito** do login novo (PlatformLogin) — Revisão, VND e MEQ (não só no login antigo).

## 3.2.1 — 2026-10-07

- **Aluno · Lei Seca (leitor) — texto vazando pra fora da folha:** o HTML das aulas (importado do
  Word) usa **tabelas** sem largura de coluna (ex.: o box "NÃO ESQUEÇA") que, com `table-layout:auto`,
  cresciam até caber o texto e **estouravam a folha** (conteúdo cortado à direita). Correção de CSS
  (`.leitura-prosa`, só no leitor): trava as tabelas na largura da folha + força quebra nas células,
  e um catch-all `max-width:100%` + `overflow-wrap:anywhere` garante que **nenhum bloco** (tabela, pré,
  imagem, texto, nowrap/larguras fixas do Word) exceda a folha. Vale pra Revisão e MEQ, claro/escuro.

## 3.2.0 — 2026-10-07

- **Admin · Questões · importar entre plataformas (super-admin):** nova aba **"Plataformas"** no
  botão _Nova Questão_ — escolhe a plataforma de origem, **busca/filtra** (disciplina/status/dificuldade,
  paginação server-side) e **importa questões selecionadas** para o banco da plataforma atual. Tabela
  com **scroll horizontal (arrastar)** + linhas **expansíveis** (enunciado completo + alternativas com
  gabarito). As cópias recebem **código novo** e a **banca da plataforma de destino** (no lugar da
  origem), preservando o vínculo com a origem (`external_id`); o editor mostra **"Importada de …"** (só
  no admin). Reusa o motor idempotente `copiarQuestao` — reimportar não duplica.
- **Aluno · carregamento/login (white-label):** portados fielmente do handoff os loadings **VND**
  (clássico+SIMULA, circuito/circuito-vertical ±SIMULA) e **Revisão** (formas, quadrados, circuito +
  efeitos/quadrados). Correção: o **carregamento real pós-login** passou a usar o **estilo escolhido no
  console** (antes caía sempre no clássico da marca) e sumiu o **flash de tela roxa** no login de marcas
  não-roxas.
- **Aluno · VND:** gamificação **desligável por tenant** (XP/nível/sequência/missões/liga somem quando
  off); **banners de imagem** renderizam na home (sem botão quando é só imagem) respeitando o "ocultar
  título"; texto rotativo **"Rumo a …"** com animação corrigida; capivara não vaza entre tenants.
- **Admin · estudantes/engajamento:** refinamentos no perfil do estudante (abas, assinaturas, desafios,
  adesivos) e no relatório de engajamento geral.

## 3.1.0 — 2026-10-06

- **Admin · sidebar unificada:** os dois desafios viraram um grupo único **"Desafios"** (Lei Seca +
  Jurisprudência como sub-itens), em vez de dois grupos separados.
- **Admin · nova área "Assinaturas & Engajamento"** (grupo Análise, `/admin/relatorios/engajamento`):
  cruza **assinaturas ativas (Guru) × engajamento em TODAS as áreas** — desafios (Lei Seca +
  Jurisprudência: fez aula/quiz) e simulados (finalizou sessão). Filtros de **área** (Todos/Simulados/
  Desafios) + **sub-filtro** (simulado ou desafio específico), KPIs (**pagantes ativos**, **risco de
  churn** = paga sem atividade, **oportunidade de conversão** = ativo sem pagar, **cobertura** da base)
  e **tabela por aluno** com filtros/ordenação e drill-down. Saiu de dentro da análise do Lei Seca.
  SQL-first (requer `DATABASE_URL`; tolerante se ausente).

## 3.0.3 — 2026-10-06

- **Perf: abrir o Desafio de Lei Seca ficou lento** porque o ranking (1.000+ alunos) era carregado no
  servidor em TODA abertura (RPC pesado + payload grande enviado ao cliente, mesmo pra quem só vê a
  Trilha) — e o cache era invalidado a cada aula concluída. Agora, no visual novo, o ranking é carregado
  **sob demanda** (só quando a aba **Ranking** abre, via `/api/aluno/leitura/ranking`), com estado de
  carregando. A linha "Você" (posição) continua instantânea. O legado segue como estava.

## 3.0.2 — 2026-10-06

- **Fix sequência (streak) do Lei Seca na virada de meia-noite:** um quiz concluído logo após 00:00
  (ex.: leitura 23:57, quiz 00:00) era contado no **dia seguinte**, criando um "buraco" e **subcontando
  a sequência** (ex.: 10 em vez de 15; Desempenho e Ranking divergiam). Agora a aula conta no **dia da
  LEITURA** (dia em que foi feita): fix forward em `onQuizConcluido` + **backfill** que corrigiu
  **129 eventos de 95 alunos** prejudicados (backup em `scripts/_backup-leiseca-streak-dia.json`).
  Scanner `scripts/_scan-leiseca-streak.mjs` para auditar o impacto.
- **Fix barra de busca:** o texto agora trunca com reticências (…) em vez de vazar quando comprimida.

## 3.0.1 — 2026-10-06

- **Fix logout do aluno (shell novo):** o botão "Sair" (sidebar) e "Sair da conta" (menu) apontavam
  para `/sair` (rota inexistente → 404). Agora fazem o logout real (`POST /api/aluno/logout`, que trata
  o cookie dinâmico por host) e voltam para `/aluno/entrar`, com loader branded na saída.

## 3.0.0 — 2026-10-06

**Redesign do portal do aluno (opt-in por tenant via `tema.aparencia_auth.internoAtivo`).** Tudo novo é
gated: tenants sem o flag e demais marcas continuam no fluxo atual (produção intacta). Pontuações,
contabilidade, correção, PDFs, acesso por e-mail e integrações (Curseduca/Guru/webhooks) **não foram
alterados** — validado em check-up (3 revisões adversariais + tsc/build/egress verdes; `lib/simulado/**`
sem diff).

- **Shell interno novo (Revisão):** sidebar/topbar redesenhados, busca de simulados (Ctrl+K, overlay com
  resultados "disponíveis × já feitos"), tema claro/escuro.
- **Início:** home redesenhada ligada a dados reais (recentes/pastas com imagem real; KPIs reais de
  questões resolvidas e taxa de acerto); cards em ticket; banners sem botão/texto quando não têm.
- **Dentro da pasta:** 3 colunas (Em andamento / Disponíveis / Já feitos), tickets do mesmo tamanho,
  ordenação por data (feitos) e por nome.
- **Fluxo do simulado (Revisão):** login novo (valida o e-mail ANTES do modal; e-mail errado mostra
  "não encontrado"), carregamento branded, runner novo (`ProvaRevisaoLive`, drop-in sobre o mesmo motor)
  e resultado novo com Refazer + Ir para o início; cadernos de cada realização na própria linha
  (sem gabarito × com gabarito).
- **Lei Seca / Jurisprudência / Ligas / Realizados:** telas internas no design novo; faixa cinza do
  rodapé no dark corrigida; avatar padrão (capivara) + cor de fundo padronizada no ranking e no pódio.

## 2.0.1 — 2026-10-05

- **Fix PDF do Diagnóstico (paginação):** o conteúdo transbordava a folha e cruzava a página sem
  respeitar cabeçalho/rodapé (com uma linha de corte alta). Causa: num container frio/sob carga a
  fonte carrega devagar e o Puppeteer capturava o PDF **antes** da re-paginação pós-fonte assentar.
  A rota de PDF (`/api/aluno/caderno-teste-pdf`) agora **espera a paginação assentar** (nenhuma folha
  pode exceder A4) antes de capturar — sem efeito quando já está correta.

## 2.0.0 — 2026-10-05

Baseline do versionamento (estado atual + recentes já no ar):

- **Download de cadernos (PDF) resiliente:** re-tenta automaticamente no `503` (Chromium ocupado) e
  mostra a mensagem real do servidor em vez da genérica; valida que o arquivo veio como PDF não-vazio.
- **Deploy seguro (stack do web):** `update_config: start-first` + `failure_action: rollback` +
  `healthcheck` em `/api/health` — sobe a imagem nova ao lado da antiga e reverte sozinho se falhar,
  sem downtime para o aluno (evita o "404 do Traefik" quando uma imagem não sobe).
- **Versão do sistema** exibida no login (canto inferior esquerdo) + este changelog.
- **Desafio de Jurisprudência:** visão do aluno e cards do admin alinhados ao Desafio de Lei Seca;
  editor de enquadramento (ticket/capa); filtro de desafios excluídos.
