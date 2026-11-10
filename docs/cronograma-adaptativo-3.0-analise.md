# Cronograma Adaptativo 3.0 - comparacao com a plataforma e plano de adocao

Fonte: `C:\Users\joooa\Downloads\cronograma 3.0` (HTML 3.0 + spec 01). O `02_Catalogo_Completo` citado na spec NAO veio; o catalogo foi lido do proprio HTML.
Plataforma: motor28.ts v2.8.1 + flags 2.18/2.19. Tres relatorios abaixo (motor, opcoes/telas, catalogo/dados).

## Conclusoes
1. Catalogo: IDENTICO ao da plataforma (24 disc., 268 aulas, 622 LP, 81 PDFights). Nada a reimportar; o importador atual le o HTML 3.0 (so normalizar zero a esquerda no numero da aula).
2. Motor: a 3.0 NAO e ajuste de parametros. Motor dia-a-dia com faixas de horas + dominó; o da plataforma e semana-a-semana. Recomendado `motor30.ts` atras de flag `motor300` por tenant (padrao desligado), mantendo o 2.8.1 para os planos atuais.
3. Planos existentes (~706): nunca regenerar automaticamente; 3.0 so em planos novos/recalculados.
4. UI do aluno ja cobre ~70%. Faltam: tutorial, confirmacao ao desativar semana especial, minimo 10h, arrastar na Semana, backup JSON, oferta LegProc complementar, reagendar em "Nao realizada"/parciais.
5. Alertas: MAX_SEM 200 vs 600 (plano truncado sem erro); colisao do id `rf:s:i`; `pf|fl:i:revisao:s` seriam tratados como PDFull regular; `detalhesMetas` nao persiste (precisa `detalhes jsonb` + dual-write); `migrarPlano` regenera planos se mudar CATALOGO_HTML.id/VERSAO_MOTOR.

## Ordem sugerida
Pequenos (limiar Juris 14h30, 600 semanas + erro de insuficiencia, minimo 10h, periodicidade 4/6/8, limiar 50-70%) -> medios (parcelamento max 3, 1 questao/dia, LegProc complementar, ids de revisao, detalhes jsonb) -> grandes (motor30 dia-a-dia, semana especial dentro do plano, dominó unico + arrastar).

## Decisoes pendentes do usuario
- Motor30 por flag de tenant (recomendado) ou substituir o 2.8.1?
- Semana especial: aceitar legado 10/12 nos planos antigos e oferecer so 4/6/8 em novos?
- Aplicar so a planos novos (recomendado) ou botao "recalcular com 3.0"?


---
# Relatorio: rel-motor

# Motor do Cronograma Adaptativo 3.0 (HTML) x motor da plataforma (motor28.ts 2.8.1) - diferenças regra a regra

Somente leitura. Status: IGUAL / DIFERENTE / AUSENTE (na plataforma). Esforço: P (pequeno), M (médio), G (grande).
Siglas: H = `C:\Users\joooa\Downloads\cronograma 3.0\Cronograma_Adaptativo_3.0.html`; M28 = `apps/web/lib/cronograma/adaptativo/motor28.ts`;
IF = `apps/web/public/cronograma/adaptativo/index.html` (iframe do aluno); PRM = `params.ts`; ENG = `engine.ts`.

## 0. Cadeia EFETIVA do HTML 3.0 (a última definição vence)

O arquivo tem 4 `<script>` (linhas 522, 525, 845, 938); o último vai até a 3862 e as `function` se sobrescrevem em ordem.

| Camada | Linhas | Papel | Efetiva? |
|---|---|---|---|
| gerarPlanoBase v1 | H:613 | motor 2.x (script 2) | NAO (sobrescrita) |
| gerarPlano v1 | H:2416 | dominó simples | NAO (sobrescrita por H:3545) |
| gerarPlanoCatalogo | H:2038 | tira aulas "anteriores", prende `remanejadas`, chama `gerarPlanoBase` | SIM |
| calcularDomino219Base | H:2245-2415 | dominó dia a dia (fila + `liberar` + `prioridade`) | SIM (envolvido por `calcularDomino` H:3795) |
| gerarPlanoBase v2 | H:3274-3441 | **motor 3.0 real** (laço dia a dia, faixas, rodízio, juris, hist, semana especial) | **SIM** |
| gerarPlano final | H:3545-3554 | normaliza `revisao.cada` in {4,6,8}, `registrarReforcos216`, chama Catalogo, reaplica dominó se há `remanejadas` | **SIM** |
| semanaRevisao216 | H:3648-3708 | semana especial 3.0 (externa + estudado, 50/70, alternância) | SIM (H:3203 é a versão antiga) |
| rotina300 / validarHoras300 | H:3819-3844 | faixas, dias PDF/revisão, fim de semana, mínimo 10h | SIM |
| reservarJuris219 / calcularDomino | H:3768-3813 | Juris semanal (limiar 14h30) + wrapper do dominó | SIM |
| construirRodizioPDF | H:3069-3108 | rodízio por vagas de essenciais | SIM |
| criarFilaDiagnostico / metaSemanalHistorico | H:2959-2967 | hist (usados em H:3294/3372; `reservarDiagnostico` H:2968 ficou órfão) | SIM |

Constantes H: `MAX_SEM=600` (H:543), `VEL_PADRAO=17` (H:557), `ESSENCIAIS` (9) H:946, `SEM_FLASH` H:542.
Migração H:3850: marcadores `regraMotor216, regraRevisao216=3, regraPDF216, regraCatalogo218, regraJuris219, regraRotina300=3`.

## 1. Diferença ESTRUTURAL (determina o esforço de tudo)

| Aspecto | HTML 3.0 | Plataforma |
|---|---|---|
| Laço | **dia a dia** (`for k<MAX_SEM*7`, H:3356); decide por data com `livre(d)` | **semana a semana** (`for sem<=MAX_SEM`, M28:464) com listas de dias (`diasSem`, `diasConteudo`) |
| Fila de vencimentos | `devidos` (due por dia, `elegivel(x,d)` H:3301) | `devidos` por semana (`due<=fimSem`, M28:476); `encaixar` no dia do due ou no mais livre |
| Perfil de semana | `rotina300` (faixa 1/2/3, dias PDF, dias revisão, fimDeSemana) | `perfilSemana` só devolve `concentrado` se horas<=18h (M28:255) |
| Dominó | `calcularDomino219Base` re-fluxa o plano existente (preserva ordem/fila) | `calcularDomino` (M28:603) só é usado via `remanejadas`; ajustes do aluno chamam `gerarEstado(cfg, fixos, ancora)` = REGENERA tudo (IF:930, 1176, 1217) |
| Semana especial | metas entram no **plano** (`S.plano`) com `detalhes` | metas `rf/rq` ficam em `S.revs`/`RV`, FORA de `S.plano`, congeladas ao começar a semana (IF:950-977) |

Conclusão: a 3.0 não é "ajuste de parâmetro" sobre o 2.8; exige **novo `gerarPlanoBase` (dia a dia) + novo dominó + nova semana especial**. Recomendação: criar `motor30.ts` ao lado do `motor28.ts` (mesma assinatura `gerarPlano`), selecionado por `cfg.motor`/flag do tenant, mantendo 2.8 para planos existentes (regra: nunca regenerar os 706 planos).

## 2. Calendário e faixas de horas (spec seção 2)

| # | Regra (spec) | HTML 3.0 | Plataforma | Status | Esf. |
|---|---|---|---|---|---|
| 2.1 | Semana ancorada na segunda; semana 1 = a da data inicial | `semDe/semInicio` H:565-566 | `semDe/semInicio` M28:223-224 | IGUAL | - |
| 2.2 | Faixas: 10h-14h30 / 15h-24h / >24h | `rotina300`: `horas<15?1: horas<=24?2:3`, horas = soma da ROTINA vigente (`horasEm`), H:3826-3827 | não há faixas; só `concentracaoAteH=18` (M28:468, PRM:48) | **AUSENTE** | G |
| 2.3 | Mínimo 10h/semana na rotina; dia = folga ou 2h-12h em passos de 30min | `validarHoras300` H:3819 (rejeita dia 1h e <10h); seletor sem opção "1h" (H:3116 `n!==1`) | IF:1228 aceita qualquer h (inclui 1h); não valida 10h; `normalizarParams` sem esse limite | **AUSENTE** | P |
| 2.4 | Ajuste de data: folga ou 2h-24h, 30min | `salvarHorasDia` H:2440-2450 (rejeita 0<h<2) | `ajustarHorasDia` IF:1254 aceita 0-24 (sem piso 2h); `horasDia` M28:236 clampa 0-24 | DIFERENTE | P |
| 2.5 | Faixa baixa: leitura seg-qui; revisão/questões sex-sáb (alterna tipo vs último) | `rotina.pdf` (dow<4 U fimDeSemana), `rotina.revisao` (dow 4,5) H:3836-3837; `distribuirRevisao` alterna `ultimoTipoRevisao` H:3382-3392 | PDF em qualquer dia de conteúdo; só questões vão ao `concentrado` (<=18h); fl/qu por `encaixar` | **AUSENTE** | G |
| 2.6 | Faixa média: PDFull inteiro numa data de leitura; sobra: até 2 LegProc da mesma lei, depois questões | H:3394-3411 (`outroDiaCompleto`, `blocoLP`, `qu` na sobra se faixa 2) | `lerPdf` só `soInteiro` com flag `pdfInteiro218` (off) e só p/ 2o PDFull (M28:519, 571) | DIFERENTE | G |
| 2.7 | Faixa alta: ciclo em todos os dias; PDFull prioritário; revisão+questões+LegProc no mesmo dia | H:3415-3436 | todos os dias já recebem PDF/fl/qu/lp (M28:566-572) sem prioridade por faixa | DIFERENTE | M |
| 2.8 | Sem sexta/sábado: último dia ativo faz revisão/questões; sem dia de leitura usa outros; 1 dia combina | `rotina300` H:3838-3842 | AUSENTE (o análogo é `concentrado` = último dia só p/ questões, <=18h) | **AUSENTE** | M |
| 2.9 | Fase inicial ("aquecimento"): dia de revisão vira PDFull se não há fl/qu elegível; até sem 2 (qu ativo) ou sem 1 (só fl) | `aquecimento` H:3378, 3394 | AUSENTE | **AUSENTE** | P (depois de 2.5) |
| 2.10 | Concentração fim de semana: sáb+dom >=40% das horas ativas E maior >= média útil +2h; candidatos à leitura | `concentrado` / `fimDeSemana` H:3834-3835 | AUSENTE (regra de 18h, ultimo dia, só questões, é de outra natureza) | **AUSENTE** | M |
| 2.11 | Adiar leitura que seria dividida p/ concluir inteira no fim de semana (todas as faixas) | `podeConcluirNoFimDeSemana` H:3399; `outroDiaCompleto` H:3402; `inteiroDepois` H:3420; domínio H:2311-2315 | AUSENTE (partes livres, M28:529-534) | **AUSENTE** | M |
| 2.12 | Horizonte 600 semanas; sobra além => erro "insuficiência" (não entrega plano truncado) | `MAX_SEM=600` H:543; erro H:3438-3439 (`residuo`); domínio `k<MAX_SEM*7` H:2363 | `MAX_SEM=200` (M28:94); `maxSemanas` padrão 200 e **clamp 20-520** (PRM:97,144); `gerarPlanoBase` sai do `for` e **devolve plano truncado sem erro** (M28:464,578); dominó limitado a 1400 dias (M28:699) e `gerarPlanoNucleo` engole o erro do dominó (M28:795) | **DIFERENTE (grave)** | M |
| 2.13 | Calendário local, datas ISO | `dParse/dISO` H:560 | idêntico M28:218 | IGUAL | - |
| 2.14 | Fila de pendências respeita tempo diário | `livre(d)` | `livre(dt)` | IGUAL (conceito) | - |

