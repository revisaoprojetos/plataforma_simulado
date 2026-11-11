/**
 * ADAPTADOR do cronograma Revisão (plano FIXO, grade congelada) para o IFRAME do Cronograma Adaptativo.
 *
 * O iframe (public/cronograma/adaptativo/index.html) no modo `?modo=revisao-fixo&emissao=<uuid>` consome o
 * mesmo formato que o adaptativo (estado/progresso/notas); aqui a emissão legada é convertida para ele.
 * Módulo PURO (sem I/O): a rota (app/api/aluno/cronograma/revisao-iframe) busca os dados e chama
 * `montarPayloadRevisaoIframe`. NADA é calculado no cliente — datas, horas, rótulos e progresso saem prontos.
 *
 * Mapeamento:
 *  - id da meta no iframe = `<chaveTipo>:<uuid da meta do catálogo>` (estável; o uuid é o que a API de check/nota usa);
 *  - chaveTipo = `x<n>`, uma por tipo_meta do legado (o iframe registra um TIPO por chave: rótulo = nome do tipo,
 *    cor = família do iframe quando o slug é conhecido — pdfull→PDFull, flash→Revisão, quest→Questões, legproc→LegProc,
 *    juris→Jurisprudência; qualquer outro tipo usa a cor neutra);
 *  - plano[id] = [data, horas] (horas = ponto médio da faixa da duração; o rótulo exibido é o TEXTO original da duração);
 *  - semanas de recesso → cfg.recessos; semanas de revisão → cfg.revSemanas (+ blocos de texto do legado).
 */

import { addDias, parseISO, proximaSegunda } from './datas'
import { duracaoEmMinutos, fmtFaixa, somarDuracoes } from './duracao'
import type { ConfigVisao } from './visao-emissao'
import type { ProgressoEmissao } from './progresso-tipos'
import type { Grade, MetaDatada } from './tipos'
import { familiaParcial, paginaRetomada, textoParada, type FamiliaParcial } from './parcial'
import { urlLeitorRevisao } from './conteudo-meta'

/** Documento da Biblioteca ligado à meta (explícito do admin ou automático), já com título/páginas. */
export type ConteudoMetaEntrada = { docId: string; origem: 'explicito' | 'auto'; pagina: number | null; titulo: string; paginas: number | null; baixavel?: boolean }
/** Linha de progresso parcial/não realizada do aluno (já reencaixada por chave). */
export type ProgressoMetaEntrada = {
  meta_id: string
  status: 'parcial' | 'nao_realizada'
  pagina_ate: number | null
  total_paginas: number | null
  artigo: string | null
  ponto: string | null
  minutos_restantes: number | null
  atualizado_em: string
}

/** Minutos planejados da meta = ponto médio da faixa da duração (mesma conta do plano[id][1] e da rota de Parcial). */
export function minutosPlanejadosDaDuracao(duracao: string | null | undefined): number {
  const f = duracaoEmMinutos(duracao)
  return Math.max(1, Math.round(f ? (f.min + f.max) / 2 : 30))
}

/** Atrasadas/pendências por data BRT (servidor). Atrasada = não concluída com data ANTERIOR a `hoje`; "Não realizada" continua atrasada. */
export function resumoAtrasos(itens: { data: string; feita: boolean }[], hoje: string): { atrasadas: number; pendentesHoje: number; metasHoje: number } {
  let atrasadas = 0, pendentesHoje = 0, metasHoje = 0
  for (const i of itens) {
    if (i.data === hoje) { metasHoje++; if (!i.feita) pendentesHoje++ }
    else if (i.data < hoje && !i.feita) atrasadas++
  }
  return { atrasadas, pendentesHoje, metasHoje }
}

/** Data (YYYY-MM-DD) em Brasília de um instante ISO. */
const diaBrt = (iso: string): string => new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10)

/** slug do tipo_meta (cadastro do tenant) → família de cor do iframe. */
const FAMILIA: Record<string, 'pf' | 'fl' | 'qu' | 'lp' | 'jp'> = {
  pdfull: 'pf',
  pdf: 'pf',
  flash: 'fl',
  revisao: 'fl',
  quest: 'qu',
  questoes: 'qu',
  legproc: 'lp',
  juris: 'jp',
  jurisprudencia: 'jp',
}

