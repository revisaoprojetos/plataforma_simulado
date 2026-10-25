# Changelog

Versionamento **semântico**: `MAJOR.MINOR.PATCH`.

- **PATCH** (`x.y.Z`) — ajuste pequeno / correção de bug.
- **MINOR** (`x.Y.0`) — área ou funcionalidade nova.
- **MAJOR** (`X.0.0`) — mudança grande (ex.: redesign geral do sistema).

**Regra (a partir de 2026-10-05):** todo push bumpa a versão em [`apps/web/lib/version.ts`](apps/web/lib/version.ts)
**e** adiciona uma seção aqui com o resumo das mudanças. Ao gerar a imagem, informamos qual versão é.
A versão aparece no rodapé esquerdo da tela de login (`v{APP_VERSION}`).

---

## 3.29.3 — 2026-10-25

**fix(plugin): card "Desempenho por pilar" passa a inserir a FÓRMULA UNIFICADA**

O bloco/card de pilar (botão "＋ Card" e "Desempenho por pilar") ainda vinha com as 3 faixas separadas
(`{ls_texto_f1/f2/f3}` sob rótulos 0-49/50-80/81-100). Agora insere UMA fórmula por pilar que escolhe o texto
pela pontuação: `{ls_pct>=81; ls_texto_alto; ls_pct>=50; ls_texto_medio; ls_texto_baixo}` (variáveis da aba
"Textos de desempenho", trocáveis por texto "entre aspas" inline). Vale pra ls/jur/dout e qualquer sub-pilar.

---

## 3.29.2 — 2026-10-25

**feat(diagnóstico): fórmula de condição estilo Excel, só nas chaves — `{cond; valor; cond; valor; padrão}`**

Fórmula definitiva (modelo do Excel `SE()` aninhado, mas SÓ nas chaves, sem "SE"), validada em .docx: lê a
variável de %/nota e mapeia o texto de cada pontuação. Ex.:
`{ls_pct>=80; "Excelente…"; ls_pct>=50; "Intermediário…"; "Abaixo de 50%…"}`.
- Lida de cima pra baixo: a 1ª condição verdadeira define o texto; o **último item solto (ímpar) é o padrão**.
- Condições: `>=` `<=` `>` `<` `=` `<>` ou faixa `LO-HI` sobre qualquer `{<slug>_pct}` (pilar/sub-pilar/disciplina).
- O texto de cada pontuação pode ser **inline, entre aspas** (dentro da própria fórmula — testado com texto longo,
  acentos, pontuação e `;` dentro das aspas) OU uma **variável** (`ls_texto_alto/_medio/_baixo`, escrita na aba
  "Textos de desempenho"). Split respeita aspas e parênteses; `<`/`>` tolerados mesmo escapados (`&lt;`/`&gt;`).
- Compat: `SE(...)`/`IF(...)` aninhado e a forma `{<pct>=LO-HI texto}` também funcionam. Variáveis de texto por
  faixa com nomes legíveis `{<slug>_texto_baixo/_medio/_alto}`; `ls/jur/dout` puxam o override do pilar canônico.
- LIMITE DO WORD (texto inline): a fórmula inteira num ÚNICO parágrafo (sem Enter dentro das `{ }`) e sem `{`/`}`.
- Validado que tags normais, laços e seções continuam intactos.

---

## 3.29.1 — 2026-10-25

**fix(diagnóstico): card volta a ter as 3 faixas separadas, mas o texto de cada uma é variável**

A v3.29.0 colapsou o card numa única área (`{slug_texto}`). Agora o card do botão "＋ Card" mantém as
**três faixas separadas** (0-49 / 50-80 / 81-100), porém o texto de cada uma é a **variável**
`{<slug>_texto_f1/f2/f3}` — editada na aba "Textos de desempenho" (não digitada no .docx), então editar nunca
quebra; o condicional `{#<slug>_f1}…` faz aparecer só a faixa do % real. `{<slug>_texto}` (1 linha) continua
disponível. nullGetter cobre `_texto_f1/f2/f3` (nunca vazio).

**feat(diagnóstico): CONDIÇÃO INLINE na variável — `{<slug>_pct=LO-HI texto}`**

Modelo pedido: escrever a condição dentro da própria variável, medindo o % entre valores. Ex.:
`{ls_pct=80-100 Excelente desempenho em lei seca.}` mostra o texto só quando `{ls_pct}` ∈ [80,100];
`{jur_pct=0-49 Abaixo de 50%…}` idem. Aspas opcionais; funciona com qualquer `{<algo>_pct}`. Implementado via
parser próprio do docxtemplater (sem dependência nova) que delega as tags normais ao parser padrão — validado
que laços/seções/variáveis continuam intactos. LIMITE DO WORD: o texto da condição tem de ficar num ÚNICO
parágrafo (sem Enter dentro da chave) e sem `{` `}`.

---

## 3.29.0 — 2026-10-25

**feat(diagnóstico): narrativa como VARIÁVEL + blocos nunca vazios + relatório real sem divergir**

Resolve de vez os cards do diagnóstico saindo em branco e a fragilidade de editar os textos:

- **Narrativa = variável `{<slug>_texto}`** (ls_texto, jur_texto, lingua_portuguesa_texto, stf_texto…): o
  card não usa mais os 3 blocos condicionais `{#ls_f1}…{/ls_f1}` (que quebravam ao editar — marcador órfão).
  O sistema resolve o parágrafo da faixa REAL do aluno; a redação fica fora do .docx, então editar nunca
  quebra o documento. O botão "＋ Card" insere `{chave_texto}` + chip "Texto".
- **Aba "Textos de desempenho" no Laboratório** (genérico + override por pilar): texto padrão por faixa com
  `{nome}`/`{pct}` que se adaptam + overrides por pilar/disciplina. Guardado no tema do tenant (sem migração).