## 3. Rodízio, leitura e dependências (spec seção 3)

| # | Regra | HTML 3.0 | Plataforma | Status | Esf. |
|---|---|---|---|---|---|
| 3.1 | Essenciais selecionadas em paralelo; ordem editorial por disciplina | `construirRodizioPDF` H:3069: vagas = essenciais selecionadas; rodadas (`indicesRodada`) | `ordemParalela` M28:367: janela `paralelo` (auto: >4 disciplinas => todas), menor fração de páginas lidas | DIFERENTE | M |
| 3.2 | Essencial termina => **complementar selecionada ocupa a vaga** | `preencher(v)`: `espera=[...COMPLEMENTARES,...AGU]`, `dependencias[i]=pai` (complementar só entra depois da última aula da essencial, H:3085-3103; verificado no dominó H:2329-2331 e em `selecionarPDF` H:3316) | ao terminar uma disciplina entra a próxima da fila (M28:388-394); sem "vaga", sem dependência de entrada, sem separar essenciais x complementares | **AUSENTE** | M |
| 3.3 | Avanço desigual: oportunidade extra à disciplina atrasada (>=15% abaixo do líder) | `atrasadas` (`maximo-progresso>=.15`) H:3093, bônus H:3100 | AUSENTE (só a regra "menor fração" escolhe a vez) | **AUSENTE** | P |
| 3.4 | Histórico desloca o ponto inicial da matéria | `indicesAnteriores` H:2706 (`ultimosTemas[disc]` = ID da aula; prefixo na ordem do catálogo) | `indicesAnteriores` M28:335 (`ultimosTemas[disc]` = POSIÇÃO 0-based, reordena por `ordem`) | IGUAL no efeito; **formato do dado diferente** (id x posição) | P |
| 3.5 | Duração PDFull = páginas/ritmo, **teto em blocos de 30min** | `minPdf` H:576 | `minPdf` M28:248 (idêntico) | IGUAL | - |
| 3.6 | Leitura inteira prioritária; **parcelamento máx. 3 datas** | `ler()` H:3331 (`partes>=2 && m<resta` => não divide mais); dominó H:2391 (`partes.size>3` ou `==3 && m<minutos` => para) | sem limite de partes (`lerPdf` M28:529-534; dominó M28:717-724) | **AUSENTE** | M |
| 3.7 | Revisão/questões/LegProc usam o saldo após a leitura; bloco registra intervalo e total de páginas; continuação abre o dia | `por(...,{paginaInicio,paginaFim,totalPaginas,continuacao,pai})` H:3336; `prioridade -3` H:2282 | `Detalhe` com as mesmas chaves (M28:53), `prioridade -1` p/ continuação (M28:655); no **núcleo base** não grava `paginaInicio/Fim` (só no dominó e `detalhesPdf`) | DIFERENTE (menor) | P |
| 3.8 | **Encaixe semanal**: entre as próximas aulas da rodada, escolhe a **mais longa que cabe inteira** no dia (muda ordem entre disciplinas) | `selecionarPDF` H:3309-3323 (reordena `fila` dentro da rodada) | AUSENTE | **AUSENTE** | M (depende de 3.1/rodadas) |
| 3.9 | Dependências de entrada das complementares preservadas | `rodizioPDF.dependencias` H:3097, 3316 | AUSENTE | **AUSENTE** | M (com 3.2) |
| 3.10 | **2o PDFull automático >24h**: liberado no dia após o 1o **concluído**, se couber inteiro; saldo anterior vira continuação; ocupação concluída conta | `limitePDF27` H:2778 (2 só se faixa 3, `d==hoje` e já há `pf` concluído hoje); `atualizarSegundoPDF` H:3130 + `adiantarPDF` | `tetoPdfDia=2` (PRM:90) / `maisPDFull` (M28:320, 568-571): na GERAÇÃO permite 2 novos/dia em qualquer faixa; sem gatilho por conclusão | **DIFERENTE** (3.0: base 1/dia; config Sim/Não removida) | M |
| 3.11 | Revisão regular 60min, vence 1 semana de conteúdo após o PDFull; SEM_FLASH | `registrar` H:3289 (`proxSemConteudo(...,1)`) | `registrar` M28:443 (`offsetRevisao=1`, `durFl=60`); `SEM_FLASH` idêntico | IGUAL | - |
| 3.12 | Questões 30min, +2 sem de conteúdo, depois da revisão (se exigida); semanas especiais não contam | H:3290, `elegivel` H:3303 (exige `fl` já alocado <= d) | `offsetQuestoes=2`, `durQu=30`; ordem fl->qu só no dominó (M28:679-680); no base `encaixarTipo('qu')` independe do fl | IGUAL (parâmetros) / DIFERENTE (precedência no base) | P |
| 3.13 | **1 meta de questões por dia**; faixa alta herda 1 se o dia anterior não coube | `limQu=1+herancas` H:3415-3428; dominó `quAdiados` H:2366, 2409 | sem teto diário de `qu` (`encaixarTipo` M28:486-491 coloca várias no mesmo dia) | **AUSENTE** | M |
| 3.14 | Faixa alta: PDFull + revisão + questões + LegProc (até 2 da mesma lei); 2a leitura antes do LegProc extra de outra lei; reduzir reserva de LegProc p/ evitar dividir | `reservarLegprocPDF216` H:3154; `blocoLP(d,true)` H:3435; H:2377-2386 | AUSENTE (LegProc entra antes do 2o PDF, M28:569-571) | **AUSENTE** | M |
| 3.15 | Faixas até 24h: organização por dias substitui composição geral | `rotina.faixa<3` ramo H:3375-3414 | AUSENTE | **AUSENTE** | G (= 2.5/2.6) |

## 4. LegProc (spec seção 4)

| # | Regra | HTML 3.0 | Plataforma | Status | Esf. |
|---|---|---|---|---|---|
| 4.1 | Meta de 30min; só leis das disciplinas selecionadas; ordem das leis e das metas preservada | `cfg.legprocs` do catálogo H:3295; `blocoLP` usa só a 1a lei de cada disc. (`primeiras`) H:3344 | `lpCarry` na ordem do catálogo (M28:454); `encaixarLP` | IGUAL (efeito) | - |
| 4.2 | Rodízio de até 6 disciplinas ativas, sem esperar terminar todas as leis | `criarRodizioLP25` slice(0,6) H:2693-2703 | `criarRodizioLP25(...,janela=6)` M28:309 (`lpJanelaRodizio=6`) | IGUAL | - |
| 4.3 | Grupo conjugado: até 2 metas da mesma lei; faixas <=24h => máx. 2 LP/dia no dia de leitura | `blocoLP(d,false,limite=2)` H:3340-3343 (`ids.length>=2` bloqueia sem `extra`) | `permitirLegproc25` M28:299: <=4/dia, <=2 disc, <=2 por disc (mesma lei) em qualquer faixa | **DIFERENTE** (teto 2 só nas faixas <=24h) | P |
| 4.4 | Faixa alta: +2 de OUTRA lei, máximo regular 4/dia | `blocoLP(d,true)`: `!chaves.has(lei)`, `ids.length>=4` H:3343,3345 | `lpMetasDia=4`, `lpDiscDia=2` (PRM:41-43) | IGUAL (limites equivalentes) | - |
| 4.5 | LegProc nos dias de leitura (faixa baixa/média) | `if(eDiaPDF||aquecimento||fechou) blocoLP(d)` H:3407 | `encaixarLP([dt])` todo dia (M28:570) | DIFERENTE | P |
| 4.6 | **Fim da fila acadêmica => fecha leis iniciadas; oferece cronograma complementar das demais** | `fechou`, `leisFinais` (`S.complementarLegproc||iniciadas`) H:3359,3438; `verificarFim216` H:3560; `gerarComplementar216` H:3565 | AUSENTE: plano só termina quando TODA a fila de LP acaba (`acabou` M28:575); sem oferta/diálogo/`complementarLegproc` | **AUSENTE** | M |
| 4.7 | "Próximos dias" mostra lei e artigos | UI (`descrever`) | `ItemLP.texto/lei` existem (M28:37-50); exibir no IF | parcial | P |
| 4.8 | LegProc parcial: saldo 20min | `confirmarSobra` H:2519-2520 | `reagendarParada` -> `cfg.sobras[id]=20` (IF:1205); `remanejadasEfetivas` M28:743 | IGUAL | - |
| 4.9 | Id `lp:1:i` (índice de catálogo estável) | `'lp:1:'+x.id` (H:3350, 3296) | `ItemLP.id` ex. `lp:L3f9a2c1b:4` (M28:39) + legado `lp:s:j`, `lp:<doc>:<n>` (dados.ts:165) | **DIFERENTE** (identidade) | M (mapeamento) |

## 5. Histórico e diagnóstico (spec seção 5)

| # | Regra | HTML 3.0 | Plataforma | Status | Esf. |
|---|---|---|---|---|---|
| 5.1 | "Já estuda pelo Revisão?" + grade de acertos/erros por matéria; último tema por disciplina (inclusive fora da seleção) | H:2979-3000, `ultimosTemas` p/ `TODAS` (H:2708) | `historicoQuestoes` (IF:1243-1251); `indicesAnteriores` só considera disc. ativas (`ativas.has(disc)`, M28:338,344) | DIFERENTE: **3.0 considera também disciplinas fora da seleção** (para a semana especial) | P |
| 5.2 | Diagnóstico: questões 30min de assuntos anteriores, alvo 2 abaixo de 24h / 3 a partir de 24h | `metaSemanalHistorico` H:2959 (`>=24*60`) | `metaSemanalHistorico` M28:837 (idêntico); flag `historicoDiagnostico219` **desligada** (PRM:107) | IGUAL (regra) / flag off | P (ligar) |
| 5.3 | Mecanismo: hist entra como `qu:i:hist:s` na fila `devidos` e disputa o dia (conta como questões => 1/dia); não ocorre na semana especial | H:3372-3374 (`else if` de `ehRev`) | `reservarDiagnostico` M28:842 reserva 30min por semana ANTES (reduz `horasPontuais`), pula semana de revisão | DIFERENTE (modelo de alocação) | M |
| 5.4 | Reforço: <50% PDFull; 50-<70% PDFlash; >=70% encerra; a partir da próxima semana civil | `sincronizarReforcoHistorico` H:3036 (`dataReforcoSemanaSeguinte`: semana seguinte a **hoje**) | `reforcosDerivados` M28:869 (`classificarResultado218`: <50 pf, <70 fl; semana seguinte à **conclusão do diagnóstico**; extra: disciplina SEM_FLASH => pf) | IGUAL (limiares) / DIFERENTE (data-base, SEM_FLASH) | P |
| 5.5 | Ids `qu:i:hist:s`, `pf|fl:i:reforco:s` | H:2950-2951 | `ehHist/ehReforco` M28:401-402 | IGUAL | - |
| 5.6 | Agregado não vira % individual do tema | H:`dadosResultadoHistorico` | idem conceito | IGUAL | - |

## 6. Semana especial de revisão (spec seção 6)

