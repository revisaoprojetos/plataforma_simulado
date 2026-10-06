# Changelog

Versionamento **semântico**: `MAJOR.MINOR.PATCH`.

- **PATCH** (`x.y.Z`) — ajuste pequeno / correção de bug.
- **MINOR** (`x.Y.0`) — área ou funcionalidade nova.
- **MAJOR** (`X.0.0`) — mudança grande (ex.: redesign geral do sistema).

**Regra (a partir de 2026-10-05):** todo push bumpa a versão em [`apps/web/lib/version.ts`](apps/web/lib/version.ts)
**e** adiciona uma seção aqui com o resumo das mudanças. Ao gerar a imagem, informamos qual versão é.
A versão aparece no rodapé esquerdo da tela de login (`v{APP_VERSION}`).

---

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
