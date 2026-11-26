/**
 * MAPA DO MOTOR — catálogo navegável de TODAS as regras/parâmetros de `RegrasMotor` (nome, o que é, onde o motor aplica, camada da
 * precedência, impacto, testes que cobrem e onde editar), com o valor padrão × vigente.
 *
 * Módulo PURO (sem 'server-only', sem zod, sem I/O). `METADADOS_MAPA` é a tabela por caminho COM curingas (`faixas.*.tetoPdf`,
 * `prioridades.porTipo.*`, `restricoes`); `montarMapa(regras)` expande contra as regras vigentes (uma linha por folha real).
 * O teste `__tests__/mapa-motor.test.ts` FALHA se uma folha nova de `RegrasMotor` ficar sem entrada aqui, e confere que os
 * arquivos/funções citados em `onde` existem.
 */
import { REGRAS_PADRAO, type RegrasMotor } from './regras'
import { FAIXAS_PADRAO, ROTULO_MODO_QUESTOES, ROTULO_MODO_REVISAO, type FaixaCarga } from './faixas-carga'
import { TIPOS_META, SLUGS_META } from './tipos-meta'
import { descreverRestricao } from './restricoes'
import { formatarValor, lerCaminho } from './regras-campos'

export type TipoParametro = 'limite' | 'limiar' | 'prioridade' | 'interruptor' | 'restricao' | 'constante'
export const TIPOS_PARAMETRO: readonly TipoParametro[] = ['limite', 'limiar', 'prioridade', 'interruptor', 'restricao', 'constante']
export const ROTULO_TIPO_PARAMETRO: Readonly<Record<TipoParametro, string>> = {
  limite: 'Limite', limiar: 'Limiar', prioridade: 'Prioridade', interruptor: 'Interruptor', restricao: 'Restrição', constante: 'Constante',
}
export const GRUPOS_MAPA = ['Horizonte', 'Faixas', 'Revisão', 'Limites por dia', 'Divisão', 'LegProc', 'Desempenho', 'Reta final', 'Juris', 'Histórico', 'Rotina', 'Rodízio', 'Equilíbrio', 'Prioridades', 'Adaptação', 'Constantes', 'Restrições', 'Tipos personalizados'] as const
export type GrupoMapa = (typeof GRUPOS_MAPA)[number]

/** As 8 camadas da precedência (mesmos nomes do diagrama "Precedência" da aba Fluxo). */
export const NOMES_CAMADAS: readonly string[] = [
  'Preservar execução registrada', 'Dependências e ordem editorial', 'Limite diário e leitura na mesma semana',
  'Faixa, semana de revisão, reta final e Jurisprudência', 'Continuação aberta e leituras inteiras', 'Revisão e questões elegíveis',
  'Reavaliar a sobra para um PDFull inteiro', 'LegProc na sobra',
]

export interface OndeAplicado { arquivo: string; funcao: string }
export interface MetaCampo {
  nome: string; descricao: string; tipo: TipoParametro; grupo: GrupoMapa
  ondeAplicado: OndeAplicado[]
  /** Só dados (rótulo/identificador sem efeito no cálculo): dispensa `ondeAplicado`. */
  soDados?: boolean
  camada: number | null; impacto: string; testes: string[]; href: string
}
export interface EntradaMapa {
  path: string; chave: string; nome: string; descricao: string; tipo: TipoParametro; grupo: GrupoMapa
  valorPadrao: string; valorVigente: string; diferePadrao: boolean
  onde: OndeAplicado[]; camada: number | null; nomeCamada: string | null; impacto: string; testes: string[]; href: string
}

const B = 'lib/cronograma/adaptativo/'
const ARQ = { m30: B + 'motor30.ts', m28: B + 'motor28.ts', fc: B + 'faixas-carga.ts', rg: B + 'regras.ts', rs: B + 'restricoes.ts' } as const
type Pref = keyof typeof ARQ
const on = (...xs: string[]): OndeAplicado[] => xs.map((x) => { const [p, f] = x.split(':'); return { arquivo: ARQ[p as Pref], funcao: f } })

const HREF_FAIXAS = '/admin/cronogramas/adaptativo/faixas'
const HREF_RESTR = '/admin/cronogramas/adaptativo/restricoes'
const HREF_PERS = '/admin/cronogramas/adaptativo/personagens'
const T_GOLD = 'scripts/_golden-motor.mjs'
const T_REG = B + '__tests__/regras.test.ts'
const T_FX = B + '__tests__/regras-faixas.test.ts'
const T_RES = B + '__tests__/restricoes.test.ts'
const T_CAMPOS = B + '__tests__/regras-campos.test.ts'
const T_AR = B + '__tests__/adaptacao-rastro.test.ts'

function d(grupo: GrupoMapa, tipo: TipoParametro, nome: string, descricao: string, impacto: string, camada: number | null, onde: OndeAplicado[],
  o: { href?: string; testes?: string[]; soDados?: boolean } = {}): MetaCampo {
  return { nome, descricao, tipo, grupo, ondeAplicado: onde, camada, impacto, testes: o.testes ?? [T_GOLD, T_REG], href: o.href ?? HREF_FAIXAS, soDados: o.soDados }
}