| # | Regra | HTML 3.0 | Plataforma | Status | Esf. |
|---|---|---|---|---|---|
| 6.1 | Ativa por padrão, a cada 8 sem; opções 4/6/8; confirmação ao desativar | `gerarPlano` H:3546 (`cada=8` default, `[4,6,8]`) | `REV_OPCOES=[4,6,8,10,12]`, `REV_PADRAO=12` (IF:882) | **DIFERENTE** (opções e padrão) | P |
| 6.2 | `ehRev`: semanas 4,8,12... | H:554 | M28:239 | IGUAL | - |
| 6.3 | Não abre PDFull regular novo | guards `!ehRev` H:3365,3417 | `semRev` não chama `lerPdf` (M28:552-560) | IGUAL | - |
| 6.4 | Grupo **essencial externa**: essencial NÃO selecionada, PDFlash 60min, giro de disciplinas e ordem editorial | `externas` H:3652-3654 (rodízio por disciplina `porDisc`, giro `((floor(sem/cada)-1)*3)%n`) | AUSENTE: `montarRevisao` (IF:950) só usa temas já estudados das disciplinas ativas | **AUSENTE** | M |
| 6.5 | Grupo **tema estudado** (disc. selecionada, estudado ou declarado anterior) com resultado individual | `estudadas` H:3651 (`resultadoTema217`) | `rankingRevisao` (grau/acerto agregado `acertoMin=60`) ou `rankingRevisao218` (flag) | DIFERENTE | G |
| 6.6 | **Regra 50/70**: <50 => PDFull releitura (tempo por páginas); 50 até 70 INCLUSIVE => PDFlash 60; >70 fora; sem resultado válido fora | `resultadoTema217` H:3645: `pct<50?'pf':pct<=70?'fl':'ok'` | `classificarResultado218` M28:174: `<70 ? 'fl' : 'ok'` (**70% exato = ok**, 3.0 = PDFlash); e sem resultado ENTRA na fila (grupo 2, M28:199) e gera rf+rq | **DIFERENTE** (limiar 70 e tratamento de "sem resultado") | P/M |
| 6.7 | **Corte**: último resultado válido concluído ANTES da segunda-feira da semana especial; registro do tema, total>0; execução mais recente vence, desempate por `resultadoAtualizadoEm`; % sem arredondar | H:3643-3646 (`(prog.em||plano)<ate`, sort por data desc) | `resultadoTema218` M28:176 SOMA todas as notas `qu:i`+`rq:*:i` sem data de corte | **AUSENTE** (soma x último; sem corte) | M |
| 6.8 | Fila: PDFlash externo -> tema estudado (pares); alterna disciplina dentro de cada grupo | `alternarDisciplinas300` H:3192; par H:3699-3705 | AUSENTE (para cada tema: `rf` 60 + `rq` 30, `planoRevisao` M28:264) | **AUSENTE** | M |
| 6.9 | Cada par = metade dos **objetivos**; só um grupo elegível => usa os disponíveis | H:3688-3707 | AUSENTE | **AUSENTE** | M |
| 6.10 | **Cursor cronológico** (nunca volta a datas anteriores p/ preencher sobras); se o 2o objetivo não cabe, restaura o par | `cursor`, `foto`, rollback H:3661,3701-3703 | `planoRevisao` preenche dias em sequência (M28:264-273), sem rollback de par | DIFERENTE | M |
| 6.11 | PDFull dividido = vários cartões, 1 objetivo; continuação primeiro no dia receptor; máx. 3 blocos | `colocarEstudada` H:3672-3684 (`melhores.slice(0,3)`, ids `pp:i:k`) | AUSENTE | **AUSENTE** | M |
| 6.12 | Saldo de objetivos já registrados preservado ao acrescentar novos pares | `objetivosAnteriores/saldo` H:3659-3666,3689-3697 | AUSENTE (revs congelado em `S.revs`) | **AUSENTE** | M |
| 6.13 | Concluir questões/editar resultado **recompõe** pendências das próximas semanas especiais | `atualizarRevisoes217` H:3715, chamado em `marcar`/`salvarNota` H:3725-3727 | `S.revs[sem]` congelado quando `semInicio<=hoje` (IF:971); futuras recalculadas só no `indexar` | DIFERENTE | M |
| 6.14 | Questões feitas DENTRO da semana especial só valem p/ semanas futuras | corte `<ate` | n/a (sem corte) | **AUSENTE** | (em 6.7) |
| 6.15 | Reserva de tempo da semana especial no plano | metas reais em `plano` (H:3368) | só reserva tempo `planoRevisao` (M28:555-557) e os itens vêm por `montarRevisao` no IF | DIFERENTE (arquitetura) | G |
| 6.16 | Ids: ver seção 9 | | | | |

## 7. Jurisprudência semanal (spec seção 7)

| # | Regra | HTML 3.0 | Plataforma | Status | Esf. |
|---|---|---|---|---|---|
| 7.1 | 60min/semana, id `jp:s`, preferir sex/sáb, maior disponibilidade, empate = data anterior, senão outro dia | `reservarJuris219` H:3768-3793 | `reservarJuris219` M28:804-833 (mesma lógica; `jurisprudencia219` **off** por padrão, PRM:103) | IGUAL | - |
| 7.2 | **Limiar: semana com >=14h30 de disponibilidade efetiva** (antes: 1h livre) | `horasSemana<14.5 && !concluida => null` H:3771-3775 (soma `horasDia` de d>=start; considera recesso/pontuais) | só exige um dia com `livre>=min` (M28:816-819); sem limiar de semana | **DIFERENTE** | P |
| 7.3 | Inclui semanas especiais elegíveis | loop sem guard `ehRev` H:3361 | sem guard (M28:919) | IGUAL | - |
| 7.4 | Semana sem estudo: sem reserva; semana ativa sem espaço p/ 60min: mensagem de insuficiência | H:3786, 3792 | M28:817, 830 | IGUAL | - |
| 7.5 | Registro concluído permanece se disponibilidade cai depois | `concluida` H:3777 | M28:807-808 | IGUAL | - |
| 7.6 | Reserva ANTES das demais metas e continuação do PDFull 1a na apresentação | H:3361-3363 (dentro do laço) | desconta capacidade via `horasPontuais` (M28:925-927) | IGUAL (efeito) | - |
| 7.7 | Dominó: unicidade pela semana da **data agendada**; mover p/ outra semana ocupa a vaga; preserva execução iniciada/concluída | `opcoes.movida`, erros H:3773,3777,3781; `calcularDomino` loop 200 tentativas H:3801 | sem `movida` (não há arraste); `origemSaiu` existe (M28:812) | DIFERENTE | M (com 8.x arraste) |
| 7.8 | Falta de espaço mensagem | | idem | IGUAL | - |

## 8. Execução, interrupção e reorganização (spec seção 8)

| # | Regra | HTML 3.0 | Plataforma | Status | Esf. |
|---|---|---|---|---|---|
| 8.1 | Concluir: registra execução/notas/tempo; PDFull registra páginas; questões com total/acertos/erros/dificuldade/origem dos erros | `marcarSemLiberarPDF`, `salvarNota` | notas `grau/res/err/diff` (ENG:147) | IGUAL (campos) / "origem dos erros" a confirmar | P |
| 8.2 | **Não realizada**: próxima data posterior com meta da MESMA família e disponibilidade; senão próximo dia de estudo; família independe da disciplina | `destinoTipoMeta` H:2096 + `moverMetaMesmoTipo` (dominó com `movida`) | `reagendarParada` (IF:1196) re-gera com `gerarEstado` a partir de amanhã; sem "mesma família" | **DIFERENTE** | M |
| 8.3 | **PDFull parcial**: última página; saldo na página seguinte; ritmo vigente; última página conclui | `confirmarSobra` H:2490-2535 (`paginasLidas`, `remanejadas`, `detalhe.paginaInicio`) | `cfg.paginasLidas` + `remanejadasEfetivas` (M28:745); IF:1203 (`pag>=P` conclui) | IGUAL | - |
| 8.4 | LegProc parcial: artigo; saldo 20min | H:2519 | IF:1205, M28:743 | IGUAL | - |
| 8.5 | Outros materiais parciais: ponto de parada + minutos restantes | `kanban-min` H:2830 | `sobras` com `max(10, ...)` (IF:1208) | IGUAL (aprox.) | - |
| 8.6 | Manter pendente guarda ponto de parada | `manterSobraPendente` H:2536 | `textoParou` / `parou` (IF:1097) | IGUAL (aprox.) | - |
| 8.7 | **Organizar metas em atraso**: pendências anteriores a hoje redistribuídas a partir da disponibilidade seguinte; preserva conclusões; registra reorganização | `organizarAtrasadas` H:2749: `calcularDomino(fonte,...)` (mantém ordem/fila relativa, `S.reorgs`) | `reorganizar` IF:1272: `gerarEstado(cfg, fixos=feitas, hoje)` (regenera TODA a fila a partir de hoje); `reorgs` existe | DIFERENTE (dominó x regeneração; pode mudar datas futuras já planejadas) | G |
| 8.8 | Ajustar horas do dia: exceção por data; excesso deslocado em cadeia; restaurar elimina | `salvarHorasDia` H:2440 (`calcularDomino`, `adiantarLP/PDF` quando aumenta) | `ajustarHorasDia` IF:1254 (`gerarEstado(cfg, fixos, d)`); teto 24h; sem piso 2h | DIFERENTE | M |
| 8.9 | **Arrastar na Semana**: diálogo "cumpriu parcialmente?"; valida data, páginas/saldo, dependências, capacidade; destino pode divergir da preferência automática | `abrirKanban/confirmarKanban` H:2805-2842, `movida` no dominó H:2370,2413 | AUSENTE (nenhum `kanban`/arraste no IF) | **AUSENTE** | G |
| 8.10 | Pausar/retomar: cronômetro pára; ao retomar vira recesso; pendências vão p/ datas compatíveis | `retomar` H:3465-3471 (`recessos+Pausa` + dominó) | `pausar/retomar` IF:1286-1302 (cada dia pendente avança na ordem; sem recesso explícito verificado) | DIFERENTE (a confirmar) | M |
| 8.11 | Dominó preserva execuções fixas e páginas; erro se capacidade < já concluído na data | H:2268 | M28:641 | IGUAL | - |
| 8.12 | Dominó mantém faixas, dependências e identidade das metas especiais (ordemAlternancia) | `liberar` H:2294-2301, 2302-2315 | `liberar` M28:662 sem faixas/alternância | **AUSENTE** | G |
| 8.13 | Ajuste de horas até 24h no domínio; `Reduzir horas após geração`: pendências redistribuídas sem exceder horas (caso homologação) | idem | `ocupado(desde)>capacidade` => erro M28:641 | IGUAL | - |

## 9. MUDANÇAS DE IDENTIDADE DE METAS (seção 10 da spec x o que a plataforma já usa)