- **Blocos NUNCA vazios**: `nullGetter` inteligente — qualquer variável do contrato
  (`_pct/_acertos/_total/_faixa/_nivel/_texto/_f1-3`) que falte resolve para um padrão coerente (0% / 0 /
  texto genérico / faixa 0-49) em vez de branco.
- **Relatório REAL do aluno** (`/api/aluno/diagnostico-docx-pdf`) passa a usar a MESMA fonte de variáveis da
  prévia (`emitirVarsAgrupamento`): emite o contrato por slug p/ todo pilar/sub-pilar/disciplina presente, a
  partir dos valores reais. Fim do "prévia certa × PDF do aluno em branco". Cache do PDF `_v4 → _v5`.
- **Plugin**: painel de variáveis reorganizado (seções + card por item). **Seletor de modelos**: título não
  corta mais (block/break-words).

---

## 3.28.2 — 2026-10-24

**fix(maratona/banco): duplicar banco não herda mais o `caderno_entrega` (downloads do dia errado)**

- Montar uma maratona **duplicando** um simulado fazia `copiarBanco` copiar a coluna `caderno_entrega`
  inteira → os PDFs de **Enunciado e Gabarito do dia 1** eram herdados pelos outros dias, e todos os
  downloads puxavam o caderno do dia 1 (a prova online, que usa o banco próprio, não era afetada).
- Agora [`copiarBanco`](apps/web/app/admin/banco-questoes/actions.ts) **não herda `caderno_entrega`** — cada
  cópia começa sem cadernos e o admin define os seus (enunciado/gabarito/diagnóstico/folha por dia). Vale para
  duplicar banco, duplicar pasta e copiar simulado para pasta.

## 3.28.1 — 2026-10-24

**fix(plugin): reorganização do painel de variáveis do simulado (OnlyOffice)**

Na v3.28.0 os chips novos (Nível/Faixa/Card) espremeram tudo numa lista única — em "Pilares"
todas as variáveis de todos os pilares caíam no mesmo bloco, sem separação. Agora:

- **Seções** "Disciplinas" e "Pilares" com cabeçalho/divisória.
- **Um bloco por item** (card com borda): título (nome · nº de questões) + botão **"＋ Card deste item"**
  em destaque (largura total) + chips de valor com **rótulos curtos** (`%`, `Acerto`, `Total`, `Assuntos`,
  `Nível`, `Faixa`) — o nome do pilar/disciplina não se repete mais em cada chip.
- **"＋ Inserir TODOS os pilares (cards)"** em destaque no topo da seção Pilares.

**fix(caderno): título cortado no seletor "Modelos de caderno — Diagnóstico"**

- No popup de modelos, o título (um `<span>` com `line-clamp-2`) não recebia largura dentro do card
  `inline-block`, então o clamp não aplicava e o `overflow-hidden` cortava o texto; títulos com underscore
  (`SP-Diagnostico_de_...`) ainda estouravam sem ponto de quebra. Fix: `block w-full` + `break-words` no
  título → 2 linhas com reticências, sem corte.

---

## 3.28.0 — 2026-10-24

**feat(prévia): contrato de variáveis 100% adaptativo + card de pilar já cabeado (1 clique)**

Para a prévia/diagnóstico nunca mais ter "variável que não conecta" ou "faixa apontando pro pilar errado",
e priorizar a facilidade de edição:

- **Dados (fonte única e universal) — `computarPreviaDados`:** toda agrupação (geral, cada disciplina, cada
  pilar/sub-pilar) agora emite o MESMO conjunto — `<slug>_pct` / `<slug>_acertos` / `<slug>_total` + as
  faixas `<slug>_f1/f2/f3` **sempre casadas com o %** — nas duas convenções de nome (`<slug>_*` e os aliases
  `pct_pilar_*`/`pct_*`). Resultado: qualquer `{X_pct}` tem automaticamente `{#X_f1/f2/f3}` certos, e um tipo
  de agrupação novo entra "de graça" (sem tocar em template nem em deploy). Flags de faixa também dentro do
  laço `{#disciplinas}`.
- **Fim da divergência entre os dois labs:** o lab do Teste (`/admin/teste/onlyoffice`) e o da Biblioteca
  (`/admin/biblioteca/editar`) passam a usar a MESMA função de cálculo. Era essa duplicação que fazia o fix
  pegar só num lab (saga v3.27.1 → v3.27.2).
- **Plugin do OnlyOffice — card já cabeado:** na aba de variáveis do simulado, cada pilar/disciplina ganha um
  botão **"＋ Card"** que insere o card inteiro (%, nº de questões e as 3 faixas) **já ligado ao slug certo** —
  impossível a faixa cair no pilar errado. Botão **"Inserir TODOS os pilares (cards)"** monta a seção
  "Desempenho por pilar" com um card por pilar presente no simulado (ex.: STF/STJ/Sistemas Internacionais),
  cada um correto. Um clique, sem casar marcador na mão.
- **Variáveis-ÚNICAS de faixa (frase sem condicional):** além dos 3 blocos condicionais, cada agrupação expõe
  `{<slug>_nivel}` (crítico / intermediário / excelente) e `{<slug>_faixa}` (0-49 / 50-80 / 81-100), medidos
  pela nota real daquele pilar. Assim dá pra escrever uma linha só — ex.: `Desempenho {stf_nivel} ({stf_pct}).`
  → "Desempenho excelente (86%)." — sem precisar de marcador de laço. Chips "Nível"/"Faixa" no plugin.

---

## 3.27.2 — 2026-10-24

**fix(prévia): sub-pilares (STF/STJ/SI) continuavam em branco no Lab da BIBLIOTECA**