export const METADADOS_MAPA: Record<string, MetaCampo> = {
  'horizonte.maxSemanas': d('Horizonte', 'limite', 'Semanas planejadas (máximo)', 'Quantas semanas à frente o motor tenta montar o plano.', 'Se a fila de leituras não couber nesse prazo, a geração é rejeitada e nada é gravado. Aumentar permite planos mais longos; reduzir rejeita rotinas leves mais cedo.', null, on('m30:gerarPlano', 'm30:calcularDomino')),

  // ── Faixas de carga ──
  'faixas.*.id': d('Faixas', 'constante', 'Identificador da faixa', 'Código estável da faixa (f1, f2…), usado só para referenciá-la.', 'Sem efeito no cálculo; serve para identificar a faixa em versões e rastros.', null, [], { soDados: true, testes: [T_FX] }),
  'faixas.*.nome': d('Faixas', 'constante', 'Nome da faixa', 'Rótulo exibido para a faixa de carga (ex.: 15h–24h30).', 'Só texto exibido nas telas; não altera o plano.', null, [], { soDados: true, testes: [T_FX] }),
  'faixas.*.minMin': d('Faixas', 'limite', 'Carga mínima da faixa', 'Menor carga semanal (em minutos) que cai nesta faixa; sempre igual ao máximo da anterior + 1.', 'Define a fronteira entre faixas: mudar desloca alunos de uma faixa para outra (teto, revisão e modo de questões mudam).', 4, on('fc:indiceDaFaixa', 'fc:faixaDoTeto'), { testes: [T_GOLD, T_FX] }),
  'faixas.*.maxMin': d('Faixas', 'limite', 'Carga máxima da faixa', 'Maior carga semanal (em minutos) da faixa; a última faixa fica sem limite.', 'Move a fronteira superior da faixa. Rotinas na fronteira passam a seguir as regras da faixa vizinha.', 4, on('fc:indiceDaFaixa', 'fc:faixaDoTeto', 'rg:resolverFaixaCarga'), { testes: [T_GOLD, T_FX] }),
  'faixas.*.tetoPdf': d('Faixas', 'limite', 'Teto de PDFulls novos por semana', 'Quantos PDFulls novos (continuações não contam) o aluno recebe por semana nesta faixa.', 'Aumentar acelera a leitura nova e aperta a agenda; reduzir alonga o plano.', 4, on('m30:tetoInfo300', 'rg:resolverTetoPdf', 'fc:faixaDoTeto'), { testes: [T_GOLD, T_REG, T_FX] }),
  'faixas.*.soRegra23': d('Faixas', 'interruptor', 'Teto só com a regra 23', 'Se ligado, o teto da faixa só vale para planos gerados pelo motor 3.2+; em planos 3.1 a faixa é pulada.', 'Mantém a compatibilidade dos planos antigos; não afeta planos novos.', 4, on('fc:faixaDoTeto'), { testes: [T_GOLD, T_FX] }),
  'faixas.*.equilibra': d('Faixas', 'interruptor', 'Faixa equilibrada', 'Liga os limites do bloco "Equilíbrio" (retornos, questões e PDFlashes por dia) para esta faixa.', 'Ligado: o dia ganha tetos fixos de retornos/questões/PDFlashes; desligado: valem os limites gerais.', 6, on('m30:tetoInfo300', 'm30:gerarPlanoBase30'), { testes: [T_GOLD, T_FX] }),
  'faixas.*.revisaoModo': d('Faixas', 'limiar', 'Modo de revisão', 'Ciclo obrigatório (semana de revisão a cada N semanas) ou semana especial por desempenho.', 'Troca o tipo de semana de revisão que o aluno desta faixa recebe.', 4, on('rg:revisaoEmCiclo', 'm30:gerarPlano'), { testes: [T_GOLD, T_FX] }),
  'faixas.*.cicloSemanas': d('Faixas', 'limite', 'Periodicidade do ciclo (faixa)', 'A cada quantas semanas ocorre a revisão em ciclo nesta faixa; vazio herda o valor global.', 'Ciclo mais curto = revisões mais frequentes e menos leitura nova nas semanas de ciclo.', 4, on('fc:cicloDaFaixa', 'm30:gerarPlano'), { testes: [T_GOLD, T_FX] }),
  'faixas.*.opcoesNovas': d('Faixas', 'limite', 'Opções de periodicidade (faixa)', 'Periodicidades oferecidas ao aluno para a semana especial nesta faixa; vazio herda a lista global.', 'Muda as opções exibidas no questionário para esta faixa.', 4, on('fc:opcoesDaFaixa', 'm30:normalizarCada'), { testes: [T_GOLD, T_FX] }),
  'faixas.*.padrao': d('Faixas', 'limite', 'Periodicidade padrão (faixa)', 'Periodicidade pré-selecionada da semana especial nesta faixa; vazio herda o padrão global.', 'Muda o valor sugerido ao aluno e o usado quando ele não escolhe.', 4, on('fc:padraoDaFaixa', 'm30:semanaRevisao216Base'), { testes: [T_GOLD, T_FX] }),
  'faixas.*.modoQuestoes': d('Faixas', 'limiar', 'Modo de questões', 'Onde as questões regulares caem: só nos dias de revisão, nos dias de revisão e PDFull, ou em qualquer dia.', 'Muda a distribuição diária de questões e a ordem de prioridade (PDFlash antes no modo livre).', 6, on('fc:classeDaFaixa', 'rg:resolverFaixa', 'm30:gerarPlanoBase30'), { testes: [T_GOLD, T_FX] }),
  'faixas.*.overrides': d('Faixas', 'limite', 'Overrides da faixa', 'Parâmetros que esta faixa sobrescreve do padrão global (limites por dia, LegProc, divisão, desempenho, juris, reta final, rotina, equilíbrio, adaptação).', 'Cada override troca o valor global só para alunos desta faixa; vazio = herda tudo.', 4, on('fc:aplicarFaixaEmRegras', 'm30:ativarFaixa'), { testes: [T_GOLD, T_FX] }),

  // ── Revisão ──
  'revisao.cicloSemanas': d('Revisão', 'limite', 'Periodicidade do ciclo (global)', 'A cada quantas semanas há uma semana de revisão obrigatória (padrão das faixas em modo ciclo).', 'Menor = revisões mais frequentes; maior = mais semanas de leitura corrida.', 4, on('fc:cicloDaFaixa', 'm30:gerarPlano')),
  'revisao.opcoesNovas': d('Revisão', 'limite', 'Periodicidades oferecidas (planos novos)', 'Lista de periodicidades da semana especial que o aluno pode escolher em planos novos.', 'Altera as opções do questionário e a validação da escolha.', 4, on('fc:opcoesDaFaixa', 'm30:normalizarCada')),
  'revisao.opcoesLegado': d('Revisão', 'limite', 'Periodicidades só de planos legados', 'Opções preservadas apenas em planos antigos que já as usavam.', 'Garante que planos legados continuem válidos; não aparece para planos novos.', 4, on('m30:normalizarCada', 'm28:ehRev')),
  'revisao.padrao': d('Revisão', 'limite', 'Periodicidade padrão', 'Periodicidade da semana especial usada quando o aluno não escolhe (deve estar entre as oferecidas).', 'Muda o ritmo padrão das semanas especiais.', 4, on('fc:padraoDaFaixa', 'm30:semanaRevisao216Base')),
  'revisao.antecipaMinSemanas.fl': d('Revisão', 'limite', 'Antecipar PDFlash: mínimo após a leitura', 'Semanas mínimas após a leitura para o PDFlash poder ser antecipado na revisão em ciclo.', 'Menor = retorno mais cedo; 0 permite antecipar já na semana seguinte.', 6, on('m30:podeAnteciparRetorno300')),
  'revisao.antecipaMinSemanas.qu': d('Revisão', 'limite', 'Antecipar questões: mínimo após a leitura', 'Semanas mínimas após a leitura para as questões poderem ser antecipadas na revisão em ciclo.', 'Menor = questões mais cedo no ciclo.', 6, on('m30:podeAnteciparRetorno300')),
  'revisao.giroExternas': d('Revisão', 'limite', 'Rotação das essenciais externas', 'A cada quantas semanas especiais gira a disciplina essencial externa.', 'Controla a variedade de disciplinas externas revisadas nas semanas especiais.', 6, on('m30:semanaRevisao216Base')),

  // ── Limites por dia ──
  'limitesDia.pdfDistintos': d('Limites por dia', 'limite', 'PDFulls distintos por dia', 'Quantos PDFulls diferentes cabem em um dia (parcelas da mesma leitura contam 1).', 'Maior = dia mais carregado de leituras; menor espalha as leituras.', 3, on('m30:cabeTipoNoDia300', 'm30:colocarEstudada', 'm30:textoLimiteDia')),
  'limitesDia.revisoes': d('Limites por dia', 'limite', 'PDFlashes por dia', 'Máximo de PDFlashes em um dia.', 'Maior = retornos se acumulam menos; menor empurra PDFlashes para outros dias.', 3, on('m30:cabeTipoNoDia300', 'm30:semanaRevisao216Base', 'm30:textoLimiteDia')),
  'limitesDia.questoes': d('Limites por dia', 'limite', 'Questões por dia', 'Máximo de metas de questões em um dia.', 'Maior = questões concentradas; menor as distribui por mais dias.', 3, on('m30:cabeTipoNoDia300', 'm30:semanaRevisao216Base', 'm30:textoLimiteDia')),
  'limitesDia.pdfNovosBase': d('Limites por dia', 'limite', 'PDFulls novos por dia (base)', 'PDFulls novos permitidos por dia na regra geral.', 'Maior permite mais leitura nova por dia (respeitando o teto semanal).', 3, on('m30:limitePDF27')),
  'limitesDia.pdfNovosAposConclusao': d('Limites por dia', 'limite', 'PDFulls novos após concluir um (modo livre)', 'PDFulls novos permitidos no dia corrente, após concluir um, no modo de questões livre.', 'Maior deixa o aluno avançar mais quando termina cedo.', 3, on('m30:limitePDF27')),

  // ── Divisão ──
  'divisao.maxDatas': d('Divisão', 'limite', 'Datas máximas por leitura', 'Em quantas datas diferentes uma leitura pode ser dividida.', 'Maior flexibiliza o encaixe de leituras longas; menor força leituras mais inteiras.', 3, on('m30:cabeSaldoNaSemana300', 'm30:colocarEstudada', 'm30:gerarPlanoBase30')),
  'divisao.sobraMinAvancarMin': d('Divisão', 'limite', 'Sobra mínima para iniciar trecho', 'Sobra de tempo (min) necessária para começar um trecho na reta final / revisão obrigatória.', 'Maior evita trechos curtos; menor aproveita sobras pequenas.', 7, on('m30:gerarPlanoBase30', 'm30:calcularDomino219Base')),
  'divisao.janelaLeituraInteiraSemanas': d('Divisão', 'limite', 'Janela para leitura inteira', 'Quantas semanas à frente o motor procura um dia que comporte a aula inteira.', 'Maior busca mais longe (menos divisões); 0 desliga a busca.', 5, on('m30:temDiaInteiro300')),

  // ── LegProc ──
  'legproc.metasDiaMax': d('LegProc', 'limite', 'Metas por dia (2º bloco)', 'Máximo de metas de LegProc no segundo bloco do dia.', 'Maior encaixa mais lei seca na sobra do dia.', 8, on('m30:blocoLP', 'm30:permitirLegproc300')),
  'legproc.metasDiaBase': d('LegProc', 'limite', 'Metas por dia (1º bloco)', 'Metas de LegProc permitidas no primeiro bloco do dia.', 'Maior antecipa lei seca no dia.', 8, on('m30:blocoLP')),
  'legproc.mesmaLei': d('LegProc', 'limite', 'Metas da mesma lei por dia', 'Quantas metas da mesma lei cabem no dia.', 'Maior concentra uma lei em um dia; menor diversifica.', 8, on('m30:blocoLP', 'm30:permitirLegproc300')),
  'legproc.leisDistintas': d('LegProc', 'limite', 'Leis distintas por dia (reagendamento)', 'Quantas leis diferentes cabem no dia ao reagendar.', 'Maior mistura mais leis por dia no dominó.', 8, on('m30:permitirLegproc300')),

  // ── Desempenho ──
  'desempenho.historicoOkMin': d('Desempenho', 'limiar', 'Diagnóstico: acerto que encerra', 'Acerto (%) a partir do qual o tema do diagnóstico histórico é considerado dominado.', 'Maior exige mais acerto para dispensar o tema; mais metas de reforço.', null, on('m30:dadosResultadoHistorico')),
  'desempenho.historicoFlashMin': d('Desempenho', 'limiar', 'Diagnóstico: acerto mínimo para PDFlash', 'Acerto (%) mínimo para o tema virar PDFlash; abaixo disso vira PDFull.', 'Maior manda mais temas para PDFull (releitura completa).', null, on('m30:dadosResultadoHistorico')),
  'desempenho.especialPdfAbaixo': d('Desempenho', 'limiar', 'Semana especial: abaixo disto, PDFull', 'Acerto (%) abaixo do qual o tema volta como PDFull na semana especial.', 'Maior gera mais releituras completas.', 6, on('m30:resultadoTema217')),
  'desempenho.especialFlashAte': d('Desempenho', 'limiar', 'Semana especial: até isto, PDFlash', 'Acerto (%) até o qual (inclusive) o tema vira PDFlash; acima fica fora da revisão.', 'Maior revisa mais temas; menor dispensa mais cedo.', 6, on('m30:resultadoTema217')),
  'desempenho.acertoFracoPct': d('Desempenho', 'limiar', 'Tema "fraco" abaixo de', 'Acerto (%) abaixo do qual o tema é considerado fraco no ranking da semana especial.', 'Maior marca mais temas como fracos, ganhando prioridade na revisão.', 6, on('m30:rankingRevisaoBase')),
  'desempenho.rankingBonusFraco': d('Desempenho', 'limiar', 'Ranking: bônus por acerto fraco', 'Pontos extras no ranking da semana especial para temas de acerto fraco.', 'Maior prioriza temas fracos sobre os demais.', 6, on('m30:rankingRevisaoBase')),
  'desempenho.rankingPesoDistancia': d('Desempenho', 'limiar', 'Ranking: peso da distância ao limiar', 'Quanto a distância ao limiar de acerto pesa no ranking da semana especial.', 'Maior favorece temas mais distantes do limiar.', 6, on('m30:rankingRevisaoBase')),
  'desempenho.rankingPenalidadeRevisado': d('Desempenho', 'limiar', 'Ranking: penalidade de tema já revisado', 'Pontos descontados no ranking de temas já revisados.', 'Maior empurra temas já revisados para o fim da fila.', 6, on('m30:rankingRevisaoBase')),

  // ── Reta final ──
  'retaFinal.semanaMinima': d('Reta final', 'limiar', 'Só após a semana', 'Semana a partir da qual (exclusivo) o plano pode entrar em reta final.', 'Maior adia a reta final; menor a antecipa.', 4, on('m30:faseFinal300')),
  'retaFinal.limiarTetos': d('Reta final', 'limiar', 'Restam ≤ N tetos (até a semana de corte)', 'Reta final começa quando restam no máximo N tetos de PDFull nas leituras pendentes (até a semana de corte).', 'Maior antecipa a reta final.', 4, on('m30:faseFinal300')),
  'retaFinal.limiarTetosApos': d('Reta final', 'limiar', 'Restam ≤ N tetos (após o corte)', 'Mesmo limiar, para depois da semana de corte.', 'Maior antecipa a reta final em planos longos.', 4, on('m30:faseFinal300')),
  'retaFinal.semanaCorteLimiar': d('Reta final', 'limiar', 'Semana de corte entre os limiares', 'Semana que separa os dois limiares de reta final.', 'Move a transição entre os dois limiares.', 4, on('m30:faseFinal300')),
  'retaFinal.semanaEncaixeExtra': d('Reta final', 'limiar', 'PDFull extra pode passar do teto após a semana', 'Após esta semana, um PDFull extra na sobra pode ultrapassar o teto semanal.', 'Maior adia o aproveitamento de sobras; menor o libera mais cedo.', 7, on('m30:gerarPlanoBase30', 'm30:calcularDomino219Base')),

  // ── Juris ──
  'juris.minSemanalMin': d('Juris', 'limiar', 'Carga mínima da semana para Jurisprudência', 'Carga semanal (min) mínima para reservar a meta de Jurisprudência.', 'Maior reserva a meta para menos alunos.', 4, on('m30:reservarJuris219Interno', 'm28:capacidadeRevisao300')),
  'juris.diasPreferidos': d('Juris', 'limite', 'Dias preferidos da Jurisprudência', 'Dias da semana (0 = segunda … 6 = domingo) em que a meta é reservada.', 'Move a meta de Jurisprudência para outros dias.', 4, on('m30:reservarJuris219Interno')),
  'juris.exigeOptIn': d('Juris', 'interruptor', 'Exigir que o aluno marque Jurisprudência', 'A meta só é reservada se o aluno marcou Jurisprudência no questionário.', 'Desligado reserva para todos que atingirem a carga mínima.', 4, on('m30:reservarJuris219Interno')),
  'juris.reservaCapacidadeRevisaoMin': d('Juris', 'limite', 'Reserva na semana de revisão', 'Minutos descontados da capacidade da semana de revisão quando a Jurisprudência está marcada.', 'Maior reduz o espaço de revisão nas semanas especiais.', 4, on('m28:capacidadeRevisao300')),

  // ── Histórico ──
  'historico.metaSemanalBase': d('Histórico', 'limite', 'Metas por semana (carga normal)', 'Quantas metas do diagnóstico dos temas anteriores entram por semana na carga normal.', 'Maior termina o diagnóstico mais rápido, ocupando mais a semana.', null, on('m30:metaSemanalHistorico', 'm28:metaSemanalHistorico')),
  'historico.metaSemanalAlta': d('Histórico', 'limite', 'Metas por semana (carga alta)', 'Metas do diagnóstico por semana na carga alta.', 'Maior acelera o diagnóstico para quem tem mais tempo.', null, on('m30:metaSemanalHistorico', 'm28:metaSemanalHistorico')),
  'historico.corteAltaMin': d('Histórico', 'limiar', 'Carga alta a partir de', 'Carga semanal (min) a partir da qual vale a meta "alta" do diagnóstico.', 'Maior restringe a meta alta a poucos alunos.', null, on('m30:metaSemanalHistorico', 'm28:metaSemanalHistorico')),

  // ── Rotina ──
  'rotina.fimSemanaFracao': d('Rotina', 'limiar', 'Fim de semana concentrado: fração da carga', 'Fração da carga semanal no fim de semana a partir da qual ele é tratado como concentrado.', 'Menor classifica mais rotinas como concentradas (PDFull também no fim de semana).', null, on('m30:rotina300')),
  'rotina.fimSemanaDiferencaHoras': d('Rotina', 'limiar', '… e maior dia acima da média dos úteis em (h)', 'Diferença mínima em horas entre o maior dia do fim de semana e a média dos dias úteis.', 'Maior exige mais contraste para considerar o fim de semana concentrado.', null, on('m30:rotina300')),
  'rotina.diasPdfAteDow': d('Rotina', 'limite', 'Dias de PDFull: segunda até (exclusivo)', 'Dia da semana até o qual (exclusivo; 4 = seg–qui) se estuda PDFull.', 'Maior estende os dias de leitura nova.', null, on('m30:rotina300')),
  'rotina.diasRevisao': d('Rotina', 'limite', 'Dias de revisão/questões', 'Dias da semana (0 = segunda … 6 = domingo) de revisão e questões.', 'Move PDFlash e questões para outros dias.', null, on('m30:rotina300')),
  'rotina.aquecimentoComQuestoes': d('Rotina', 'limite', 'Aquecimento com questões (semanas)', 'Semanas iniciais que antecipam retornos, com questões ligadas.', 'Maior alonga o aquecimento do início do plano.', 6, on('m30:gerarPlanoBase30', 'm30:calcularDomino219Base')),
  'rotina.aquecimentoSoRevisao': d('Rotina', 'limite', 'Aquecimento só PDFlash (semanas)', 'Semanas iniciais de aquecimento só com PDFlash.', 'Maior alonga o aquecimento sem questões.', 6, on('m30:gerarPlanoBase30', 'm30:calcularDomino219Base')),

  // ── Rodízio ──
  'rodizio.atrasoLimiar': d('Rodízio', 'limiar', 'Disciplina atrasada quando ≥ N abaixo do maior', 'Diferença de progresso (0–1) a partir da qual uma disciplina é considerada atrasada.', 'Menor aciona o reforço de disciplinas atrasadas mais cedo.', 2, on('m30:construirRodizioPDF')),

  // ── Equilíbrio ──
  'equilibrio.retornosDiaMax': d('Equilíbrio', 'limite', 'Retornos por dia (máx.)', 'Teto diário de PDFlash/questões de retorno nas faixas equilibradas.', 'Maior permite mais retornos por dia.', 6, on('m30:gerarPlanoBase30')),
  'equilibrio.questoesDia': d('Equilíbrio', 'limite', 'Questões por dia (equilibrada)', 'Questões por dia nas faixas equilibradas.', 'Maior aumenta o volume diário de questões.', 6, on('m30:gerarPlanoBase30', 'm30:calcularDomino219Base')),
  'equilibrio.flashesDia': d('Equilíbrio', 'limite', 'PDFlashes por dia no reagendamento', 'PDFlashes por dia no reagendamento das faixas equilibradas.', 'Maior encaixa mais PDFlashes por dia no dominó.', 6, on('m30:calcularDomino219Base')),

  // ── Prioridades ──
  'prioridades.porTipo.*': d('Prioridades', 'prioridade', 'Prioridade por tipo de meta', 'Ordem do tipo de meta no reagendamento (menor número = primeiro).', 'Muda quais metas vencem a disputa por vaga no dia ao reagendar.', null, on('m30:calcularDomino219Base'), { href: HREF_PERS }),
  'prioridades.outros': d('Prioridades', 'prioridade', 'Prioridade: tipo desconhecido', 'Prioridade usada para tipos de meta fora do registro.', 'Raramente relevante; afeta metas de tipo desconhecido.', null, on('m30:calcularDomino219Base')),
  'prioridades.faixa3.fl': d('Prioridades', 'prioridade', 'Modo livre: PDFlash', 'Prioridade do PDFlash no modo de questões livre.', 'Menor coloca PDFlash antes das demais metas.', null, on('m30:calcularDomino219Base')),
  'prioridades.faixa3.qu': d('Prioridades', 'prioridade', 'Modo livre: Questões', 'Prioridade das questões no modo livre.', 'Menor coloca questões antes.', null, on('m30:calcularDomino219Base')),
  'prioridades.faixa3.pdf': d('Prioridades', 'prioridade', 'Modo livre: PDFull', 'Prioridade do PDFull no modo livre.', 'Menor coloca PDFull antes.', null, on('m30:calcularDomino219Base')),

  // ── Restrições ──
  'restricoes': d('Restrições', 'restricao', 'Restrições declarativas por personagem', 'Regras como "máximo por dia", "não no mesmo dia que…", "só na sobra do dia", aplicadas a cada candidata do dia.', 'Cada restrição ativa bloqueia posições no plano; sem restrições o motor se comporta como o padrão.', 3, on('rs:restricaoQueBloqueia', 'm30:gerarPlanoBase30'), { href: HREF_RESTR, testes: [T_GOLD, T_RES] }),

  // ── Tipos personalizados do catálogo (FASE 3a): `tiposGx.<slug>` = { ativo, maxPorDia, maxPorSemana, dias, faixas, aPartirDaSemana } ──
  'tiposGx': d('Tipos personalizados', 'restricao', 'Regras por tipo personalizado do catálogo', 'Para cada tipo personalizado que "gera meta" (slug do catálogo): ativo, máximo por dia/semana, dias permitidos, faixas de carga e a partir de qual semana. O motor lê `regras.tiposGx[slug]` ao agendar as metas gx na sobra do dia.', 'Só ADIA metas do tipo (elegibilidade); nunca cria metas nem muda as de outros tipos. Sem regra = entra na sobra do dia por prioridade do catálogo. Vale ao gerar/regenerar o plano.', 8, on('m30:gerarPlanoBase30'), { href: HREF_PERS, testes: [T_GOLD, T_REG] }),

  // ── Adaptação ──
  'adaptacao.dominoAtivo': d('Adaptação', 'interruptor', 'Dominó (refluxo ao não fazer/mover)', 'Liga o refluxo do plano quando o aluno adia ou não faz uma meta.', 'Desligado: a meta só é adiada, sem reorganizar as seguintes.', null, on('m30:calcularDominoE', 'm30:adiarSemDomino'), { testes: [T_GOLD, T_AR] }),
  'adaptacao.reforcoAtivo': d('Adaptação', 'interruptor', 'Reforço do diagnóstico (metas :reforco:)', 'Liga a criação de metas de reforço por acerto baixo no diagnóstico.', 'Desligado: nenhuma meta de reforço é criada.', null, on('m30:registrarReforcos216'), { testes: [T_GOLD, T_AR] }),
  'adaptacao.semanaEspecialAtiva': d('Adaptação', 'interruptor', 'Semana especial por desempenho', 'Liga as metas adaptativas da semana especial (:revisao:/rf/rq).', 'Desligado: a revisão por desempenho não gera metas (o ciclo não muda).', 4, on('m30:semanaRevisao216Interno'), { testes: [T_GOLD, T_AR] }),
  'adaptacao.antecipaRetornoAtivo': d('Adaptação', 'interruptor', 'Antecipar retorno (PDFlash/questões)', 'Permite antecipar o retorno de PDFlash/questões antes do prazo.', 'Desligado: retorno nunca antes do prazo (também na reta final).', 6, on('m30:podeAnteciparRetorno300'), { testes: [T_GOLD, T_AR] }),

  // ── Constantes ──
  'constantes.blocoMin': d('Constantes', 'constante', 'Bloco mínimo de tempo', 'Granularidade (min) das divisões de leitura, sobras e vagas.', 'Base de todos os horários; mudar altera praticamente todo o plano.', null, on('m30:cabeSaldoNaSemana300', 'm30:gerarPlanoBase30', 'm30:semanaRevisao216Base')),
  'constantes.questoesBaseDia': d('Constantes', 'constante', 'Questões por dia fora da faixa equilibrada (base)', 'Base da fórmula "base + heranças" de questões por dia fora da faixa equilibrada.', 'Maior aumenta as questões diárias de base.', 6, on('m30:gerarPlanoBase30', 'm30:calcularDomino219Base')),
  'constantes.reservaCicloDivisor': d('Constantes', 'constante', 'Reserva do ciclo: divisor das vagas de questões', 'Os PDFulls do ciclo são limitados a vagas de questões ÷ este valor.', 'Maior reserva menos PDFulls no ciclo.', 5, on('m30:gerarPlanoBase30')),
  'constantes.prioridadesDomino.revisaoDia': d('Constantes', 'prioridade', 'Dominó: prioridade de revisão no dia certo', 'Prioridade de PDFlash/questões no dia de revisão (menor = primeiro).', 'Menor dá preferência à revisão no dia dela.', null, on('m30:calcularDomino219Base')),
  'constantes.prioridadesDomino.revisaoRepetida': d('Constantes', 'prioridade', 'Dominó: prioridade da mesma família repetida', 'Prioridade quando a mesma família se repete no dia.', 'Maior empurra repetições para depois.', null, on('m30:calcularDomino219Base')),
  'constantes.prioridadesDomino.rebaixada': d('Constantes', 'prioridade', 'Dominó: prioridade rebaixada', 'Prioridade de metas fora do dia certo (rebaixadas).', 'Maior deixa essas metas por último.', null, on('m30:calcularDomino219Base')),
  'constantes.cotaPdflashDuracaoMin': d('Constantes', 'constante', 'Duração assumida na cota de PDFlash', 'Duração (min) assumida por PDFlash ao calcular a cota diária quando não informada.', 'Maior reserva mais tempo por PDFlash, reduzindo vagas de questões.', 6, on('m30:cotaPDFlash300', 'm30:gerarPlanoBase30')),
  'constantes.cargaMinimaMin': d('Constantes', 'constante', 'Carga semanal mínima para gerar o plano', 'Carga mínima (min) para gerar o plano; abaixo, a geração é rejeitada. 0 = não rejeita.', 'Maior rejeita rotinas curtas; 0 mantém o comportamento atual.', null, on('m30:gerarPlano')),
}