| Id 3.0 | Significado 3.0 | Plataforma hoje | Impacto |
|---|---|---|---|
| `pf:i`, `pp:i:k` | PDFull regular e segmentos; `pai`=`pf:i` | igual (M28:514, `detalhes.pai`) | nenhum |
| `fl:i`, `qu:i` | revisão/questões regulares | igual | nenhum |
| `qu:i:hist:s` | diagnóstico histórico | existe (`ehHist` M28:401; `ID_META` aceita, dados.ts:449) | nenhum (flag off hoje) |
| `pf:i:reforco:s`, `fl:i:reforco:s` | reforço do diagnóstico | existe (`ehReforco` M28:402) | nenhum |
| **`rf:s:i`** | **PDFlash de essencial EXTERNA** (`i` = aula externa, `s` = semana) | `rf:s:i` = flashcard de tema JÁ ESTUDADO (IF:961 `${t}:${sem}:${i}`) | **COLISÃO SEMÂNTICA**: mesmo formato, outro conteúdo. Planos/progresso `rf:*` existentes devem ser preservados como legado; novos `rf` seriam externos. `indiceAula` já lê `p[2]` p/ `rf/rq` (igual) |
| **`rq:s:i`** | **legado** (mantido só p/ registros antigos; 3.0 NÃO gera mais) | ativo: 1 `rq` (30min) por tema na revisão (IF:961; `DUR_REVISAO.rq=30`) | 3.0 deixa de gerar `rq`; ainda LÊ `rq` como evidência (`resultadoTema217` H:3644 aceita `['qu','rq']`) |
| **`pf:i:revisao:s`** | releitura PDFull do tema (<50%) na semana especial `s` | AUSENTE | NOVO tipo. Perigo: o código usa `id.startsWith('pf:')`/`/^p[fp]:/`/`p[0]==='pf'` como "PDFull regular da aula i": `rankingRevisao218` (M28:195), `rankingRevisao` (ENG:161), `temasFracos` (M28:166), `novosPDFDia27` (M28:325), `detalhesPdf`/`blocos` (M28:585), `saudePlano`, `liberacao.ts`, `plano-metas.ts` `descrever`. Precisa de teste `ehRevisaoAdaptativa(id)` (`/^(pf|fl):\d+:revisao:\d+$/`) em todos. `ID_META` (dados.ts:449) e CHECK `chk_cron_adapt_pm_tipo` (prefixo) aceitam; conferir se o CHECK valida o formato inteiro |
| **`fl:i:revisao:s`** | PDFlash adaptativo do tema estudado (50-70%) | AUSENTE | idem; mesma família `fl` (`familiaMeta`) - reutiliza conteúdo da aula `i` (liberação deve resolver `i`, não `s`) |
| `lp:1:i` | LegProc, `i` = índice estável do catálogo | `lp:<hash>:<n>` / legado `lp:s:j` | mapear (tabela de equivalência já existe em dados.ts:165-210) |
| `jp:s` | Jurisprudência da semana `s` de ORIGEM (a data pode mudar) | igual (`jp:sem`, M28:813) | nenhum |
| `detalhes` novos | `semanaRevisao, semanaOrigemRevisao, ordemAlternancia, essencialNaoSelecionada, material ('PDFull'/'PDFlash'/'Questões'), origem, percentualOrigem, reforco, pai, geracao, deslocada, artigo, jurisprudencia` | `Detalhe` (M28:53) tem só `continuacao,pai,origem,pagina*,artigo,deslocada,geracao,jurisprudencia,historico,reforco` | estender o tipo + persistência (tabela `plano_meta`/JSON de detalhes) |
| cfg novos | `remanejadas, reforcosHistorico, complementarLegproc, revisao.cada` in {4,6,8}, `ultimosTemas` por id | `ultimosTemas` por posição (M28:67); `remanejadas` existe; `reforcosHistorico`/`complementarLegproc` ausentes (reforço é derivado a cada geração) | decidir se `reforcosHistorico` é persistido (3.0) ou derivado (plataforma) |

Regra geral da 3.0: `i` identifica o CONTEÚDO, `s` a semana de ORIGEM, `k` o segmento; a data pode mudar sem mudar a identidade (H spec seção 10).

## 10. Resumo executivo e ordem sugerida

Totais (itens da tabela): IGUAL ~28, DIFERENTE ~24, AUSENTE ~26.

IGUAL: semana/calendário, `minPdf` (30min), revisão 60min/+1 sem, questões 30min/+2 sem, SEM_FLASH, rodízio LP 6 disc., limites LP 4/dia, Juris (escolha do dia, `jp:s`), parcial PDFull/LegProc 20min, `metaSemanalHistorico` 2/3, reforço 50/70 (limiares), ids de `hist`/`reforco`.

Maior volume de trabalho (G): faixas + `rotina300` + laço dia a dia (2.2, 2.5-2.11, 3.15); semana especial 3.0 (6.4-6.15, incluindo mover metas para dentro de `S.plano`); dominó com `movida`/arraste/Kanban (8.7-8.9, 8.12).

Ordem sugerida (menor risco primeiro, tudo atrás de flag/versão `motor 3.0`; planos existentes ficam no 2.8):
1. **P (sem mexer na geração)**: limiar Juris 14h30 (7.2); `MAX_SEM` 600 + erro de insuficiência no base + subir clamp de `maxSemanas` (2.12); mínimo 10h/passos 2h (2.3, 2.4); `revisao.cada` {4,6,8} padrão 8 (6.1); LP máx 2/dia fora da faixa alta (4.3).
2. **M**: limiar 70% inclusivo e exclusão de "sem resultado" na semana especial (6.6), corte antes da segunda e "último resultado" (6.7); parcelamento máx. 3 datas (3.6); teto 1 `qu`/dia + herança (3.13); fim da fila LP + oferta complementar (4.6); identidades `pf|fl:i:revisao:s` e blindagem dos `startsWith('pf:')` (seção 9).
3. **G**: `motor30.ts` com `rotina300` + laço dia a dia (faixas, fim de semana 40%/2h, aquecimento, encaixe, 2o PDFull por conclusão) e rodízio por vagas (`construirRodizioPDF`).
4. **G**: semana especial 3.0 no plano (externas + estudadas, alternância, cursor, PDFull até 3 blocos, recomposição ao concluir questões) - exige mover `RV/S.revs` para `S.plano` + `detalhes` (IF:950-977) e a liberação das externas (conteúdo de disciplina NÃO selecionada: acesso/`liberacao.ts`).
5. **G**: dominó único para reorganizar/ajustar horas/atrasadas/arrastar (substituir `gerarEstado` por `calcularDomino` com `movida`) + UI de arraste (Kanban).

Riscos/observações:
- A spec e o HTML divergem em um ponto de redação: spec fala "faixa 10h-14h30" mas o código usa `horas<15` (aceita 14,5 e também 14,75 etc. por passo de 30min não ocorre). Equivalente na prática.
- `rf:s:i` colide com legado da plataforma (seção 9); `rq` deixa de ser gerado (DUR_REVISAO.rq=30 vira só legado).
- Regeneração automática dos planos existentes NÃO é recomendada (regra do projeto/analise 2.19 F5); H:3850 regenera na migração, a plataforma não deve copiar isso.
- Não verificado linha a linha: `retomar` do iframe (IF:1292+) quanto a registrar recesso; "origem dos erros" nas notas.

---
# Relatorio: rel-opcoes

# Cronograma Adaptativo 3.0 x Plataforma — opções de configuração e telas

Somente leitura. Fontes: HTML 3.0 (3863 linhas, shell em camadas: base 2.16 + patches 2.17/2.18/2.19/3.0), spec 01_Comportamento (seções 1,5,6,8,9,10), iframe da plataforma (`apps/web/public/cronograma/adaptativo/index.html`, 2620 linhas), libs `apps/web/lib/cronograma/adaptativo/*`, admin `apps/web/app/admin/cronogramas/adaptativo/*`.
Legenda: IGUAL / DIFERENTE / AUSENTE (= ausente na plataforma) / SÓ-PLAT (existe só na plataforma).
Observação de método: os "IGUAL" abaixo foram conferidos por leitura do código de UI; regras do MOTOR (faixas de horas, dominó, semana especial 3.0) não foram executadas, só comparadas por texto/grep.

## 0. Diagnóstico de linhagem (importante)
- Plataforma: motor `motor28.ts` v**2.8.1** (`VERSAO_MOTOR`), iframe "2.0 porte fiel", com flags opcionais 2.18 (`pdfInteiro218`, `revisaoPorResultado218`) e 2.19 (`jurisprudencia219`, `historicoDiagnostico219`), todas **desligadas por padrão por tenant**. Chave local `rej-cronograma-v2`.
- 3.0: gerador "motor 216" (`S.regraMotor=216`, `regraRevisao216=3`, `regraPDF216=1`, `regraCatalogo218=1`, `regraJuris219=1`, `regraRotina300=3`). As regras 2.16–3.0 são **sempre ligadas** e o HTML **regenera o plano na migração** (linhas 1105/3850-3854).
- Conclusão: a distância maior NÃO está na UI e sim no motor (faixas 300, PDFull inteiro/3 datas, semana especial por pares, Jurisprudência obrigatória, complementar LegProc). A UI do aluno da plataforma já tem ~70% das telas do 3.0.
- Há pistas de que o `motor28.ts` já tem `calcularDomino`, `reservarJuris219`, rodízio LP — reaproveitável; mas `faixa|rotina300` não aparece em motor28.ts/engine.ts (grep sem resultados).

## 1. Opções do aluno — lado a lado

### 1.1 Primeiro acesso e ritmo
| Item | 3.0 | Plataforma | Status |
|---|---|---|---|
| Coleta nome + ritmo (padrão 17 pág/h ou teste) | `renderInicio`, `VEL_PADRAO=17`, teste de leitura (`abrirTesteLeitura`, `leit-*`) | `renderInicio`, `VEL_PADRAO=17`, mesmo teste `leit-*`; ritmo padrão vira param por tenant `velPadrao` (5–60) | IGUAL (+SÓ-PLAT: param tenant) |
| Ritmo manual em Configurar (fls/h ou refazer teste) | `leit-config` | `cfg-vel` (3–80) + `leit-config` | IGUAL |
| Tutorial pós-1º acesso | `abrirTutorial(obrigatorio)`, modal "Seu cronograma, na prática", cards `DICAS_CRONOGRAMA` com filtro por grupo, `perfil.tutorialVisto`; reabrível | 0 ocorrências de tutorial/DICAS no iframe | AUSENTE |

