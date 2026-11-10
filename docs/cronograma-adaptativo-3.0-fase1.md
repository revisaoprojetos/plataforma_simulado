# Cronograma Adaptativo - Fase 1 (MOTOR) - log

Decisao do usuario: o motor do modelo novo SUBSTITUI o 2.8.1 (sem flag de coexistencia). Planos ja gravados (~706) NAO sao regenerados; so plano novo ou recalculado pelo aluno usa o motor atual.
O identificador do motor (`cfg.motor`, `VERSAO_MOTOR = '3.0.0'`) e carimbo TECNICO: nao aparece em nenhum texto de UI/erro.

## O que foi portado (apps/web/lib/cronograma/adaptativo/motor30.ts, ~700 linhas, modulo puro)
Cadeia efetiva do HTML confirmada: `gerarPlano` (H:3545) -> `gerarPlanoCatalogo` (H:2038) -> `gerarPlanoBase` v2 (H:3274-3441); `rotina300` (H:3823), `semanaRevisao216` (H:3648), `reservarJuris219` (H:3768), `calcularDomino` (H:3795) -> `calcularDomino219Base` (H:2245), `construirRodizioPDF` (H:3069), `unificarPDF216`, `ordemDominoPDF`, `reservarLegprocPDF216`, `registrarReforcos216`, `resultadoTema217`.

- Laco DIA A DIA (`for k < MAX_SEM*7`), faixas de horas (`horas<15`=1, `<=24`=2, `>24`=3), minimo 10h/passo 30min (`validarHoras300`), dias de PDF/revisao, fim de semana concentrado (>=40% das horas ativas e maior >= media util + 2h), aquecimento, adiar leitura para concluir inteira, encaixe semanal (`selecionarPDF`), PDFull no maximo 3 datas, 1 meta de questoes/dia com heranca, segundo PDFull so por conclusao na faixa alta (`limitePDF27`).
- Rodizio por vagas (essenciais; complementar ocupa a vaga e depende da ultima aula; oportunidade extra a atrasada >=15%).
- LegProc: teto 2/dia (4 na faixa alta, 2 leis), fim da fila fecha leis iniciadas e `complementar` (ctx.complementarLegproc) agenda as demais; `pendenciasLegproc()` lista o saldo para a oferta.
- Diagnostico historico sempre ativo (2 ou 3/semana, `qu:i:hist:s` dentro do laco), reforco 50/70 (`registrarReforcos216`).
- Jurisprudencia semanal obrigatoria, limiar 14h30 de disponibilidade efetiva, recesso/pontuais contam.
- Semana especial DENTRO do plano (`rf:s:i` externas + `pf|fl:i:revisao:s` estudadas, `pp:i:k` parcelas, max 3 blocos, alternancia por disciplina, cursor cronologico com rollback de par, corte antes da segunda, <50 PDFull / 50-70 inclusive PDFlash / >70 e sem resultado fora, saldo de objetivos).
- Horizonte 600 semanas; sobra => `ErroInsuficiencia` (codigo `insuficiencia`), nenhum plano truncado.
- Domino: nao realizada (remanejadas), PDFull parcial, LegProc parcial 20min, organizar atrasadas, ajustar horas ate 24h, recesso/pausa, `movida`, `adiantarPDF/LP`. API: `calcularDomino(fonte,cfg,desde,opcoes,AS,LP,ctx)`.
- Periodicidade da semana especial: 4/6/8 (padrao 8); 10/12 sao ACEITAS em planos existentes (`normalizarCada(cada, legado=true)`); invalido => 8.

## Contexto novo (`Contexto30`, no lugar do estado global `S` do modelo)
`prog` (estado/em/t/parou), `hoje`, `planoAtual`, `detalhes`, `complementarLegproc`, alem de `ordem/feitas/usados/params/notas` ja existentes.

## Identidades e colisoes
- `pf|fl:i:revisao:s`: `reforcoHistorico()`/`revisaoAdaptativa()`/`pdfRegular()` (regex completo). Blindagem `startsWith('pf:')` em: `rankingRevisao218`, `temasFracos`, `novosPDFDia27`, `detalhesPdf` (motor28.ts, legado), `rankingRevisao` (engine.ts) e `estudadas216/rankingRevisaoBase/detalhesPdf` (motor30). O HTML cru usa `startsWith('pf:')` em `estudadas216`: um PDF de releitura concluido volta como "tema estudado" e DUPLICA o tema na fila (visto no diferencial: pf:6 e pf:1 repetidos, rollback do 3o par). A referencia do teste recebe a mesma blindagem (`extrairMotorHtml({semBlindagem:true})` roda o HTML cru).
- `rf:s:i` (colisao): continua com o mesmo formato. Sem `detalhes.essencialNaoSelecionada`, e externa somente se a disciplina da aula `i` NAO esta em `cfg.discs`; flashcard legado de tema estudado (disciplina selecionada) nao e tratado como externo. `rq:s:i` e lido como evidencia (resultadoTema217) mas nao e mais gerado.
- ids `jp:s`, `qu:i:hist:s`, `pf|fl:i:reforco:s`, `lp:*` inalterados (dados.ts `ID_META` e o CHECK por prefixo aceitam os novos ids; liberacao.ts/plano-metas.ts leem `p[1]`=aula).