- A v3.27.1 corrigiu só o cálculo inline do Lab do **Teste** (`/admin/teste/onlyoffice/[id]`). O Lab da
  **Biblioteca** (`/admin/biblioteca/editar/[versaoId]`) — que é o usado no diagnóstico — calcula por
  `computarPreviaDados` (`lib/conteudo/previa-compute.ts`), que **ainda** emitia variáveis de pilar só
  para a lista fixa `Lei seca / Jurisprudência / Doutrina`. Resultado: `pct_pilar_stf`, `stf_acertos`,
  `stf_total` (e STJ/SI) nunca eram gerados → cards de sub-pilar em branco.
- Agora `computarPreviaDados` gera `pct_pilar_<slug>` / `acerto_pilar_<slug>` / `total_pilar_<slug>` +
  os flags de faixa `<slug>_f1/f2/f3` para **todos** os pilares presentes (inclui os sub-pilares da
  jurisprudência). Verificado no simulado "DPE/SP-Minissimulado de Jurisprudência" (VND): STF 7 · STJ 20
  · Sistemas Internacionais 3.

---

## 3.27.1 — 2026-10-24

**fix(prévia): valores dos SUB-PILARES (STF/STJ/SI) ficavam em branco no diagnóstico**

- A listagem de variáveis (`simulado-vars`) já abria os sub-pilares, mas o **cálculo da prévia**
  (`aplicarPreviaSimulado`) só gerava as variáveis de pilar para a lista fixa `Lei seca / Jurisprudência /
  Doutrina` — então `pct_pilar_stf`, `acerto_pilar_stj`, etc. **nunca eram preenchidos** e os cards STF/STJ/SI
  saíam em branco (caindo na amostra). Agora as variáveis de pilar (`pct_pilar_<slug>`, `acerto_pilar_<slug>`,
  `total_pilar_<slug>`) + os flags de faixa (`<slug>_f1/f2/f3`) são gerados para **TODOS os pilares
  presentes**, incluindo os sub-pilares da jurisprudência.

## 3.27.0 — 2026-10-24

**feat/fix: sub-pilar da jurisprudência (STF/STJ) no diagnóstico + seletores do Lab de prévia + dev webpack**

- **Sub-pilar da jurisprudência (STF · STJ · Sistemas Internacionais):** os minissimulados de jurisprudência
  não trazem o tribunal num campo estruturado — ele só aparece no texto (comentário/enunciado). Novo
  `lib/simulado/pilar-jurisprudencia.ts` detecta o tribunal por texto e **abre a Jurisprudência em
  sub-pilares** (aditivo: a questão continua no pilar "Jurisprudência"). A API `simulado-vars` e os cálculos
  passam a expor `pct_pilar_stf`, `acerto_pilar_stj`, etc. Ex.: DPE/SP-Minissimulado → **STF 7 · STJ 20 ·
  Sistemas Internacionais 3** (antes colapsava tudo em "Jurisprudência", por isso o diagnóstico mostrava os
  pilares errados).
- **Seletor de Diagnóstico (editor beta):** só lista os **Modelos de Caderno** (`categoria=modelo_caderno`,
  não mais a Biblioteca/Conteúdos), com **capa/thumb** e **navegação em pastas/subpastas** (cards no visual da
  Biblioteca, até 5 por linha).
- **Seletor "Selecionar simulado" (Laboratório de prévia):** abas **Simulados × Desafios** — os desafios
  (ex.: Maratona) aparecem como pastas com os **simulados internos** (capa + mesmo visual).
- **Dev (`scripts/dev.ps1`):** força `next dev --webpack` — no Next 16 o Turbopack virou padrão e era instável
  aqui (OOM + `ChunkLoadError` do HMR que travava o editor no localhost).
- **Ajustes acumulados** em simulados (form/wizard/tabela de questões/regras/board), leitor de jurisprudência,
  caderno-designer (merge), ingestão de conteúdo e callback do OnlyOffice.

## 3.26.1 — 2026-10-24

**fix(integração Curseduca): a integração "sumia depois de um tempo" em todos os tenants (chave de criptografia)**

- **Causa-raiz (confirmada com dado real):** as credenciais ficam criptografadas (AES-256-GCM) com a
  `APP_ENCRYPTION_KEY`; esse valor **mudou ao longo do tempo** em produção, então credenciais salvas com a
  chave anterior ficavam **ilegíveis** e o código as tratava como **"não configurado" silenciosamente** → o
  admin tinha que readicionar tudo, e a regra de sync parava.
- **Rotação de chave** (`lib/crypto.ts`): novo `APP_ENCRYPTION_KEY_OLD` (lista por vírgula); a descriptografia
  tenta a chave atual e depois as antigas → trocar a chave **não órfã mais** as credenciais. A criptografia
  usa sempre a atual.
- **Para de mascarar** (`lib/integracoes/config.ts`): falha de descriptografia agora é **logada** (não vira
  "não configurado" silencioso).
- **Aviso na UI** (`curseduca-config.tsx`): credencial ilegível mostra banner *"a chave mudou — regrave"* e
  abre o painel, em vez de parecer apagada.
- **Chave propagada** a `worker` e `api` no compose (antes só o `web`).
- **AÇÃO DE INFRA necessária:** fixar `APP_ENCRYPTION_KEY` no env do stack (valor permanente) e nunca trocar;
  readicionar as credenciais do tenant órfão 1x.

## 3.26.0 — 2026-10-23

**perf(biblioteca): otimização backend-first (admin + aluno) — corta egress e carregamento**