### 1.2 Configurar
| Item | 3.0 | Plataforma | Status |
|---|---|---|---|
| Nome do cronograma / título | não há (1 plano) | `cfg-titulo` (multi-plano/hub) | SÓ-PLAT |
| "Gerar sem data de início" | não há | `cfg-sem-data` (Semana N/Dia N) | SÓ-PLAT |
| Data de início | `cfg-inicio` | `cfg-inicio` | IGUAL |
| Horas por dia, h + min separados | `camposHorarioDuplo`, teto rotina 12h; `h===1` removido da lista (só 0 ou ≥2h), passo 30min | `camposHorarioDuplo` (2.15), teto 12h; opção "01" ainda existe; minutos só a partir de 2h | DIFERENTE (1h permitido) |
| Mínimo semanal 10h | `validarHoras300`: cada dia ativo ≥2h e total ≥10h; bloqueia prévia/gerar; lista "falta" mostra o erro | Só exige ≥1 dia com horas (`nDias`); sem 10h, sem mín. 2h | AUSENTE |
| Ajuste de uma data 2–24h (0 = folga), restaurar | `abrirHorasDia` modal + `salvarHorasDia`; valida 0 ou 2–24 em 30min; `restaurar-horas` | `ajustarHorasDia`/`hd-ok`/`hd-padrao`, aceita 0–24 (qualquer, arredonda a 0,5); bloqueia abaixo do já concluído no dia | DIFERENTE (regra ≥2h; modal x painel inline) |
| Mudar rotina a partir de data (`desde`) + histórico de distribuições | `cfg-desde`, rotinas | `cfg-desde` + lista "Distribuições registradas" | IGUAL |
| Recessos (ini/fim/motivo) | `rec-add`/`rec-del` | idem, máx. 120 dias e sem sobreposição | IGUAL |
| Disciplinas: Essenciais / Complementares / Específicas AGU | chips + "Marcar todas/Desmarcar" | idem | IGUAL |
| Tipos configuráveis PDFull/Revisão/Questões/LegProc | `data-meta`; PDFull obrigatório | idem (`META_TXT`) | IGUAL |
| Jurisprudência | automática e obrigatória (semanal 60min, só semanas com ≥14h30 efetivas; sexta/sábado) | checkbox "opcional" só se `PARAMS_MOTOR.jurisprudencia219`; senão card "em breve"; padrão desligado por tenant | DIFERENTE |
| Videoaulas | stripped do catálogo (`limparCampos218` remove `videoaula`) | `EXTRAS_META` "Videoaulas" indisponível (vd deletado) | IGUAL (ambos desligados) |
| "Segundo PDFull" Sim/Não | REMOVIDO (automático na faixa >24h, só se couber inteiro) | `mais-pdf` Sim/Não + `tetoPdfDia` (padrão 2) | DIFERENTE (remover pergunta) |
| "Quantas matérias em paralelo" | não há (todas as essenciais em paralelo; vaga de essencial liberada → complementar) | `cfg-paralelo` (Automático/1..12) | DIFERENTE (3.0 remove) |
| Arranjo (pdf / equilibrado / constância) | `arranjo` ainda no handler, mas 3.0 organiza por faixa de horas | `ARRANJOS` com descrições, `arranjo:'pdf'` forçado em `montarCfg` | DIFERENTE (substituído por faixas) |
| Semana especial: ativa por padrão, 4/6/8 | `REV` opções [4,6,8], padrão 8; recomendado | `REV_OPCOES=[4,6,8,10,12]`, `REV_PADRAO=12`, dica "recomendamos a cada 12" | DIFERENTE |
| Confirmação ao desativar semana especial | `window.confirm("Atenção. A revisão periódica é importante... Deseja prosseguir sem semanas de revisão?")`; cancelar mantém inclusão | nenhuma confirmação (radio troca direto) | AUSENTE |
| "Já estuda pelo Revisão?" Sim/Não | tabela ACERTOS/ERROS/TOTAL (readonly) por matéria | idem (`data-hist-*`, total calculado) | IGUAL |
| Último tema concluído por matéria (inclui não selecionadas) | select por disciplina (TODAS) | select por disciplina (TODAS) | IGUAL |
| Avaliar tema anterior ("Estudada anteriormente" + `Avaliar tema e questões` → `abrirAvaliacaoAnterior`) | existe (dificuldade/desempenho do tema) | não existe | AUSENTE |
| Diagnóstico histórico (2 metas/sem <24h, 3 ≥24h; <50% PDFull, 50–70% PDFlash, ≥70% encerra) | sempre ativo | existe atrás da flag `historicoDiagnostico219` (padrão desligado) | DIFERENTE (flag) |
| Prévia de duração | `agendarPrevia` (200ms) → metas, semanas, término, "saúde" da carga; erro do motor vira toast e PREV=null | idem (spinner, ok/atenção, aviso de carga, término previsto) | IGUAL (conferir tratamento de erro) |
| Recalcular preservando concluídas | `gerar-ok`, `fixosAtuais()` | `gerar-ok`, `fixosAtuais()` + `ancoraConfig()`; mensagem "As metas concluídas continuam marcadas…" | IGUAL |
| Recomeçar do zero | não confirmado no 3.0 | `zerar`/`zerar-ok` com confirmação | SÓ-PLAT |
| Limite de horizonte (600 sem.; "insuficiência" em vez de plano truncado) | spec §2 | `maxSemanas` param tenant (20–520, padrão 200) | DIFERENTE |

### 1.3 Persistência / backup / exportação
| Item | 3.0 | Plataforma | Status |
|---|---|---|---|
| Chave local | `rej-cronograma-v3-0`, backup `:backup`, lê legadas desde `rej-cronograma-v2-19` | `rej-cronograma-v2` (fonte da verdade é o servidor) | DIFERENTE |
| Canal nuvem | Firestore `estado/progresso/notas` com sufixo `-v300` (lê `-v219`) | `POST/GET /api/aluno/cronograma/adaptativo` (`acao:'sync'`, `parte`, `doc`) → tabelas Supabase `…_plano`, `…_meta`, `…_plano_meta` (dual-write) | SÓ-PLAT (arquitetura própria; NÃO adotar Firestore) |
| Backup JSON | `baixarBackup216` → `Backup_Cronograma_3.0_<data>.json` com `S` inteiro | 0 ocorrências | AUSENTE (baixa prioridade: servidor já persiste) |
| DOCX | calendário + materiais + links | botão `btn-docx` "Baixar DOCX" (lib via CDN no cliente) + rota `…/adaptativo/docx` + `docx-adapter.ts` | IGUAL (conferir links de questões/materiais) |
| Marcadores de regra por plano | `S.regra*` + regeneração automática | não regenera (política: nunca mover datas de alunos) | DIFERENTE (manter nossa política) |

## 2. Telas: o que há de novo no 3.0 (vs. plataforma)
Abas: 3.0 = Hoje / Semana / Desempenho / Configurar / **Admin**; plataforma = Hoje / Semana / Desempenho / Configurar (Admin vira área do painel).

### 2.1 Hoje
| Recurso 3.0 | Plataforma | Status |
|---|---|---|
| Cartões do dia com continuidades no topo | `renderHoje`/`cartao`; continuação primeiro (ORDEM no motor/estado) | IGUAL |
| Ações Concluir / Não realizada | `feito`, `faltou` ("Não realizado") | IGUAL (texto: "Não realizado") |
| Não realizada → procura próxima data da mesma família | só marca `missed`; reagendamento via "Recalcular" (`reorganizar`) | DIFERENTE (comportamento) |
| PDFull parcial (última página; saldo no ritmo vigente) | `Parcial` → `formParcial` (campo "parou"); `perguntaParada` | DIFERENTE (3.0 usa modal com páginas/total e reagenda saldo) |
| LegProc parcial (artigo de parada → saldo de 20 min) | `perguntaParada` (artigo/julgado) | DIFERENTE (verificar se gera saldo 20 min) |
| Outros materiais parciais + minutos restantes; "Manter pendente" | campo "parou" simples | DIFERENTE |
| Organizar metas em atraso (`organizarAtrasadas`, dominó, registra `reorgs` tipo organizar-atrasadas) | `reorganizar` (retoma hoje/amanhã, apaga `missed`, `S.reorgs`) | DIFERENTE (equivalente funcional, motor diferente) |
| Ajustar horas do dia (modal, dominó em cadeia) | painel inline `horas-dia` (`hd-ok`/`hd-padrao`) | IGUAL (funcional) |
| Pausar / retomar (retomada pode virar recesso) | `pausar`/`retomar` (`S.pausa.desde`; pendências avançam) | IGUAL/DIFERENTE (não registra recesso — verificar) |
| "Próximos dias" com nome da lei e artigos | `prox` lista 3 próximos dias; não confirmei nome da lei/artigos | DIFERENTE (verificar) |
| Oferta de cronograma complementar LegProc (fim da fila acadêmica) | 0 ocorrências | AUSENTE |
| Folha da meta: cronômetro, notas, links de questões | `abrirFolha`, cronômetro; link vai para `questoes-plat` (questões da própria plataforma, `abrirQuestoesPlat`) | SÓ-PLAT (superior; manter) |
| Player de vídeo no PDFull | o HTML 3.0 NÃO implementa player (videoaula só metadado/removido) apesar do spec | IGUAL (nenhum tem; v4.11 da plataforma tem vídeo próprio no leitor) |
| Tutorial acessível por botão | AUSENTE | AUSENTE |
| Abrir material | `abrirMaterial`, `extra-abrir`, `rever` | SÓ-PLAT (Biblioteca/leitor) |

### 2.2 Semana
| 3.0 | Plataforma | Status |
|---|---|---|
| Chips de semanas, carga prevista, navegação | `renderSemana` equivalente | IGUAL |
| **Arrastar meta pendente para outra data** (`draggable`, `podeMoverKanban`, `abrirKanban` "Mover meta", pergunta "Fiz parte desta meta", valida data/páginas/capacidade, dominó) | nenhum drag; sem modal Mover | AUSENTE |
| Ordem de alternância gravada na semana especial (`detalhesMetas`) | revisão materializada em `S.revs` (congela semanas iniciadas) | DIFERENTE |

### 2.3 Desempenho
| 3.0 | Plataforma | Status |
|---|---|---|
| Totais, atrasadas, tempo, últimos 15 dias; exclui metas anteriores (`ehMetaAnterior`) | `renderDesempenho` + desempenho real do banco (Meu Desempenho com dados reais, snapshot) | IGUAL (base) / SÓ-PLAT (dados) |
| Agregado por matéria não substitui % individual | idem (param `acertoMin`) | IGUAL |

### 2.4 Admin
| 3.0 | Plataforma | Status |
|---|---|---|
| Aba Admin local: editar aulas/títulos/ordem/páginas/links de questões; LegProc (lei, artigos, sequência); catálogo no HTML; ajustes em localStorage | Painel do tenant: `/admin/cronogramas/adaptativo` (Liberação), `/metas` (Metas & inteligência), `/catalogo` (Catálogo de metas, override em banco), `/definicoes` (Definição e análise) | SÓ-PLAT (substitui; NÃO importar o Admin local) |
| Painel "Catálogo atualizado pelas planilhas" + "Materiais de apoio e origem" (PDFlash/PDFight/videoaula/linha da planilha) | `catalogo-html.json`, `catalogo-origem.json`, `catalogo-diagnostico.ts` | DIFERENTE (comparar catálogo 3.0: 191 aulas essenciais, 622 LP/24 disc. no 2.18/2.19 — recontar no 3.0) |

## 3. Admin "Metas & inteligência" (plataforma) vs. 3.0
Parâmetros hoje por tenant (`params.ts`, `simulado_tenants.tema.cronograma_adaptativo_cfg`): `velPadrao, diaCurtoMin, durFl/Qu/Lp/Rf/Rq, offsetRevisao(1), offsetQuestoes(2), semFlash[], tetoPdfDia(2), lpMetasDia(4), lpDiscDia(2), lpMesmaDisc(2), lpJanelaRodizio(6), charsMetaLp, concentracaoAteH(18), maxSemanas(200), acertoMin(60), usarDesempenhoNoPlano, pesoDesempenho, pdfInteiro218, revisaoPorResultado218, jurisprudencia219, jurisprudenciaMin, jurisTagsImagem, jurisTitulosExpansivos, historicoDiagnostico219`.
No 3.0 esses valores são constantes do código (não há equivalente configurável). Pontos de atrito:
- `concentracaoAteH=18` (2.8: último dia concentra questões) x 3.0: faixas por horas (<15 / 15–24 / >24) + concentração de fim de semana ≥40% — **regra diferente**, não um valor.
- `tetoPdfDia`/`maisPDFull` x 3.0 "PDFull adicional só >24h".
- `maxSemanas=200` x horizonte 600.
- `lpMetasDia=4, lpMesmaDisc=2` já coincidem com spec §4 (máx. 4/dia, até 2 da mesma lei).
- `offsetRevisao=1/offsetQuestoes=2` coincidem com spec §3.
- `diaCurtoMin`, `durRf/durRq`, `semFlash`, `usarDesempenhoNoPlano` não existem no 3.0 (SÓ-PLAT; manter).