export type RevisaoMeta = {
  uuid: string
  data: string
  titulo: string
  complemento: string | null
  disc: string
  aula: string
  /** Texto original da duração (faixa), exibido no lugar das horas numéricas. */
  dur: string
  video: string | null
  pdf: string | null
  links: { nome: string; url: string }[]
  ausente: string | null
  qtd: number
  /** Rota interna para resolver as questões da plataforma (null = sem questões). */
  resolver: string | null
  simulado: { nome: string; url: string } | null
  /** Instante (ISO) em que o aluno concluiu, quando concluída. */
  marcadaEm: string | null
  /** Família do Parcial (pdf = última página · lp = artigo · outro = ponto + minutos) e minutos planejados. */
  fam: FamiliaParcial
  minPlan: number
  /** Material da Biblioteca ligado à meta (null = sem conteúdo). `url` abre o leitor do portal com retorno ao cronograma. */
  doc: { id: string; titulo: string; origem: 'explicito' | 'auto'; paginas: number | null; url: string; baixavel: boolean } | null
  /** Registro de Parcial / Não realizada do aluno (null = nenhum). */
  parcial: { status: 'parcial' | 'nao_realizada'; pagina: number | null; total: number | null; artigo: string | null; ponto: string | null; minutos: number | null; texto: string; rotulo: string; em: string } | null
}

export type RevisaoTipo = { chave: string; nome: string; familia: 'pf' | 'fl' | 'qu' | 'lp' | 'jp' | null }

export type PayloadRevisaoIframe = {
  ok: true
  /** Mesmo formato do GET do adaptativo: o boot do iframe hidrata S com isto. */
  estado: {
    cfg: Record<string, unknown>
    plano: Record<string, [string, number]>
    fim: number
    revs: Record<string, never>
    detalhes: Record<string, { ordemAlternancia: number }>
    pausa: null
    exemplo: false
    titulo: string
  }
  progresso: { prog: Record<string, { s?: 'done' | 'missed'; em?: string; parou?: { v: string; em: string } }>; extras: never[] }
  notas: { notas: Record<string, { texto: string }> }
  revisao: {
    emissaoId: string
    titulo: string
    nomeModelo: string
    arquivada: boolean
    desatualizada: boolean
    indisponivel: boolean
    semDatas: boolean
    /** "Hoje" em Brasília (hojeBrtISO) — o iframe usa ESTE dia (não o relógio do navegador) para atrasadas/hoje. */
    hoje: string
    /** Contagens por data BRT calculadas no servidor (atrasadas, pendentes e metas de hoje). */
    resumo: { atrasadas: number; pendentesHoje: number; metasHoje: number }
    /** Semana a abrir na aba Semana (primeira de conteúdo com pendência; ou a atual). */
    semanaInicial: number | null
    tipos: RevisaoTipo[]
    metas: Record<string, RevisaoMeta>
    /** Horas "de capacidade" por data (soma das metas do dia) e rótulos de carga já formatados pelo servidor. */
    horasDia: Record<string, number>
    cargaDia: Record<string, string>
    cargaSemana: Record<string, string>
    semanasRevisao: number[]
    blocosRevisao: { titulo: string; texto: string }[]
    config: ConfigVisao
    progresso: ProgressoEmissao | null
    aviso: string | null
  }
}

function diasEntre(a: string, b: string): number {
  return Math.round((parseISO(a) - parseISO(b)) / 86_400_000)
}

