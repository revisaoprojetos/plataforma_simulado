/**
 * FLUXO DO CRONOGRAMA ADAPTATIVO GERADO DAS REGRAS VIGENTES (nós/arestas como DADOS).
 *
 * Função pura `montarFluxo(regras)` → diagramas (fluxograma "do cadastro ao plano gravado" + árvores de decisão) com os valores REAIS
 * das regras (cortes de faixa, tetos, limiares, restrições ativas, interruptores de adaptação). `caminhoDaRotina` resolve, para uma rotina
 * (horas por dia), a faixa/teto/revisão/limites e a lista de nós percorridos (o cliente só destaca). Sem I/O, sem Date, sem 'server-only'.
 *
 * INFERIDO: o HTML original (Cronograma_Adaptativo_3.0.html) não estava disponível. A estrutura dos nós foi inferida das regras
 * vigentes + do "Mapa do Cronograma Adaptativo" (.md). Nós/valores de regra vêm do dado; textos de etapas fora do motor marcam `inferido`.
 */
import { resolverFaixaCarga, resolverIndiceFaixa, resolverTetoPdf, type RegrasMotor } from './regras'
import { classeDaFaixa, cicloDaFaixa, opcoesDaFaixa, padraoDaFaixa, textoIntervalo, ROTULO_MODO_QUESTOES } from './faixas-carga'
import { descreverRestricao } from './restricoes'
import type { TipoNo, NoFluxo, ArestaFluxo, DiagramaFluxo } from '../../admin/fluxo/adaptador'

// Tipos genéricos vivem no framework de fluxo (re-exportados aqui para compatibilidade).
export type { TipoNo, NoFluxo, ArestaFluxo, DiagramaFluxo }


const HREF_FAIXAS = '/admin/cronogramas/adaptativo/faixas'
const HREF_RESTR = '/admin/cronogramas/adaptativo/restricoes'
const L_FAIXAS = { href: HREF_FAIXAS, rotulo: 'Editar em Faixas e limites' }
const L_RESTR = { href: HREF_RESTR, rotulo: 'Editar em Restrições' }
const DIAS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']

