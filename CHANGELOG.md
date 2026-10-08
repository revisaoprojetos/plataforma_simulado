# Changelog

Versionamento **semântico**: `MAJOR.MINOR.PATCH`.

- **PATCH** (`x.y.Z`) — ajuste pequeno / correção de bug.
- **MINOR** (`x.Y.0`) — área ou funcionalidade nova.
- **MAJOR** (`X.0.0`) — mudança grande (ex.: redesign geral do sistema).

**Regra (a partir de 2026-10-05):** todo push bumpa a versão em [`apps/web/lib/version.ts`](apps/web/lib/version.ts)
**e** adiciona uma seção aqui com o resumo das mudanças. Ao gerar a imagem, informamos qual versão é.
A versão aparece no rodapé esquerdo da tela de login (`v{APP_VERSION}`).

---

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