export function montarPayloadRevisaoIframe(args: {
  emissao: { id: string; titulo: string | null; cronograma_nome: string; arquivada: boolean }
  grade: Grade
  checks: Record<string, string>
  notas: Record<string, string>
  config: ConfigVisao
  progresso: ProgressoEmissao | null
  hoje: string
  semDatas: boolean
  desatualizada: boolean
  indisponivel: boolean
  /** meta (uuid do catálogo) -> documento da Biblioteca. Opcional: sem isso as metas ficam sem "Abrir material". */
  conteudos?: Map<string, ConteudoMetaEntrada>
  /** Parcial / Não realizada do aluno nesta emissão. */
  progressoMetas?: ProgressoMetaEntrada[]
}): PayloadRevisaoIframe {
  const { emissao, grade, checks, notas, config, progresso, hoje, semDatas, desatualizada, indisponivel } = args
  const conteudos = args.conteudos ?? new Map<string, ConteudoMetaEntrada>()
  const progMetas = new Map((args.progressoMetas ?? []).map((p) => [p.meta_id, p]))
  const semanas = grade.semanas
  const primeira = semanas[0]

  // Sem calendário (semDatas): as datas reais não significam nada → desloca o plano para começar na próxima segunda,
  // assim nada aparece "atrasado" só porque a emissão é antiga. Só exibição; os rótulos viram "Semana N / Dia N".
  const deslocar = semDatas && primeira ? diasEntre(proximaSegunda(hoje), primeira.inicio) : 0
  const dt = (d: string) => (deslocar ? addDias(d, deslocar) : d)

  const metasBrutas: { m: MetaDatada; sem: number }[] = semanas.flatMap((s) => (s.kind === 'conteudo' ? s.metas.map((m) => ({ m, sem: s.numero })) : []))
  // Ordem estável do dia: data → ordem do tipo → ordem da meta (a mesma da grade legada).
  metasBrutas.sort((x, y) => (x.m.data < y.m.data ? -1 : x.m.data > y.m.data ? 1 : x.m.tipoDef.ordem - y.m.tipoDef.ordem || x.m.ordem - y.m.ordem))

  const tiposMap = new Map<string, RevisaoTipo>()
  const tipos: RevisaoTipo[] = []
  const chaveDoTipo = (m: MetaDatada): string => {
    const slug = m.tipoDef.slug
    let t = tiposMap.get(slug)
    if (!t) {
      t = { chave: `x${tipos.length}`, nome: m.tipoDef.nome, familia: FAMILIA[slug] ?? null }
      tiposMap.set(slug, t)
      tipos.push(t)
    }
    return t.chave
  }

  const plano: PayloadRevisaoIframe['estado']['plano'] = {}
  const detalhes: PayloadRevisaoIframe['estado']['detalhes'] = {}
  const metas: Record<string, RevisaoMeta> = {}
  const prog: PayloadRevisaoIframe['progresso']['prog'] = {}
  const notasOut: PayloadRevisaoIframe['notas']['notas'] = {}
  const horasDia: Record<string, number> = {}
  const porDia = new Map<string, MetaDatada[]>()
  const porSemanaMetas = new Map<number, MetaDatada[]>()

  let seq = 0
  for (const { m, sem: semNum } of metasBrutas) {
    const id = `${chaveDoTipo(m)}:${m.id}`
    const data = dt(m.data)
    const faixa = duracaoEmMinutos(m.duracao)
    const horas = faixa ? (faixa.min + faixa.max) / 2 / 60 : 0.5
    plano[id] = [data, horas]
    detalhes[id] = { ordemAlternancia: seq++ }
    horasDia[data] = (horasDia[data] ?? 0) + horas
    const l1 = porDia.get(data)
    if (l1) l1.push(m)
    else porDia.set(data, [m])

    const l2 = porSemanaMetas.get(semNum)
    if (l2) l2.push(m)
    else porSemanaMetas.set(semNum, [m])

    const marcadaEm = checks[m.id] ?? null
    if (marcadaEm) prog[id] = { s: 'done', em: diaBrt(marcadaEm) }
    if (notas[m.id]) notasOut[id] = { texto: notas[m.id] }

    // Parcial / Não realizada (ignorados se a meta já está concluída). Mesmo formato do adaptativo: s:'missed' · parou:{v,em}.
    const fam = familiaParcial(m.tipoDef.slug)
    const pr = marcadaEm ? undefined : progMetas.get(m.id)
    let parcial: RevisaoMeta['parcial'] = null
    if (pr) {
      const texto = pr.status === 'parcial'
        ? textoParada(fam, { paginaAte: pr.pagina_ate, totalPaginas: pr.total_paginas, artigo: pr.artigo, ponto: pr.ponto, minutosRestantes: pr.minutos_restantes })
        : ''
      const em = diaBrt(pr.atualizado_em)
      parcial = { status: pr.status, pagina: pr.pagina_ate, total: pr.total_paginas, artigo: pr.artigo, ponto: pr.ponto, minutos: pr.minutos_restantes, texto, rotulo: String(pr.pagina_ate ?? pr.artigo ?? pr.ponto ?? ''), em }
      if (pr.status === 'nao_realizada') prog[id] = { s: 'missed', em }
      else prog[id] = { parou: { v: String(pr.pagina_ate ?? pr.artigo ?? pr.ponto ?? ''), em } }
    }

    const cont = conteudos.get(m.id)
    // Retoma na página seguinte à última concluída (Parcial de PDFull); senão a página do vínculo explícito.
    const paginaAbrir = (parcial?.status === 'parcial' && fam === 'pdf' ? paginaRetomada(parcial.pagina, parcial.total ?? cont?.paginas) : null) ?? cont?.pagina ?? null

    metas[id] = {
      uuid: m.id,
      data,
      titulo: m.titulo,
      complemento: m.complemento,
      disc: m.disciplina,
      aula: m.aula ?? '',
      dur: m.duracao ?? '',
      video: m.video ?? null,
      pdf: m.pdf ?? null,
      links: (m.links?.urls ?? []).map((u) => ({ nome: u.plataforma.nome, url: u.url })),
      ausente: m.links?.ausente ?? null,
      qtd: m.qtdQuestoes ?? 0,
      resolver: m.qtdQuestoes ? `/aluno/cronograma/resolver/${m.id}?voltar=${encodeURIComponent(`/aluno/cronograma/${emissao.id}`)}` : null,
      simulado: m.tipo === 'simulado' && m.simulado_externo_url ? { nome: m.simulado_externo_nome ?? 'Abrir simulado', url: m.simulado_externo_url } : null,
      marcadaEm,
      fam,
      minPlan: minutosPlanejadosDaDuracao(m.duracao),
      doc: cont ? { id: cont.docId, titulo: cont.titulo, origem: cont.origem, paginas: cont.paginas, baixavel: cont.baixavel === true, url: urlLeitorRevisao(cont.docId, emissao.id, paginaAbrir) } : null,
      parcial,
    }
  }

  const cargaDia: Record<string, string> = {}
  for (const [d, ms] of porDia) {
    const f = somarDuracoes(ms.map((x) => x.duracao))
    if (f) cargaDia[d] = fmtFaixa(f)
  }
  const cargaSemana: Record<string, string> = {}
  for (const [n, ms] of porSemanaMetas) {
    const f = somarDuracoes(ms.map((x) => x.duracao))
    if (f) cargaSemana[String(n)] = fmtFaixa(f)
  }

  const recessos = semanas
    .filter((s) => s.kind === 'recesso')
    .map((s) => ({ ini: dt(s.inicio), fim: dt(s.fim), motivo: 'Recesso' }))
  const semanasRevisao = semanas.filter((s) => s.kind === 'revisao').map((s) => s.numero)
  const blocosRevisao = semanas.find((s) => s.kind === 'revisao' && 'blocos' in s)
  const blocos = blocosRevisao && blocosRevisao.kind === 'revisao' ? blocosRevisao.blocos : []

  // Semana inicial da aba Semana: com calendário, a atual (o iframe calcula); sem calendário, a 1ª com pendência.
  let semanaInicial: number | null = null
  if (semDatas) {
    const pend = semanas.find((s) => s.kind === 'conteudo' && s.metas.some((x) => !checks[x.id]))
    semanaInicial = (pend ?? semanas[semanas.length - 1])?.numero ?? 1
  }

  const cfg = {
    start: primeira ? dt(primeira.inicio) : hoje,
    horas: [0, 0, 0, 0, 0, 0, 0],
    rotinas: [] as unknown[],
    recessos,
    discs: [] as string[],
    metas: {},
    semData: semDatas,
    revisao: { ativa: semanasRevisao.length > 0, cada: 8 },
    /** Marca o plano como fixo/somente leitura (o iframe NÃO chama o motor). */
    fixo: true,
  }

  return {
    ok: true,
    estado: {
      cfg,
      plano,
      fim: semanas.length || 1,
      revs: {},
      detalhes,
      pausa: null,
      exemplo: false,
      titulo: emissao.titulo ?? emissao.cronograma_nome,
    },
    progresso: { prog, extras: [] },
    notas: { notas: notasOut },
    revisao: {
      emissaoId: emissao.id,
      titulo: emissao.titulo ?? '',
      nomeModelo: emissao.cronograma_nome,
      arquivada: emissao.arquivada,
      desatualizada,
      indisponivel,
      semDatas,
      hoje,
      resumo: resumoAtrasos(Object.entries(plano).map(([id, [data]]) => ({ data, feita: prog[id]?.s === 'done' })), hoje),
      semanaInicial,
      tipos,
      metas,
      horasDia,
      cargaDia,
      cargaSemana,
      semanasRevisao,
      blocosRevisao: blocos,
      config,
      progresso,
      aviso: grade.avisos.length ? grade.avisos[0] : null,
    },
  }
}