export function fmtMin(m: number): string {
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`
}
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`

type NoIn = Omit<NoFluxo, 'tipo' | 'titulo' | 'col' | 'row' | 'id'>
const no = (id: string, tipo: TipoNo, titulo: string, col: number, row: number, o: NoIn & { descricao: string }): NoFluxo => ({ id, tipo, titulo, col, row, ...o })
const ar = (de: string, para: string, rotulo?: string): ArestaFluxo => ({ de, para, ...(rotulo ? { rotulo } : {}) })

export function montarFluxo(R: RegrasMotor): DiagramaFluxo[] {
  const ativas = R.restricoes.filter((r) => r.ativa)
  const FX = R.faixas
  const A = R.adaptacao
  const diasJuris = R.juris.diasPreferidos.map((d) => DIAS[d]).join(' e ')

  // 1) Do cadastro ao plano gravado ─────────────────────────────────────────────────────────────────
  const cadastro: DiagramaFluxo = {
    id: 'cadastro', titulo: 'Do cadastro ao plano gravado',
    resumo: 'Caminho de uma geração. Etapas fora do motor (cadastro, liberação, questionário) são inferidas do mapa.',
    nos: [
      no('c.inicio', 'inicio', 'Cadastro e liberação', 0, 0, { inferido: true, link: { href: '/admin/cronogramas/adaptativo', rotulo: 'Editar em Liberação' }, descricao: 'O aluno é cadastrado na plataforma e recebe acesso ao Cronograma Adaptativo (regras de liberação por produto/grupo). Sem acesso, o iframe não abre.' }),
      no('c.quest', 'etapa', 'Questionário', 1, 0, { inferido: true, descricao: 'O aluno informa horas de cada dia da semana, data de início, disciplinas, metas ligadas, Jurisprudência (opt-in) e se já estuda pelo Revisão (diagnóstico dos temas anteriores).' }),
      no('c.rotina', 'etapa', 'Rotina e faixa', 2, 0, { valor: FX.map((f, k) => `${f.nome} (${textoIntervalo(f, k, FX)})`).join(' · '), link: L_FAIXAS, descricao: 'A soma das horas da semana define a faixa de carga, o teto de PDFulls novos, o tipo de revisão e o modo de questões. Veja a árvore Faixa e teto.' }),
      no('c.menos', 'aberto', 'Rotina muito curta', 2, 1, { valor: 'Sem regra no motor vigente', inferido: true, descricao: 'O mapa (spec 3.0) diz que rotinas abaixo de 10h são "configuração rejeitada". O motor só rejeita se a constante "carga semanal mínima" (aba Faixas › Constantes) for maior que 0; no padrão (0) a primeira faixa começa em 0 e nada é rejeitado.' }),
      no('c.fila', 'etapa', 'Fila de leituras', 3, 0, { descricao: 'Aulas na ordem editorial do catálogo (dependências e ordem interna da disciplina). Cada aula vira um ciclo de metas: PDFull, PDFlash e questões.' }),
      no('c.gera', 'etapa', 'Geração semana a semana', 4, 0, { valor: `Horizonte: até ${R.horizonte.maxSemanas} semanas`, link: L_FAIXAS, descricao: 'O motor percorre as semanas aplicando a precedência de 8 camadas (veja o diagrama Precedência) até alocar toda a fila.' }),
      no('c.restr', 'etapa', 'Restrições por personagem', 5, 0, { valor: ativas.length ? `${plural(ativas.length, 'ativa', 'ativas')}: ${ativas.map((r) => r.rotulo || descreverRestricao(r)).join(' · ')}` : 'Nenhuma ativa', link: L_RESTR, descricao: 'Regras declarativas por tipo de meta (máximo por dia, não no mesmo dia, depois de…) aplicadas a cada candidata do dia.' }),
      no('c.cabe', 'decisao', `Cabe em ${R.horizonte.maxSemanas} semanas?`, 6, 0, { valor: `${R.horizonte.maxSemanas} semanas`, link: L_FAIXAS, descricao: 'Se a fila não termina dentro do horizonte, a geração é rejeitada e nada é gravado.' }),
      no('c.rej', 'rejeicao', 'Nada é gravado', 6, 1, { descricao: 'O plano atual do aluno permanece como estava; o aluno vê a mensagem de que a rotina não comporta o conteúdo.' }),
      no('c.inv', 'etapa', 'Conferência (invariantes)', 7, 0, { descricao: 'Verificação das invariantes da especificação (limites por dia, teto, restrições) no plano gerado. Violações aparecem na aba Integridade.' }),
      no('c.fim', 'resultado', 'Plano gravado', 8, 0, { descricao: 'O plano é gravado com o carimbo regrasHash (hash das regras vigentes). Mudar regras depois NÃO altera planos já gravados; só os gerados dali em diante.' }),
    ],
    arestas: [ar('c.inicio', 'c.quest'), ar('c.quest', 'c.rotina'), ar('c.rotina', 'c.menos', 'rotina curta'), ar('c.rotina', 'c.fila'), ar('c.fila', 'c.gera'), ar('c.gera', 'c.restr'), ar('c.restr', 'c.cabe'), ar('c.cabe', 'c.rej', 'não'), ar('c.cabe', 'c.inv', 'sim'), ar('c.inv', 'c.fim')],
  }

  // 2) Faixa por rotina e teto de PDFull ───────────────────────────────────────────────────────────
  const fnos: NoFluxo[] = [no('f.carga', 'inicio', 'Carga semanal', 0, 2, { descricao: 'Soma, em minutos, das horas dos 7 dias da rotina vigente da semana.' })]
  const farestas: ArestaFluxo[] = []
  FX.forEach((f, k) => {
    const ultima = f.maxMin == null
    const eq = f.equilibra ? ` · faixa equilibrada (retornos ≤ ${R.equilibrio.retornosDiaMax}/dia, ${R.equilibrio.questoesDia} questões/dia, ≤ ${R.equilibrio.flashesDia} PDFlashes/dia)` : ''
    const ov = Object.keys(f.overrides || {}).filter((s) => Object.keys((f.overrides as Record<string, object>)[s] || {}).length)
    const rev = f.revisaoModo === 'ciclo' ? `revisão em ciclo (${cicloDaFaixa(f, R)} sem.)` : `semana especial por desempenho (padrão ${padraoDaFaixa(f, R)} sem.)`
    fnos.push(no(`f.r${k}`, 'resultado', `${f.nome} · teto ${f.tetoPdf}`, k + 1, 4, {
      valor: `${f.tetoPdf} PDFull/sem`, link: L_FAIXAS,
      descricao: `${f.tetoPdf} PDFulls novos/semana${eq}; ${rev}; questões: ${ROTULO_MODO_QUESTOES[f.modoQuestoes].toLowerCase()}${ov.length ? '; overrides: ' + ov.join(', ') : ''}. Continuações de leitura não contam. Após a semana ${R.retaFinal.semanaEncaixeExtra}, um PDFull extra na sobra pode ultrapassar o teto.${f.soRegra23 ? ' Em planos gerados pelo motor 3.1 o teto desta faixa é o da faixa seguinte.' : ''}`,
    }))
    if (!ultima) {
      fnos.push(no(`f.d${k}`, 'decisao', `Carga ≤ ${fmtMin(f.maxMin as number)}?`, k + 1, 3, { valor: `${f.maxMin} min${f.soRegra23 ? ' · teto só na regra 23' : ''}`, link: L_FAIXAS, descricao: `Fronteira da faixa "${f.nome}" (${textoIntervalo(f, k, FX)}).` }))
      farestas.push(ar(k === 0 ? 'f.carga' : `f.d${k - 1}`, `f.d${k}`, k === 0 ? undefined : 'não'), ar(`f.d${k}`, `f.r${k}`, 'sim'))
    } else farestas.push(ar(k === 0 ? 'f.carga' : `f.d${k - 1}`, `f.r${k}`, k === 0 ? undefined : 'não'))
  })
  const faixa: DiagramaFluxo = { id: 'faixa', titulo: 'Árvore A · Faixa por rotina e teto de PDFull', resumo: 'A carga semanal decide a faixa de carga (nome, teto de PDFulls novos, revisão e modo de questões).', nos: fnos, arestas: farestas }

  // 3) Revisão: ciclo × desempenho ──────────────────────────────────────────────────────────────────
  const revisao: DiagramaFluxo = {
    id: 'revisao', titulo: 'Árvore B · Revisão: ciclo ou desempenho',
    resumo: 'Rotinas até o corte usam a revisão em ciclo; acima, a semana especial por desempenho.',
    nos: [
      no('r.carga', 'inicio', 'Carga semanal', 0, 1, { descricao: 'Mesma soma de horas da árvore A.' }),
      no('r.d', 'decisao', 'A faixa usa revisão em ciclo?', 1, 1, { valor: FX.filter((f) => f.revisaoModo === 'ciclo').map((f) => f.nome).join(', ') || 'nenhuma', link: L_FAIXAS, descricao: 'Cada faixa de carga escolhe o modo de revisão: ciclo obrigatório ou semana especial por desempenho. Nenhuma em ciclo = só desempenho.' }),
      no('r.ciclo', 'resultado', `Revisão em ciclo (${R.revisao.cicloSemanas} sem.)`, 2, 0, { valor: `A cada ${R.revisao.cicloSemanas} semanas`, link: L_FAIXAS, descricao: `Semana obrigatória de revisão a cada ${R.revisao.cicloSemanas} semanas, com PDFlash/questões pendentes. O retorno pode ser antecipado: PDFlash após ${plural(R.revisao.antecipaMinSemanas.fl, 'semana', 'semanas')}, questões após ${plural(R.revisao.antecipaMinSemanas.qu, 'semana', 'semanas')} da leitura${A.antecipaRetornoAtivo ? '' : ' (adaptação DESLIGADA: nunca antes do due)'}.` }),
      no('r.sem', 'decisao', 'Semana especial ativa?', 2, 2, { valor: A.semanaEspecialAtiva ? 'Ligada' : 'Desligada', link: L_RESTR, descricao: 'Interruptor da adaptação por desempenho (aba Faixas e limites › Adaptação por desempenho).' }),
      no('r.off', 'rejeicao', 'Sem revisão por desempenho', 3, 3, { descricao: 'Desligada: nenhuma meta :revisao:/rf/rq é criada por desempenho.' }),
      no('r.perio', 'resultado', `Semana especial a cada ${R.revisao.padrao} sem.`, 3, 2, { valor: `Padrão ${R.revisao.padrao} · opções ${R.revisao.opcoesNovas.join('/')}`, link: L_FAIXAS, descricao: `Periodicidade padrão ${R.revisao.padrao}; planos novos oferecem ${R.revisao.opcoesNovas.join(', ')}; legados preservam ${R.revisao.opcoesLegado.join(', ')}. Rotação das disciplinas essenciais externas a cada ${R.revisao.giroExternas} semanas especiais. Jurisprudência marcada reserva ${R.juris.reservaCapacidadeRevisaoMin} min da capacidade.` }),
    ],
    arestas: [ar('r.carga', 'r.d'), ar('r.d', 'r.ciclo', 'sim'), ar('r.d', 'r.sem', 'não'), ar('r.sem', 'r.off', 'não'), ar('r.sem', 'r.perio', 'sim')],
  }

  // 4) Diagnóstico × semana especial 50/70 ─────────────────────────────────────────────────────────
  const D = R.desempenho
  const diagnostico: DiagramaFluxo = {
    id: 'diagnostico', titulo: 'Árvore C · Diagnóstico × semana especial',
    resumo: `Limiares de acerto: ${D.especialPdfAbaixo}% e ${D.especialFlashAte}% (semana especial); ${D.historicoFlashMin}% e ${D.historicoOkMin}% (diagnóstico histórico).`,
    nos: [
      no('h.inicio', 'inicio', 'Já estuda pelo Revisão?', 0, 1, { inferido: true, descricao: 'Pergunta do questionário. Se sim, o aluno informa o acerto dos temas anteriores e o motor monta o diagnóstico histórico.' }),
      no('h.d', 'decisao', `Carga ≥ ${fmtMin(R.historico.corteAltaMin)}?`, 1, 1, { valor: `${R.historico.corteAltaMin} min`, link: L_FAIXAS, descricao: 'Define quantos temas anteriores são diagnosticados por semana.' }),
      no('h.alta', 'resultado', `${R.historico.metaSemanalAlta} metas/sem`, 2, 0, { valor: `${R.historico.metaSemanalAlta} por semana`, link: L_FAIXAS, descricao: 'Carga alta.' }),
      no('h.base', 'resultado', `${R.historico.metaSemanalBase} metas/sem`, 2, 1, { valor: `${R.historico.metaSemanalBase} por semana`, link: L_FAIXAS, descricao: 'Carga normal.' }),
      no('h.ac', 'decisao', 'Acerto do tema (diagnóstico)', 3, 1, { valor: `ok ≥ ${D.historicoOkMin}% · PDFlash ≥ ${D.historicoFlashMin}%`, link: L_FAIXAS, descricao: 'Resultado do diagnóstico histórico por tema.' }),
      no('h.ok', 'resultado', `≥ ${D.historicoOkMin}%: encerra`, 4, 0, { descricao: 'Tema bem dominado: nada é criado.' }),
      no('h.fl', 'resultado', `${D.historicoFlashMin}% a < ${D.historicoOkMin}%: PDFlash`, 4, 1, { descricao: `Meta de PDFlash de reforço. ${A.reforcoAtivo ? '' : 'Reforço DESLIGADO: nenhuma meta :reforco: é criada.'}`, valor: A.reforcoAtivo ? 'Reforço ligado' : 'Reforço desligado', link: L_RESTR }),
      no('h.pf', 'resultado', `< ${D.historicoFlashMin}%: PDFull`, 4, 2, { descricao: `Releitura completa. ${A.reforcoAtivo ? '' : 'Reforço DESLIGADO: nenhuma meta :reforco: é criada.'}`, valor: A.reforcoAtivo ? 'Reforço ligado' : 'Reforço desligado', link: L_RESTR }),
      no('e.ac', 'decisao', 'Acerto (semana especial)', 3, 4, { valor: `PDFull < ${D.especialPdfAbaixo}% · PDFlash ≤ ${D.especialFlashAte}%`, link: L_FAIXAS, descricao: `Resultado do tema na semana especial. Ranking: tema fraco abaixo de ${D.acertoFracoPct}% (bônus ${D.rankingBonusFraco}, peso ${D.rankingPesoDistancia}, penalidade de revisado ${D.rankingPenalidadeRevisado}).` }),
      no('e.pf', 'resultado', `< ${D.especialPdfAbaixo}%: PDFull`, 4, 3, { descricao: 'Releitura (meta :revisao:).' }),
      no('e.fl', 'resultado', `${D.especialPdfAbaixo}% a ${D.especialFlashAte}%: PDFlash`, 4, 4, { descricao: `Inclusive em ${D.especialFlashAte}%: na semana especial 70% ainda gera PDFlash (no diagnóstico 70% encerra).` }),
      no('e.fora', 'resultado', `> ${D.especialFlashAte}%: fora`, 4, 5, { descricao: 'Tema fora da semana especial.' }),
    ],
    arestas: [ar('h.inicio', 'h.d'), ar('h.d', 'h.alta', 'sim'), ar('h.d', 'h.base', 'não'), ar('h.alta', 'h.ac'), ar('h.base', 'h.ac'), ar('h.ac', 'h.ok', `≥ ${D.historicoOkMin}%`), ar('h.ac', 'h.fl', 'meio'), ar('h.ac', 'h.pf', 'baixo'), ar('e.ac', 'e.pf', 'baixo'), ar('e.ac', 'e.fl', 'meio'), ar('e.ac', 'e.fora', 'alto')],
  }

  // 5) Limites por dia → reta final → Jurisprudência → LegProc ─────────────────────────────────────
  const LD = R.limitesDia, RF = R.retaFinal, J = R.juris, LP = R.legproc
  const dia: DiagramaFluxo = {
    id: 'dia', titulo: 'Árvore D · Limites por dia, reta final, Jurisprudência e LegProc',
    resumo: 'Como uma meta candidata ganha (ou perde) um dia.',
    nos: [
      no('d.ini', 'inicio', 'Meta candidata ao dia', 0, 0, { descricao: 'Para cada dia ativo da rotina, o motor tenta alocar as metas pendentes na ordem de prioridade.' }),
      no('d.restr', 'decisao', 'Restrição ativa barra?', 1, 0, { valor: ativas.length ? plural(ativas.length, 'restrição ativa', 'restrições ativas') : 'Nenhuma ativa', link: L_RESTR, descricao: ativas.length ? ativas.map((r) => '• ' + (r.rotulo || descreverRestricao(r))).join('\n') : 'Sem restrições ativas: esta decisão nunca barra.' }),
      no('d.lim', 'decisao', 'Dentro dos limites do dia?', 2, 0, { valor: `${LD.pdfDistintos} PDFulls · ${LD.revisoes} PDFlashes · ${LD.questoes} questões`, link: L_FAIXAS, descricao: `PDFulls distintos por dia ≤ ${LD.pdfDistintos} (partes da mesma leitura contam 1), PDFlashes ≤ ${LD.revisoes}, questões ≤ ${LD.questoes}. Divisão de uma leitura: até ${R.divisao.maxDatas} datas na mesma semana.` }),
      no('d.teto', 'decisao', 'Cabe no teto semanal de PDFull?', 3, 0, { valor: `Tetos ${FX.map((l) => l.tetoPdf).join('/')}`, link: L_FAIXAS, descricao: `Vale só para PDFull novo (veja a árvore A). Após a semana ${RF.semanaEncaixeExtra}, o PDFull extra na sobra pode ultrapassar o teto.` }),
      no('d.novos', 'decisao', 'PDFulls novos no dia', 4, 0, { valor: `${LD.pdfNovosBase}/dia (modo de questões livre, após conclusão: ${LD.pdfNovosAposConclusao})`, link: L_FAIXAS, descricao: `Base ${LD.pdfNovosBase} PDFull novo por dia; nas faixas com modo de questões livre, no dia corrente após um PDFull concluído, até ${LD.pdfNovosAposConclusao}.` }),
      no('d.ok', 'resultado', 'Meta alocada no dia', 5, 0, { descricao: 'A meta recebe a data. A identidade (id) não muda se a data mudar depois.' }),
      no('d.rej', 'rejeicao', 'Adiada para outro dia', 2, 1, { descricao: 'Qualquer "não" acima adia a meta para o próximo dia/semana elegível (o rastro registra o motivo: restrição, limite do dia, teto semanal, PDFulls novos).' }),

      no('rf.d', 'decisao', 'Reta final?', 0, 3, { valor: `semana > ${RF.semanaMinima} e ≤ ${RF.limiarTetos} tetos (≤ ${RF.limiarTetosApos} após a sem. ${RF.semanaCorteLimiar})`, link: L_FAIXAS, descricao: `Entra em reta final a partir da semana ${RF.semanaMinima + 1}, quando restam ≤ ${RF.limiarTetos} tetos de PDFull nas leituras pendentes (≤ ${RF.limiarTetosApos} após a semana ${RF.semanaCorteLimiar}); fila vazia também ativa.` }),
      no('rf.sim', 'resultado', 'Reta final ativa', 1, 3, { descricao: `Sobra ≥ ${fmtMin(R.divisao.sobraMinAvancarMin)} permite iniciar um trecho; PDFull extra pode ultrapassar o teto após a semana ${RF.semanaEncaixeExtra}; retorno pode ser antecipado.`, valor: `Sobra mínima ${R.divisao.sobraMinAvancarMin} min`, link: L_FAIXAS }),
      no('rf.nao', 'resultado', 'Regras normais', 1, 4, { descricao: 'Teto semanal e retornos nos dias previstos.' }),

      no('j.d1', 'decisao', 'Aluno marcou Jurisprudência?', 3, 3, { valor: J.exigeOptIn ? 'Opt-in exigido' : 'Sem opt-in', link: L_FAIXAS, descricao: J.exigeOptIn ? 'A meta só é reservada se o aluno marcou Jurisprudência.' : 'Opt-in não exigido: vale para todos.' }),
      no('j.d2', 'decisao', `Carga ≥ ${fmtMin(J.minSemanalMin)}?`, 4, 3, { valor: `${J.minSemanalMin} min`, link: L_FAIXAS, descricao: 'Carga mínima da semana para reservar a meta.' }),
      no('j.res', 'resultado', 'Reserva Jurisprudência', 5, 3, { valor: `Dias: ${diasJuris}`, link: L_FAIXAS, descricao: `A reserva da Jurisprudência vem antes das demais metas (precedência 4), nos dias preferidos: ${diasJuris}.` }),
      no('j.rej', 'rejeicao', 'Sem Jurisprudência', 5, 4, { descricao: 'Sem meta de Jurisprudência na semana.' }),

      no('l.d', 'decisao', 'Sobrou tempo no dia?', 3, 6, { descricao: 'Depois de alocar as demais metas, o que sobra do dia é oferecido ao LegProc (primeiro bloco e, depois, o segundo bloco de outra lei).' }),
      no('l.res', 'resultado', 'LegProc na sobra', 4, 6, { valor: `${LP.metasDiaMax} metas · ${LP.leisDistintas} leis · ${LP.mesmaLei} da mesma lei`, link: L_FAIXAS, descricao: `Até ${LP.metasDiaMax} metas por dia (1º bloco: ${LP.metasDiaBase}), ≤ ${LP.mesmaLei} da mesma lei e ≤ ${LP.leisDistintas} leis distintas por dia no reagendamento.` }),
      no('l.rej', 'rejeicao', 'Sem LegProc no dia', 4, 7, { descricao: 'Sem sobra: o LegProc espera o próximo dia.' }),
    ],
    arestas: [
      ar('d.ini', 'd.restr'), ar('d.restr', 'd.lim', 'não'), ar('d.restr', 'd.rej', 'sim'), ar('d.lim', 'd.teto', 'sim'), ar('d.lim', 'd.rej', 'não'),
      ar('d.teto', 'd.novos', 'sim'), ar('d.teto', 'd.rej', 'não'), ar('d.novos', 'd.ok', 'sim'), ar('d.novos', 'd.rej', 'não'),
      ar('rf.d', 'rf.sim', 'sim'), ar('rf.d', 'rf.nao', 'não'),
      ar('j.d1', 'j.d2', 'sim'), ar('j.d1', 'j.rej', 'não'), ar('j.d2', 'j.res', 'sim'), ar('j.d2', 'j.rej', 'não'),
      ar('l.d', 'l.res', 'sim'), ar('l.d', 'l.rej', 'não'),
    ],
  }

  // 6) Precedência de aplicação (8 camadas, do mapa) ───────────────────────────────────────────────
  const camadas: Array<[string, string]> = [
    ['Preservar execução registrada', 'Referências estáveis e capacidade restante.'],
    ['Dependências e ordem editorial', 'Ordem interna da disciplina e entrada das complementares.'],
    ['Limite diário e leitura na mesma semana', `Até ${R.divisao.maxDatas} datas.`],
    ['Faixa, semana de revisão, reta final e Jurisprudência', 'A reserva da Jurisprudência vem antes das demais metas.'],
    ['Continuação aberta e leituras inteiras', `Protegendo a capacidade dos retornos previstos (janela de ${R.divisao.janelaLeituraInteiraSemanas} semanas para leitura inteira).`],
    ['Revisão e questões elegíveis', 'De 25h a 35h, se os retornos não couberem, cede um dia de leitura nova.'],
    ['Reavaliar a sobra para um PDFull inteiro', `Exceção de aproveitamento após a semana ${RF.semanaEncaixeExtra} e regras da reta final.`],
    ['LegProc na sobra', 'Primeiro bloco e, depois, o segundo bloco de outra lei.'],
  ]
  const prec: DiagramaFluxo = {
    id: 'precedencia', titulo: 'Precedência de aplicação (8 camadas)',
    resumo: 'Ordem em que o motor aplica as regras; as de cima vencem as de baixo. Texto do mapa; valores das regras vigentes.',
    nos: camadas.map(([t, d], k) => no(`p.${k + 1}`, 'etapa', `${k + 1}. ${t}`, k % 4, Math.floor(k / 4), { descricao: d, ...(k === 2 || k === 3 || k === 4 || k === 6 ? { link: L_FAIXAS } : {}) })),
    arestas: camadas.slice(1).map((_, k) => ar(`p.${k + 1}`, `p.${k + 2}`)),
  }

  // 7) Dominó "fiz / não fiz" ──────────────────────────────────────────────────────────────────────
  const domino: DiagramaFluxo = {
    id: 'domino', titulo: 'Árvore E · Dominó (fiz / não fiz)',
    resumo: 'O que acontece quando o aluno age sobre o plano. Geração × dominó: o teto semanal é inicial no dominó (até a reta final) e pode ser ultrapassado após a semana 4 na geração.',
    nos: [
      no('m.ini', 'inicio', 'Aluno age sobre uma meta', 0, 1, { descricao: 'Marca a meta como feita ou não feita, adia, ou informa o acerto. Gatilho do dominó = ação do aluno (na geração, o gatilho é configurar/recalcular).' }),
      no('m.fez', 'decisao', 'Fez a meta?', 1, 1, { descricao: 'Metas concluídas ficam fixas e nunca se movem.' }),
      no('m.conc', 'resultado', 'Concluída e fixa', 2, 0, { descricao: `Gera os retornos previstos (PDFlash/questões). ${A.antecipaRetornoAtivo ? 'O retorno pode ser antecipado conforme a revisão.' : 'Antecipação de retorno DESLIGADA: nunca antes do due.'}`, valor: A.antecipaRetornoAtivo ? 'Antecipa retorno: ligado' : 'Antecipa retorno: desligado', link: L_RESTR }),
      no('m.dom', 'decisao', 'Dominó ativo?', 2, 2, { valor: A.dominoAtivo ? 'Ligado' : 'Desligado', link: L_RESTR, descricao: 'Interruptor da adaptação (aba Faixas e limites › Adaptação por desempenho).' }),
      no('m.refl', 'resultado', 'Refluxo do plano', 3, 1, { descricao: 'As metas seguintes são reacomodadas pelas regras (mesma precedência da geração), preservando o que já foi executado.' }),
      no('m.adia', 'resultado', 'Só adia a meta', 3, 3, { descricao: 'Dominó desligado: só adia o que o aluno pediu, sem refluxo (o rastro registra "adiada sem dominó").' }),
      no('m.nota', 'decisao', 'Informou o acerto?', 1, 4, { inferido: true, descricao: 'Notas/acertos do aluno alimentam o diagnóstico e a semana especial.' }),
      no('m.ref', 'decisao', 'Reforço ativo?', 2, 4, { valor: A.reforcoAtivo ? 'Ligado' : 'Desligado', link: L_RESTR, descricao: 'Interruptor do reforço do diagnóstico.' }),
      no('m.refok', 'resultado', 'Meta :reforco: criada', 3, 4, { descricao: `Acerto < ${D.historicoFlashMin}% → PDFull; até < ${D.historicoOkMin}% → PDFlash (veja a árvore C).` }),
      no('m.refoff', 'rejeicao', 'Nenhuma meta :reforco:', 3, 5, { descricao: 'Reforço desligado: nada é criado por desempenho.' }),
    ],
    arestas: [ar('m.ini', 'm.fez'), ar('m.fez', 'm.conc', 'sim'), ar('m.fez', 'm.dom', 'não'), ar('m.dom', 'm.refl', 'sim'), ar('m.dom', 'm.adia', 'não'), ar('m.ini', 'm.nota'), ar('m.nota', 'm.ref', 'sim'), ar('m.ref', 'm.refok', 'sim'), ar('m.ref', 'm.refoff', 'não')],
  }

  return [cadastro, faixa, revisao, diagnostico, dia, prec, domino]
}

// ── Simulador de faixa (E2) ──────────────────────────────────────────────────────────────────────────
export interface CaminhoRotina {
  minutosSemana: number
  faixa: 1 | 2 | 3
  /** Faixa de carga dinâmica (0-based) e nome. */
  faixaIdx: number
  faixaNome: string
  teto: number
  tetoAteMin: number | null
  equilibra: boolean
  revisao: { modo: 'ciclo' | 'desempenho' | 'desligada'; periodicidade: number; opcoes: number[] }
  limites: { pdfDistintos: number; revisoes: number; questoes: number; pdfNovosBase: number; pdfNovosAposConclusao: number }
  historicoMetaSemanal: number
  jurisReserva: boolean
  /** ids dos nós percorridos, em ordem (navegar nas árvores A, B, C, D). */
  caminho: string[]
  avisos: string[]
}

export function sanitizarHoras(horas: unknown): number[] {
  const a = Array.isArray(horas) ? horas : []
  return Array.from({ length: 7 }, (_, k) => {
    const n = Number(a[k])
    return Number.isFinite(n) ? Math.max(0, Math.min(24, Math.round(n * 2) / 2)) : 0
  })
}

/** Resolve a rotina (horas por dia, seg→dom) nas regras e devolve o caminho percorrido nas árvores. `regra23=false` simula plano 3.1. */
export function caminhoDaRotina(horas: unknown, R: RegrasMotor, regra23 = true): CaminhoRotina {
  const h = sanitizarHoras(horas)
  const min = Math.round(h.reduce((t, x) => t + x, 0) * 60)
  const fx = resolverFaixaCarga(min, R), idx = resolverIndiceFaixa(min, R), faixa = classeDaFaixa(fx)
  const linha = resolverTetoPdf(min, regra23, R)
  const ciclo = fx.revisaoModo === 'ciclo'
  const c: string[] = ['f.carga']
  for (let k = 0; k <= idx; k++) if (k < R.faixas.length - 1) c.push(`f.d${k}`)
  c.push(`f.r${idx}`)
  c.push('r.carga', 'r.d')
  let revisao: CaminhoRotina['revisao']
  if (ciclo) { c.push('r.ciclo'); revisao = { modo: 'ciclo', periodicidade: cicloDaFaixa(fx, R), opcoes: [cicloDaFaixa(fx, R)] } }
  else if (!R.adaptacao.semanaEspecialAtiva) { c.push('r.sem', 'r.off'); revisao = { modo: 'desligada', periodicidade: 0, opcoes: [] } }
  else { c.push('r.sem', 'r.perio'); revisao = { modo: 'desempenho', periodicidade: padraoDaFaixa(fx, R), opcoes: opcoesDaFaixa(fx, R) } }
  const alta = min >= R.historico.corteAltaMin
  c.push('h.d', alta ? 'h.alta' : 'h.base')
  c.push('d.ini', 'd.restr', 'd.lim', 'd.teto', 'd.novos')
  const jurisReserva = min >= R.juris.minSemanalMin
  c.push('j.d1', 'j.d2', jurisReserva ? 'j.res' : 'j.rej')
  const avisos: string[] = []
  if (min === 0) avisos.push('Rotina sem horas: nenhum dia ativo.')
  if (R.constantes.cargaMinimaMin > 0 && min < R.constantes.cargaMinimaMin) avisos.push(`Abaixo da carga mínima configurada (${fmtMin(R.constantes.cargaMinimaMin)}): a geração do plano é rejeitada.`)
  else if (min > 0 && min < 600) avisos.push('Abaixo de 10h: a especificação (mapa) manda rejeitar a configuração, mas o motor vigente aceita (carga mínima = 0).')
  if (R.juris.exigeOptIn) avisos.push('Jurisprudência só é reservada se o aluno marcar o opt-in (assumido marcado no caminho).')
  if (!regra23 && R.faixas.some((l) => l.soRegra23)) avisos.push('Plano 3.1: o teto das faixas "só regra 23" é pulado (vale o da faixa seguinte).')
  if (Object.values(fx.overrides || {}).some((o) => o && Object.keys(o).length)) avisos.push(`A faixa "${fx.nome}" sobrescreve parâmetros globais (veja a matriz em Faixas).`)
  return {
    minutosSemana: min, faixa, faixaIdx: idx, faixaNome: fx.nome, teto: linha.teto, tetoAteMin: linha.ateMin, equilibra: linha.equilibra, revisao, limites: { ...R.limitesDia },
    historicoMetaSemanal: alta ? R.historico.metaSemanalAlta : R.historico.metaSemanalBase, jurisReserva, caminho: c, avisos,
  }
}