## 4. O que a plataforma tem e o 3.0 NÃO tem (não pode ser perdido)
1. Parâmetros por tenant (acima) + `ctx.params` injetado no iframe via GET da API; `PARAMS_PADRAO` = comportamento 2.8 (determinismo).
2. Supabase: planos (`…_plano`: cfg+grade+revs+extras+pausa), progresso (`…_meta`, por `meta_id`), espelho relacional `…_plano_meta` (dual-write, migr. 050000/060000/061000), `…_catalogo` (override do admin), `…_legproc`, `…_meta_def` + visão de análise. `gradeValida` (`ID_META`) valida o plano inteiro.
3. Multi-plano/hub: fixar, arquivar, renomear, título, listar (`dados.ts`).
4. Snapshot (`snapshot.ts`) alimentando painel/Home/Início NOVA sem montar tudo no cliente.
5. Liberação (`liberacao.ts`): bloqueio de documentos conforme data da meta, `docBloqueadoNoCronograma`, simulação por aluno, `liberacaoDoc`.
6. Biblioteca: `conteudo-banco.ts` (AS/WLP/LP a partir de documentos), `paginas-pdf.ts`, `abrirMaterial` no leitor, legProc em texto STF/STJ recolhível.
7. QF (questões da plataforma): `qf*.ts`, `abrirQuestoesPlat`.
8. Estado de extras (`extras` sessões de estudo), "sem data", impersonation/visualização do aluno, fuso `America/Fortaleza`/BRT.
9. Tema/dark via tokens, integração iframe Curseduca, `motor28.js` gerado por `pnpm cronograma:motor`, suíte `pnpm cronograma:testar`, retrocompatibilidade de 706 planos (política: nunca regenerar automaticamente).
10. Catálogo/override/definições editados no painel (substitui o Admin local do 3.0).

## 5. Mapeamento: diferença → arquivo(s) → esforço → risco
Esforço: P (≤0,5 dia) / M (1–3 dias) / G (>3 dias). Risco: B/M/A.

### 5.1 UI do iframe (todos em `apps/web/public/cronograma/adaptativo/index.html`; para o motor, recompilar `motor28.js`)
| # | Diferença | Onde mexer | Esf. | Risco |
|---|---|---|---|---|
| U1 | Tutorial (modal, `DICAS_CRONOGRAMA`, `tutorialVisto`, botão reabrir) | index.html (+ estilos); `S.perfil.tutorialVisto` já persiste via `estado` | M | B |
| U2 | Confirmação ao desativar semana especial | handler `rev-ativa` em index.html (hoje troca direto) | P | B |
| U3 | Opções 4/6/8 + padrão 8 (hoje 4–12, padrão 12) | `REV_OPCOES`/`REV_PADRAO` no index.html e `cfgVazia`/`Estado` (`cada:12`) em `estado.ts`; cuidado com planos que usam 10/12 (aceitar legado) | P | M (planos existentes com 10/12) |
| U4 | Mínimo 10h/semana e ≥2h/dia (`validarHoras300`), remover opção 1h | `camposHorarioDuplo`, `renderConfig` (lista `falta`), `gerarDaConfig`, `agendarPrevia`; `ajustarHorasDia` (0 ou 2–24) | P–M | M (aluno com rotina <10h hoje não consegue recalcular — comunicar; ligar por flag de tenant) |
| U5 | Remover pergunta "segundo PDFull" e "matérias em paralelo" | seção 7 do `renderConfig`; `montarCfg` (`maisPDFull`, `paralelo`); depende do motor (faixa >24h) | P (UI) | A se removido antes do motor |
| U6 | Avaliação de tema anterior ("Avaliar tema e questões") | `renderHistoricoConfig` + novo modal; guardar em `cfg`/`notas` (`avaliacoesAnteriores`); `dados.ts` `sincronizarDoc` precisa aceitar a chave | M | M |
| U7 | Arrastar na Semana + modal "Mover meta" (parcial, valida data/páginas/capacidade) | `renderSemana`, novo `abrirKanban`; chama `calcularDomino` (já em motor28.ts) via `Motor28`; `Estado` | G | A (mexe em datas; precisa de testes do dominó e de `fixos`) |
| U8 | "Não realizada" com reagendamento automático para próxima data da mesma família | `marcar(id,'missed')` + `Motor28.calcularDomino`; `reorganizar` | M | M |
| U9 | PDFull parcial por página/total e LegProc parcial por artigo (saldo 20 min) | `formParcial`, `perguntaParada`, `concluirMeta`; motor `remanejadas`/`paginasLidas` já existem em `montarCfg` | M | M |
| U10 | Organizar atrasadas com dominó (substituir `reorganizar`) | `reorganizar`, `data-acao="reorg*"`; Hoje `renderHoje` | M | M |
| U11 | Oferta de cronograma complementar LegProc | Hoje (`renderHoje`), novo `gerarComplementar`; precisa `pendenciasLegproc` (LP restantes); `lp:` no `gradeValida` já aceito | M | M |
| U12 | "Próximos dias" com lei + artigos | `proximosDias`/`prox` em `renderHoje`; `info()`/`descrever` em `engine.ts` (lei/artigos vêm de `WLP`/`LP`) | P–M | B |
| U13 | Backup JSON | botão novo no cabeçalho (`btn-docx` vizinho); só exporta `S` | P | B |
| U14 | Pausa: registrar retomada como recesso | `retomar` em index.html; `pausarAdaptativo` em `dados.ts` | P–M | B |

### 5.2 Motor (maior parte do esforço)
| # | Diferença | Onde mexer | Esf. | Risco |
|---|---|---|---|---|
| M1 | Faixas de horas 300 (<15h/15–24h/>24h), dias de leitura seg–qui, sexta/sábado revisão+questões, concentração de fim de semana (≥40%, +2h) | `motor28.ts` (`gerarPlanoNucleo`, `perfilSemana`, novo `rotina300`), `engine.ts`; param tenant `rotina300` (flag, padrão off) | G | A |
| M2 | PDFull inteiro, máx. 3 datas, bloco 30min, PDFull adicional >24h | `motor28.ts`; reaproveitar `pdfInteiro218` e `tetoPdfDia` | G | A |
| M3 | Essenciais todas em paralelo + complementar entra na vaga + avanço desigual | `motor28.ts` (seleção/rodízio de disciplinas; hoje param `paralelo`) | G | A |
| M4 | Semana especial 3.0 (pares PDFlash externo + tema estudado, 49/50/70/71%, corte na segunda, cursor cronológico, 1 objetivo por PDFull dividido) | `engine.ts` (`rankingRevisao218`, `planoRevisao`), `estado.ts` `montarRevisao`/`indexar`, `snapshot.ts`; novos ids `pf:i:revisao:s`, `fl:i:revisao:s` | G | A |
| M5 | Jurisprudência: obrigatória com ≥14h30 efetivas; mensagem de insuficiência | `motor28.ts` `reservarJuris219`; param `jurisprudencia219` → modo "sempre" | M | M |
| M6 | Diagnóstico histórico sempre ativo (2/3 metas), reforços `pf:i:reforco:s`/`fl:i:reforco:s`/`qu:i:hist:s` | `motor28.ts`; `historicoDiagnostico219` já cobre parte; alinhar limiares (<50 PDFull, 50–70 PDFlash, ≥70 fim) | M | M |
| M7 | Horizonte 600 semanas e erro de insuficiência explícito | param `maxSemanas` (cap 520 em `params.ts`: ajustar para 600); `motor28.ts` | P | B |
| M8 | LegProc: até 4 no dia / até 2 da mesma lei, conjugado | já coincide com `lpMetasDia`, `lpMesmaDisc`; revisar agrupamento visual | P | B |

### 5.3 Persistência / backend
| # | Diferença | Onde mexer | Esf. | Risco |
|---|---|---|---|---|
| P1 | Novos ids de meta (`pf:i:reforco:s`, `fl:i:revisao:s`, `qu:i:hist:s`, `rf:s:i`) | `ID_META` regex em `dados.ts` (já aceita `[A-Za-z0-9:_-]{1,60}`), CHECK `chk_cron_adapt_pm_tipo` (migr. 20261106040000/050000), `descrever` em `engine.ts` e `plano-metas.ts`, `snapshot.ts`, `liberacao.ts` (pf/fl com sufixo não devem virar "aula" duplicada), `docx-adapter.ts` | M | M |
| P2 | Params novos por tenant (rotina300, semana especial 3.0, jp obrigatório, paralelo off) | `params.ts` + `config-metas.ts` + `metas-client.tsx` (novo bloco "Versão 3.0"), + `normalizarParams`; migração não é necessária (jsonb `tema`) | M | B |
| P3 | Migração de planos existentes | NÃO regenerar (política); aplicar 3.0 só a planos novos/recalculados com flag do tenant | P (decisão) | A se esquecido |
| P4 | Testes | `scripts/_equiv-motor.mjs`, `_ac-motor.mjs`, `_regras218.mjs`, `_juris219.mjs` + nova suíte para casos §11 do spec (10h/14h30/15h/24h/24h30, 49/50/70/71%, LegProc parcial 20 min); invariante "flag off = plano idêntico" | M–G | B |

## 6. Ordem recomendada
1. **Sem tocar no motor (baixo risco):** U2, U1, U13, U12, U14, M7, parte de U3 (aceitar 4/6/8, manter legado 10/12), P2 (bloco de params novo, sem efeito).
2. **Validações de rotina atrás de flag de tenant:** U4 (10h/2h) + remoção de 1h — só para planos novos/recalculados.
3. **Fluxos de execução:** U8–U11 (Não realizada, parcial, organizar, complementar) usando `calcularDomino` já existente.
4. **Motor 3.0 atrás de flag `motor300` por tenant (padrão off):** M1→M2→M3→M4→M5/M6; só então U5 (remover perguntas de segundo PDFull/paralelo, quando flag ligada).
5. **U7 (arrastar na Semana)** por último — depende do dominó estabilizado e de P4.

## 7. Riscos transversais
- Regenerar planos: o HTML 3.0 regenera na migração; aqui nunca (706 planos, mudaria datas de alunos).
- Fonte do ritmo: `velPadrao` por tenant coexiste com `VEL_PADRAO=17` (iguais por padrão).
- Divergência spec x HTML 3.0: spec cita "player de vídeo no PDFull" mas o HTML não tem; não tratar como requisito do iframe.
- Admin local do 3.0 (catálogo no localStorage) conflita com o catálogo por tenant em banco: não portar.
- `iframe`/Curseduca: modais `window.confirm` (U2) e `<input type=date>` funcionam em iframe, mas `confirm()` pode ser bloqueado por sandbox sem `allow-modals`; preferir confirmação inline (padrão `CONF` já usado em `zerar`/`gerar`).
- Não verifiquei por execução: nome de lei/artigos em "Próximos dias", saldo de 20 min no LegProc parcial, gravação de recesso na retomada; marcados "verificar".

---
# Relatorio: rel-catalogo

# Relatório: catálogo e persistência do Cronograma Adaptativo 3.0 x plataforma