## Planos existentes - NAO regenerar (regra 1)
- motor28.ts permanece como LEGADO (so tipos/regex de blindagem, `remanejadasEfetivas` e `proximoEstudo` exportados).
- `dados.ts migrarPlano` so dispara por mudanca de `cfg.catalogo` (nao por VERSAO_MOTOR). Agora: plano com `cfg.motor` sem prefixo `3.` migra pelo motor LEGADO (`ctx.legado`) e mantem o carimbo antigo; plano ja gravado com o motor atual migra pelo atual. `engine.ts gerarPlano` usa o motor atual por padrao; `planoUsaMotorAtual(cfg.motor)`.
- `sincronizarDoc` carimba o catalogo apenas para planos do motor atual (iframe antigo em cache continua no caminho antigo).
- iframe: `public/cronograma/adaptativo/motor28.js` e agora o bundle `window.Motor28` = motor atual (+ `Motor28.legado` = 2.8.1). Mesma API usada pelo index.html; o wrapper `gerarPlano` do index.html passa `prog/hoje/planoAtual/detalhes/complementarLegproc`.

## Parametros por tenant (params.ts) - efeito com o motor atual
Honrados: `velPadrao`, `durFl/durQu/durLp/durRf/durRq`, `offsetRevisao/offsetQuestoes`, `semFlash`, `lpJanelaRodizio`, `jurisprudenciaMin` (teto), `maxSemanas` (padrao 600, clamp 20-600).
DEPRECATED (sem efeito, colunas mantidas): `tetoPdfDia` (regra e 1/dia, 2o so por conclusao), `concentracaoAteH` (substituido pela concentracao de fim de semana), `lpMetasDia/lpDiscDia/lpMesmaDisc` (fixos 2/dia, 4 na faixa alta), `usarDesempenhoNoPlano/pesoDesempenho` (antecipar fracos no plano), `pdfInteiro218`, `revisaoPorResultado218`, `historicoDiagnostico219`, `jurisprudencia219` (agora sempre ativos), `cfg.paralelo` (substituido pelo rodizio por vagas). Extensao mantida: reforco de disciplina sem PDFlash (SEM_FLASH) vira PDFull.

## Testes (apps/web/scripts)
- `_motor30-diferencial.mjs`: extrai o motor do HTML (parser do TypeScript + vm, sem imprimir) e compara plano/fim/detalhes com o TS. 29 cenarios: 10h, 14h30, 15h, 24h, 24h30, fim de semana concentrado (2), sem sexta/sabado, recesso de semana inteira, 9 essenciais (3 faixas), essenciais+complementares, revisao 4/6/sem, sem fl/qu, sem lp, rotina trocada, horas pontuais, historico (2), semana especial com 49/50/70/71/sem resultado (5 variantes incl. periodicidade 4 e 9 essenciais), LegProc complementar. Resultado: 29/29 identicos.
- `_motor30-dominio.mjs`: dominio (organizar atrasadas, reduzir/aumentar horas, ajustar dia 24h, recesso, movida, nao realizada, LegProc parcial 20min, PDFull parcial, faixa alta, semana especial+reducao) + insuficiencia: 12/12 identicos.
- `_motor30-homologacao.mjs`: 14 casos da secao 11 da especificacao + compatibilidade legada (10/12, blindagem de ids, rf legado, horizonte, erro de insuficiencia): 52/52.
- `pnpm cronograma:testar` (inclui os 3 novos): legado 14+25+15+22+24 aprovados (nenhum teste do 2.8.1 precisou mudar: o motor 2.8.1 foi preservado como legado; alteracao em motor28.ts = so tipos, 2 exports e regex de blindagem sem efeito nos planos), diferencial 29/29, dominio 12/12, homologacao 52/52. `pnpm cronograma:motor` OK (bundle + cache-buster). `tsc --noEmit` do apps/web: 0 erros.

## Divergencias (zero no plano; explicadas)
1. Blindagem de `pf:` (acima) - correcao deliberada, aplicada tambem na referencia do teste.
2. `ultimosTemas`: HTML = id da aula; plataforma = posicao (0-based) - o teste converte.
3. Server-side nao persiste `detalhes` da semana especial, data de conclusao (`em`) nem `cert`: ao recalcular no servidor o motor usa a data planejada e `acertos = res - err`. Impacto: ordem de alternancia/objetivos anteriores podem ser recompostos de forma ligeiramente diferente de um plano que ficou so no iframe.
4. `pausa/retomar` e arrastar na semana (Kanban) sao de UI: nao portados nesta fase (o dominio com `movida` esta pronto e testado).

## Fase 2 (fica para depois)
- UI do iframe: faixas/minimo 10h no seletor (sem 1h), periodicidade 4/6/8 (padrao 8) + confirmacao ao desativar, tutorial, oferta de LegProc complementar (usar `pendenciasLegproc` + `ctx.complementarLegproc`), "Nao realizada"/parciais usando `calcularDomino`, organizar atrasadas e ajustar horas pelo dominio (hoje o iframe regenera com `gerarEstado`), arrastar na Semana, backup JSON, mensagem de insuficiencia (`ErroInsuficiencia`) na tela.
- Semana especial na UI: o iframe ainda monta `S.revs`/`RV` (index.html ~950-977); passar a ler as metas `rf/pf/fl:*:revisao:*` do plano e remover a montagem antiga para planos novos.
- Persistencia: coluna `detalhes jsonb` (+ dual-write em plano-metas.ts) com `semanaRevisao, semanaOrigemRevisao, ordemAlternancia, essencialNaoSelecionada, material, origem, percentualOrigem, reforco, pai, geracao`; data de conclusao e `cert` nas metas.
- Liberacao de conteudo das essenciais EXTERNAS (`rf:s:i` de disciplina nao selecionada): liberacao.ts hoje resolve a aula pelo indice mas o acesso do aluno e por disciplina/produto.
- Admin params: marcar os parametros deprecated e subir o limite de `maxSemanas` na tela (feito: 600), esconder os campos sem efeito.
- Estatisticas/snapshot: tratar `pf|fl:i:revisao:s` como "revisao adaptativa" (rotulo), nao como PDFull regular.