- **`html_rico` eliminado (−3,1 GB no banco + fim do write-amplification):** a coluna `html_rico` das versões
  guardava o HTML com **imagens base64 inline** (~10 MB por documento, ~3,1 GB no total), **reescrito a cada
  edição** do OnlyOffice. O leitor do aluno usa 100% o **PDF fiel** (`carregarLeituraPdf`); o caminho HTML
  (`carregarLeitura`) está morto e, se reativado, `regenerarHtmlRico` recria sob demanda. Removida a escrita em
  `reconciliacao.ts` e **zerado** o `html_rico` existente (regenerável). Sem perda para o aluno.
- **Navegação da Biblioteca do aluno cacheada:** `arvoreBibliotecaAluno` agora passa por `remember(90s)` com
  chave **por tenant+aluno+pasta** — corta o recomputo de acesso sobre todos os documentos a cada recarga
  (ex.: iframe Curseduca com muitos reloads). Acesso por-aluno intacto (a chave inclui o aluno).
- **Admin `listarArvore` enxuto:** deixou de gerar a URL assinada do original (que o cliente descartava) e a
  **pré-geração de PDF** de todo docx; a URL do PDF virou **sob demanda** (ao abrir o detalhe). Card carrega só
  a capa (thumb) — de **3 idas ao storage por documento para 1**.
- **Prévia do admin** (`conteudoPreviewAdmin`) deixou de puxar **todos** os trechos (até ~7.766 por versão) —
  limitada a 400.
- **Código morto removido:** `listarBibliotecaAluno`, `DocxThumb` e estados `arquivos`/`pdfs` do cliente.
- **fix(ranking leitura):** o detalhe do aluno (`detalheRankingAluno`) agora soma o **bônus de conclusão** além
  do de sequência — antes mostrava menos pontos que a lista do ranking.
- **fix(jurisprudência progresso):** gravação **fail-closed** — se a leitura do estado atual falhar, não grava
  (evita apagar dias que só existem no servidor); o cliente mantém o localStorage e re-tenta.

## 3.25.1 — 2026-10-22

**chore(sidebar): "Modelos de Caderno (OnlyOffice)" movido para o grupo Simulado**

- O item **Modelos de Caderno (OnlyOffice)** (`/admin/biblioteca?tab=modelos`) saiu do grupo *Biblioteca* e passou
  a ficar **logo abaixo de "Modelos de Caderno"** no grupo **Simulado** — os dois tipos de modelo de caderno
  juntos. Vale para **todos os tenants** (código global). A `href` não mudou, então permissão
  (`configuracoes:view`), o gate de manutenção por área (`biblioteca`) e os rótulos/ícones personalizados por
  tenant continuam valendo. Grupo *Biblioteca* ficou só com "Conteúdos".

## 3.25.0 — 2026-10-22

**fix(diagnóstico OnlyOffice): "desempenho por pilar" com faixa duplicada + download do aluno + ajustes de ranking/trilha**

- **Desempenho por pilar mostrava 2 faixas (ex.: Jurisprudência 0-49 E 81-100):** o template tinha um laço
  órfão `{#jur_f3}` **sem** `{/jur_f3}` (bloco "81-100" não fechado). O auto-corretor de marcadores
  (`removerMarcadoresOrfaos` em [`previa-docx.ts`](apps/web/lib/conteudo/previa-docx.ts)) **removia a abertura
  órfã** → o texto da faixa alta virava incondicional e aparecia sempre. Agora, num `{#x}` órfão, ele **insere
  o fechamento no 1º limite estrutural** (`</w:tc>`/`</w:tr>`/`</w:body>`) → o conteúdo volta a ser condicional.
  Vale para **qualquer** template e **sobrevive a re-edições** (fix de código, não de dado). Cache do PDF do
  aluno invalidado (`_v3` → `_v4`).
- **Download do diagnóstico pelo aluno (editor OnlyOffice):** nova modalidade `office` na entrega V2
  ([`entrega-aluno.ts`](apps/web/lib/caderno-teste/entrega-aluno.ts)) + botão em "Simulados realizados"
  ([página do simulado](apps/web/app/aluno/(portal)/simulados/[id]/page.tsx)); o PDF é gerado por sessão com os
  dados reais do aluno.
- **Resultado (VND) sem faixas laterais:** removido o `max-w`/`margin:auto` → largura cheia.
- **Bônus de MARCO (leitura/desafio) agora é PERMANENTE:** ranking, "minha linha", detalhe do admin e trilha
  passam a usar o **maior** streak atingido (`streakMaior`, do ledger imutável) no lugar do `streakAtual` — os
  pontos extras conquistados (14/21/30 dias…) **não somem** quando a sequência quebra ou o desafio termina.
- **Ranking de leitura ordenado por PONTOS:** pódio e lista ordenam por pontuação primeiro, usando a sequência
  só como desempate (antes ordenava por streak primeiro → aluno com menos pontos subia no pódio).

## 3.24.3 — 2026-10-22

**fix(diagnóstico OnlyOffice): invalida o cache do PDF (marca `_v2`)**

- O PDF do diagnóstico é cacheado por sessão+versão+hash; como o template não mudou, os PDFs gerados com o
  mapeamento de dados ANTIGO (errado) continuariam a ser servidos. Adicionado sufixo `_v2` no caminho do cache
  → regenera com os dados corretos (v3.24.2).

## 3.24.2 — 2026-10-22

**fix(diagnóstico OnlyOffice): dados REAIS do aluno no PDF (aluno certo, acertos, pilares, tempo)**

- **Aluno errado:** a rota chamava `carregarDadosBancoCore` só com `{sessao}` e usava `registros[0]` → sem
  `aluno`, o merge carrega todos os alunos ordenados por nome e `registros[0]` virava o 1º alfabético ("Alice"),
  não o dono da sessão → nome errado e 0 acertos. Agora passa `aluno: estudante_id` e usa `.find(r.id===)`.