Somente leitura. Scripts gravados só no scratchpad (pasta `...\scratchpad\`):
`ext.mjs` (extrator de literais do HTML), `cmp.mjs`, `c2.mjs` ... `c6.mjs` (comparações) e `imp\` (cópia do importador apontando para saída temporária).
Reproduzir: `cd <scratchpad>; node cmp.mjs; node c2.mjs; node c3.mjs; node c4.mjs; node c5.mjs; node c6.mjs`.

## 0. Conclusão curta

1. O catálogo embutido no HTML 3.0 é o MESMO catálogo autorizado 2.18 que a plataforma já importou. O id da fonte é idêntico: `planilhas-e935254383d8` (HTML) = `catalogo-html.json` da plataforma.
2. Contagens iguais: 24 disciplinas ativas, 268 aulas ativas (277 posições), 622 metas LegProc (81 leis), 81 PDFights.
3. A única diferença de dados é formatação: o número da aula passa a ter 2 dígitos (`"1"` vira `"01"`) em 153 aulas e nos 81 PDFights. Conteúdo, links, páginas, ordem editorial, ordem das LP e materiais são idênticos.
4. O importador existente (`importar-cronograma-html.mjs`) FUNCIONA com o HTML 3.0 sem alteração. O formato dos blocos não mudou.
5. O que muda de verdade na 3.0 é o estado e a persistência (seção 3): metas de revisão especial com ids novos de 4 segmentos, `detalhesMetas` e marcadores de regra. A plataforma hoje DESCARTA o que não está na lista do `sincronizarDoc`.
6. Risco maior: trocar o id do catálogo faz `migrarPlano` regenerar os planos sozinho no próximo acesso (seção 4). Reimportar o 3.0 NÃO muda o id, então não dispara isso.

## 1. Arquivos recebidos

- `01_Comportamento_Completo_Cronograma_3.0.md` (171 linhas) e `Cronograma_Adaptativo_3.0.html` (3,1 MB, 3.863 linhas) foram lidos.
- `02_Catalogo_Completo_Cronograma_3.0.md` NÃO foi enviado. A seção 10 da spec diz que "o arquivo de catálogo traz os registros e as exceções". Sem ele, as exceções foram inferidas do próprio HTML (`CATALOGO_PLANILHAS.avisos/pendentesLegProc/semPlanilhaPdfull`, `CATALOGO_BASE218`, `sanearCatalogo218`).
- Blocos gigantes do HTML (nunca impressos inteiros):
  - linha 523: `DADOS` (base legada 2.8: `AS` 269 posições, `WLP` 51)
  - linha 846: `_MB64` (1,6 MB, template DOCX em base64)
  - linha 2601: `CATALOGO_PLANILHAS` (521 KB): `aulas` 265, `legprocs` 622, `apoio` 81, `resumo` 34, `avisos` 1
  - linha 3729: `CATALOGO_BASE218` (511 KB): `aulas` 277, `ordem` 268, `legprocs` 622, `ordemLP` 622, `materiais` 265, `pdfights` 81
  - também: `ESSENCIAIS` (9), `COMPLEMENTARES` (10), `AGU` (4 grupos), `COR`, `SEM_FLASH` (5)

## 2. Diferença de catálogo

### 2.1 Contagens (HTML 3.0 x `apps/web/lib/cronograma/adaptativo/catalogo-html.json`)

| Item | HTML 3.0 | Plataforma | Igual? |
|---|---|---|---|
| id da fonte | planilhas-e935254383d8 | planilhas-e935254383d8 | sim |
| disciplinas ativas | 24 | 24 (+ Direitos Humanos retirada = 25 no arquivo) | sim |
| aulas ativas (`ordem`) | 268 | 268 | sim (hash de `ordem` idêntico) |
| posições em `aulas` | 277 (9 nulas) | 277 (9 preenchidas mas fora de `ordem`) | equivalente |
| LegProc | 622 em 81 leis (30 min cada) | 622 | sim (hash idêntico) |
| ordem das LP (`ordemLP`) | 622 | 622 | sim |
| PDFights (`apoio`) | 81 | 81 | sim, exceto zero-pad do número |
| materiais (PDFlash/PDFight páginas, atualização) | 265 | 265 | sim (0 diferenças) |
| essenciais / complementares / AGU | 9 / 10 / 4 grupos | iguais | sim |
| PDFulls essenciais | 191 aulas (10.310 páginas) | idem | sim (bate com a spec: "191 aulas essenciais") |
| complementares / AGU | 60 / 17 aulas | idem | sim |
| páginas totais | 14.442 | 14.442 | sim |

Por disciplina (aulas ativas): Const 31, Adm 31, Trib 31, PC 28, Civil 27, Ambiental 13, Trabalho 11, Proc. Trabalho 11, Empresarial 9, Financeiro 8, Internacional 8, Proc. Penal 7, Previd. 6, Prev. Público 6, Urbanístico 6, Penal 6, Econômico 6, Leg. Penal Especial 6, Agrário 5, Consumidor 3, Ensino 3, AGU 3, Eleitoral 2, Int. Privado 1.

### 2.2 IDs estáveis

- No HTML o id da aula é a POSIÇÃO em `aulas` (`pf:<i>`, `fl:<i>`, `qu:<i>`). As posições são as mesmas do JSON da plataforma (comparação índice a índice: 0 diferenças de conteúdo).
- LegProc no HTML: `lp:1:<índice em legprocs>`. Na plataforma: `lp:<chave-da-lei>:<n>` (textual, gerado em `conteudo-banco.ts:323`) e legados `lp:<s>:<j>`. Os esquemas NÃO são intercambiáveis. A plataforma deve manter o seu.
- Na plataforma, `pf:<i>` do plano usa o índice do `AS` montado a partir da Biblioteca (`conteudo-banco.ts`), e o catálogo HTML apenas enriquece (páginas, links, ordem). Reimportar o catálogo não altera esses índices porque o importador usa o JSON atual como base (`mesclarPlanilhas`).

### 2.3 Aulas retiradas e adicionadas

- Retiradas (nulas no HTML, posições reservadas): índices 115, 119, 123, 124 (Processo Civil 29, 30, 31, 32) e 270 a 274 (Direitos Humanos 1 a 5). Na plataforma continuam no JSON, mas fora de `ordem` (não ativas); `disciplinaRetirada('direitos humanos')` cobre as 5 de DH.
- Adicionadas: nenhuma. `0 aulas novas` no teste do importador. Entre o `DADOS.AS` legado e o catálogo 2.18 há ajustes de tema já absorvidos (PC 12 e 13 viram "(Parte 1)", PC 04 do Trabalho, Prev. Público 05, Leg. Penal Especial "EXTRA", 3 aulas de Legislação da AGU sem planilha).

### 2.4 Ordem editorial

`ordem` e `ordemLP` idênticas (hash a56eb55941 e fbf169f154). Padrão do rodízio: Const, Adm, Trib, PC, Const, Adm, ... (as 4 maiores intercaladas).

### 2.5 Links repetidos (a preservar, são "autorizados")

- QConcursos: 15 grupos de aulas com o mesmo link (34 aulas). Exemplos: PC 05/06, PC 07/08, Const 14/15, Trib 16/17/18, Trib 21/22/23, Trib 28/29/30, Econômico 04/05/06, Empresarial 01/02, 03/04, 07/08, Civil 20/21, Ambiental 04/05, Prev. 03/04, PC 24/25, PC 27/28.
- TEC: 5 grupos (12 aulas): Trib 16/17/18, Trib 22/23, PC 23/24/25, Ambiental 04/05, Civil 23/24.
- Metadados ausentes (aulas ativas): sem QC = 15 (PC 09, 20, 23; Trib 26, 27; Proc. Trabalho 02, 04, 09, 10, 11; Prev. Público 03; AGU 01 a 03; Urbanístico 05). Sem TEC = 11 (PC 04, 09, 20, 21, 22; Trib 25, 26, 27; AGU 01 a 03). Páginas = 0: só as 3 de Legislação da AGU (`semPlanilhaPdfull`).
- Nenhuma dessas ausências muda entre as versões. O importador atual não deduplica links nem preenche vazios.

### 2.6 Cobertura LegProc (real)

- LP por disciplina: Adm 101, Tributário 85, PC 82, Civil 78, Constitucional 60, Ambiental 54, Trabalho 43, Empresarial 32, Financeiro 28, Previdenciário 24, Urbanístico 23, Consumidor 12 (12 disciplinas, 81 leis).
- Sem LP: Processo do Trabalho (essencial, listada em `pendentesLegProc`), complementares Agrário, Econômico, Penal, Proc. Penal, Leg. Penal Especial, Prev. Público, e as 5 de AGU (Eleitoral, Int., Int. Privado, Ensino, Leg. AGU).
- Aviso do catálogo: `aba_com_nome_incorreto` (arquivo `LegProc_Previdenciário_Metas.xlsx`, aba "LegProc - Civil"): vínculo pela coluna Disciplina/arquivo.
- PDFights por disciplina: PC 32, Adm 25, Proc. Penal 9, Leg. Penal Especial 6, Prev. Público 5, Econômico 4.
- Extra do 3.0 não importado hoje: `legprocs[].ordemLei`, `numeroMeta`, `origem{arquivo,aba,linha}` e `materiais[].links[]/origem`. O importador descarta de propósito (saída compacta). Não afeta o motor.

## 3. O importador funcionaria com o HTML 3.0?

Sim. Teste feito em cópia no scratchpad (a base `anterior` = cópia do JSON atual; o arquivo real da plataforma NÃO foi tocado):

```
node <scratchpad>\imp\scripts\importar-cronograma-html.mjs "C:/Users/joooa/Downloads/cronograma 3.0/Cronograma_Adaptativo_3.0.html"
-> fontes planilhas-e935254383d8 (antes: planilhas-e935254383d8) · 277 aulas (268 ativas) · 622 metas LegProc · 81 apoio
-> 0 aulas novas · 153 aulas alteradas · 0 metas de LegProc novas
node c4.mjs   # diff semântico antes x depois
-> campos (disc, tema, páginas, QC, TEC) 0 diferenças; ordem, ordemLP, legprocs, materiais, grupos, cores, semFlash IGUAIS;
   as "153 alteradas" são só o número com zero à esquerda ("1" -> "01"); apoio idem (42 números).
```

- Formato dos blocos: `literal()` achou `DADOS`, `CATALOGO_PLANILHAS`, `ESSENCIAIS`, `COMPLEMENTARES`, `AGU`, `COR`, `SEM_FLASH`. A mescla do 3.0 (`mesclarPlanilhas`, linha 2608) é a mesma transcrita no importador, com uma diferença: o 3.0 compara número com `formatarNumeroAula` (padding) e ignora aulas nulas (`x&&x[0]===...`). O importador compara com `chaveCatalogo(x[1])` (sem padding). Hoje casa por tema primeiro, então não duplica; mas se um tema mudar e o número tiver padding diferente, o casamento por número pode falhar.
- Pendências recomendadas (para quem for implementar, não feito aqui):
  1. Ao importar, aplicar a regra do 3.0 `formatarNumeroAula` ou normalizar ao comparar, e decidir se grava "01" (cosmético: `AS[i][1]` e `plano_meta.aula` mudam de "1" para "01"; `numeroAula()`/`Number(x.numero)` seguem funcionando, "01.1" continua NaN como "1.1").
  2. O importador não aplica `sanearCatalogo218` (anular PC 29 a 32 e DH). Na plataforma isso já está coberto por `ordem` + `RETIRADAS`. OK.
  3. O 3.0 remove `videoaula` dos materiais (`limparCampos218`); o importador grava `videoaula:null`. Sem efeito.
  4. Corretor de texto do 3.0 (`corrigirTexto218`: "Rersponsabilidade" etc., "Art, 442", "Art; 674", parêntese da LC 225/26): os 622 textos de LP do HTML já vêm corrigidos? Hash dos LP é idêntico ao da plataforma, então a plataforma já está corrigida/igual. Nada a fazer.
- Após importar, o `id` continua `planilhas-e935254383d8`. Se o JSON mudar mas o id não, `migrarPlano` NÃO roda (compara só o id). Bom para planos existentes, mas o catálogo novo só vale para planos gerados depois.

## 4. Persistência e estado: 3.0 x plataforma

### 4.1 Chaves e canais

| Item | HTML 3.0 | Plataforma |
|---|---|---|
| chave local | `rej-cronograma-v3-0`; leitura de legadas desde `rej-cronograma-v2-19` até v2-5 | iframe usa `rej-cronograma-v2` (nome único) e sincroniza por API (`POST acao:'sync', parte`) |
| canal da nuvem | docs `estado-v300`, `progresso-v300`, `notas-v300` com fallback `-v219` | banco: `simulado_cronograma_adaptativo_plano` (cfg, plano, fim, revs, pausa, exemplo, extras) + `_meta` (progresso) + `_plano_meta` (espelho) |
| `estado` | cfg, plano, fim, reorgs, revs, pausa, perfil, exemplo + marcadores de regra + `detalhesMetas` + `catalogo` + `arquivoCatalogo218` + `catalogoMigrado` + `legprocAnterior` | só cfg, plano, fim, revs, pausa, exemplo, titulo (`sincronizarDoc`, `dados.ts:~455`) |
| `progresso` | prog, log | prog + extras (log não existe) |
| `notas` | notas | notas |

Marcadores de regra do 3.0 (campos de `estado`): `regraRotina300`(3), `regraJuris219`(1), `regraCatalogo218`(1), `regraPDF216`(1), `regraRevisao216`(3), `regraMotor`(216), `regraLiberacaoPDF`(215), `regraRodizioPDF`(214), `regraEssenciais`(213), `regrasVersao`(26), `complementarLegproc`. Quando algum diverge, o 3.0 REGENERA o plano ao abrir (linha 1105, só fora de `exemplo`). Na plataforma o equivalente é `cfg.motor`/`cfg.catalogo` (`VERSAO_MOTOR='2.8.1'`) mais os switches por tenant em `params` (`revisaoPorResultado218`, `jurisprudencia219`).

### 4.2 Campos de cfg novos no 3.0 (ausentes do motor/iframe da plataforma)

- `cfg.reforcosHistorico` (reforço do diagnóstico histórico) e `cfg.paginasReforco` (páginas lidas por objetivo de reforço, por id pai).
- `cfg.legprocs` (apareceu na varredura; verificar uso antes de decidir).
- Já existem na plataforma: `historicoQuestoes`, `jaEstudaRevisao`, `ultimosTemas`, `horasPontuais`, `remanejadas`, `paginasLidas`.

### 4.3 Identidades de meta (spec seção 10)

| Id | Significado | `ID_META` da plataforma (`/^(pf\|pp\|fl\|qu\|lp\|rf\|rq\|jp):[A-Za-z0-9:_-]{1,60}$/`) | Parse em `plano-metas.descrever` / `engine.descrever` |
|---|---|---|---|
| `pf:i`, `fl:i`, `qu:i` | regular | aceita | ok |
| `pp:i:k` | segmento físico de PDFull (detalhe aponta para o objetivo pai) | aceita | `parte` = k, aula = i: ok |
| `qu:i:hist:s` | questões do diagnóstico histórico | aceita | aula = i ok; `s` (semana) perdida |
| `pf:i:reforco:s`, `fl:i:reforco:s` | reforço do diagnóstico | aceita | aula = i ok; `s` perdida |
| `pf:i:revisao:s`, `fl:i:revisao:s` | releitura/PDFlash adaptativos da semana especial | aceita | aula = i ok; `s` perdida |
| `rf:s:i`, `rq:s:i` | PDFlash de essencial externa / questões especiais (legado) | aceita | já tratado (`rf/rq: sem:aula`) |
| `lp:1:i` | LegProc com índice de catálogo | aceita, mas a plataforma usa `lp:<chave>:<n>` | não equivale |
| `jp:s` | jurisprudência semanal | aceita | ok |

Todos os prefixos novos já estão no CHECK. Nenhum id novo é rejeitado na gravação.

### 4.4 Detalhes de revisão especial (o que precisa persistir)

No 3.0, `S.detalhesMetas[id]` guarda por meta de revisão especial (`montarSemanaEspecial`, linha ~3668):
`semanaRevisao:true`, `semanaOrigemRevisao` (s), `ordemAlternancia` (inteiro, usado na ordenação da Semana e na reorganização), `essencialNaoSelecionada` (pertencimento ao grupo: externas x estudadas), `material` ('PDFull' | 'PDFlash' | 'Questões'), `reforco` (bool), `pai` (id do objetivo), `origem` (origem do resultado, vem de `x.resultado.origem`), `percentualOrigem` (pct do resultado: 49, 50, 70, 71...), e para PDFull em parcelas `paginaInicio`, `paginaFim`, `totalPaginas`, `continuacao`. Também `deslocada`, `artigo` e `geracao` (dominó/remanejamento).

Não dá para recompor tudo a partir de `plano` e `notas`: `origem`/`percentualOrigem` dependem do resultado vigente na geração e a spec diz que resultado feito DURANTE a semana especial só entra em semanas posteriores. Logo precisam ser gravados.

Hoje na plataforma:
- Não existe `detalhesMetas` em nenhum lugar do repositório (grep zerado). `calcularDomino` recebe `detalhes` só em memória (a partir de `cfg.remanejadas[id].detalhe`, persistido em `adaptativo_plano_remanejada.detalhe jsonb`).
- `sincronizarDoc('estado')` descarta `detalhesMetas`, `reorgs`, `perfil`, `regra*`, `catalogo`, `arquivoCatalogo218`.
- `revs` (semanas congeladas) tem outro formato (`[id, data][]`), e o 3.0 coloca as metas especiais no próprio `plano`.

### 4.5 O que exigiria migração

| Item | Precisa? | Detalhe |
|---|---|---|
| CHECK `chk_cron_adapt_pm_tipo` (`pf,pp,fl,qu,lp,rf,rq,jp`) | NÃO | os prefixos dos ids novos já estão cobertos. Não há tipo novo (`revisao/reforco/hist` são sufixos). |
| `ID_META` em `dados.ts` | NÃO | aceita 4 segmentos até 60 chars. |
| `UNIQUE (plano_id, meta_id)` | NÃO | ids novos são únicos. |
| Coluna para `detalhesMetas` | SIM, para o 3.0 completo | opção A: `detalhes jsonb` em `simulado_cronograma_adaptativo_plano` (cache do motor, simples, entra no `COLS_PLANO` e no `sincronizarDoc`). Opção B (dual-write, padrão do projeto): `detalhe jsonb` + colunas promovidas em `..._plano_meta`: `pai text`, `material text`, `origem text`, `percentual_origem numeric`, `ordem_alternancia int`, `semana_origem int`, `grupo_externo bool` (essencialNaoSelecionada), `parte`, `pagina_inicio/fim`, `total_paginas`, `continuacao bool`. |
| `parte` na `plano_meta` | ajuste de código | `descrever` só preenche `parte` para `pp`; `semana_origem` dos ids de 4 segmentos hoje fica nula. |
| Marcadores de regra do 3.0 | opcional | mapear para `cfg`/`params` (ex.: `cfg.regraRotina300`). Sem coluna, vão dentro do `cfg` jsonb, que já é persistido integralmente. |
| `cfg.reforcosHistorico`, `cfg.paginasReforco` | NÃO (jsonb) | `cfg` é gravado inteiro; as filhas `plano_pagina_lida`/`remanejada` só espelham. Se quiser consulta SQL, criar filha tipo `plano_pagina_lida (tipo='reforco')`. |
| `arquivoCatalogo218` (metas retiradas, progresso e notas arquivados) | já coberto de outra forma | a plataforma arquiva por `adaptativo_meta.arquivada` (migr. 20261106040000). Não copiar o objeto do HTML. |
| Chaves `v300/v219` e localStorage | só no iframe | no banco não existem. Se o iframe novo for portado, manter o `POST sync` por parte e ler docs legados do banco (já é o comportamento). |
| Dual-write | sim, para o item "coluna de detalhes" | seguir o padrão de `espelharPlanoMetas`: o JSON continua sendo a fonte lida pelo motor, linhas são espelho. `sincronizarCfg/espelhar` precisam passar `detalhes`. |

## 5. Compatibilidade com os ~706 planos existentes

- Nunca regenerar automaticamente. Pontos que HOJE regeneram sozinhos, a evitar na adoção do 3.0:
  1. `migrarPlano` (`dados.ts:~172`): roda ao carregar quando `cfg.catalogo !== catalogoIdDoTenant()`. O id efetivo é `CATALOGO_HTML.id` ou `...-o<versao>` do overlay do admin. Trocar o id do JSON OU salvar o overlay regenera TODOS os planos do tenant no próximo acesso (recalcula a partir de hoje, mantendo `fixosPreservados`, com backup em storage `cronograma/backup-catalogo/<tenant>/<plano>.json`).
  2. `VERSAO_MOTOR` (`'2.8.1'`) é carimbada em `cfg.motor`. `sincronizarDoc` só carimba o catálogo quando `cfg.motor === VERSAO_MOTOR`; um iframe com motor diferente grava SEM carimbo e o plano migra no acesso seguinte. Ao subir o motor 3.0, não mudar `VERSAO_MOTOR` sem plano de migração controlado.
  3. O 3.0 do HTML regenera por conta própria quando um `regra*` diverge. Esse comportamento NÃO deve ser portado como automático.
- Reimportar o catálogo 3.0 mantendo `id` e índices: seguro. Planos existentes não são alterados. Só mudam o label do número da aula (cosmético) e, se o motor 3.0 for ligado, aplica-se apenas a planos NOVOS ou a regeneração manual.
- Planos antigos continuam válidos no formato novo: ids `pf/pp/fl/qu/lp/rf/rq/jp` já existentes seguem aceitos. `detalhesMetas` ausente é tratado como `{}` (os PDFulls derivam `detalhesPdf(id, plano, detalhes)`). Metas de revisão especial antigas (`rf:s:i`, `rq:s:i` em `revs`) continuam lidas; as novas (`pf:i:revisao:s`, ...) só existem em planos gerados pelo motor 3.0.
- Progresso preservado: `adaptativo_meta` é por `(plano_id, meta_id)` e não muda. Há backup `simulado_cronograma_adaptativo_meta_bkp_20261106`.
- Se as metas especiais novas passarem a viver em `plano` e o front antigo (iframe 2.x) abrir um plano gerado pelo 3.0, as 4-segmentos aparecem como metas pf/fl/qu comuns na aula `i` (parse por `a`), sem a semana de origem e sem alternância. É degradação aceitável, mas a `Semana` do 3.0 precisa de `ordemAlternancia`. Recomenda-se não misturar: ligar o motor 3.0 por flag de tenant (como `jurisprudencia219`) e por plano novo.

## 6. Riscos e recomendações, em ordem

1. Reimportar o catálogo 3.0 é de baixo risco (mesmo id). Rodar com `anterior` = JSON atual e conferir o diff (`c4.mjs`). Decidir sobre o zero-pad do número antes de commitar.
2. Antes de ligar qualquer lógica 3.0 que gere ids de 4 segmentos: criar a coluna/jsonb de `detalhes` e fazer `sincronizarDoc` + `COLS_PLANO` + espelho gravá-la/lê-la; senão `ordemAlternancia`, `origem` e `percentualOrigem` se perdem a cada sync.
3. Ajustar `plano-metas.descrever` para extrair `semana_origem` dos ids `:revisao:`, `:reforco:`, `:hist:` (hoje nula).
4. Não trocar `CATALOGO_HTML.id` nem `VERSAO_MOTOR` junto com essa entrega.
5. Corrigir o importador para comparar número com padding (ou normalizar) e, se desejado, deduplicar/avisar links repetidos e ausentes em log, sem alterar dados.
6. Obter `02_Catalogo_Completo_Cronograma_3.0.md` para confirmar as exceções (aulas retiradas, links repetidos autorizados, páginas ausentes) por fonte e não por inferência.