// ── expansão contra as regras vigentes ────────────────────────────────────────────────────────────────
const igual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

function textoOverrides(o: unknown): string {
  if (!o || typeof o !== 'object') return 'herda tudo'
  const partes: string[] = []
  for (const [sec, v] of Object.entries(o as Record<string, unknown>)) {
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) partes.push(`${sec}.${k} = ${formatarValor(x)}`)
  }
  return partes.length ? partes.join(' · ') : 'herda tudo'
}
function textoCampoFaixa(campo: keyof FaixaCarga, f: FaixaCarga | undefined): string {
  if (!f) return '—'
  const v = f[campo]
  if (campo === 'overrides') return textoOverrides(v)
  if (campo === 'revisaoModo') return ROTULO_MODO_REVISAO[f.revisaoModo]
  if (campo === 'modoQuestoes') return ROTULO_MODO_QUESTOES[f.modoQuestoes]
  if (v === null || v === undefined) return campo === 'maxMin' ? 'sem limite' : 'herda o global'
  return formatarValor(v)
}

export function montarMapa(regras: RegrasMotor): EntradaMapa[] {
  const out: EntradaMapa[] = []
  const base = (chave: string, m: MetaCampo) => ({ chave, descricao: m.descricao, tipo: m.tipo, grupo: m.grupo, onde: m.ondeAplicado, camada: m.camada, nomeCamada: m.camada ? NOMES_CAMADAS[m.camada - 1] ?? null : null, impacto: m.impacto, testes: m.testes, href: m.href })
  for (const [chave, m] of Object.entries(METADADOS_MAPA)) {
    if (chave.startsWith('faixas.*.')) {
      const campo = chave.slice('faixas.*.'.length) as keyof FaixaCarga
      regras.faixas.forEach((f, k) => {
        const p = FAIXAS_PADRAO[k]
        const vig = textoCampoFaixa(campo, f), pad = textoCampoFaixa(campo, p)
        out.push({ ...base(chave, m), path: `faixas.${k}.${campo}`, nome: `${m.nome} — ${f.nome}`, valorPadrao: pad, valorVigente: vig, diferePadrao: !p || !igual(f[campo], p[campo]) })
      })
    } else if (chave === 'prioridades.porTipo.*') {
      for (const s of SLUGS_META) {
        const vig = regras.prioridades.porTipo[s] ?? regras.prioridades.outros, pad = REGRAS_PADRAO.prioridades.porTipo[s] ?? REGRAS_PADRAO.prioridades.outros
        out.push({ ...base(chave, m), path: `prioridades.porTipo.${s}`, nome: `Prioridade: ${TIPOS_META[s].rotulo}`, valorPadrao: String(pad), valorVigente: String(vig), diferePadrao: vig !== pad })
      }
    } else if (chave === 'restricoes') {
      if (!regras.restricoes.length) out.push({ ...base(chave, m), path: 'restricoes', nome: m.nome, valorPadrao: 'nenhuma', valorVigente: 'nenhuma', diferePadrao: false })
      for (const r of regras.restricoes) {
        out.push({ ...base(chave, m), path: `restricoes.${r.id}`, nome: r.rotulo || `Restrição ${r.id}`, valorPadrao: 'nenhuma', valorVigente: `${r.ativa ? 'ativa' : 'desligada'} · ${descreverRestricao(r)}`, diferePadrao: true })
      }
    } else if (chave === 'tiposGx') {
      const tg = (regras as { tiposGx?: Record<string, unknown> }).tiposGx ?? {}
      const slugs = Object.keys(tg)
      if (!slugs.length) out.push({ ...base(chave, m), path: 'tiposGx', nome: m.nome, valorPadrao: 'nenhuma', valorVigente: 'nenhuma', diferePadrao: false })
      for (const s of slugs) out.push({ ...base(chave, m), path: `tiposGx.${s}`, nome: `Tipo personalizado: ${s}`, valorPadrao: 'sem regras', valorVigente: JSON.stringify(tg[s]), diferePadrao: true })
    } else {
      const vig = lerCaminho(regras, chave), pad = lerCaminho(REGRAS_PADRAO, chave)
      out.push({ ...base(chave, m), path: chave, nome: m.nome, valorPadrao: formatarValor(pad), valorVigente: formatarValor(vig), diferePadrao: !igual(vig, pad) })
    }
  }
  return out
}

export interface ResumoMapa { total: number; diferem: number; porGrupo: Array<{ grupo: GrupoMapa; total: number; diferem: number }> }
/** Resumo do topo da tela: nº de parâmetros e quantos diferem do padrão, por grupo (só grupos presentes, na ordem de GRUPOS_MAPA). */
export function resumirMapa(lista: readonly EntradaMapa[]): ResumoMapa {
  const porGrupo = GRUPOS_MAPA.map((grupo) => {
    const l = lista.filter((e) => e.grupo === grupo)
    return { grupo, total: l.length, diferem: l.filter((e) => e.diferePadrao).length }
  }).filter((g) => g.total > 0)
  return { total: lista.length, diferem: lista.filter((e) => e.diferePadrao).length, porGrupo }
}