- **Pilares de exemplo:** o template usa `ls_pct/jur_pct/dout_pct` (schema do `computarPreviaDados`), mas o
  merge dá `pct_pilar_<slug>` → caíam nos valores de exemplo (45/70/100%). Agora faz o **alias** com os valores
  reais por questão do merge (+ faixas 0-49/50-80/81-100).
- **Tempo:** `tempo_usado` mapeado do `tempo_total` do merge.

## 3.24.1 — 2026-10-22

**fix(diagnóstico OnlyOffice): usar a versão EDITADA (não a importada) no PDF do aluno e na capa**

- O PDF do diagnóstico do aluno saía no formato **importado** (placeholders `[NOME COMPLETO...]`, `X/100`) em
  vez do template **editado** (com as variáveis). Causa: a rota usava o `versaoId` congelado na seleção, mas
  editar um documento publicado cria um **rascunho mais novo** (e `versao_atual_id` fica na versão antiga).
  Agora a rota resolve pelo `docId` → **última versão por `numero`** (o rascunho editado). `entrega-aluno.ts`
  passa o `docId` (não o versaoId).
- `gerarThumbDocumento`/`thumbDocumento` ganharam a opção `latest` (ignora `versao_atual_id`, usa a mais nova);
  a **capa fiel** do card do diagnóstico (`banco-caderno-montagem.tsx`) pede `latest: true` → mostra o editado.

## 3.24.0 — 2026-10-22

**feat(diagnóstico OnlyOffice): prévia fiel no card + download do diagnóstico do aluno; OnlyOffice em produção**

- **Prévia fiel do card do Diagnóstico (admin):** quando a fonte do diagnóstico é o **editor OnlyOffice**, o card
  da montagem do caderno (`banco-caderno-montagem.tsx`) agora mostra a **imagem da 1ª página renderizada** (mesma
  capa fiel da Biblioteca, via `thumbDocumento`) em vez do HTML/trechos. Loader enquanto gera; fallback pra prévia
  de trechos se o OnlyOffice estiver fora.
- **Download do Diagnóstico pro aluno (editor OnlyOffice):** antes o diagnóstico vindo do editor era **inerte**
  pro aluno. Agora o slot `{docId, versaoId}` vira um `pdfUrl` e aparece em "Materiais e downloads" (quando o
  gabarito/nota é liberado). Nova rota `/api/aluno/diagnostico-docx-pdf` valida a sessão, pega os **valores reais
  do aluno** (`carregarDadosBancoCore`), **preenche o `.docx`** (`renderPreviaDocx`) e **converte em PDF no
  OnlyOffice** (`converterDocxParaPdf`), cacheado por sessão+versão. (`entrega-aluno.ts` reconhece o variant;
  `sessoes/resultado` passa o `sessao.id` — sem mexer nos componentes de resultado.)
- **Infra — OnlyOffice em produção:** serviço `onlyoffice` adicionado ao `docker-compose.portainer.yml` (atrás do
  Traefik, host via `${ONLYOFFICE_HOST}` — sslip.io quando não há DNS próprio, cert HTTP-01). Envs do `web`:
  `NEXT_PUBLIC_ONLYOFFICE_URL` (derivada do host), `CONTEUDO_WOPI_HOST` (pública, evita SSRF), `ONLYOFFICE_INTERNAL_URL`.

## 3.23.0 — 2026-10-22

**feat(biblioteca): área do aluno + leitor fiel de PDF com grifos, controle de acesso e navegação Drive**

Biblioteca de Conteúdos liberada para o aluno, reutilizando a área de leitura do Jurisprudência.

- **Leitor do aluno = o mesmo `leitor-jus.html`** (top bar, barra de grifos, caderno, sumário, foco), com o
  **conteúdo = PDF fiel** (OnlyOffice) renderizado dentro (`components/aluno/leitor-biblioteca.tsx`).
  - Grifos **geométricos** sobre o PDF (marca-texto/sublinhado/ondulado/tachado/contorno + cores + borracha +
    desfazer + nota), salvos **no perfil do aluno** (`simulado_conteudo_grifos_pdf`, API `/api/conteudo/grifo-pdf`).
  - Seleção de texto **estável** portando o mecanismo do pdfjs (`endOfContent` + `.selecting`); camada de texto
    com as variáveis corretas do pdfjs 6.x (`--total-scale-factor`, `--scale-round-x/y`).
- **Controle de acesso** no gate do aluno (`lib/conteudo/leitor.ts`): por grupo/para todos + herança de pasta
  (`acesso_geral`/`herda_acesso`); a biblioteca do aluno mostra **só a área de conteúdo** (exclui modelos de caderno).
- **Navegação Drive do aluno** (`components/aluno/biblioteca-drive.tsx`): pastas/subpastas, capas fiéis, menu de
  3 pontos (Abrir/Baixar) reutilizando o menu animado do admin (`components/conteudo/menu-drive.tsx`); largura cheia.
- **Admin**: diálogos de acesso (grupos+alunos+herança), botão "Novo" e cards estilo Drive; **auto-publicar** o
  documento na importação (subir = já disponível); download do aluno gated (`/api/conteudo/baixar`).
- **Migrações**: `20261021000000` (acesso de documento), `20261022000000` (papéis+link), `20261022100000`
  (`html_rico`), `20261022110000` (`simulado_conteudo_grifos_pdf`). ⚠️ Aplicar em produção + `NOTIFY pgrst`.
- ℹ️ Limitação conhecida: o OnlyOffice converte cores de **tema** do docx errado (pincel amarelo de título vira
  roxo) em qualquer saída (PDF/PNG) — não é do renderizador; corrige-se no docx (cor fixa).
- Inclui ajustes em andamento de Curseduca (reconciliação) e Lei Seca (VND) feitos em paralelo.

## 3.22.2 — 2026-10-20

**fix(gamificação): rede de segurança do marcador de dia (streak da Leitura) — fim dos buracos sob carga**

