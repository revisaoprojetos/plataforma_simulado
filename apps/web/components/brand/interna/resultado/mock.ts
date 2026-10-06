// Mock do RESULTADO INTERNO no formato do CONTRATO REAL (`ResultadoInternoData`).
// Serve só à /interna/preview: alimenta as telas branded sem backend. Produção passa
// `data` real; aqui geramos um exemplo determinístico (LCG) a partir de SEEDS canônicos
// (Rev 80 q / 2 realizações · VND 100 q / 3 · MEQ 120 q / 3). Nada de rede.
//
// IMPORTANTE: só preenche campos que TÊM fonte real no contrato. Widgets do protótipo antigo
// sem dado real (histograma da turma, você×turma por disciplina, barcode comparativo pesado,
// questões mais difíceis da turma, pódio/vizinhos) NÃO existem mais — foram descartados.

import type { Brand } from '../interna-tokens'
import type {
  ResCorrecao,
  ResDificil,
  ResDificuldade,
  ResDisc,
  ResDownload,
  ResHistBin,
  ResPadrao,
  ResRankPeer,
  ResRanking,
  ResTentativa,
  ResultadoInternoData,
} from './data'

// ---- LCG determinístico -------------------------------------------------------
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}
function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

function tfmt(sec: number) {
  sec = Math.floor(sec)
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`
  return `${Math.floor(sec / 60)}min ${String(sec % 60).padStart(2, '0')}s`
}

type QStatus = 'certa' | 'errada' | 'branco' | 'anulada'

type SeedQ = {
  disc: string
  assunto: string
  gab: 'C' | 'E'
  resp: 'C' | 'E' | null
  enunciado?: string
  comentario?: string
}

type Seed = {
  titulo: string
  short: string
  banca: string
  date: string
  pos: number
  part: number
  seed: number
  discs: [string, number, string[]][]
  att: [string, number, number][] // [date, pos, pct-base de acerto]
  det: SeedQ[]
}

const SEEDS: Record<Brand, Seed> = {
  revisao: {
    titulo: '24/07/2026 – Direito do Trabalho e Processo do Trabalho',
    short: 'TRABALHO',
    banca: 'Revisão · estilo Cebraspe',
    date: '24/07/2026',
    pos: 100,
    part: 104,
    seed: 11,
    discs: [
      ['Direito do Trabalho', 40, ['Jornada de trabalho', 'Férias', 'Aviso prévio', 'Rescisão contratual', 'Remuneração', 'Estabilidades', 'Terceirização', 'Proteção ao trabalho da mulher']],
      ['Direito Processual do Trabalho', 40, ['Competência material', 'Recursos', 'Execução', 'Rito sumaríssimo', 'Prescrição intercorrente', 'Dissídio coletivo', 'Audiência', 'Provas']],
    ],
    att: [['24/07/26', 101, 0.34], ['13/08/26', 100, 0.44]],
    det: [
      { disc: 'Direito do Trabalho', assunto: 'Proteção ao trabalho da mulher', gab: 'C', resp: 'E',
        enunciado: 'A expressão "estabelecimento", constante do § 1º do art. 389 da CLT, deve ser interpretada de modo a abranger o shopping center em relação às empregadas dos lojistas que nele atuam, em razão da proteção constitucional conferida ao mercado de trabalho da mulher, à maternidade e à infância.',
        comentario: 'Gabarito: CERTO. O TST firmou entendimento de que o shopping center se equipara a "estabelecimento" para fins do art. 389, § 1º, da CLT, devendo manter local apropriado para a guarda dos filhos das empregadas dos lojistas no período de amamentação.' },
      { disc: 'Direito Processual do Trabalho', assunto: 'Competência material', gab: 'C', resp: 'E',
        enunciado: 'Compete à Justiça do Trabalho processar e julgar ação civil pública ajuizada pelo Ministério Público do Trabalho que tenha por objeto exclusivamente a implementação de medidas de saúde, higiene e segurança no ambiente de trabalho, ainda que os trabalhadores beneficiados sejam servidores submetidos a regime jurídico estatutário.',
        comentario: 'Gabarito: CERTO. O STF entende que, quando o pedido se refere ao meio ambiente de trabalho (normas de saúde, higiene e segurança), a competência é da Justiça do Trabalho, independentemente do vínculo dos trabalhadores (Súmula 736 do STF).' },
      { disc: 'Direito do Trabalho', assunto: 'Atividade especial', gab: 'E', resp: 'E',
        enunciado: 'Após a entrada em vigor da Lei nº 9.032/1995, é vedado o reconhecimento da especialidade da atividade com fundamento na penosidade, ainda que perícia técnica individualizada comprove a exposição habitual e permanente do segurado a condições concretas de desgaste à saúde.',
        comentario: 'Gabarito: ERRADO. A jurisprudência admite o reconhecimento da especialidade quando a perícia comprova a efetiva exposição a agentes nocivos, ainda que a atividade não conste de rol regulamentar.' },
      { disc: 'Direito do Trabalho', assunto: 'Aviso prévio', gab: 'C', resp: 'C',
        enunciado: 'Segundo a jurisprudência do TST, a proporcionalidade do aviso prévio ao tempo de serviço, prevista na Lei nº 12.506/2011, aplica-se apenas em favor do empregado.',
        comentario: 'Gabarito: CERTO. O TST consolidou que o acréscimo de 3 dias por ano trabalhado é direito exclusivo do empregado, não podendo ser exigido dele quando pede demissão.' },
      { disc: 'Direito Processual do Trabalho', assunto: 'Prescrição intercorrente', gab: 'C', resp: 'C',
        enunciado: 'Após a Reforma Trabalhista, ocorre a prescrição intercorrente no processo do trabalho no prazo de dois anos, contado a partir do momento em que o exequente deixa de cumprir determinação judicial no curso da execução.',
        comentario: 'Gabarito: CERTO. É a redação do art. 11-A da CLT, incluído pela Lei nº 13.467/2017.' },
      { disc: 'Direito Processual do Trabalho', assunto: 'Rito sumaríssimo', gab: 'E', resp: 'C',
        enunciado: 'Nas reclamações trabalhistas submetidas ao procedimento sumaríssimo, admite-se a citação do reclamado por edital quando ele estiver em local incerto e não sabido.',
        comentario: 'Gabarito: ERRADO. O art. 852-B, II, da CLT veda expressamente a citação por edital no rito sumaríssimo, cabendo ao autor indicar corretamente o nome e o endereço do reclamado.' },
      { disc: 'Direito do Trabalho', assunto: 'Jornada de trabalho', gab: 'E', resp: 'E' },
      { disc: 'Direito Processual do Trabalho', assunto: 'Recursos', gab: 'C', resp: 'E' },
      { disc: 'Direito Processual do Trabalho', assunto: 'Execução', gab: 'E', resp: 'C' },
      { disc: 'Direito Processual do Trabalho', assunto: 'Dissídio coletivo', gab: 'C', resp: 'E' },
    ],
  },
  vnd: {
    titulo: 'DPU (2026) – Cebraspe',
    short: 'DPU',
    banca: 'Cebraspe',
    date: '22/09/2026',
    pos: 38,
    part: 412,
    seed: 22,
    discs: [
      ['Direito Constitucional', 20, ['Defensoria na CF', 'Assistência jurídica', 'Direitos fundamentais', 'Controle de constitucionalidade']],
      ['Direito Institucional', 15, ['Vedações (LC 80/94)', 'Intimação pessoal', 'Prerrogativas', 'Autonomia']],
      ['Direito Processual Civil', 15, ['Prerrogativas processuais', 'Tutela coletiva', 'Recursos', 'Gratuidade']],
      ['Direito Penal', 15, ['Execução penal', 'Crimes contra o patrimônio', 'Dosimetria']],
      ['Direito Processual Penal', 15, ['Súmula Vinculante 14', 'Prisões cautelares', 'Audiência de custódia']],
      ['Direitos Humanos', 10, ['Sistema interamericano', 'Tratados']],
      ['ECA', 10, ['Medidas socioeducativas', 'Acolhimento']],
    ],
    att: [['02/09/26', 140, 0.55], ['14/09/26', 96, 0.62], ['22/09/26', 38, 0.71]],
    det: [
      { disc: 'Direito Constitucional', assunto: 'Defensoria na CF', gab: 'C', resp: 'C',
        enunciado: 'A Defensoria Pública da União tem legitimidade para propor ação civil pública em defesa de direitos difusos, coletivos ou individuais homogêneos de pessoas necessitadas.',
        comentario: 'Gabarito: CERTO. Art. 5º, II, da Lei 7.347/85 e art. 4º, VII, da LC 80/94. O STF reconheceu a constitucionalidade dessa legitimidade na ADI 3.943.' },
      { disc: 'Direito Processual Civil', assunto: 'Prerrogativas processuais', gab: 'C', resp: 'C',
        enunciado: 'O prazo em dobro para manifestações processuais da Defensoria Pública aplica-se também aos processos em autos eletrônicos.',
        comentario: 'Gabarito: CERTO. O art. 186 do CPC garante prazo em dobro à Defensoria; diferentemente do litisconsórcio (art. 229, § 2º), não há exceção para autos eletrônicos.' },
      { disc: 'Direito Institucional', assunto: 'Vedações (LC 80/94)', gab: 'C', resp: 'E',
        enunciado: 'É vedado ao membro da Defensoria Pública da União exercer a advocacia fora das atribuições institucionais.',
        comentario: 'Gabarito: CERTO. Art. 46, I, da LC 80/94. A vedação decorre também do art. 134, § 1º, da CF.' },
      { disc: 'Direito Constitucional', assunto: 'Assistência jurídica', gab: 'E', resp: 'E',
        enunciado: 'A assistência jurídica integral e gratuita prestada pela Defensoria Pública abrange apenas a atuação judicial.',
        comentario: 'Gabarito: ERRADO. A assistência é integral: inclui orientação jurídica, atuação extrajudicial, mediação e educação em direitos (art. 4º da LC 80/94).' },
      { disc: 'Direito Processual Penal', assunto: 'Súmula Vinculante 14', gab: 'C', resp: 'C',
        enunciado: 'Segundo a Súmula Vinculante 14, é direito do defensor ter acesso amplo aos elementos de prova que, já documentados em procedimento investigatório, digam respeito ao exercício do direito de defesa.',
        comentario: 'Gabarito: CERTO. É a literalidade da SV 14. O acesso não alcança diligências em andamento.' },
      { disc: 'Direito Institucional', assunto: 'Intimação pessoal', gab: 'E', resp: 'C',
        enunciado: 'A intimação pessoal do defensor público pode ser substituída pela publicação no diário oficial, desde que conste o nome do membro responsável.',
        comentario: 'Gabarito: ERRADO. A intimação pessoal com vista dos autos é prerrogativa do defensor (art. 44, I, da LC 80/94) e não pode ser substituída por publicação.' },
      { disc: 'Direitos Humanos', assunto: 'Sistema interamericano', gab: 'C', resp: 'C' },
      { disc: 'Direito Penal', assunto: 'Execução penal', gab: 'E', resp: 'E' },
      { disc: 'Direito Constitucional', assunto: 'Controle de constitucionalidade', gab: 'C', resp: 'C' },
      { disc: 'Direito Processual Civil', assunto: 'Tutela coletiva', gab: 'C', resp: null },
    ],
  },
  meq: {
    titulo: 'PF – Agente (Simulado 02)',
    short: 'PF',
    banca: 'Cebraspe',
    date: '15/09/2026',
    pos: 1102,
    part: 1840,
    seed: 33,
    discs: [
      ['Língua Portuguesa', 20, ['Crase', 'Concordância', 'Regência', 'Interpretação']],
      ['Raciocínio Lógico', 10, ['Negação de proposições', 'Equivalências']],
      ['Informática', 10, ['Segurança da informação', 'Redes']],
      ['Direito Constitucional', 15, ['Segurança pública', 'Direitos fundamentais']],
      ['Direito Administrativo', 15, ['Poder de polícia', 'Atos administrativos']],
      ['Direito Penal', 15, ['Peculato culposo', 'Crimes contra a Adm.']],
      ['Direito Processual Penal', 15, ['Inquérito policial', 'Arquivamento', 'Prisão temporária']],
      ['Legislação Especial', 20, ['Lei de Drogas', 'Estatuto do Desarmamento', 'Abuso de autoridade']],
    ],
    att: [['15/09/26', 1102, 0.5], ['20/09/26', 846, 0.56], ['27/09/26', 1390, 0.47]],
    det: [
      { disc: 'Direito Processual Penal', assunto: 'Inquérito policial', gab: 'C', resp: 'C',
        enunciado: 'O inquérito policial é procedimento administrativo, inquisitivo e dispensável para a propositura da ação penal.',
        comentario: 'Gabarito: CERTO. O IP tem natureza administrativa e caráter inquisitivo; é dispensável quando o titular da ação já dispõe de elementos suficientes (arts. 12, 27 e 39, § 5º, do CPP).' },
      { disc: 'Direito Processual Penal', assunto: 'Arquivamento', gab: 'E', resp: 'C',
        enunciado: 'A autoridade policial poderá mandar arquivar autos de inquérito quando entender que não há indícios de autoria.',
        comentario: 'Gabarito: ERRADO. Art. 17 do CPP: a autoridade policial não poderá mandar arquivar autos de inquérito.' },
      { disc: 'Língua Portuguesa', assunto: 'Crase', gab: 'C', resp: 'C',
        enunciado: 'Na frase "Refiro-me à questão discutida na reunião", o emprego do acento indicativo de crase é obrigatório.',
        comentario: 'Gabarito: CERTO. O verbo "referir-se" exige a preposição "a", que se funde ao artigo feminino "a" de "a questão".' },
      { disc: 'Direito Processual Penal', assunto: 'Prisão temporária', gab: 'E', resp: 'C',
        enunciado: 'A prisão temporária pode ser decretada de ofício pelo juiz durante o inquérito policial.',
        comentario: 'Gabarito: ERRADO. Art. 2º da Lei 7.960/89: depende de representação da autoridade policial ou de requerimento do Ministério Público.' },
      { disc: 'Direito Penal', assunto: 'Peculato culposo', gab: 'C', resp: 'E',
        enunciado: 'No peculato culposo, a reparação do dano, se anterior à sentença irrecorrível, extingue a punibilidade.',
        comentario: 'Gabarito: CERTO. Art. 312, § 3º, do CP. Se a reparação for posterior, reduz de metade a pena imposta.' },
      { disc: 'Raciocínio Lógico', assunto: 'Negação de proposições', gab: 'E', resp: 'E',
        enunciado: 'A negação da proposição "Todo policial é atento" é "Nenhum policial é atento".',
        comentario: 'Gabarito: ERRADO. A negação correta é "Algum policial não é atento".' },
      { disc: 'Informática', assunto: 'Segurança da informação', gab: 'C', resp: 'C' },
      { disc: 'Direito Constitucional', assunto: 'Segurança pública', gab: 'C', resp: 'E' },
      { disc: 'Direito Administrativo', assunto: 'Poder de polícia', gab: 'E', resp: 'E' },
      { disc: 'Legislação Especial', assunto: 'Lei de Drogas', gab: 'C', resp: 'E' },
    ],
  },
}

const altsFor = (gab: 'C' | 'E'): ResCorrecao['alternativas'] => [
  { letra: 'C', texto: 'Certo', correta: gab === 'C' },
  { letra: 'E', texto: 'Errado', correta: gab === 'E' },
]

const statusOf = (gab: 'C' | 'E', resp: 'C' | 'E' | null): QStatus =>
  resp === null ? 'branco' : resp === gab ? 'certa' : 'errada'

type Dif = 'facil' | 'media' | 'dificil'
const difOf = (rng: () => number): Dif => { const r = rng(); return r < 0.33 ? 'facil' : r < 0.7 ? 'media' : 'dificil' }

function build(brand: Brand): ResultadoInternoData {
  const sp = SEEDS[brand]
  const rng = makeRng(sp.seed)
  const natt = sp.att.length

  // ---- monta as questões (detalhadas + preenchidas por disciplina) ----
  type QFull = { disc: string; assunto: string; gab: 'C' | 'E'; resp: 'C' | 'E' | null; status: QStatus; enun?: string; com?: string; time: number; dif: Dif; turma: number }
  const qs: QFull[] = []
  for (const [dn, cnt, assuntos] of sp.discs) {
    const mine = sp.det.filter((q) => q.disc === dn)
    mine.forEach((q) => {
      const st = statusOf(q.gab, q.resp)
      qs.push({ disc: dn, assunto: q.assunto, gab: q.gab, resp: q.resp, status: st, enun: q.enunciado, com: q.comentario, time: 35 + Math.floor(rng() * 155), dif: difOf(rng), turma: 34 + Math.floor(rng() * 56) })
    })
    const base = sp.att[natt - 1][2]
    for (let j = 0; j < cnt - mine.length; j++) {
      const r = rng()
      const status: QStatus = r < 0.04 ? 'branco' : r < 0.04 + base ? 'certa' : 'errada'
      const gab: 'C' | 'E' = pick(rng, ['C', 'E'])
      const resp = status === 'branco' ? null : status === 'certa' ? gab : gab === 'C' ? 'E' : 'C'
      qs.push({ disc: dn, assunto: assuntos[j % assuntos.length], gab, resp, status, time: 35 + Math.floor(rng() * 155), dif: difOf(rng), turma: 34 + Math.floor(rng() * 56) })
    }
  }

  const N = qs.length
  const acertos = qs.filter((q) => q.status === 'certa').length
  const erros = qs.filter((q) => q.status === 'errada').length
  const branco = qs.filter((q) => q.status === 'branco').length
  const totalSec = qs.reduce((s, q) => s + q.time, 0)
  const nota = Math.round((1000 * acertos) / N) / 10
  const pct = Math.round((100 * acertos) / N)

  const discNomes = sp.discs.map(([dn]) => dn)
  const discCnt = new Map(sp.discs.map(([dn, cnt]) => [dn, cnt]))
  const porDisciplina: ResDisc[] = discNomes.map((dn) => {
    const seg = qs.filter((q) => q.disc === dn)
    const ac = seg.filter((q) => q.status === 'certa').length
    const tt = discCnt.get(dn)!
    const turma = Math.round(seg.reduce((s, q) => s + q.turma, 0) / Math.max(seg.length, 1))
    return { nome: dn, ac, tt, pct: Math.round((100 * ac) / tt), turmaPct: turma }
  })

  // ---- tentativas (realizações) ----
  const attStatus: QStatus[][] = [] // mapa de status por tentativa (p/ barcode)
  const tentativas: ResTentativa[] = sp.att.map(([date, pos, basePct], a) => {
    // a última tentativa é a sessão corrente (usa os status reais); as anteriores
    // derivam determinísticamente do pct-base só para o preview.
    const last = a === natt - 1
    const rngA = makeRng(sp.seed + (a + 1) * 97)
    let ac = 0, er = 0, bl = 0
    const discAc = new Map<string, number>(discNomes.map((dn) => [dn, 0]))
    const myMapa: QStatus[] = []
    for (const q of qs) {
      let st: QStatus
      if (last) st = q.status
      else {
        const r = rngA()
        st = r < 0.05 ? 'branco' : r < 0.05 + basePct ? 'certa' : 'errada'
      }
      myMapa.push(st)
      if (st === 'certa') { ac++; discAc.set(q.disc, (discAc.get(q.disc) ?? 0) + 1) }
      else if (st === 'errada') er++
      else bl++
    }
    attStatus.push(myMapa)
    const secs = totalSec * (1 + 0.12 * (natt - 1 - a))
    return {
      n: a + 1,
      nota: Math.round((1000 * ac) / N) / 10,
      acertos: ac,
      erros: er,
      branco: bl,
      total: N,
      pct: Math.round((100 * ac) / N),
      tempo: tfmt(secs),
      posicao: pos,
      data: date,
      mapa: myMapa,
      porDisc: discNomes.map((dn) => ({ nome: dn, ac: discAc.get(dn) ?? 0, tt: discCnt.get(dn)!, pct: Math.round((100 * (discAc.get(dn) ?? 0)) / discCnt.get(dn)!), turmaPct: porDisciplina.find((p) => p.nome === dn)?.turmaPct })),
    }
  })

  const mapa = qs.map((q, i) => ({ ordem: i + 1, status: q.status }))

  // histórico por questão (status por tentativa) + mudança entre as 2 últimas
  const correcao: ResCorrecao[] = qs.map((q, i) => {
    const hist = attStatus.map((m) => m[i])
    const prev = hist.length >= 2 ? hist[hist.length - 2] : null
    const curr = hist[hist.length - 1]
    let mudanca: ResCorrecao['mudanca'] = 'keep'
    if (prev) {
      if (prev !== 'certa' && curr === 'certa') mudanca = 'up'
      else if (prev === 'certa' && curr !== 'certa') mudanca = 'down'
    }
    // % da turma que marcou cada alternativa (C/E): aproxima pela turma de acerto
    const correta = q.turma
    const outra = 100 - correta
    const cPct = q.gab === 'C' ? correta : outra
    const ePct = q.gab === 'E' ? correta : outra
    return {
      ordem: i + 1,
      enunciado: q.enun ?? `Item ${i + 1} — ${q.assunto} (${q.disc}).`,
      disciplina: q.disc,
      dificuldade: q.dif,
      comentario: q.com ?? null,
      status: q.status,
      gabarito: q.gab,
      turmaPct: q.turma,
      tempoSeg: q.time,
      historico: hist,
      mudanca,
      alternativas: altsFor(q.gab).map((alt) => ({
        ...alt,
        turmaPct: alt.letra === 'C' ? cPct : ePct,
        usuario: q.resp !== null && alt.letra === q.resp,
      })),
    }
  })

  // ---- blocos de EXEMPLO (sample) ----
  const dificuldade: ResDificuldade[] = (['facil', 'media', 'dificil'] as const).map((nivel) => {
    const seg = qs.filter((q) => q.dif === nivel)
    const ac = seg.filter((q) => q.status === 'certa').length
    const turma = Math.round(seg.reduce((s, q) => s + q.turma, 0) / Math.max(seg.length, 1))
    return { nivel, pct: Math.round((100 * ac) / Math.max(seg.length, 1)), turmaPct: turma, qtd: seg.length }
  })

  const marcC = qs.filter((q) => q.resp === 'C')
  const marcE = qs.filter((q) => q.resp === 'E')
  const padrao: ResPadrao = {
    marcouCpct: Math.round((100 * marcC.length) / N),
    marcouEpct: Math.round((100 * marcE.length) / N),
    brancoPct: Math.round((100 * branco) / N),
    acertoQuandoC: Math.round((100 * marcC.filter((q) => q.status === 'certa').length) / Math.max(marcC.length, 1)),
    acertoQuandoE: Math.round((100 * marcE.filter((q) => q.status === 'certa').length) / Math.max(marcE.length, 1)),
    acertoBranco: 0,
    dica:
      marcC.filter((q) => q.status === 'certa').length / Math.max(marcC.length, 1) >
      marcE.filter((q) => q.status === 'certa').length / Math.max(marcE.length, 1)
        ? 'Você acerta mais quando marca "Certo". Ao marcar "Errado", releia o item com atenção antes de decidir.'
        : 'Você acerta mais quando marca "Errado". Desconfie de itens que parecem óbvios demais ao marcar "Certo".',
  }

  const tempoPorQuestao = qs.map((q, i) => ({ ordem: i + 1, seg: q.time, status: q.status }))
  const tempoMedia = Math.round(totalSec / N)

  // assuntos mais errados (top 5 por nº de erros)
  const errByAssunto = new Map<string, { disciplina: string; erros: number; total: number }>()
  for (const q of qs) {
    const e = errByAssunto.get(q.assunto) ?? { disciplina: q.disc, erros: 0, total: 0 }
    e.total++
    if (q.status === 'errada') e.erros++
    errByAssunto.set(q.assunto, e)
  }
  const assuntosMaisErrados = [...errByAssunto.entries()]
    .map(([assunto, v]) => ({ assunto, ...v }))
    .filter((v) => v.erros > 0)
    .sort((a, b) => b.erros - a.erros)
    .slice(0, 5)

  // ---- ranking (sample, iniciais apenas) ----
  const ranking = buildRanking(brand, sp, nota, acertos, N, qs)

  const downloads: ResDownload[] = [
    { nome: 'Caderno de questões', href: '#caderno', comGab: false },
    { nome: 'Folha de respostas', href: '#folha', comGab: false },
    { nome: 'Folha com gabarito', href: '#folha-gabarito', comGab: true },
    { nome: 'Gabarito comentado', href: '#comentado', comGab: true },
    { nome: 'Diagnóstico', href: '#diagnostico', comGab: true },
  ]

  return {
    titulo: sp.titulo,
    banca: sp.banca,
    short: sp.short,
    notaLiberada: true,
    gabaritoLiberado: true,
    refazerHref: '/simulado/mock',
    cadernoHref: '#caderno',
    treinarErrosHref: '/simulado/meus-erros',
    melhor: {
      nota, acertos, erros, branco, total: N, pct, tempo: tfmt(totalSec), tpq: tfmt(Math.round(totalSec / N)),
      posicao: sp.pos, participantes: sp.part, mediaTurma: ranking.mediaTurma,
      percentil: ranking.percentil, xp: 40 + Math.floor(pct / 2),
    },
    tentativas,
    porDisciplina,
    mapa,
    correcao,
    downloads,
    dificuldade,
    padrao,
    ranking,
    tempoPorQuestao,
    tempoMedia,
    assuntosMaisErrados,
    corteEstimado: brand === 'meq' ? 60 : undefined,
  }
}

// ---- ranking sample (iniciais apenas, nunca nome real) -------------------------
function buildRanking(
  brand: Brand,
  sp: Seed,
  nota: number,
  acertos: number,
  N: number,
  qs: { disc: string; dif: string; turma: number; status: QStatus }[],
): ResRanking {
  const rng = makeRng(sp.seed + 777)
  const participantes = sp.part
  const posicao = sp.pos
  const percentil = Math.max(1, Math.min(99, Math.round(100 * (1 - posicao / participantes))))
  const mediaTurma = Math.round((brand === 'revisao' ? 741 : brand === 'vnd' ? 582 : 523) / 10 * 10) / 10

  // histograma de notas (10 faixas), com a faixa do aluno marcada
  const inis = ['M. A.', 'J. C.', 'R. S.', 'L. F.', 'A. G.', 'P. H.', 'C. M.', 'T. B.', 'F. D.', 'N. R.']
  const histograma: ResHistBin[] = Array.from({ length: 10 }).map((_, i) => {
    const center = 45 + i * 3
    const dist = Math.abs(center - mediaTurma)
    const qtd = Math.max(2, Math.round(participantes / (10 + dist * 1.2) * (0.5 + rng())))
    const faixaLo = i * 10
    return { faixa: `${faixaLo}-${faixaLo + 10}`, qtd, voce: nota >= faixaLo && nota < faixaLo + 10 }
  })
  const mediaMarcador = mediaTurma

  const top: ResRankPeer[] = Array.from({ length: 5 }).map((_, i) => ({
    iniciais: inis[i],
    nota: Math.round((980 - i * 12 - Math.floor(rng() * 8)) / 10) / 10,
    acertos: Math.round(N * (0.98 - i * 0.013)),
    posicao: i + 1,
  }))
  const voce: ResRankPeer = { iniciais: 'Você', nota, acertos, posicao, voce: true }

  // questões mais difíceis p/ a turma (menor turma%)
  const dificeis: ResDificil[] = qs
    .map((q, i) => ({ ordem: i + 1, disciplina: q.disc, turmaPct: q.turma, seuStatus: q.status }))
    .sort((a, b) => a.turmaPct - b.turmaPct)
    .slice(0, 5)

  const base: ResRanking = { participantes, posicao, percentil, mediaTurma, histograma, mediaMarcador, top, voce, dificeis }

  if (brand === 'vnd') {
    base.podio = [
      { iniciais: 'M. A.', nota: top[0].nota, acertos: top[0].acertos, posicao: 1 },
      { iniciais: 'J. C.', nota: top[1].nota, acertos: top[1].acertos, posicao: 2 },
      { iniciais: 'R. S.', nota: top[2].nota, acertos: top[2].acertos, posicao: 3 },
    ]
  }
  if (brand === 'meq') {
    const corte = 60
    const faltam = Math.max(0, Math.ceil(((corte - nota) / 100) * N))
    base.corteEstimado = { valor: corte, diff: Math.round((nota - corte) * 10) / 10, faltam }
  }
  return base
}

const CACHE: Partial<Record<Brand, ResultadoInternoData>> = {}

/** Mock no formato do contrato real — usado pela /interna/preview. */
export function resultadoMock(brand: Brand = 'revisao'): ResultadoInternoData {
  return (CACHE[brand] ??= build(brand))
}

/**
 * Completa os blocos de EXEMPLO ausentes a partir dos dados REAIS obrigatórios
 * (correcao/mapa/tentativas/melhor). Usado em PRODUÇÃO: quando o backend não fornece
 * turma/ranking/tempo/dificuldade/padrão, derivamos valores determinísticos para que os
 * blocos do mockup apareçam populados (fidelidade visual) em vez de "Sem dados".
 * Outros alunos só por INICIAIS de exemplo (nunca nome real — privacidade §2.4).
 */
export function deriveSamples(brand: Brand, data: ResultadoInternoData): ResultadoInternoData {
  const N = Math.max(data.melhor.total, data.correcao.length, 1)
  const rng = makeRng(hashStr(data.titulo) ^ (N * 131))
  const out: ResultadoInternoData = { ...data }

  // turma % por questão (determinística) + dificuldade por questão quando ausentes
  const turmaDeOrdem = new Map<number, number>()
  const difDeOrdem = new Map<number, 'facil' | 'media' | 'dificil'>()
  for (const q of data.correcao) {
    turmaDeOrdem.set(q.ordem, q.turmaPct ?? 34 + Math.floor(rng() * 56))
    difDeOrdem.set(q.ordem, q.dificuldade ?? difOf(rng))
  }

  // correcao: preenche turmaPct/dificuldade/alternativas(%)/mudança se faltarem
  if (data.correcao.some((q) => q.turmaPct == null || !q.alternativas.some((a) => a.turmaPct != null))) {
    out.correcao = data.correcao.map((q) => {
      const turma = turmaDeOrdem.get(q.ordem)!
      const outra = 100 - turma
      return {
        ...q,
        turmaPct: q.turmaPct ?? turma,
        dificuldade: q.dificuldade ?? difDeOrdem.get(q.ordem),
        alternativas: q.alternativas.map((a) => ({
          ...a,
          turmaPct: a.turmaPct ?? (a.correta ? turma : outra),
        })),
      }
    })
  }

  // porDisciplina: turmaPct derivado (média da turma das questões da disciplina)
  if (data.porDisciplina.some((d) => d.turmaPct == null)) {
    const byDisc = new Map<string, number[]>()
    for (const q of out.correcao) {
      if (!q.disciplina) continue
      const arr = byDisc.get(q.disciplina) ?? []
      arr.push(q.turmaPct ?? 50)
      byDisc.set(q.disciplina, arr)
    }
    out.porDisciplina = data.porDisciplina.map((d) => {
      if (d.turmaPct != null) return d
      const arr = byDisc.get(d.nome) ?? []
      const t = arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : Math.max(0, Math.min(100, d.pct - 5 + Math.floor(rng() * 10)))
      return { ...d, turmaPct: t }
    })
  }

  // dificuldade (3 níveis)
  if (!out.dificuldade) {
    out.dificuldade = (['facil', 'media', 'dificil'] as const).map((nivel) => {
      const seg = out.correcao.filter((q) => (q.dificuldade ?? difDeOrdem.get(q.ordem)) === nivel)
      const ac = seg.filter((q) => q.status === 'certa').length
      const turma = seg.length ? Math.round(seg.reduce((s, q) => s + (q.turmaPct ?? 50), 0) / seg.length) : 50
      return { nivel, pct: Math.round((100 * ac) / Math.max(seg.length, 1)), turmaPct: turma, qtd: seg.length }
    })
  }

  // padrão de respostas (deriva do status — sem marcação C/E real, aproxima por acerto)
  if (!out.padrao) {
    const ok = out.correcao.filter((q) => q.status === 'certa').length
    const err = out.correcao.filter((q) => q.status === 'errada').length
    const bl = out.correcao.filter((q) => q.status === 'branco').length
    const tot = Math.max(ok + err + bl, 1)
    out.padrao = {
      marcouCpct: Math.round((100 * Math.round((ok + err) * 0.52)) / tot),
      marcouEpct: Math.round((100 * Math.round((ok + err) * 0.48)) / tot),
      brancoPct: Math.round((100 * bl) / tot),
      acertoQuandoC: Math.round((100 * ok) / Math.max(ok + err, 1)),
      acertoQuandoE: Math.max(0, Math.round((100 * ok) / Math.max(ok + err, 1)) - 6),
      acertoBranco: 0,
      dica: 'Releia com atenção os itens em que você hesitou — pequenas distrações explicam parte dos erros.',
    }
  }

  // tempo por questão (sample determinístico quando ausente)
  if (!out.tempoPorQuestao) {
    out.tempoPorQuestao = data.mapa.map((m) => ({ ordem: m.ordem, seg: 35 + Math.floor(rng() * 155), status: m.status }))
    out.tempoMedia = Math.round(out.tempoPorQuestao.reduce((s, q) => s + q.seg, 0) / Math.max(out.tempoPorQuestao.length, 1))
  }

  // assuntos mais errados (de correcao, por enunciado/disciplina quando não há assunto)
  if (!out.assuntosMaisErrados) {
    const byDisc = new Map<string, { erros: number; total: number }>()
    for (const q of out.correcao) {
      const key = q.disciplina ?? 'Geral'
      const e = byDisc.get(key) ?? { erros: 0, total: 0 }
      e.total++
      if (q.status === 'errada') e.erros++
      byDisc.set(key, e)
    }
    out.assuntosMaisErrados = [...byDisc.entries()]
      .map(([assunto, v]) => ({ assunto, disciplina: assunto, erros: v.erros, total: v.total }))
      .filter((v) => v.erros > 0)
      .sort((a, b) => b.erros - a.erros)
      .slice(0, 5)
  }

  // ranking (iniciais de exemplo; nunca nome real)
  if (!out.ranking) {
    out.ranking = buildRankingSample(brand, out, rng)
  }

  if (brand === 'meq' && out.corteEstimado == null) out.corteEstimado = 60
  return out
}

function hashStr(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

function buildRankingSample(brand: Brand, data: ResultadoInternoData, rng: () => number): ResRanking {
  const N = Math.max(data.melhor.total, 1)
  const nota = data.melhor.nota ?? 0
  const participantes = data.melhor.participantes ?? 100 + Math.floor(rng() * 900)
  const posicao = data.melhor.posicao ?? Math.max(1, Math.round(participantes * (1 - nota / 120)))
  const percentil = Math.max(1, Math.min(99, Math.round(100 * (1 - posicao / participantes))))
  const mediaTurma = data.melhor.mediaTurma ?? Math.round((nota - 6 + rng() * 12) * 10) / 10
  const inis = ['M. A.', 'J. C.', 'R. S.', 'L. F.', 'A. G.', 'P. H.', 'C. M.']
  const max0 = 10
  const histograma: ResHistBin[] = Array.from({ length: max0 }).map((_, i) => {
    const center = 45 + i * 3
    const dist = Math.abs(center - mediaTurma)
    const qtd = Math.max(2, Math.round(participantes / (10 + dist * 1.2) * (0.5 + rng())))
    const lo = i * 10
    return { faixa: `${lo}-${lo + 10}`, qtd, voce: nota >= lo && nota < lo + 10 }
  })
  const top: ResRankPeer[] = Array.from({ length: 5 }).map((_, i) => ({
    iniciais: inis[i],
    nota: Math.round((98 - i * 1.2 - rng()) * 10) / 10,
    acertos: Math.round(N * (0.98 - i * 0.013)),
    posicao: i + 1,
  }))
  const voce: ResRankPeer = { iniciais: 'Você', nota, acertos: data.melhor.acertos, posicao, voce: true }
  const dificeis: ResDificil[] = data.correcao
    .map((q) => ({ ordem: q.ordem, disciplina: q.disciplina ?? 'Geral', turmaPct: q.turmaPct ?? 40, seuStatus: q.status }))
    .sort((a, b) => a.turmaPct - b.turmaPct)
    .slice(0, 5)
  const base: ResRanking = { participantes, posicao, percentil, mediaTurma, histograma, mediaMarcador: mediaTurma, top, voce, dificeis }
  if (brand === 'vnd') base.podio = top.slice(0, 3).map((p) => ({ ...p }))
  if (brand === 'meq') {
    const corte = data.corteEstimado ?? 60
    base.corteEstimado = { valor: corte, diff: Math.round((nota - corte) * 10) / 10, faltam: Math.max(0, Math.ceil(((corte - nota) / 100) * N)) }
  }
  return base
}

// Status visual (cor, fundo, rótulo) por marca/estado da questão.
export function stc(st: QStatus): { c: string; bg: string; lab: string } {
  if (st === 'certa') return { c: '#1FA868', bg: 'rgba(31,168,104,.12)', lab: 'Certa' }
  if (st === 'errada') return { c: '#E5484D', bg: 'rgba(229,72,77,.11)', lab: 'Errada' }
  if (st === 'anulada') return { c: '#8A6DEF', bg: 'rgba(138,109,239,.14)', lab: 'Anulada' }
  return { c: '#8A8FA3', bg: 'rgba(138,143,163,.14)', lab: 'Em branco' }
}

// Cor de nota (0..100) — verde/âmbar/vermelho com fundo suave.
export function notec(v: number): [string, string] {
  if (v >= 70) return ['#1FA868', 'rgba(31,168,104,.1)']
  if (v >= 50) return ['#D99A1E', 'rgba(217,154,30,.12)']
  return ['#E5484D', 'rgba(229,72,77,.1)']
}

// Número ptBR: inteiro sem decimais, não-inteiro com 1 casa e vírgula.
export function fnum(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',')
}
export function posFmt(v: number): string {
  return `${v.toLocaleString('pt-BR')}º`
}
