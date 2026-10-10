# Changelog

Versionamento **semântico**: `MAJOR.MINOR.PATCH`.

- **PATCH** (`x.y.Z`) — ajuste pequeno / correção de bug.
- **MINOR** (`x.Y.0`) — área ou funcionalidade nova.
- **MAJOR** (`X.0.0`) — mudança grande (ex.: redesign geral do sistema).

**Regra (a partir de 2026-10-05):** todo push bumpa a versão em [`apps/web/lib/version.ts`](apps/web/lib/version.ts)
**e** adiciona uma seção aqui com o resumo das mudanças. Ao gerar a imagem, informamos qual versão é.
A versão aparece no rodapé esquerdo da tela de login (`v{APP_VERSION}`).

---

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