- O marcador do dia (`quiz:<doc>`) dependia de TODA a cadeia de queries do `onQuizConcluido`; sob o pico do
  último dia do desafio ~15% das conclusões falhavam (erro transitório engolido) e o dia sumia do streak.
- [`/api/leitura/resposta`](apps/web/app/api/leitura/resposta/route.ts): ao completar o quiz, o `onQuizConcluido`
  virou best-effort e ganhou uma **rede de segurança** — se o marcador não existe, grava um mínimo idempotente
  (`xp=0`, ancorado ao dia da leitura) direto, com 1 insert. O streak deixa de depender da cadeia rica ter sucedido.
  Quando o `onQuizConcluido` já gravou (com XP), o insert é no-op.

## 3.22.1 — 2026-10-20

**fix(gamificação): streak da Leitura e missão de simulado — eventos ao vivo perdidos sob carga**

- **Streak da Leitura/Lei Seca perdendo o dia da conclusão:** o marcador do dia (`quiz:<doc>` no ledger, fonte das
  colunas "Feito em"/"Sequência" e do streak) só era gravado pelo `onQuizConcluido` disparado ao completar o quiz;
  sob o pico do último dia do desafio ~15% das conclusões falhavam (erro transitório engolido pelo try/catch) e o
  dia sumia do streak, apesar de "Concluída 100%". Agora [`/api/leitura/resposta`](apps/web/app/api/leitura/resposta/route.ts)
  re-avalia a conclusão **a cada resposta** (sem gate `up`, idempotente) → re-carimba se o evento ao vivo se perder.
- **Missão "Complete 1 simulado" ficando 0/1 mesmo após concluir:** o crédito dependia só do evento ao vivo no
  finalize e nada reconciliava depois. [`missoesHoje`](apps/web/lib/gamificacao/leitura.ts) agora reconcilia a missão
  `finalizar_simulado` contando as sessões realmente finalizadas do dia (não-teste), robusto a falha transitória
  (+ helper `janelaDiaUtc` em [`datas.ts`](apps/web/lib/gamificacao/datas.ts)).
- **Backfill (produção):** restaurados os marcadores de dia perdidos de ~71 alunos na Leitura (Lei Seca) — "Feito em",
  "Sequência" e XP restaurados, sem duplicar bônus; reversível. (Teto de XP NÃO era a causa — estava desligado.)

## 3.22.0 — 2026-10-20

**feat(biblioteca): Biblioteca de Conteúdos — Drive jurídico com capa fiel, visualizador e versões**

- **Nova área Biblioteca de Conteúdos** (`/admin/biblioteca`): Drive com pastas, importação de `.docx/.pdf/.html`,
  versionamento e reconciliação de uids (grifos/anotações sobrevivem às edições). Coleções **Conteúdos** e
  **Modelos de Caderno** (editados 100% no OnlyOffice).
- **Capa fiel do card (print da 1ª folha):** ao importar/publicar/editar (editor OnlyOffice), o sistema gera um PNG
  nítido (1000×1414) da 1ª página via **OnlyOffice ConvertService** e usa como capa do card — a ideia dos simulados,
  mas gerada automaticamente. Cache no storage por versão+hash (bucket `pdfs`), URL já entregue pelo `listarArvore`
  (sem flash de placeholder), com geração sob demanda no `onError` e backfill das capas existentes.
- **Visualizador em tela cheia:** a folha renderizada FIEL (OnlyOffice modo leitura) no centro + lateral direita com
  abas **Versões** (linha do tempo das edições: upload/editor/restauração + data BRT) e **Detalhes** (infos +
  "Onde é usado"/vínculos). Cards estilo Drive (folha A4 borda-a-borda) e kebab animado.
- **Acesso do aluno** (`/aluno/biblioteca`) e **editores Office** na área de **Teste** (plugin Blocos & Variáveis,
  prévia "Ver com valores" com seleção de simulado), tudo atrás da manutenção por área.

## 3.21.1 — 2026-10-19

**fix(estudantes): bloqueia e-mail duplicado ao criar/editar aluno**

- `createEstudanteAction` criava o perfil sem checar duplicidade → dava pra ter 2 alunos com o mesmo e-mail
  no tenant (double-submit). Agora **criar** e **editar** bloqueiam e-mail já usado por outro aluno ativo da
  mesma plataforma (case-insensitive, por tenant) com mensagem clara no form. O fluxo de **admin** já era
  idempotente (reusa a conta + upsert em `tenant_acessos`), não mudou.

## 3.21.0 — 2026-10-19

**feat/fix(maratona): ranking conta só a tentativa válida · "Simulado encerrado" · ranking admin com nomes reais**

- **Ranking — tentativa válida:** o check-in sai da maior permanência (≥ `segMin`), mas o tempo/nota exibidos
  vinham da última tentativa — então quem fazia em 23min e **refazia em 7min** aparecia com "7min + check".
  Agora nota e tempo do ranking saem **só das tentativas válidas** (permanência ≥ mínimo); sem válida → cai pro
  fim. Um aluno com check nunca mais aparece abaixo do mínimo. (`carregarRankingMaratona`.)
- **"Simulado encerrado":** quando a janela do simulado passa (ou status `encerrado`), a UI do check-in deixa de
  oferecer **"Refazer"** e mostra **"Simulado encerrado"** (`MaratonaSimuladoLink.encerrado` + `SeloEtapa`/`dispoSim`).
- **Ranking ADMIN (novo):** a aba Ranking da maratona estava vazia (stub). Agora tem tabela própria
  ([`maratona-ranking-admin.tsx`](apps/web/components/admin/maratona-ranking-admin.tsx)) com **nomes/e-mails reais**
  (aluno segue anônimo/iniciais), nº de peito e, **por etapa**, check-in ✓/⚠ + tempo que conta + nº de tentativas +
  flag "abaixo do mínimo"; busca + filtros (com/sem check-in, refez, abaixo do mínimo). Loader
  `carregarRankingMaratonaAdmin` + action `obterRankingMaratonaAdmin` (gated por `simulados:view`).

## 3.20.0 — 2026-10-17

**feat: área de Teste (editores Office) atrás da manutenção + downloads de caderno no card + ajustes de maratona**

- **Spike dos editores Office (`/admin/teste`):** nova área para avaliar a migração do construtor de caderno
  (blocos HTML) para **docx nativo**, com **Collabora Online (CODE)** e **OnlyOffice (Community)** rodando em
  Docker (`docker-compose.teste.yml`). Criar/importar/editar `.docx`, prova de **merge** (docxtemplater:
  `{tags}` + laços) com dados reais de 1 aluno, e geração de **modelos** prontos.
- **Plugin do OnlyOffice "Blocos & Variáveis"** (painel lateral docado, servido pelo próprio app via config
  dinâmica): blocos **fiéis ao Diagnóstico real** (paleta navy/dourado, tamanhos e posição dos valores lidos
  do `.docx` de referência), inserção 1-clique de blocos (`PasteHtml`) e variáveis (`PasteText`), e **modo
  "Prévia de valores"** reversível — liga/desliga no documento via `Undo` exato, contando os campos presentes
  pelo backend (`/api/teste/doc-tags`).
- **Teste gated pela manutenção por área:** a área **nasce bloqueada** (`padraoBloqueado`) e a visibilidade/
  acesso é filtrada pelo **allowlist** em *Sistema → Páginas em manutenção → Admin* (quem pode visualizar).
- **Downloads de caderno a partir do card do simulado:** pop-up "Baixar" na home/pasta com Caderno de Questões
  (enunciado/pré-prova), Gabarito Comentado e Diagnóstico quando liberados e importados como PDF; reusa a mesma
  fonte do resultado (`caderno_entrega` + `resolverLiberacoes`).
- **Maratona:** melhorias no interno (progressão/abas) e no carregamento; tours do aluno atualizados.

## 3.19.5 — 2026-10-17

**fix(maratona): "Ver regulamento" do card da Home abre a aba Regulamento interna (não um link externo)**

- O botão era `<a href={config.regulamentoUrl}>` (vazio/externo). Agora navega para `/aluno/maratona?aba=regulamento`;
  a página lê `?aba=` e abre o `MaratonaInterno` já na aba correta (`abaInicial`).

## 3.19.4 — 2026-10-17

**fix(maratona): acesso por GRUPO não liberava o desafio + card da Home mostra a progressão real**

- **Acesso (crítico):** o gate da maratona checava **assinatura Guru**, ignorando os grupos/alunos adicionados
  na aba **Acessos** — por isso só quem tinha Guru via o desafio. Agora `alunoTemAcessoMaratona` (card/área) e
  `temAcessoPorDesafio` (simulados) seguem o modelo da aba Acessos: **individual + grupo** (`simulado_pasta_estudantes`
  / `simulado_pasta_grupos` + `simulado_grupo_membros`); sem atribuição = liberado para todos. Igual ao juris.
- **Card da Home:** "{feitos}/N" e a barra eram fixos em 0 — agora refletem a **progressão real** (simulados
  concluídos) do aluno.

## 3.19.3 — 2026-10-17

**fix(maratona): aba Medalhas reflete o estado REAL (conquistada×bloqueada) + remove texto fixo do ranking**

- **Medalhas:** era 100% mock (todas douradas + fileira "bloqueado" fixa). Agora cada medalha de KM fica
  **dourada (CONQUISTADA)** quando o aluno concluiu o simulado daquela parada, ou **cinza + cadeado
  (BLOQUEADA)** caso contrário; contador "X de 4"; selo **Finisher** libera ao concluir os 3 simulados.
- **Ranking:** removido o placeholder "Próxima atualização [segunda-feira, 10h]".

## 3.19.2 — 2026-10-17

**fix(maratona): "Link direto" do admin (aba Acessos) levava à trilha de leitura — agora abre a maratona**

- O `ModuloAcesso` (reusado da leitura) gerava `/aluno/leitura?modulo=<id>` também para a maratona. Nova área
  `area="maratona"` → link vira **`/aluno/maratona`** (percurso/painel), rótulo "Link direto para a maratona".

## 3.19.1 — 2026-10-17

**fix(maratona): ranking expunha o NOME COMPLETO do corredor — volta a mostrar só INICIAIS (privacidade)**

- O ranking da maratona estava mostrando o nome completo de terceiros (ex.: "Joao") em vez da abreviação.
- Agora o loader (`carregarRankingMaratona`) anonimiza: nome de terceiros vira **iniciais** ("João Silva" →
  "J. S."; nome único → "J."); a própria linha do aluno continua como **"Você"** (componente). Cache por
  tenant passa a guardar só iniciais (sem PII).

## 3.19.0 — 2026-10-17

**feat: Maratona (check-in/selo/nº de corredor), runner (Certo×Errado + navegador + cronômetro) e bloco "Nº de peito" nos cadernos**

- **Maratona — regra de check-in + selo:** por etapa, um "Tempo mínimo no simulado" (h/min/seg) no admin; o
  aluno que **permanece ≥ esse tempo** ao encerrar ganha o **check-in** da etapa. Selo por área: **cinza
  (bloqueado) → dourado + tag "OBTIDO"** quando cumpre; a medalha da parada também só doura com o check.
- **Nº do corredor:** entregue na **ordem de chegada ao 1º simulado encerrado**, fixo. Atribuição **atômica**
  (`SELECT … FOR UPDATE` na pasta, sem duplicar no pico; fallback sem `DATABASE_URL`). Exibido destacado no
  Painel (à direita do tempo) e usado no PDF via `{{numero_peito}}`.
- **Ranking da maratona:** passa a mostrar **nº do corredor · check · tempo** (sem pontos); ordena por check-in
  e menor tempo. "Ir para o simulado" no Painel abre a aba Simulados (não vai direto).
- **Runner (Revisão):** navegador sem recorte na célula ativa; **Certo/Errado** no mesmo estilo das múltiplas
  (sem verde/vermelho; ativo = cor de seleção); removido "Julgue o item a seguir"; dica da tesoura só em
  múltipla escolha; **cronômetro crescente** (sem rótulo, com ocultar) à esquerda do Caderno quando **não há
  tempo limite**.
- **Cadernos/diagnóstico:** novo bloco **"Nº de peito"** (designer e diagnóstico), com valor vindo do número do
  corredor salvo; **fita no topo do cabeçalho** (cor editável) e **descrição (2ª linha) na nota**.

## 3.18.1 — 2026-10-16

**fix(juris): arcade "travado" — foco do teclado no iframe (personagem não andava e perdia)**

- O arcade roda num `<iframe>`; se o foco do teclado estava na PÁGINA PAI (ex.: trocou p/ a aba Desafio — o
  iframe fica sempre montado e não ganha foco sozinho — ou fechou a leitura), as SETAS/WASD rolavam a página
  e o `keydown` nunca chegava ao jogo → o personagem ficava parado e o aluno "perdia sem conseguir jogar".
- **Arcade (jogo.js):** canvas focável (`tabindex=-1`) + `grabFocus()` (canvas.focus + window.focus) em todo
  `pointerdown`/`touchstart` no jogo e ao iniciar a partida (`startRun`).
- **Host (desafio-juris-interno.tsx):** foca o iframe do arcade ao abrir a aba Desafio, ao fechar a leitura e
  quando a aba/janela volta a ficar visível.
- Cache-bust `?v=20261015b`.

## 3.18.0 — 2026-10-16

**feat: cadernos, leitor da juris, tema escuro da Maratona, config de legendas e correções**

- **Cadernos (editor)**: fundo da folha preenche 100% (fim das faixas brancas); novos ajustes de
  cabeçalho/rodapé (encaixe/alinhamento/altura/em-quais-folhas); card de disciplina com cor de
  fita/fundo/texto/%/X-N separadas; herança por posição das edições do MODELO → disciplinas reais do
  banco; início da unificação dos dois editores (helpers em `components/admin/caderno-shared/`).
- **Jurisprudência (admin)**: renomear o nome do dia/aula (inline) na aba Dias & Teses.
- **Leitor (Lei Seca + Juris)**: justificação do texto corrige (inline/`data-align` canônico no sanitize
  + CSS); caixas de Art./lei justificadas e deslocadas (~2/3, à direita) no leitor da juris; fix do
  parse do dia 1 (título de tema embrulhado em `marca-pincel` não virava tema → tese colava no anterior).
- **Leitor da Juris (iframe)**: remove cabeçalho do documento; espaço do topo menor; tag das leituras
  maior (só na leitura, não na lateral); "LEGENDA"/botão da lateral/recolher somem quando não há legenda;
  botão "Concluir leitura" no fim (contínuo e por-tema), com ícone e ~1/3 da coluna à direita.
- **Config de legendas por documento**: no editor, ligar/desligar cada legenda + "Grifo do Revisão"
  (com Marcar/Desmarcar todas); aplicado nos dois leitores. Todas as aulas de Jurisprudência ficaram
  com as legendas e o Grifo do Revisão desativados.
- **Maratona de Simulados**: suporte a TEMA ESCURO (tokens `--mxi-*` reativos ao `.dark`), mantendo a
  identidade navy+dourado.

## 3.17.6 — 2026-10-15

**fix(juris) CRÍTICO: POST do progresso mescla best/dom por `max` (anti-regressão) — correções param de reverter**

- O `best` do arcade é um **recorde (máximo)**; nunca deveria diminuir. Mas o `POST /progresso` sobrescrevia
  cego, então um `localStorage` velho (pontuação rebaixada pelo clamp `tese=0`, ou anterior a uma recorreção
  do servidor) **REGREDIA** o valor a cada flush do bootstrap — desfazendo correções e reintroduzindo valores
  antigos.
- Agora o POST **mescla monotonicamente**: `best[dia] = max(servidor, cliente)` e `dom[dia] = união das
  teses`. Correções do servidor **persistem**; nenhuma aba antiga consegue baixar a pontuação.
- Com isso a recorreção retroativa das teses (tese ficou 0 o desafio todo até hoje → dominar teses dava 0;
  restaurado p/ 100 e os pontos de teses re-somados aos dias já completos, respeitando o teto) fica estável.

## 3.17.5 — 2026-10-15

**fix(juris): detalhe do aluno (admin) não soma mais o dia 15/selo — consistência de pontuação entre áreas**

- O "pontosTotal" do modal **Detalhe do aluno** somava `best` de TODOS os dias, incluindo o **dia 15 (selo
  final)** — que tem 0 teses próprias e reusa um pool, então duplicava pontos. Agora pula dias com `teses<=0`,
  igual ao **ranking**, à **API /ranking** e ao **arcade** (`totalPts`/`pontosDe`). Fim do "cada área com um
  número diferente".
- NB (config, feito no banco): o campo `pontos.tese` do desafio estava em **0** (concluir não pontuava e o teto
  por dia caía p/ 2.000 → 6.000 em 3 dias); restaurado para **100** (3.000/dia → 9.000). Dia-15 fantasma
  (restaurado pela recuperação) limpo das contas afetadas, com backup.

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
